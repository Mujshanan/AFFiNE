export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonSchema = boolean | { [key: string]: unknown };

export interface SchemaIssue {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  message: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaIssue[];
}

type SchemaBundle = Record<string, JsonSchema>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return '[' + value.map(canonicalJson).join(',') + ']';
  if (isObject(value)) {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(key => JSON.stringify(key) + ':' + canonicalJson(value[key]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value) ?? 'undefined';
}

const sameJson = (a: unknown, b: unknown): boolean =>
  canonicalJson(a) === canonicalJson(b);

const escapePointer = (value: string): string =>
  value.replace(/~/g, '~0').replace(/\//g, '~1');

const decodePointer = (value: string): string =>
  value.replace(/~1/g, '/').replace(/~0/g, '~');

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function resolveReference(
  reference: string,
  currentPath: string,
  bundle: SchemaBundle
): { schema: JsonSchema; path: string } | undefined {
  const [filePart = '', fragment = ''] = reference.split('#', 2);
  const extensionIndex = currentPath.indexOf('.json');
  const currentFilePath =
    extensionIndex === -1
      ? currentPath
      : currentPath.slice(0, extensionIndex + '.json'.length);
  const filePath = filePart
    ? normalizePath(
        currentFilePath
          .split('/')
          .slice(0, -1)
          .concat(filePart.split('/'))
          .join('/')
      )
    : currentFilePath;
  const root = bundle[filePath];
  if (root === undefined) return undefined;
  if (!fragment) return { schema: root, path: filePath };
  if (!fragment.startsWith('/')) return undefined;

  let current: unknown = root;
  for (const token of fragment.slice(1).split('/')) {
    if (!isObject(current) && !Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[decodePointer(token)];
  }
  if (current === undefined) return undefined;
  return { schema: current as JsonSchema, path: filePath };
}

function typeMatches(value: unknown, type: string): boolean {
  switch (type) {
    case 'null':
      return value === null;
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return isObject(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    default:
      return false;
  }
}

/**
 * Validates the JSON Schema 2020-12 vocabulary used by the checked-in
 * Khwarizmi contract bundle. Unsupported schema keywords fail closed.
 */
export function validateJsonSchema(
  value: unknown,
  schemaPath: string,
  bundle: SchemaBundle
): SchemaValidationResult {
  const errors: SchemaIssue[] = [];
  const supported = new Set([
    '$schema',
    '$id',
    '$defs',
    '$comment',
    'title',
    'description',
    '$ref',
    'type',
    'const',
    'enum',
    'properties',
    'required',
    'additionalProperties',
    'items',
    'prefixItems',
    'oneOf',
    'allOf',
    'if',
    'then',
    'else',
    'not',
    'minimum',
    'maximum',
    'maxProperties',
    'minLength',
    'maxLength',
    'pattern',
    'minItems',
    'maxItems',
    'uniqueItems',
  ]);

  const visit = (
    instance: unknown,
    schema: JsonSchema,
    currentSchemaPath: string,
    instancePath: string,
    depth: number
  ): boolean => {
    if (depth > 256) {
      errors.push({
        instancePath,
        schemaPath: currentSchemaPath,
        keyword: 'depth',
        message: 'Schema evaluation depth exceeded',
      });
      return false;
    }
    if (schema === true) return true;
    if (schema === false) {
      errors.push({
        instancePath,
        schemaPath: currentSchemaPath,
        keyword: 'falseSchema',
        message: 'Value is rejected by false schema',
      });
      return false;
    }
    if (!isObject(schema)) {
      errors.push({
        instancePath,
        schemaPath: currentSchemaPath,
        keyword: 'schema',
        message: 'Invalid schema node',
      });
      return false;
    }

    for (const keyword of Object.keys(schema)) {
      if (!supported.has(keyword)) {
        errors.push({
          instancePath,
          schemaPath: currentSchemaPath,
          keyword,
          message: 'Unsupported schema keyword in Khwarizmi validator',
        });
        return false;
      }
    }

    let valid = true;
    const add = (keyword: string, message: string) => {
      valid = false;
      errors.push({
        instancePath,
        schemaPath: currentSchemaPath + '/' + keyword,
        keyword,
        message,
      });
    };

    if (typeof schema.$ref === 'string') {
      const resolved = resolveReference(schema.$ref, currentSchemaPath, bundle);
      if (!resolved) add('$ref', 'Unresolved schema reference: ' + schema.$ref);
      else if (
        !visit(
          instance,
          resolved.schema,
          resolved.path,
          instancePath,
          depth + 1
        )
      )
        valid = false;
    }

    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (
        !types.some(
          type => typeof type === 'string' && typeMatches(instance, type)
        )
      )
        add('type', 'Expected type ' + types.join(' or '));
    }
    if (
      Object.prototype.hasOwnProperty.call(schema, 'const') &&
      !sameJson(instance, schema.const)
    )
      add('const', 'Value does not match the required constant');
    if (
      Array.isArray(schema.enum) &&
      !schema.enum.some(item => sameJson(instance, item))
    )
      add('enum', 'Value is not one of the allowed values');

    if (Array.isArray(schema.allOf)) {
      schema.allOf.forEach((part, index) => {
        if (
          !visit(
            instance,
            part as JsonSchema,
            currentSchemaPath + '/allOf/' + index,
            instancePath,
            depth + 1
          )
        )
          valid = false;
      });
    }
    if (Array.isArray(schema.oneOf)) {
      let matches = 0;
      schema.oneOf.forEach((part, index) => {
        const before = errors.length;
        const branchValid = visit(
          instance,
          part as JsonSchema,
          currentSchemaPath + '/oneOf/' + index,
          instancePath,
          depth + 1
        );
        errors.splice(before);
        if (branchValid) matches++;
      });
      if (matches !== 1)
        add(
          'oneOf',
          'Value must match exactly one oneOf branch; matched ' + matches
        );
    }
    if (schema.not !== undefined) {
      const before = errors.length;
      const matchesNotSchema = visit(
        instance,
        schema.not as JsonSchema,
        currentSchemaPath + '/not',
        instancePath,
        depth + 1
      );
      errors.splice(before);
      if (matchesNotSchema) add('not', 'Value must not match the not schema');
    }
    if (schema.if !== undefined) {
      const before = errors.length;
      const conditionMatches = visit(
        instance,
        schema.if as JsonSchema,
        currentSchemaPath + '/if',
        instancePath,
        depth + 1
      );
      errors.splice(before);
      const branch = conditionMatches ? schema.then : schema.else;
      if (
        branch !== undefined &&
        !visit(
          instance,
          branch as JsonSchema,
          currentSchemaPath + (conditionMatches ? '/then' : '/else'),
          instancePath,
          depth + 1
        )
      )
        valid = false;
    }

    if (typeof instance === 'string') {
      if (
        typeof schema.minLength === 'number' &&
        [...instance].length < schema.minLength
      )
        add('minLength', 'String is shorter than minLength');
      if (
        typeof schema.maxLength === 'number' &&
        [...instance].length > schema.maxLength
      )
        add('maxLength', 'String is longer than maxLength');
      if (typeof schema.pattern === 'string') {
        let matches = false;
        try {
          matches = new RegExp(schema.pattern, 'u').test(instance);
        } catch {
          add('pattern', 'Schema contains an invalid regular expression');
        }
        if (!matches)
          add('pattern', 'String does not match the required pattern');
      }
    }
    if (typeof instance === 'number') {
      if (typeof schema.minimum === 'number' && instance < schema.minimum)
        add('minimum', 'Number is below minimum');
      if (typeof schema.maximum === 'number' && instance > schema.maximum)
        add('maximum', 'Number is above maximum');
    }

    if (Array.isArray(instance)) {
      if (
        typeof schema.minItems === 'number' &&
        instance.length < schema.minItems
      )
        add('minItems', 'Array has fewer items than minItems');
      if (
        typeof schema.maxItems === 'number' &&
        instance.length > schema.maxItems
      )
        add('maxItems', 'Array has more items than maxItems');
      if (schema.uniqueItems === true) {
        for (let i = 0; i < instance.length; i++) {
          if (instance.slice(0, i).some(item => sameJson(item, instance[i]))) {
            add('uniqueItems', 'Array items must be unique');
            break;
          }
        }
      }
      if (Array.isArray(schema.prefixItems)) {
        schema.prefixItems.forEach((itemSchema, index) => {
          if (
            index < instance.length &&
            !visit(
              instance[index],
              itemSchema as JsonSchema,
              currentSchemaPath + '/prefixItems/' + index,
              instancePath + '/' + index,
              depth + 1
            )
          )
            valid = false;
        });
      }
      if (
        schema.items === false &&
        Array.isArray(schema.prefixItems) &&
        instance.length > schema.prefixItems.length
      )
        add('items', 'Array contains items beyond prefixItems');
      else if (schema.items !== undefined && schema.items !== false) {
        const start = Array.isArray(schema.prefixItems)
          ? schema.prefixItems.length
          : 0;
        for (let i = start; i < instance.length; i++) {
          if (
            !visit(
              instance[i],
              schema.items as JsonSchema,
              currentSchemaPath + '/items',
              instancePath + '/' + i,
              depth + 1
            )
          )
            valid = false;
        }
      }
    }

    if (isObject(instance)) {
      if (
        typeof schema.maxProperties === 'number' &&
        Object.keys(instance).length > schema.maxProperties
      ) {
        add('maxProperties', 'Object has more properties than maxProperties');
      }
      if (Array.isArray(schema.required)) {
        for (const key of schema.required) {
          if (
            typeof key === 'string' &&
            !Object.prototype.hasOwnProperty.call(instance, key)
          )
            add('required', 'Missing required property: ' + key);
        }
      }
      const properties = isObject(schema.properties) ? schema.properties : {};
      for (const [key, child] of Object.entries(properties)) {
        if (
          Object.prototype.hasOwnProperty.call(instance, key) &&
          !visit(
            instance[key],
            child as JsonSchema,
            currentSchemaPath + '/properties/' + escapePointer(key),
            instancePath + '/' + escapePointer(key),
            depth + 1
          )
        )
          valid = false;
      }
      for (const [key, child] of Object.entries(instance)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          if (schema.additionalProperties === false)
            add('additionalProperties', 'Unexpected property: ' + key);
          else if (
            schema.additionalProperties !== undefined &&
            schema.additionalProperties !== true &&
            !visit(
              child,
              schema.additionalProperties as JsonSchema,
              currentSchemaPath + '/additionalProperties',
              instancePath + '/' + escapePointer(key),
              depth + 1
            )
          )
            valid = false;
        }
      }
    }
    return valid;
  };

  const root = bundle[schemaPath];
  if (root === undefined) {
    return {
      valid: false,
      errors: [
        {
          instancePath: '',
          schemaPath,
          keyword: '$ref',
          message: 'Schema file not found in bundle',
        },
      ],
    };
  }
  const valid = visit(value, root, schemaPath, '', 0);
  return { valid: valid && errors.length === 0, errors };
}

export function validateSchemaBundle(
  bundle: SchemaBundle
): SchemaValidationResult {
  const errors: SchemaIssue[] = [];
  const supported = new Set([
    '$schema',
    '$id',
    '$defs',
    '$comment',
    'title',
    'description',
    '$ref',
    'type',
    'const',
    'enum',
    'properties',
    'required',
    'additionalProperties',
    'items',
    'prefixItems',
    'oneOf',
    'allOf',
    'if',
    'then',
    'else',
    'not',
    'minimum',
    'maximum',
    'maxProperties',
    'minLength',
    'maxLength',
    'pattern',
    'minItems',
    'maxItems',
    'uniqueItems',
  ]);
  const schemaChildren = (schema: Record<string, unknown>): unknown[] => {
    const children: unknown[] = [];
    for (const key of ['$defs', 'properties']) {
      const map = schema[key];
      if (isObject(map)) children.push(...Object.values(map));
    }
    for (const key of [
      'items',
      'additionalProperties',
      'if',
      'then',
      'else',
      'not',
    ]) {
      if (schema[key] !== undefined && typeof schema[key] !== 'boolean')
        children.push(schema[key]);
    }
    for (const key of ['prefixItems', 'oneOf', 'allOf']) {
      if (Array.isArray(schema[key]))
        children.push(...(schema[key] as unknown[]));
    }
    return children;
  };
  const visit = (
    node: unknown,
    schemaPath: string,
    filePath: string,
    seen: Set<object>
  ) => {
    if (typeof node === 'boolean') return;
    if (!isObject(node) || seen.has(node)) return;
    seen.add(node);
    for (const keyword of Object.keys(node)) {
      if (!supported.has(keyword))
        errors.push({
          instancePath: '',
          schemaPath: schemaPath + '/' + keyword,
          keyword,
          message: 'Unsupported schema keyword in Khwarizmi validator bundle',
        });
    }
    if (
      typeof node.$ref === 'string' &&
      !resolveReference(node.$ref, filePath, bundle)
    ) {
      errors.push({
        instancePath: '',
        schemaPath: schemaPath + '/$ref',
        keyword: '$ref',
        message: 'Unresolved schema reference: ' + node.$ref,
      });
    }
    for (const [index, child] of schemaChildren(node).entries())
      visit(child, schemaPath + '/child-' + index, filePath, seen);
  };
  for (const [path, schema] of Object.entries(bundle))
    visit(schema, path, path, new Set<object>());
  return { valid: errors.length === 0, errors };
}
