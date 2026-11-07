use chrono::{DateTime, Duration, NaiveDateTime, Utc};
use napi::{Env, Result, Task, bindgen_prelude::AsyncTask};
use napi_derive::napi;
use rand::{
  distr::{Alphanumeric, Distribution},
  rng,
};
use sha3::{Digest, Sha3_256};

const SALT_LENGTH: usize = 16;
const MAX_CLAIM_BITS: u32 = 256;
const MAX_MINT_BITS: u32 = 24;
const STAMP_VERSION: &str = "1";
const STAMP_LIFETIME_MINUTES: i64 = 5;

/// A protocol-level representation of the AFFiNE-compatible v1 Hashcash stamp.
///
/// This implementation is maintained in the MIT-scoped frontend native crate.
/// It intentionally preserves the seven-field wire format and the legacy v1
/// whole-hex-nibble verification rule; it does not import or wrap the EE-scoped common crate.
struct Stamp {
  claim: u32,
  timestamp: String,
  resource: String,
  extension: String,
  salt: String,
  counter: String,
}

impl Stamp {
  fn format(&self) -> String {
    format!(
      "{}:{}:{}:{}:{}:{}:{}",
      STAMP_VERSION, self.claim, self.timestamp, self.resource, self.extension, self.salt, self.counter
    )
  }

  fn parse(value: &str) -> Option<Self> {
    let fields = value.split(':').collect::<Vec<_>>();
    if fields.len() != 7
      || fields
        .iter()
        .enumerate()
        .any(|(index, field)| index != 4 && field.is_empty())
    {
      return None;
    }
    if fields[0] != STAMP_VERSION {
      return None;
    }
    let claim = fields[1].parse::<u32>().ok()?;
    if claim == 0 || claim > MAX_CLAIM_BITS {
      return None;
    }
    // Validate the timestamp during parsing, not only during verification.
    NaiveDateTime::parse_from_str(fields[2], "%Y%m%d%H%M%S").ok()?;
    Some(Self {
      claim,
      timestamp: fields[2].to_owned(),
      resource: fields[3].to_owned(),
      extension: fields[4].to_owned(),
      salt: fields[5].to_owned(),
      counter: fields[6].to_owned(),
    })
  }

  fn is_unexpired(&self) -> bool {
    NaiveDateTime::parse_from_str(&self.timestamp, "%Y%m%d%H%M%S")
      .ok()
      .map(|value| DateTime::<Utc>::from_naive_utc_and_offset(value, Utc))
      .and_then(|created| created.checked_add_signed(Duration::minutes(STAMP_LIFETIME_MINUTES)))
      .is_some_and(|expires| Utc::now() <= expires)
  }

  fn has_legacy_v1_work(&self) -> bool {
    // v1 compatibility: existing AFFiNE verifiers count complete leading
    // zero hex nibbles using floor(claim / 4). Keep this rule for old stamps.
    let required_zero_nibbles = (self.claim / 4) as usize;
    let digest = Sha3_256::digest(self.format().as_bytes());
    hex::encode(digest)
      .as_bytes()
      .iter()
      .take(required_zero_nibbles)
      .all(|digit| *digit == b'0')
      && required_zero_nibbles <= 64
  }

  fn verify(&self, requested_bits: u32, resource: &str) -> bool {
    requested_bits > 0
      && requested_bits <= self.claim
      && self.resource == resource
      && self.is_unexpired()
      && self.has_legacy_v1_work()
  }

  fn mint(resource: String, requested_bits: Option<u32>) -> Result<String> {
    let claim = requested_bits.unwrap_or(20);
    if claim == 0 || claim > MAX_MINT_BITS {
      return Err(napi::Error::from_reason(
        "Hashcash mint difficulty must be between 1 and 24 bits",
      ));
    }

    let timestamp = Utc::now().format("%Y%m%d%H%M%S").to_string();
    let mut random = rng();
    let salt = Alphanumeric
      .sample_iter(&mut random)
      .take(SALT_LENGTH)
      .map(char::from)
      .collect::<String>();

    let prefix = format!("{}:{}:{}:{}:{}:{}", STAMP_VERSION, claim, timestamp, resource, "", salt);
    // Minting uses ceil(claim / 4), matching the historical v1 producer.
    let required_zero_nibbles = ((claim + 3) / 4) as usize;
    let target = "0".repeat(required_zero_nibbles);
    let mut counter = 0_u64;

    loop {
      let candidate = format!("{prefix}:{counter:x}");
      let digest = hex::encode(Sha3_256::digest(candidate.as_bytes()));
      if digest.starts_with(&target) {
        return Ok(candidate);
      }
      counter = counter
        .checked_add(1)
        .ok_or_else(|| napi::Error::from_reason("Hashcash counter exhausted"))?;
    }
  }
}

