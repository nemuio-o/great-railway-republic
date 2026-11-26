// 本番（Cloudflare Pages）に配信されているファイルが、リポジトリの内容と
// 一致しているかを検証する。デプロイ直後に CI から実行する想定。
//
// 使い方:
//   node scripts/verify-deploy.mjs [--base https://example.pages.dev] [--dir dist]
//
// --dir を dist にすると、ビルド時にアセットURLへ付与した ?v= を無視して比較する。
// 終了コード 0 = すべて一致 / 1 = 不一致または取得失敗。

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const DIR = join(ROOT, getArg('--dir', 'game-deploy-v2'));
const BASE = getArg('--base', 'https://great-railway-republic.pages.dev').replace(/\/+$/, '');

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

// 改行コードの違いや ?v= の有無で落とさないよう揃えてから比較する。
const normalize = text => text
    .replace(/\r\n/g, '\n')
    .replace(/((?:src|href)="(?:js|css)\/[^"?]+\.(?:js|css))\?v=[^"]*"/g, '$1"')
    .trimEnd();

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
        const local = normalize(await readFile(join(DIR, target.local), 'utf8'));
        const remote = normalize(await fetchText(target.path));
        const ok = local === remote;
        results.push({
            file: target.local,
            ok,
            detail: ok
                ? sha(local)
                : `local ${sha(local)} / remote ${sha(remote)} (${local.length} vs ${remote.length} chars)`
        });
    } catch (error) {
        results.push({ file: target.local, ok: false, detail: `取得失敗: ${error.message}` });
    }
}

// ビルドIDが配信物と一致しているかも見る（どのビルドが生きているかの断定に使う）。
let buildLine = '';
try {
    const localIndex = await readFile(join(DIR, 'index.html'), 'utf8');
    const remoteIndex = await fetchText('/');
    const pick = text => (text.match(/build\s+([0-9A-Za-z_-]+)/) || [])[1] || null;
    const localId = pick(localIndex);
    const remoteId = pick(remoteIndex);
    if (localId) {
        const same = localId === remoteId;
        buildLine = `build id: local ${localId} / remote ${remoteId ?? '(なし)'}${same ? '' : ' ←不一致'}`;
        if (!same) results.push({ file: '(build id)', ok: false, detail: buildLine });
    }
} catch {
    // build id の確認は補助情報なので、失敗しても本判定は続ける。
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
