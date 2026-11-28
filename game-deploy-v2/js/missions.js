// ==========================================================
// 任務（Night Watch 夜間警備）
// ==========================================================
// 図鑑の隣にある任務タブからミニゲームを起動し、クリア結果を受け取って
// ガチャチケットを配る。ミニゲーム自体は minigames/night-watch に置いた
// 単体HTMLで、親とは postMessage だけでやり取りする。

const NIGHT_WATCH_URL = 'minigames/night-watch/index.html';

// 報酬。依頼の指定どおり。
// - 手動（非オート）クリア: 通常チケット 10枚
// - 初クリア: 50枚
// - DAY 5 / DAY 10 の初クリア: レアチケット 100枚
const NIGHT_WATCH_REWARD = {
    clearNormal: 10,
    firstClearNormal: 50,
    milestoneRare: 100,
    milestoneDays: [5, 10]
};

function getNightWatchProgress() {
    if (!state.nightWatch || typeof state.nightWatch !== 'object') {
        state.nightWatch = { clearedDays: [], rewardedFirst: [], log: [] };
    }
    const p = state.nightWatch;
    if (!Array.isArray(p.clearedDays)) p.clearedDays = [];
    if (!Array.isArray(p.rewardedFirst)) p.rewardedFirst = [];
    if (!Array.isArray(p.log)) p.log = [];
    return p;
}

function openNightWatch() {
    const overlay = document.getElementById('night-watch-overlay');
    const frame = document.getElementById('night-watch-frame');
    if (!overlay || !frame) return;

    SoundEngine.init();
    SoundEngine.playUI('click');

    // 毎回リロードして前回の状態を持ち越さない（ゲーム側のセーブは別キー）。
    frame.src = `${NIGHT_WATCH_URL}?t=${Date.now()}`;
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');

    // ミニゲーム中も列車は稼ぎ続ける（オート進軍を維持）。
    startBackgroundFarming();
}

function closeNightWatch() {
    const overlay = document.getElementById('night-watch-overlay');
    const frame = document.getElementById('night-watch-frame');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
    // 中断時は音を止める（ミニゲーム側のBGMが残らないように）。
    if (frame) frame.src = 'about:blank';
    stopBackgroundFarming();
    renderMissionTab();
}

// ミニゲームからのクリア通知を受け取る。
window.addEventListener('message', event => {
    const data = event.data;
    if (!data || data.type !== 'night-watch-clear') return;
    // 同一オリジンの iframe からのみ受け付ける。
    if (event.origin !== window.location.origin && event.origin !== 'null') return;
    handleNightWatchClear(Number(data.day) || 0, !!data.auto);
});

function handleNightWatchClear(day, wasAuto) {
    if (!day || day < 1) return;
    const progress = getNightWatchProgress();

    const isFirstClear = !progress.rewardedFirst.includes(day);
    if (!progress.clearedDays.includes(day)) progress.clearedDays.push(day);
    progress.clearedDays.sort((a, b) => a - b);

    // オート監視AIでのクリアは報酬対象外。記録だけ残す。
    if (wasAuto) {
        progress.log.unshift({
            day,
            at: Date.now(),
            normal: 0,
            rare: 0,
            auto: true,
            note: '自動監視AIのため報酬なし'
        });
        progress.log = progress.log.slice(0, 20);
        saveGame(true);
        renderMissionTab();
        showToast(`🌙 DAY ${day} クリア（自動監視AI）— 報酬対象外`);
        return;
    }

    let normal = NIGHT_WATCH_REWARD.clearNormal;
    let rare = 0;

    if (isFirstClear) {
        if (NIGHT_WATCH_REWARD.milestoneDays.includes(day)) {
            // 5日目・10日目の初クリアはレアチケット。
            rare = NIGHT_WATCH_REWARD.milestoneRare;
            normal = NIGHT_WATCH_REWARD.firstClearNormal;
        } else {
            normal = NIGHT_WATCH_REWARD.firstClearNormal;
        }
        progress.rewardedFirst.push(day);
    }

    if (!state.gachaTickets || typeof state.gachaTickets !== 'object') {
        state.gachaTickets = { normal: 0, rare: 0 };
    }
    state.gachaTickets.normal = toNonNegativeInt(state.gachaTickets.normal) + normal;
    state.gachaTickets.rare = toNonNegativeInt(state.gachaTickets.rare) + rare;

    progress.log.unshift({ day, at: Date.now(), normal, rare, auto: false });
    progress.log = progress.log.slice(0, 20);

    SoundEngine.playUI('upgrade');
    const parts = [`通常×${normal}`];
    if (rare > 0) parts.push(`レア×${rare}`);
    showToast(`🌙 DAY ${day} 警備完了！ 🎟 ${parts.join(' / ')}`);
    updateHeaderUI();
    saveGame(true);
    renderMissionTab();
}

// 任務タブの描画。カード部分は静的なので、数値だけ更新する。
function renderMissionTab() {
    const host = document.getElementById('mission-reward-log');
    if (!host) return;
    const progress = getNightWatchProgress();

    const countEl = document.getElementById('mission-cleared-count');
    if (countEl) countEl.textContent = String(progress.clearedDays.length);

    if (!progress.log.length) {
        host.innerHTML = `<div class="bg-slate-900/60 border border-slate-700 rounded-lg p-3 text-[11px] text-slate-400 text-center">
            まだ警備実績がありません。警備シフトに入り、DAY 1 の夜を明けましょう。
        </div>`;
        return;
    }

    host.innerHTML = progress.log.map(entry => {
        const rewards = [];
        if (entry.normal > 0) rewards.push(`通常×${entry.normal}`);
        if (entry.rare > 0) rewards.push(`レア×${entry.rare}`);
        const rewardText = rewards.length ? rewards.join(' / ') : (entry.note || '報酬なし');
        const tone = entry.auto ? 'text-slate-400' : 'text-emerald-300';
        return `<div class="flex items-center justify-between gap-2 bg-slate-900/70 border border-slate-700 rounded px-2.5 py-1.5 text-[11px]">
            <span class="tech-font text-slate-300">DAY ${entry.day}${entry.auto ? '（自動AI）' : ''}</span>
            <span class="${tone} font-bold">${rewardText}</span>
        </div>`;
    }).join('');
}

// ==========================================================
// ミニゲーム中の背後稼働
// ==========================================================
// メインの gameLoop は requestAnimationFrame で回っているため、
// ミニゲームを開いてもシミュレーション自体は止まらない。
// ここでは「オート進軍が切れていたら入れる」「離脱時に戻す」だけを扱う。
let nightWatchResumeAuto = false;

function startBackgroundFarming() {
    // オートでないと背後で稼げないので、任務中は自動進軍を有効にする。
    if (typeof state.autoMarch !== 'undefined' && !state.autoMarch) {
        nightWatchResumeAuto = true;
        state.autoMarch = true;
        if (typeof syncPlaybackControlsUI === 'function') syncPlaybackControlsUI();
    }
    if (!state.inWave && typeof startWave === 'function') {
        // 進軍していなければ開始して、裏で金とチケットを拾わせる。
        try { startWave(); } catch (e) {}
    }
}

function stopBackgroundFarming() {
    // 任務のために付けたオートだけを戻す（元からONなら触らない）。
    if (nightWatchResumeAuto) {
        state.autoMarch = false;
        nightWatchResumeAuto = false;
        if (typeof syncPlaybackControlsUI === 'function') syncPlaybackControlsUI();
    }
}