pub struct AsyncVerifyChallengeResponse {
  response: String,
  bits: u32,
  resource: String,
}

#[napi]
impl Task for AsyncVerifyChallengeResponse {
  type Output = bool;
  type JsValue = bool;

  fn compute(&mut self) -> Result<Self::Output> {
    Ok(Stamp::parse(&self.response).is_some_and(|stamp| stamp.verify(self.bits, &self.resource)))
  }

  fn resolve(&mut self, _: Env, output: bool) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi]
pub fn verify_challenge_response(
  response: String,
  bits: u32,
  resource: String,
) -> AsyncTask<AsyncVerifyChallengeResponse> {
  AsyncTask::new(AsyncVerifyChallengeResponse {
    response,
    bits,
    resource,
  })
}

pub struct AsyncMintChallengeResponse {
  bits: Option<u32>,
  resource: String,
}

#[napi]
impl Task for AsyncMintChallengeResponse {
  type Output = String;
  type JsValue = String;

  fn compute(&mut self) -> Result<Self::Output> {
    Stamp::mint(self.resource.clone(), self.bits)
  }

  fn resolve(&mut self, _: Env, output: String) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi]
pub fn mint_challenge_response(resource: String, bits: Option<u32>) -> AsyncTask<AsyncMintChallengeResponse> {
  AsyncTask::new(AsyncMintChallengeResponse { bits, resource })
}

#[cfg(test)]
mod tests {
  use napi::Task;

  use super::*;

  #[test]
  fn mint_and_verify_preserves_the_native_api_and_v1_wire_format() {
    let resource = "test-resource".to_string();
    let mut mint = AsyncMintChallengeResponse {
      bits: Some(8),
      resource: resource.clone(),
    };
    let response = mint.compute().unwrap();
    let fields = response.split(':').collect::<Vec<_>>();
    assert_eq!(fields.len(), 7);
    assert_eq!(fields[0], STAMP_VERSION);
    assert_eq!(fields[1], "8");
    assert_eq!(fields[3], resource);
    assert_eq!(fields[4], "");

    let mut verify = AsyncVerifyChallengeResponse {
      response,
      bits: 8,
      resource,
    };
    assert!(verify.compute().unwrap());
  }

  #[test]
  fn verification_rejects_wrong_resource_and_higher_requested_work() {
    let stamp = Stamp::parse(&Stamp::mint("resource-a".into(), Some(8)).unwrap()).unwrap();
    assert!(!stamp.verify(8, "resource-b"));
    assert!(!stamp.verify(9, "resource-a"));
  }

  #[test]
  fn verifies_a_fixed_v1_wire_compatibility_vector() {
    let stamp = Stamp::parse("1:8:20261107080000:test-resource::ABCDEFGHIJKLMNOP:13e").unwrap();
    assert!(stamp.has_legacy_v1_work());
  }

  #[test]
  fn mint_rejects_unbounded_proof_work() {
    assert!(Stamp::mint("resource".into(), Some(25)).is_err());
    assert!(Stamp::mint("resource".into(), Some(0)).is_err());
  }

  #[test]
  fn parser_rejects_malformed_or_out_of_range_stamps() {
    assert!(Stamp::parse("1:8:20261107080000:test::salt").is_none());
    assert!(Stamp::parse("2:8:20261107080000:test::salt:0").is_none());
    assert!(Stamp::parse("1:0:20261107080000:test::salt:0").is_none());
    assert!(Stamp::parse("1:25:20261107080000:test::salt:0").is_some());
    assert!(Stamp::parse("1:257:20261107080000:test::salt:0").is_none());
    assert!(Stamp::parse("1:8:not-a-date:test::salt:0").is_none());
  }

  #[test]
  fn verification_rejects_expired_stamps() {
    let mut stamp = Stamp::parse(&Stamp::mint("resource".into(), Some(8)).unwrap()).unwrap();
    stamp.timestamp = "20000101000000".into();
    assert!(!stamp.verify(8, "resource"));
  }
}
