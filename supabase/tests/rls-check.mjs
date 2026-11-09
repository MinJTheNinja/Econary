// Applies all migrations to an in-memory Postgres (PGlite) with Supabase auth stubs and checks RLS/RPC behaviour.
// Run: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from "node:fs";
const MIG = new URL("../migrations/", import.meta.url);
const db = new PGlite();
const q = async (sql, p) => (await db.query(sql, p)).rows;
// Supabase stubs
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);
try { await db.exec(readdirSync(MIG).sort().map((f) => readFileSync(new URL(f, MIG), "utf8")).join("\n")); } catch (e) { console.log("MIGRATION ERROR:", e.message, e.where ?? ""); process.exit(1); }
console.log('migration OK');

const U = '11111111-1111-1111-1111-111111111111';
await db.exec(`insert into auth.users values ('${U}')`);
console.log('profile auto-created:', (await q('select level, role from profiles'))[0]);

// words + dedupe
await db.exec(`insert into words (term, meaning, importance) values
 ('금리','이자율',90),('PER','주가수익비율',80),('인플레이션','물가 상승',85),('비활성어','x',99),('스태그플레이션','불황+물가',70),('J커브','환율',60)`);
await db.exec(`update words set is_active=false where term='비활성어'`);
try { await db.exec(`insert into words (term, meaning) values ('p e r','dup')`); console.log('FAIL: dup allowed'); }
catch (e) { console.log('duplicate normalized term rejected ✓'); }

// contents: quiz without answer cannot be approved
const wid = (await q(`select id from words where term='금리'`))[0].id;
try { await db.exec(`insert into word_contents (word_id, kind, body, choices, source, review_status) values (${wid},'quiz','Q','["a","b"]','ytn','approved')`); console.log('FAIL'); }
catch { console.log('approved quiz without answer rejected ✓'); }
await db.exec(`insert into word_contents (word_id, kind, body, choices, answer_index, answer_explanation, source, review_status)
  values (${wid},'quiz','금리를 올리면?','["물가 하락 압력","물가 상승 압력"]',0,'긴축','hankyung','approved'),
         (${wid},'explanation','설명','null',null,null,'ytn','pending')`);
const quizId = (await q(`select id from word_contents where kind='quiz'`))[0].id;

// act as learner
await db.exec(`set test.uid = '${U}'; set role authenticated;`);
await db.exec(`update profiles set level='beginner'`);
const a = await q('select word_id, position from get_or_create_today_assignment()');
console.log('assigned (beginner=5):', a.length, a.map(r => r.word_id).join(','));
const a2 = await q('select * from get_or_create_today_assignment()');
console.log('idempotent:', a2.length === a.length);
console.log('inactive excluded:', !(await q(`select 1 from words where term='비활성어' and id = any($1)`, [a.map(r=>r.word_id)])).length);
console.log('first assigned has quiz (금리):', a[0].word_id === wid);
console.log('learner sees approved content only:', (await q('select id, kind from word_contents')).map(r=>r.kind).join(','));
try { await q('select answer_index from word_contents'); console.log('FAIL answer visible'); } catch { console.log('answer_index hidden from learner ✓'); }
try { await db.exec(`update profiles set role='content_admin'`); console.log('FAIL role escalation'); } catch { console.log('role escalation blocked ✓'); }

const cid = '22222222-2222-2222-2222-222222222222';
const r1 = await q(`select * from submit_quiz_attempt($1,$2,1,'new')`, [cid, quizId]);
const r2 = await q(`select * from submit_quiz_attempt($1,$2,0,'new')`, [cid, quizId]);
console.log('submit:', r1[0], '\nretry same id:', r2[0]);
console.log('attempt rows:', (await q('select count(*)::int n from quiz_attempts'))[0].n);
console.log('assignment completed:', (await q(`select quiz_completed_at is not null c from daily_assignments where word_id=${wid}`))[0].c);
try { await db.exec(`insert into quiz_attempts (user_id, client_attempt_id, word_id, content_id, context, selected_index, is_correct) values ('${U}', gen_random_uuid(), ${wid}, ${quizId}, 'new', 0, true)`); console.log('FAIL direct insert'); } catch { console.log('direct attempt insert blocked ✓'); }
await db.exec(`insert into review_schedule (user_id, word_id, due_date) values ('${U}', ${wid}, '2026-11-10')`);
console.log('own schedule insert ok');
// 뜻 고르기 퀴즈 (검수 퀴즈 없는 단어용)
const perId = (await q(`select id from words where term='PER'`))[0].id;
const choices = await q('select * from get_meaning_quiz($1)', [perId]);
console.log('meaning quiz 4 choices incl. answer:', choices.length === 4 && choices.some((c) => c.choice_word_id === perId) ? '✓' : 'FAIL ' + JSON.stringify(choices));
console.log('meaning quiz excludes inactive:', choices.every((c) => c.text !== 'x') ? '✓' : 'FAIL');
const mid = '33333333-3333-3333-3333-333333333333';
const wrong = choices.find((c) => c.choice_word_id !== perId).choice_word_id;
const m1 = (await q('select * from submit_meaning_quiz($1,$2,$3,$4)', [mid, perId, wrong, 'new']))[0];
const m2 = (await q('select * from submit_meaning_quiz($1,$2,$3,$4)', [mid, perId, perId, 'new']))[0];
console.log('meaning submit wrong→false, retry keeps first result:', m1.is_correct === false && m2.already_recorded && m2.is_correct === false ? '✓' : 'FAIL');
console.log('meaning quiz completes assignment:', (await q(`select quiz_completed_at is not null c from daily_assignments where word_id=${perId}`))[0].c ? '✓' : 'FAIL');
await db.exec('reset role');
