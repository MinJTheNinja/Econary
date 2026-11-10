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
// 오류 신고 (PRD 7.1)
await db.exec(`insert into content_reports (user_id, word_id, target, reason, note) values ('${U}', ${perId}, 'word_meaning', 'wrong_meaning', '뜻이 이상해요')`);
await db.exec(`insert into content_reports (user_id, word_id, content_id, target, reason) values ('${U}', ${wid}, ${quizId}, 'quiz', 'wrong_answer')`);
console.log('learner can report meaning and quiz:', (await q('select count(*)::int n from content_reports'))[0].n === 2 ? '✓' : 'FAIL');
try { await db.exec(`insert into content_reports (user_id, word_id, target, reason) values ('${U}', ${wid}, 'quiz', 'other')`); console.log('FAIL quiz report without content'); }
catch { console.log('quiz report needs content id ✓'); }
try { await db.exec(`insert into content_reports (user_id, word_id, target, reason) values ('44444444-4444-4444-4444-444444444444', ${wid}, 'word_meaning', 'other')`); console.log('FAIL report as other user'); }
catch { console.log('cannot report as another user ✓'); }
await db.exec('reset role');

// ───────── 학습 계획 (시험일 + 하루 공부 시간) ─────────
const pq = async (rem, learned, days, min) => (await q('select * from plan_quota($1,$2,$3,$4)', [rem, learned, days, min]))[0];
const eq = (label, got, want) => console.log(label, JSON.stringify(got) === JSON.stringify(want) ? '✓' : `FAIL ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
eq('plan: no exam → capacity', await pq(1000, 0, null, 20), { quota: 20, phase: 'open', learn_days: null });
eq('plan: exam passed → capacity', await pq(1000, 5, 0, 10), { quota: 10, phase: 'open', learn_days: null });
eq('plan: spread over learn days', await pq(300, 0, 37, 30), { quota: 10, phase: 'learn', learn_days: 30 });
eq('plan: capped by time', await pq(3000, 0, 37, 10), { quota: 10, phase: 'learn', learn_days: 30 });
eq('plan: min 3 a day', await pq(20, 0, 60, 30), { quota: 3, phase: 'learn', learn_days: 53 });
eq('plan: 60min cap 50', await pq(3000, 0, 20, 60), { quota: 50, phase: 'learn', learn_days: 13 });
eq('plan: final week review only', await pq(500, 40, 7, 20), { quota: 0, phase: 'review', learn_days: 0 });
eq('plan: final week but nothing learned', await pq(500, 0, 5, 20), { quota: 20, phase: 'learn', learn_days: 1 });

const U2 = '55555555-5555-5555-5555-555555555555';
await db.exec(`insert into auth.users values ('${U2}')`);
const roundId = (await q(`insert into exam_rounds (round, exam_date) values (999, kst_today() + 37) returning id`))[0].id;
await db.exec(`set test.uid = '${U2}'; set role authenticated;`);
console.log('learner reads exam rounds:', (await q('select count(*)::int n from exam_rounds'))[0].n >= 1 ? '✓' : 'FAIL');
try { await db.exec(`insert into exam_rounds (round, exam_date) values (1000, '2027-01-01')`); console.log('FAIL learner wrote exam round'); }
catch { console.log('learner cannot write exam rounds ✓'); }
eq('not onboarded → level fallback', (await q('select quota, phase from get_my_plan()'))[0], { quota: 10, phase: 'open' });
await db.exec(`update profiles set exam_round_id=${roundId}, daily_minutes=10, onboarded_at=now()`);
try { await db.exec(`update profiles set daily_minutes=15`); console.log('FAIL invalid minutes'); } catch { console.log('invalid daily minutes rejected ✓'); }
try { await db.exec(`update profiles set role='quality_admin'`); console.log('FAIL role escalation'); } catch { console.log('role still not updatable ✓'); }
const plan = (await q('select * from get_my_plan()'))[0];
// 활성 단어 5개, 30일에 나누면 하루 1개 → 최소 3개
eq('my plan', { quota: plan.quota, phase: plan.phase, days_left: plan.days_left, remaining: plan.remaining, exam_round: plan.exam_round },
  { quota: 3, phase: 'learn', days_left: 37, remaining: 5, exam_round: 999 });
console.log('today assignment follows plan (3):', (await q('select * from get_or_create_today_assignment()')).length === 3 ? '✓' : 'FAIL');
// 계획을 바꾸면 오늘 배정도 바로: 늘리면 추가, 줄이면 손대지 않은 단어만 뒤에서 뺀다
await db.exec('reset role');
const firstToday = (await q(`select word_id from daily_assignments where user_id = $1 and assign_date = kst_today() order by position limit 1`, [U2]))[0].word_id;
await db.exec(`update daily_assignments set content_viewed_at = now() where user_id = '${U2}' and word_id = ${firstToday}`);
await db.exec(`set test.uid = '${U2}'; set role authenticated;`);
await db.exec(`update profiles set exam_round_id = null`); // 미정 → 하루 10개 (단어는 5개뿐)
const grown = await q('select word_id, position from get_or_create_today_assignment()');
console.log('plan up → today topped up to 5, no duplicates:', grown.length === 5 && new Set(grown.map((r) => r.word_id)).size === 5 ? '✓' : `FAIL ${grown.length}`);
await db.exec(`update profiles set exam_round_id = ${roundId}`); // 다시 하루 3개
const shrunk = await q('select word_id from get_or_create_today_assignment()');
console.log('plan down → back to 3, started word kept:', shrunk.length === 3 && shrunk.some((r) => r.word_id === firstToday) ? '✓' : `FAIL ${shrunk.length}`);
await db.exec('reset role');

// ───────── 계정 삭제 ─────────
const firstAssigned = (await q(`select word_id from daily_assignments where user_id = $1 limit 1`, [U2]))[0].word_id;
const contentId = (await q(`select id from word_contents where word_id = $1 limit 1`, [firstAssigned]))[0]?.id;
if (contentId) await db.exec(`insert into content_reports (user_id, word_id, content_id, reason) values ('${U2}', ${firstAssigned}, ${contentId}, 'typo')`);
await db.exec(`set test.uid = '${U2}'; set role authenticated;`);
await db.exec(`select delete_my_account()`);
await db.exec('reset role');
const left = (await q(`select
  (select count(*) from auth.users where id = $1)::int users,
  (select count(*) from profiles where user_id = $1)::int profiles,
  (select count(*) from daily_assignments where user_id = $1)::int assignments`, [U2]))[0];
eq('delete account removes learner data', left, { users: 0, profiles: 0, assignments: 0 });
if (contentId) console.log('reports kept but detached:', (await q(`select count(*)::int n from content_reports where content_id = $1 and user_id is null`, [contentId]))[0].n === 1 ? '✓' : 'FAIL');
const STAFF = '66666666-6666-6666-6666-666666666666';
await db.exec(`insert into auth.users values ('${STAFF}'); update profiles set role = 'content_admin' where user_id = '${STAFF}'`);
await db.exec(`set test.uid = '${STAFF}'; set role authenticated;`);
try { await db.exec(`select delete_my_account()`); console.log('FAIL staff deleted'); } catch { console.log('staff account cannot self-delete ✓'); }
await db.exec('reset role');
await db.exec(`set role anon; set test.uid = '';`);
try { await db.exec(`select delete_my_account()`); console.log('FAIL anon called delete'); } catch { console.log('anon cannot call delete ✓'); }
await db.exec('reset role');
