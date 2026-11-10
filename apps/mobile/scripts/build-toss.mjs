// 토스 미니앱 빌드: EXPO_PUBLIC_TARGET=toss 웹 export → 단일 번들·eval 없음 검사 → index.html 보정 → ait build.
// 사용: apps/mobile 에서 `npm run build:toss` (--skip-ait: .ait 를 만들지 않고 dist-toss 만)
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'dist-toss';
const skipAit = process.argv.includes('--skip-ait');
const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

rmSync(OUT, { recursive: true, force: true });
// --clear: metro.config.js 의 토스 전용 대체 모듈이 이전(일반 웹) 캐시와 섞이지 않게
run(`npx expo export --platform web --output-dir ${OUT} --clear`, { EXPO_PUBLIC_TARGET: 'toss' });

// 1) 한 번들: 지연 청크 로더(eval)를 쓰지 않도록 화면 청크 분할이 없어야 한다
const jsDir = join(OUT, '_expo', 'static', 'js', 'web');
const bundles = readdirSync(jsDir).filter((f) => f.endsWith('.js'));
if (bundles.length !== 1) fail(`JS 번들이 ${bundles.length}개예요 (1개여야 함): ${bundles.join(', ')}`);

// 2) eval·new Function 금지 (앱인토스 보안 체크리스트)
const banned = [/\beval\s*\(/, /\bnew\s+Function\s*\(/];
for (const f of bundles) {
  const src = readFileSync(join(jsDir, f), 'utf8');
  for (const re of banned) {
    const m = src.match(re);
    if (m) fail(`${f} 에 ${m[0]} 이 있어요: …${src.slice(Math.max(0, m.index - 120), m.index + 60)}…`);
  }
}

// 3) index.html: 한국어, 라이트 모드만, 핀치 줌 끔, 첫 화면 전 배경색
const htmlPath = join(OUT, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
html = html
  .replace('<html lang="en">', '<html lang="ko">')
  .replace(
    /<meta name="viewport"[^>]*>/,
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />\n    <meta name="color-scheme" content="light" />',
  )
  .replace('</style>', '  body { background-color: #F2F2F7; }\n    </style>');
if (!html.includes('user-scalable=no') || !html.includes('color-scheme')) fail('index.html 보정에 실패했어요');
writeFileSync(htmlPath, html);

const size = (dir) => readdirSync(dir).reduce((n, f) => {
  const p = join(dir, f);
  const s = statSync(p);
  return n + (s.isDirectory() ? size(p) : s.size);
}, 0);
console.log(`\n✔ ${OUT}: 번들 ${bundles[0]}, 전체 ${(size(OUT) / 1024 / 1024).toFixed(1)}MB (한도 100MB), eval 없음`);

if (!skipAit) run('npx ait build', { AIT_LANG: 'ko' });
