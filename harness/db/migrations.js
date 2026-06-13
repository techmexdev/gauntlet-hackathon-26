import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function runMigrations(db) {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  const columns = db.prepare('PRAGMA table_info(decisions)').all().map((row) => row.name);
  const addColumn = (name, type) => {
    if (!columns.includes(name)) {
      db.exec(`ALTER TABLE decisions ADD COLUMN ${name} ${type}`);
    }
  };
  addColumn('agent_reasons_json', 'TEXT');
  addColumn('confidence', 'REAL');
  addColumn('escalate', 'INTEGER');
  addColumn('cascade_meta_json', 'TEXT');
  addColumn('commit_branch', 'TEXT');
  addColumn('commit_rationale_json', 'TEXT');
  addColumn('score_explanation', 'TEXT');
}
