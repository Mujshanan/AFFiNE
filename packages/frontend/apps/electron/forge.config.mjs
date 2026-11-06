import cp from 'node:child_process';
import { readdir, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { utils } from '@electron-forge/core';
import { FusesPlugin } from '@electron-forge/plugin-fuses';

import {
  appIdMap,
  arch,
  buildType,
  iconUrl,
  icoPath,
  platform,
  productName,
} from './scripts/make-env.js';

const fromBuildIdentifier = utils.fromBuildIdentifier;

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const DEFAULT_ELECTRON_LOCALES_KEEP = new Set([
  'en',
  'en_US',
  'en_GB',
  'zh_CN',
  'zh_TW',
  'fr',
  'es',
  'es_419',
  'pl',
  'de',
  'ru',
  'ja',
  'it',
  'ca',
  'da',
  'hi',
  'sv',
  'ur',
  'ar',
  'uk',
  'ko',
  'pt_BR',
  'fa',
  'nb',
]);

const getElectronLocalesKeep = () => {
  const raw = process.env.ELECTRON_LOCALES_KEEP?.trim();
  if (!raw) return DEFAULT_ELECTRON_LOCALES_KEEP;

  const normalized = raw.toLowerCase();
  if (normalized === 'all' || normalized === '*') return null;

  const keep = new Set(
    raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  );

  // Always keep English as a safe fallback.
  keep.add('en');
  keep.add('en_US');
  keep.add('en_GB');
  return keep;
};

const getElectronPakLocalesKeep = keep => {
  const pakKeep = new Set();
  for (const locale of keep) {
    if (locale === 'en') {
      pakKeep.add('en-US');
      continue;
    }
    pakKeep.add(locale.replaceAll('_', '-'));
  }

  // Always keep English (US) as a safe fallback for Chromium/Electron locales.
  pakKeep.add('en');
  pakKeep.add('en-US');
  pakKeep.add('en-GB');
  return pakKeep;
};

const trimElectronPakLocales = async (resourcesAppDir, targetPlatform) => {
  if (process.env.TRIM_ELECTRON_LOCALES === '0') return;
  if (targetPlatform !== 'win32') return;

  const keep = getElectronLocalesKeep();
  if (!keep) return;

  const rootDir = path.resolve(resourcesAppDir, '..', '..');
  const localesDir = path.join(rootDir, 'locales');

  let entries;
  try {
    entries = await readdir(localesDir, { withFileTypes: true });
  } catch {
    return;
  }

  const pakKeep = getElectronPakLocalesKeep(keep);

  await Promise.all(
    entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.pak'))
      .map(async entry => {
        const locale = entry.name.slice(0, -'.pak'.length);
        if (pakKeep.has(locale)) return;
        await rm(path.join(localesDir, entry.name), { force: true });
      })
  );
};

const makers = [
  {
    name: '@electron-forge/maker-zip',
    config: {
      name: productName,
      platforms: ['win32'],
    },
  },
  !process.env.SKIP_BUNDLE && {
    name: '@electron-forge/maker-squirrel',
    config: {
      name: productName,
      setupIcon: icoPath,
      iconUrl,
      loadingGif: './resources/icons/affine_installing.gif',
    },
  },
].filter(Boolean);

console.log('makers', makers);

/**
 * @type {import('@electron-forge/shared-types').ForgeConfig}
 */
export default {
  buildIdentifier: buildType,
  packagerConfig: {
    name: productName,
    icon: icoPath,
    electronZipDir: process.env.ELECTRON_FORGE_ELECTRON_ZIP_DIR,
    extraResource: ['./resources/app-update.yml'],
    protocols: [
      {
        name: productName,
        schemes: [productName.toLowerCase()],
      },
    ],
    executableName: productName,
    ignore: [
      /\\.map$/,
      /\\/test($|\\/)/,
      /\\/scripts($|\\/)/,
      /\\/examples($|\\/)/,
      /\\/docs($|\\/)/,
      /\\/README\\.md$/,
      /\\/forge\\.config\\.mjs$/,
      /\\/dev-app-update\\.yml$/,
      /\\/resources\\/app-update\\.yml$/,
    ],
    afterCopy: [
      (buildPath, _electronVersion, targetPlatform, _arch, done) => {
        trimElectronPakLocales(buildPath, targetPlatform)
          .then(() => done())
          .catch(done);
      },
    ],
    asar: true,
  },
  makers,
  plugins: [
    { name: '@electron-forge/plugin-auto-unpack-natives', config: {} },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  hooks: {
    readPackageJson: async (_, packageJson) => {
      // we want different package name for canary build
      // so stable and canary will not share the same app data
      packageJson.productName = productName;
    },
    prePackage: async () => {
      if (!process.env.HOIST_NODE_MODULES) {
        await rm(path.join(__dirname, 'node_modules'), {
          recursive: true,
          force: true,
        });

        await symlink(
          path.join(__dirname, '..', '..', '..', 'node_modules'),
          path.join(__dirname, 'node_modules')
        );
      }
    },
    generateAssets: async (_, platform, arch) => {
      if (process.env.SKIP_GENERATE_ASSETS) {
        return;
      }

      cp.spawnSync('yarn', ['generate-assets'], {
        stdio: 'inherit',
        cwd: __dirname,
      });
    },
  },
};
