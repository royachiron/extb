import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Env } from '../../src/types';

const python = `import sqlite3,json,sys
p=json.load(sys.stdin)
c=sqlite3.connect(p['file']);c.row_factory=sqlite3.Row
if 'schema' in p: c.executescript(p['schema'])
r=[]
try:
 for s in p.get('statements',[]):
  q=c.execute(s['sql'],s['binds']); rows=[dict(x) for x in q.fetchall()]
  r.append({'results':rows,'meta':{'changes':c.execute('SELECT changes()').fetchone()[0]}})
 c.commit()
except: c.rollback();raise
print(json.dumps(r))`;

export function database() {
  const dir = mkdtempSync(join(tmpdir(), 'extb-core-'));
  const file = join(dir, 'db.sqlite');
  const execute = (statements: { sql: string; binds: unknown[] }[], schema?: string) => JSON.parse(execFileSync('python3', ['-c', python], { input: JSON.stringify({ file, statements, schema }), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  execute([], readFileSync(join(process.cwd(), 'schema.sql'), 'utf8'));
  class Statement {
    binds: unknown[] = [];
    constructor(public sql: string) {}
    bind(...binds: unknown[]) { this.binds = binds; return this; }
    async first() { return execute([this])[0].results[0] || null; }
    async run() { return execute([this])[0]; }
    async all() { return execute([this])[0]; }
  }
  const env = { DB: { prepare: (sql: string) => new Statement(sql), batch: async (statements: Statement[]) => execute(statements) }, SETUP_PASSPHRASE: 'a-long-private-setup-passphrase' } as unknown as Env;
  return { env, close: () => rmSync(dir, { recursive: true, force: true }) };
}
