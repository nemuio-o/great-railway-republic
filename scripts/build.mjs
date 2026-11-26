// デプロイ用のビルドを作る。
// 配信物そのもの（game-deploy-v2）は書き換えず、dist/ に複製してから
// JS/CSS の参照URLへビルドIDを付ける。これでブラウザが古いJSを掴まない。
//
// 使い方:
//   node scripts/build.mjs            # dist/ を作る（build id は時刻）
//   node scripts/build.mjs --id abc123
//
// 出力: dist/ … Cloudflare Pages へアップロードするディレクトリ

import { cp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(ROOT, 'game-deploy-v2');
const DIST = join(ROOT, 'dist');

const args = process.argv.slice(2);
const idIdx = args.indexOf('--id');
const BUILD_ID = (idIdx >= 0 ? args[idIdx + 1] : '')
    || new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

if (existsSync(DIST)) await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(SRC, DIST, { recursive: true });

const indexPath = join(DIST, 'index.html');
let html = await readFile(indexPath, 'utf8');

// 自前のアセットだけに版を付ける（CDN の Tailwind や Google Fonts は対象外）。
const before = html;
html = html.replace(
    /(src|href)="((?:js|css)\/[^"?]+\.(?:js|css))"/g,
    (_m, attr, path) => `${attr}="${path}?v=${BUILD_ID}"`
);

if (html === before) {
    console.error('アセットの参照が見つかりませんでした。index.html の構造を確認してください。');
    process.exit(1);
}

// ヘッダーのビルド表示にも同じIDを埋める。
html = html.replace('build —', `build ${BUILD_ID}`);

await writeFile(indexPath, html, 'utf8');

// 検証用に、どのIDで作ったかを残す。
await writeFile(join(DIST, 'build-id.txt'), `${BUILD_ID}\n`, 'utf8');

// 参照が付いたかを自己確認する（付いていなければデプロイしない）。
const check = await readFile(indexPath, 'utf8');
const stamped = (check.match(/\?v=/g) || []).length;
if (stamped === 0) {
    console.error('アセットURLにビルドIDが付与されませんでした。');
    process.exit(1);
}

const digest = createHash('sha256').update(check, 'utf8').digest('hex').slice(0, 12);
console.log(`build id : ${BUILD_ID}`);
console.log(`assets   : ${stamped} 件に ?v=${BUILD_ID} を付与`);
console.log(`dist     : ${DIST}`);
console.log(`index    : ${digest}`);
