// Applies supabase/migrations to the remote project using SUPABASE_DB_URL from pipeline/.env.
// Run: npm run db:push   (add --dry-run to preview)
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const env = Object.fromEntries(
  readFileSync(new URL('../pipeline/.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
if (!env.SUPABASE_DB_URL) {
  console.error('pipeline/.env 에 SUPABASE_DB_URL 이 없습니다 (Dashboard → Connect → Session pooler 연결 문자열).');
  process.exit(1);
}
const r = spawnSync('npx', ['--yes', 'supabase@2', 'db', 'push', '--db-url', env.SUPABASE_DB_URL, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 1);
