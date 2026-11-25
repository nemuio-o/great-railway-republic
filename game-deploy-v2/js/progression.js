// ==========================================================
// 進行度による解放（セフィラ / 機能タブ）
// ----------------------------------------------------------
// 解放条件はすべてここで一元管理する。個々の画面や処理に
// 条件を散らさないこと（調整時に1か所だけ直せば済むようにする）。
//
// 判定に使うのは「到達済みの累計」ではなく、周回をまたいで残る値だけ:
//   - prestigeCount           転生回数（永続）
//   - maxReachedStages        勢力ごとの最高到達ステージ（永続）
//   - clearedFactions         制圧済み勢力（永続）
// ==========================================================

// セフィラの解放条件。ステージは「指定勢力の指定ステージに到達」で判定する。
// 1周目で全員は揃わないよう、勢力の進行に合わせて段階的に配る。
const SEPHIRA_UNLOCKS = [
    { id: 'tiphareth', factionId: 'pol', stage: 1 },              // 初期（艦長）
    { id: 'geburah',   factionId: 'pol', stage: 5 },              // チュートリアル中盤
    { id: 'netzach',   factionId: 'pol', stage: 10 },             // チュートリアル踏破
    { id: 'chokmah',   factionId: 'un',  stage: 5 },
    { id: 'hod',       factionId: 'un',  stage: 15 },
    { id: 'binah',     factionId: 'un',  stage: 30 },             // 国連制圧
    { id: 'yesod',     factionId: 'usa', stage: 10 },
    { id: 'chesed',    factionId: 'chn', stage: 20 },
    { id: 'malkuth',   factionId: 'isl', stage: 30 },
    { id: 'kether',    factionId: 'rus', stage: 30 }              // 王冠は終盤
];

// 機能タブの解放条件。type は 'faction'（勢力制圧）/ 'stage'（指定勢力のステージ到達）
// / 'prestige'（転生回数）。requirement は画面表示用の短文。
const TAB_UNLOCKS = {
    train:  { type: 'none' },
    rd:     { type: 'none' },
    world:  { type: 'none' },
    staff:  { type: 'stage', factionId: 'pol', stage: 5, requirement: '国連警察 STAGE 5 到達' },
    skills: { type: 'stage', factionId: 'pol', stage: 10, requirement: '国連警察 STAGE 10 到達' },
    escort: { type: 'faction', factionId: 'un', requirement: '国連防衛軍を制圧' },
    gacha:  { type: 'faction', factionId: 'usa', requirement: 'アメリカ合衆国を制圧' },
    weapons:{ type: 'faction', factionId: 'chn', requirement: '中華人民共和国を制圧' },
    prestige:{ type: 'prestigeOrStage', factionId: 'usa', stage: 30, count: 1, requirement: 'アメリカ合衆国 STAGE 30 到達' },
    dex:    { type: 'prestige', count: 1, requirement: '転生 1 回' }
};

function getSephiraUnlockDef(sephId) {
    return SEPHIRA_UNLOCKS.find(u => u.id === sephId) || null;
}

function getSephiraUnlockText(sephId) {
    const def = getSephiraUnlockDef(sephId);
    if (!def) return '解放済み';
    const faction = FACTIONS.find(f => f.id === def.factionId);
    const name = faction ? faction.name : def.factionId;
    return `戦線「${name}」STAGE ${def.stage} 到達`;
}

function isSephiraUnlocked(sephId) {
    const def = getSephiraUnlockDef(sephId);
    if (!def) return true;
    if (state.hiredSephiroth.includes(sephId)) return true;
    const reached = state.maxReachedStages[def.factionId] || 1;
    return reached >= def.stage;
}

// 到達済みなのに未雇用のセフィラを自動で雇用する。追加した数を返す。
function autoUnlockSephiroth(notify = false) {
    if (!Array.isArray(state.hiredSephiroth)) state.hiredSephiroth = ['tiphareth'];
    const newly = [];
    SEPHIROTH.forEach(s => {
        if (state.hiredSephiroth.includes(s.id)) return;
        const def = getSephiraUnlockDef(s.id);
        if (!def) return;
        const reached = state.maxReachedStages[def.factionId] || 1;
        if (reached < def.stage) return;
        state.hiredSephiroth.push(s.id);
        newly.push(s);
    });
    if (newly.length > 0 && notify) {
        const names = newly.map(s => s.name.split(' ')[0]).join('・');
        showToast(`👤 新たなセフィラが参集しました: ${names}`);
        SoundEngine.playUI('upgrade');
    }
    return newly.length;
}

function isTabUnlocked(tabId) {
    const def = TAB_UNLOCKS[tabId];
    if (!def || def.type === 'none') return true;
    if (def.type === 'prestige') return (Number(state.prestigeCount) || 0) >= (def.count || 1);
    // 一度転生していれば、以後は到達条件を問わず解放する（永続解禁）。
    if (def.type === 'prestigeOrStage') {
        if ((Number(state.prestigeCount) || 0) >= (def.count || 1)) return true;
        return (state.maxReachedStages[def.factionId] || 1) >= def.stage;
    }
    if (def.type === 'faction') return Array.isArray(state.clearedFactions) && state.clearedFactions.includes(def.factionId);
    if (def.type === 'stage') {
        const reached = state.maxReachedStages[def.factionId] || 1;
        return reached >= def.stage;
    }
    return true;
}

function getTabLockText(tabId) {
    const def = TAB_UNLOCKS[tabId];
    return def && def.requirement ? def.requirement : '';
}

// 解放済みタブの一覧（順序は表示順）。
function getUnlockedTabIds() {
    return Object.keys(TAB_UNLOCKS).filter(id => isTabUnlocked(id));
}

// 未解放のタブが押されたときの共通処理。
function handleLockedTabAttempt(tabId) {
    const text = getTabLockText(tabId);
    if (!text) return false;
    showToast(`🔒 この機能はまだ解放されていません（${text}）`);
    SoundEngine.playUI('denied');
    return true;
}
