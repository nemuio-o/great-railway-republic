// 本番（Cloudflare Pages）に配信されているファイルが、リポジトリの内容と
// 一致しているかを検証する。デプロイ直後に CI から実行する想定。
//
// 使い方:
//   node scripts/verify-deploy.mjs [--base https://example.pages.dev]
//
// 終了コード 0 = すべて一致 / 1 = 不一致または取得失敗。

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', 'game-deploy-v2');

// 配信対象のうち、中身がそのまま出るものだけを突き合わせる。
// /index.html は Pages が / へ 308 するので / を取得する。
const TARGETS = [
    { local: 'index.html', path: '/' },
    { local: 'js/game.js', path: '/js/game.js' },
    { local: 'js/gacha.js', path: '/js/gacha.js' },
    { local: 'js/state.js', path: '/js/state.js' },
    { local: 'js/data.js', path: '/js/data.js' },
    { local: 'js/progression.js', path: '/js/progression.js' },
    { local: 'js/weapon-names.js', path: '/js/weapon-names.js' },
    { local: 'js/tutorial.js', path: '/js/tutorial.js' },
    { local: 'css/styles.css', path: '/css/styles.css' }
];

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const BASE = (baseIdx >= 0 ? args[baseIdx + 1] : 'https://great-railway-republic.pages.dev')
    .replace(/\/+$/, '');

// 改行コードの違いで落とさないよう LF に揃えて比較する。
const normalize = text => text.replace(/\r\n/g, '\n').trimEnd();

const sha = text => createHash('sha256').update(normalize(text), 'utf8').digest('hex').slice(0, 12);

// 古いキャッシュを掴まないよう、毎回ユニークなクエリを付けて取得する。
async function fetchText(path) {
    const url = `${BASE}${path}?verify=${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}

const results = [];
for (const target of TARGETS) {
    try {
        const local = normalize(await readFile(join(ROOT, target.local), 'utf8'));
        const remote = normalize(await fetchText(target.path));
        results.push({
            file: target.local,
            ok: local === remote,
            detail: local === remote
                ? `${sha(local)}`
                : `local ${sha(local)} / remote ${sha(remote)} (${local.length} vs ${remote.length} chars)`
        });
    } catch (error) {
        results.push({ file: target.local, ok: false, detail: `取得失敗: ${error.message}` });
    }
}

const width = Math.max(...results.map(r => r.file.length));
for (const r of results) {
    console.log(`${r.ok ? 'OK  ' : 'NG  '} ${r.file.padEnd(width)}  ${r.detail}`);
}

const failed = results.filter(r => !r.ok);
if (failed.length) {
    console.error(`\n${failed.length} 件が本番と一致しません（base: ${BASE}）`);
    process.exit(1);
}
console.log(`\nすべて一致: ${results.length} ファイル（base: ${BASE}）`);
