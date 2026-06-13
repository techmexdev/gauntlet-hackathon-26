import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = join(__dirname, '../../shared/schemas');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const schemaNames = ['normalized-post', 'agent-output', 'decision', 'alarm'];

for (const name of schemaNames) {
  const schema = JSON.parse(readFileSync(join(SCHEMAS_DIR, `${name}.json`), 'utf8'));
  ajv.addSchema(schema, name);
}

export function validate(schemaName, data) {
  const validateFn = ajv.getSchema(schemaName);
  if (!validateFn) {
    throw new Error(`Unknown schema: ${schemaName}`);
  }
  const valid = validateFn(data);
  return { valid, errors: validateFn.errors || [] };
}

export { ajv };
