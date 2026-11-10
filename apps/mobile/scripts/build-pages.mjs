// GitHub Pages 웹 빌드: https://minjtheninja.github.io/Econary/app/ 에서 iPhone '홈 화면에 추가'로 앱처럼 쓰는 용도.
// app.json 은 그대로 두고 이 빌드에서만 baseUrl(/Econary/app)을 넣은 뒤 export → 홈 화면 앱 메타·아이콘·manifest 를 붙인다.
// 사용: apps/mobile 에서 `node scripts/build-pages.mjs [출력 폴더]` (기본 dist-pages). CI(.github/workflows/pages.yml)가 site/app 으로 빌드.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const BASE = '/Econary/app';
const OUT = process.argv[2] ?? 'dist-pages';
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

for (const k of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']) {
  if (!process.env[k] && !(existsSync('.env') && readFileSync('.env', 'utf8').includes(`${k}=`))) fail(`${k} 가 없어요`);
}

// 1) baseUrl 을 넣은 app.json 으로 export, 끝나면 원래대로
const appJson = readFileSync('app.json', 'utf8');
const conf = JSON.parse(appJson);
conf.expo.experiments = { ...conf.expo.experiments, baseUrl: BASE };
writeFileSync('app.json', JSON.stringify(conf, null, 2));
rmSync(OUT, { recursive: true, force: true });
try {
  execSync(`npx expo export --platform web --output-dir ${OUT} --clear`, { stdio: 'inherit' });
} finally {
  writeFileSync('app.json', appJson);
}

// 2) 홈 화면 앱: 아이콘, manifest, iOS 메타 (standalone 으로 열리고 상태바는 화면 배경 위)
copyFileSync('assets/icon.png', join(OUT, 'apple-touch-icon.png'));
writeFileSync(
  join(OUT, 'manifest.webmanifest'),
  JSON.stringify(
    {
      name: 'Econary',
      short_name: 'Econary',
      lang: 'ko',
      start_url: `${BASE}/`,
      scope: `${BASE}/`,
      display: 'standalone',
      background_color: '#F2F2F7',
      theme_color: '#F2F2F7',
      icons: [{ src: `${BASE}/apple-touch-icon.png`, sizes: '1024x1024', type: 'image/png', purpose: 'any' }],
    },
    null,
    2,
  ),
);

const htmlPath = join(OUT, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
const head = [
  `<link rel="manifest" href="${BASE}/manifest.webmanifest" />`,
  `<link rel="apple-touch-icon" href="${BASE}/apple-touch-icon.png" />`,
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-title" content="Econary" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
  '<meta name="theme-color" content="#F2F2F7" media="(prefers-color-scheme: light)" />',
  '<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />',
].join('\n    ');
html = html
  .replace('<html lang="en">', '<html lang="ko">')
  // viewport-fit=cover: 노치·홈 인디케이터 영역까지 그리고 safe area 는 앱이 처리. 핀치 줌 끔 (앱처럼)
  .replace(
    /<meta name="viewport"[^>]*>/,
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />',
  )
  .replace('</head>', `    ${head}\n  </head>`);
if (!html.includes('apple-mobile-web-app-capable') || !html.includes('viewport-fit=cover')) fail('index.html 보정에 실패했어요');
writeFileSync(htmlPath, html);

// 3) 화면 주소마다 같은 index.html 을 둔다 (Pages 는 /auth-callback 을 auth-callback.html 로 연다).
//    없으면 404 로 가서 ?code= 가 사라진다 — Google 계정 연결이 앱에 반영되지 않던 원인
const routes = [];
const walk = (dir, prefix) => {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    if (f.isDirectory()) walk(join(dir, f.name), /^\(.*\)$/.test(f.name) ? prefix : `${prefix}${f.name}/`);
    else if (/\.tsx?$/.test(f.name) && !/^[_+]/.test(f.name) && !f.name.includes('[')) {
      const name = f.name.replace(/\.tsx?$/, '');
      if (name !== 'index' && !prefix.includes('[')) routes.push(`${prefix}${name}`);
    }
  }
};
walk('src/app', '');
for (const r of routes) {
  mkdirSync(dirname(join(OUT, `${r}.html`)), { recursive: true });
  writeFileSync(join(OUT, `${r}.html`), html);
}
console.log(`화면 주소: ${routes.join(', ')}`);

console.log(`\n✔ ${OUT}: ${BASE}/ 용 웹 빌드 + 홈 화면 앱 메타`);
