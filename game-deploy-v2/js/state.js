let state = {
    currentWorldTab: 'real',
    darkWorldUnlocked: false,
    currentFactionId: 'pol',
    unlockedFactions: ['pol'],
    clearedFactions: [],
    // 今回の周回で制圧した勢力。転生条件はこちらだけを見る（累積の clearedFactions と分離）。
    runClearedFactions: [],
    // ステージごとのクリア回数（周回報酬倍率の判定用）。キーは "factionId:stage"。
    stageClearCounts: {},
    factionStages: { pol: 1, un: 1, usa: 1, chn: 1, isl: 1, rus: 1, eu: 1, ter: 1, corp: 1, gew: 1, ant: 1, endless: 1, gew_beacon: 1, dark_abyss: 1, dark_endless: 1 },
    maxReachedStages: { pol: 1, un: 1, usa: 1, chn: 1, isl: 1, rus: 1, eu: 1, ter: 1, corp: 1, gew: 1, ant: 1, endless: 1, gew_beacon: 1, dark_abyss: 1, dark_endless: 1 },
    stage: 1,
    maxStage: 10,
    weather: 'cloudy',
    gold: 300,
    hp: 1000,
    maxHp: 1000,
    armorLevel: 1,
    inWave: false,
    autoMarch: false,
    autoMarchTimer: 0,
    loopStage: false,
    gameSpeed: 1,
    activeTab: 'train',
    dexSubTab: 'boss',
    selectedSephirothTreeNode: 'tiphareth',
    selectedCarIndex: 0,
    cars: [],
    unlockedWeapons: ['railgun_tiphareth', 'mg_vulcan', 'aa_flak'],
    weaponLevels: {
        railgun_tiphareth: 1, mg_vulcan: 1, aa_flak: 1,
        torpedo_launcher: 1, howitzer_heavy: 1, missile_malkuth: 1, laser_kether: 1
    },
    hiredSephiroth: ['tiphareth'],
    sephirahLevels: {
        tiphareth: 1, geburah: 1, netzach: 1, chokmah: 1, hod: 1,
        binah: 1, yesod: 1, chesed: 1, malkuth: 1, kether: 1
    },
    bossRecords: {},
    bossDexFilter: 'all',
    muteBossCutscene: false,
    skipSeenBossCutscene: false,
    equippedEscorts: [],
    escortLevels: {},
    escortDuplicateCounts: {},
    soldEscorts: [],
    beaconKeys: {},
    relics: {},
    sephirothShards: 0,
    prestigeCount: 0,
    prestigeUpgrades: {
        kether: 0, chokmah: 0, binah: 0, chesed: 0, geburah: 0,
        tiphareth: 0, netzach: 0, hod: 0, yesod: 0, malkuth: 0
    },
    skillLevels: { salvo: 1, overdrive: 1, goldrush: 1, shield: 1 },
    activeTactic: 'salvo',
    gachaTickets: { normal: 0, rare: 0 },
    gachaLastResult: null,
    gachaSubTab: 'normal',
    weaponSubTab: 'inventory',
    // 研究開発タブの武装絞り込み。'all' か武装ID。
    rdWeaponFilter: 'all',
    enhanceMaterials: 0,
    escortEnhanceModules: 0,
    escortModuleLevels: {},
    weaponInstances: [],
    weaponNextUid: 1,
    manufacturerGachaUnlocked: {},
    // ティファレトの機能説明を既読したメニューID（初回のみ再生する）。
    tutorialSeen: [],
    // 任務（Night Watch 夜間警備）の進行と報酬履歴。
    nightWatch: { clearedDays: [], rewardedFirst: [], log: [] }
};

function checkAndUnlockAntarcticBase(notify = true) {
    const hasAllKeys = BEACON_KEYS.every(k => !!state.beaconKeys[k.id]);
    if (hasAllKeys && !state.unlockedFactions.includes('ant')) {
        state.unlockedFactions.push('ant');
        if (notify) {
            showToast('🧊 全9種のビーコンキーが共鳴！極秘拠点「Gewinner南極基地」が現実世界にアンロックされました！');
        }
        return true;
    }
    return false;
}

// 戦術マスターデータ
const TACTICAL_MAX_LEVEL = 30;
// 戦術の最終効果。
const TACTICAL_CAPS = {
    salvo: 1.50,      // 全兵装攻撃力 +150%
    overdrive: 3.00,  // 対ボス与ダメージ +300%
    goldrush: 2.00,   // 獲得資金 +200%
    shield: 0.70      // 被ダメージ -70%
};

function getTacticalEffectRatio(level, cap) {
    const lv = Math.max(1, Math.min(TACTICAL_MAX_LEVEL, Math.floor(level) || 1));
    return Math.min(cap, cap * (lv / TACTICAL_MAX_LEVEL));
}

const TACTICAL_SKILLS = [
    {
        id: 'salvo',
        name: '攻撃力上昇',
        shortName: '攻撃力',
        icon: '⚔️',
        color: '#ef4444',
        borderClass: 'border-red-500',
        btnBg: 'bg-red-900/90 hover:bg-red-800 text-red-100',
        baseUpgradeCost: 350,
        desc: '全兵装の攻撃力を常時強化する戦術。選択すると常時稼働する。',
        getAtkBonus: (lv) => getTacticalEffectRatio(lv, TACTICAL_CAPS.salvo),
        getEffectSummary: (lv) => `全兵装攻撃力 +${Math.round(getTacticalEffectRatio(lv, TACTICAL_CAPS.salvo) * 100)}%`,
        getEffectParts: (lv) => [
            { label: '攻撃力', now: `+${Math.round(getTacticalEffectRatio(lv, TACTICAL_CAPS.salvo) * 100)}%`, next: `+${Math.round(getTacticalEffectRatio(lv + 1, TACTICAL_CAPS.salvo) * 100)}%` }
        ]
    },
    {
        id: 'overdrive',
        name: '対ボス攻撃力上昇',
        shortName: '対ボス',
        icon: '🎯',
        color: '#f59e0b',
        borderClass: 'border-amber-500',
        btnBg: 'bg-amber-900/90 hover:bg-amber-800 text-amber-100',
        baseUpgradeCost: 380,
        desc: 'ボスへ与えるダメージを常時強化する戦術。選択すると常時稼働する。',
        getBossBonus: (lv) => getTacticalEffectRatio(lv, TACTICAL_CAPS.overdrive),
        getEffectSummary: (lv) => `対ボス与ダメージ +${Math.round(getTacticalEffectRatio(lv, TACTICAL_CAPS.overdrive) * 100)}%`,
        getEffectParts: (lv) => [
            { label: '対ボス与ダメージ', now: `+${Math.round(getTacticalEffectRatio(lv, TACTICAL_CAPS.overdrive) * 100)}%`, next: `+${Math.round(getTacticalEffectRatio(lv + 1, TACTICAL_CAPS.overdrive) * 100)}%` }
        ]
    },
    {
        id: 'goldrush',
        name: '取得コイン増量',
        shortName: 'コイン',
        icon: '💰',
        color: '#eab308',
        borderClass: 'border-yellow-400',
        btnBg: 'bg-yellow-900/90 hover:bg-yellow-800 text-yellow-100',
        baseUpgradeCost: 420,
        desc: '敵撃破およびステージクリアで得られる資金を常時増やす戦術。',
        getGoldBonus: (lv) => getTacticalEffectRatio(lv, TACTICAL_CAPS.goldrush),
        getEffectSummary: (lv) => `獲得資金 +${Math.round(getTacticalEffectRatio(lv, TACTICAL_CAPS.goldrush) * 100)}%`,
        getEffectParts: (lv) => [
            { label: '獲得資金', now: `+${Math.round(getTacticalEffectRatio(lv, TACTICAL_CAPS.goldrush) * 100)}%`, next: `+${Math.round(getTacticalEffectRatio(lv + 1, TACTICAL_CAPS.goldrush) * 100)}%` }
        ]
    },
    {
        id: 'shield',
        name: '被ダメージ軽減',
        shortName: '防御',
        icon: '🛡️',
        color: '#38bdf8',
        borderClass: 'border-sky-400',
        btnBg: 'bg-sky-900/90 hover:bg-sky-800 text-sky-100',
        baseUpgradeCost: 340,
        desc: '受けるダメージを常時軽減する戦術。選択すると常時稼働する。',
        getDamageReduction: (lv) => getTacticalEffectRatio(lv, TACTICAL_CAPS.shield),
        getEffectSummary: (lv) => `被ダメージ -${Math.round(getTacticalEffectRatio(lv, TACTICAL_CAPS.shield) * 100)}%`,
        getEffectParts: (lv) => [
            { label: '被ダメージ', now: `-${Math.round(getTacticalEffectRatio(lv, TACTICAL_CAPS.shield) * 100)}%`, next: `-${Math.round(getTacticalEffectRatio(lv + 1, TACTICAL_CAPS.shield) * 100)}%` }
        ]
    }
];

// 戦術は「4種のうち1つを選択して常時稼働させる」パッシブ。
// 発動ボタン・クールダウン・効果時間は廃止し、選択中の戦術だけが常に効果を発揮する。
function getTacticById(skillId) {
    return TACTICAL_SKILLS.find(s => s.id === skillId);
}

function getActiveTacticId() {
    const id = state.activeTactic;
    return TACTICAL_SKILLS.some(s => s.id === id) ? id : 'salvo';
}

function isTacticSelected(skillId) {
    return getActiveTacticId() === skillId;
}

// 演出（カットイン／大ボス登場）表示中かどうか。
// オーバーレイの表示状態から判定するため、タイマーが失われても固まらない。
function isCutsceneActive() {
    const cutin = document.getElementById('cutin-overlay');
    const grand = document.getElementById('grand-boss-overlay');
    if (cutin && !cutin.classList.contains('hidden')) return true;
    if (grand && !grand.classList.contains('hidden')) return true;
    return false;
}

function isSkillMaxed(skillId) {
    return getSkillLevel(skillId) >= TACTICAL_MAX_LEVEL;
}

function getSkillLevel(skillId) {
    if (!state.skillLevels || typeof state.skillLevels !== 'object') {
        state.skillLevels = { salvo: 1, overdrive: 1, goldrush: 1, shield: 1 };
    }
    const raw = Number(state.skillLevels[skillId]);
    if (!Number.isFinite(raw) || raw < 1) {
        state.skillLevels[skillId] = 1;
        return 1;
    }
    return Math.floor(raw);
}

function getSkillUpgradeCost(skillId) {
    const sk = TACTICAL_SKILLS.find(s => s.id === skillId);
    if (!sk) return 999999;
    const lv = getSkillLevel(skillId);
    // 武器と同じ伸び率: 武器DPS成長 × レベルコスト倍率 × 転生倍率
    const costMult = Math.pow(getWeaponDamageGrowth(), lv - 1) * getUpgradeLevelCostMult(lv) * getPrestigeCostMult();
    const rawCost = sk.baseUpgradeCost * costMult;
    if (!Number.isFinite(rawCost)) return Infinity;
    return Math.max(100, Math.floor(rawCost));
}

function getActiveSkillAtkMult() {
    if (!isTacticSelected('salvo')) return 1.0;
    const sk = getTacticById('salvo');
    return 1 + sk.getAtkBonus(getSkillLevel('salvo'));
}
// 旧・装填速度戦術は廃止したが、呼び出し側との互換のため素通しにする。
function getActiveSkillSpeedMult() {
    return 1.0;
}
function getActiveSkillGoldMult() {
    if (!isTacticSelected('goldrush')) return 1.0;
    const sk = getTacticById('goldrush');
    return 1 + sk.getGoldBonus(getSkillLevel('goldrush'));
}
function getActiveTacticBossDmgMult() {
    if (!isTacticSelected('overdrive')) return 1.0;
    const sk = getTacticById('overdrive');
    return 1 + sk.getBossBonus(getSkillLevel('overdrive'));
}
function getActiveSkillDamageTakenMult() {
    if (!isTacticSelected('shield')) return 1.0;
    const sk = getTacticById('shield');
    return 1 - sk.getDamageReduction(getSkillLevel('shield'));
}

function getWeatherCollectibleBonuses() {
    const wId = state.weather || 'cloudy';
    let atkBonus = 0;
    let goldBonus = 0;
    let reloadBonus = 0;
    let extraSlow = 0;
    let nullifyRainDebuff = false;
    let stormSlipResist = 0;

    if (wId === 'clear') {
        const lv = state.relics['witem_clear'] || 0;
        if (lv > 0) { atkBonus += lv * 0.45; goldBonus += lv * 0.30; }
    } else if (wId === 'rain') {
        const lv = state.relics['witem_rain'] || 0;
        if (lv > 0) { nullifyRainDebuff = true; atkBonus += lv * 0.35; reloadBonus += lv * 0.20; }
    } else if (wId === 'snow') {
        const lv = state.relics['witem_snow'] || 0;
        if (lv > 0) { atkBonus += lv * 0.40; extraSlow += Math.min(0.40, lv * 0.10); }
    } else if (wId === 'storm') {
        const lv = state.relics['witem_storm'] || 0;
        if (lv > 0) { stormSlipResist = 0.90; atkBonus += lv * 0.50; }
    }

    return { atkBonus, goldBonus, reloadBonus, extraSlow, nullifyRainDebuff, stormSlipResist };
}

function getEffectiveWeatherAllyAtkMult() {
    const w = getCurrentWeather();
    const wb = getWeatherCollectibleBonuses();
    const baseMult = (w.id === 'rain' && wb.nullifyRainDebuff) ? 1.0 : w.allyAtkMult;
    return baseMult * (1 + wb.atkBonus);
}

// セフィロトの樹（プレステージ10ノード）ボーナス計算
function getTreeLv(nodeId) {
    return (state.prestigeUpgrades && state.prestigeUpgrades[nodeId]) || 0;
}
function getMaxEscortSlots() {
    return 1 + Math.min(4, getTreeLv('malkuth'));
}
// マルクトLv5の追加効果: 鹵獲機の攻撃力とHPを+25%
function getMalkuthEscortBonus() {
    return getTreeLv('malkuth') >= 5 ? 0.25 : 0;
}
function getNetzachEscortMult() {
    return 1 + getTreeLv('netzach') * 0.30;
}
function getHodArmorHpMult() {
    return 1 + getTreeLv('hod') * 0.12;
}
function getBinahBossDmgMult() {
    return 1 + getTreeLv('binah') * 0.24;
}
function getChokmahTreeCritBonus() {
    const lv = getTreeLv('chokmah');
    return { reloadBonus: lv * 0.08, critMultBonus: lv * 0.15 };
}

function getEscortStats(bossId) {
    return getEscortStatsAtLevel(bossId, state.escortLevels[bossId] || 1);
}

// 鹵獲機のレベル上限とソフトキャップ。
// 1.18^Lv のまま上限なしだと Lv4000 付近で HP/攻撃力が Infinity になり、
// さらにコスト計算が破綻して MAX_SAFE_INTEGER で買えてしまうため、
// Lv100 以降は成長を 1.03/Lv に落とし、Lv200 で打ち止める。
const ESCORT_MAX_LEVEL = 200;
const ESCORT_SOFT_CAP_LEVEL = 100;
const ESCORT_SOFT_GROWTH = 1.03;
// 強化コストにHP増加を換算する重み（1HP = 0.01 DPS相当）。
// 高HPの鹵獲機ほど強化費が高くなり、火力だけでなく耐久も価格に反映される。
const ESCORT_HP_COST_WEIGHT = 0.01;

function getEscortLevelMult(level) {
    const lv = Math.max(1, Math.min(ESCORT_MAX_LEVEL, Math.floor(level) || 1));
    if (lv <= ESCORT_SOFT_CAP_LEVEL) return Math.pow(1.18, lv - 1);
    const soft = Math.pow(1.18, ESCORT_SOFT_CAP_LEVEL - 1);
    return soft * Math.pow(ESCORT_SOFT_GROWTH, lv - ESCORT_SOFT_CAP_LEVEL);
}

function getEscortStatsAtLevel(bossId, lv) {
    const base = ENEMY_TYPES[bossId];
    if (!base) return null;
    const level = Math.max(1, Math.min(ESCORT_MAX_LEVEL, Math.floor(lv) || 1));
    const lvMult = getEscortLevelMult(level);
    const netzachMult = getNetzachEscortMult();
    const malkuthMult = 1 + getMalkuthEscortBonus();
    const maxHp = Math.floor((base.hp * 0.75 + 850) * lvMult * getPrestigeHpMult() * netzachMult * malkuthMult);
    // 天候の攻撃倍率は発射時（updateAllyEscorts 内部）に一度だけ掛ける。
    // ここで掛けると発射時と二重掛けになるため、生成時のステータスには含めない。
    const dmg = Math.floor((base.damage * 0.48 + 36) * lvMult * getPrestigeAtkMult() * netzachMult * malkuthMult);
    const cooldown = base.attr === 'AIR' ? 38 : base.attr === 'SEA' ? 55 : 46;
    const moveSpeed = Math.max(0.55, (base.speed || 0.4) * 1.45);
    return {
        id: bossId,
        name: base.name.replace(/【.*?】/, ''),
        attr: base.attr,
        color: base.color,
        radius: base.radius || 32,
        maxHp,
        damage: dmg,
        cooldown,
        moveSpeed,
        lv: level
    };
}

function getCollectibleBonus(type) {
    let total = 0;
    COLLECTIBLES.forEach(r => {
        if (r.sourceType === 'boss' && r.effectType === type) {
            const lv = state.relics[r.id] || 0;
            if (lv > 0) total += lv * r.perLv;
        }
    });
    return total;
}

function getPrestigeAtkMult() {
    return 1 + getTreeLv('geburah') * 0.33 + getTreeLv('kether') * 0.27 + getCollectibleBonus('atk');
}
function getPrestigeHpMult() {
    return 1 + getTreeLv('yesod') * 0.39 + getCollectibleBonus('hp');
}
function getPrestigeGoldMult() {
    return 1 + getTreeLv('chesed') * 0.33 + getTreeLv('kether') * 0.18 + getCollectibleBonus('gold') + getWeatherCollectibleBonuses().goldBonus;
}
function getPrestigeSynergyMult() {
    return 1 + getTreeLv('tiphareth') * 0.21 + getCollectibleBonus('synergy');
}
function getRelicReloadMult() {
    return 1 + getCollectibleBonus('reload') + getWeatherCollectibleBonuses().reloadBonus + getChokmahTreeCritBonus().reloadBonus;
}
function getRelicEnemySlowMult() {
    return Math.max(0.35, 1 - Math.min(0.65, getCollectibleBonus('slow') + getWeatherCollectibleBonuses().extraSlow));
}
function getRelicRegenRatio() {
    return Math.min(1.0, getCollectibleBonus('regen'));
}

// ============================================================
// コストと火力の伸び（周回前提のテンポを作る）
// ------------------------------------------------------------
// コストの伸び(r) > 火力の伸び にすると、買うほど次の1Lvが遠くなる。
//   Cost_n = BaseCost * r^n
//
// ここでは コスト ×1.145 / 火力 ×1.08 と差をつけている。
// この差が「進むほど1ステージが重くなる」壁になる。
//
// 検証済みの到達点（転生0回・戦術や鹵獲機なし）:
//   アメリカ入口 n41   … 約0.15h
//   イスラム大ボス n130 … 約2.1h（ここまでが1周目）
//   ロシア入口 n131    … ここで完全に止まる（転生が必要）
// 転生してセフィロトを伸ばすと、この壁を越えて次の勢力へ進める。
// ============================================================
const COST_GROWTH = 1.145;
const WEAPON_GROWTH = 0.08;
const ARMOR_GROWTH = 0.08;
// 武器・セフィラの強化コストは「実戦DPSの伸び」に比例させる。
// 基準値に加えて、レベルごと・転生回数ごとの割増を掛ける。
const UPGRADE_BASE_COST_PER_DPS = 60;
const UPGRADE_LEVEL_COST_RATE = 1.4;
const UPGRADE_PRESTIGE_COST_RATE = 0.10;
// 武器・セフィラ・装甲の上限。コスト/ステータスのInfinity化を防ぐ安全弁。
// 現状の最高難度（暗黒無限ST30）でも必要Tierは約290 / 装甲約221なので十分な余裕がある。
const WEAPON_MAX_LEVEL = 1500;
const SEPHIRAH_MAX_LEVEL = 1500;
const ARMOR_MAX_LEVEL = 4000;
// 転生ごとの成長上乗せ。ハードキャップ（+40%で打ち止め）だと上限に達した瞬間に
// 成長が止まり体感が悪いため、漸近するソフトギャップにする。
//   bonus = MAX * (1 - EXP(-prestige / SCALE))
//   転生5回: +12% / 10回: +22% / 20回: +33% / 40回: +39%（+40%へ漸近）
const WEAPON_PRESTIGE_BONUS_MAX = 0.40;
const WEAPON_PRESTIGE_BONUS_SCALE = 15;

function getPrestigeGrowthBonus() {
    const prestige = Math.max(0, Number(state.prestigeCount) || 0);
    return WEAPON_PRESTIGE_BONUS_MAX * (1 - Math.exp(-prestige / WEAPON_PRESTIGE_BONUS_SCALE));
}

// レベルごとのコスト割増。DPSの伸びとは別に、同じ強化を重ねるほど高くする。
function getUpgradeLevelCostMult(level) {
    const lv = Math.max(1, Math.floor(level) || 1);
    const mult = Math.pow(UPGRADE_LEVEL_COST_RATE, lv - 1);
    return Number.isFinite(mult) ? mult : Infinity;
}

// 転生回数ごとのコスト割増。報酬の伸び(+10%/転生)と同率にして、
// 周回が進んでも強化のテンポが極端に変わらないようにする。
function getPrestigeCostMult() {
    const prestige = Math.max(0, Number(state.prestigeCount) || 0);
    const mult = 1 + prestige * UPGRADE_PRESTIGE_COST_RATE;
    return Number.isFinite(mult) ? mult : Infinity;
}

function getWeaponDamageGrowth() {
    return 1 + WEAPON_GROWTH * (1 + getPrestigeGrowthBonus());
}

function getWeaponDpsAtLevel(weaponId, level) {
    const w = WEAPONS[weaponId];
    if (!w) return 0;
    // 実際に表示・戦闘で使われる丸め後のダメージでDPSを出す。
    return getWeaponDamageAtLevel(weaponId, level) * 60 / w.cooldown;
}

function getWeaponDamageAtLevel(weaponId, level) {
    const w = WEAPONS[weaponId];
    if (!w) return 0;
    const lv = Math.max(1, Math.min(WEAPON_MAX_LEVEL, Math.floor(level) || 1));
    return Math.round(w.damage * Math.pow(getWeaponDamageGrowth(), lv - 1) * getPrestigeAtkMult());
}

function getWeaponDamage(weaponId) {
    return getWeaponDamageAtLevel(weaponId, state.weaponLevels[weaponId] || 1);
}

function getWeaponUpgradeCost(weaponId) {
    const lv = Math.max(1, state.weaponLevels[weaponId] || 1);
    if (lv >= WEAPON_MAX_LEVEL) return Infinity;
    const gain = getWeaponDpsAtLevel(weaponId, lv + 1) - getWeaponDpsAtLevel(weaponId, lv);
    const cost = gain * UPGRADE_BASE_COST_PER_DPS * getUpgradeLevelCostMult(lv) * getPrestigeCostMult();
    if (!Number.isFinite(cost)) return Infinity;
    return Math.max(50, Math.ceil(cost));
}

// セフィラの強化コストも、実際に噛み合っている兵装のDPS上昇から算出する。
// 装備中の兵装と解放済みの同系統兵装のうち、最もDPSが高いものを基準にする。
function getSephirahMatchingWeaponId(sephId) {
    const s = SEPHIROTH.find(item => item.id === sephId);
    if (!s) return null;
    const all = Object.values(WEAPONS).filter(w => w.type === s.specialty);
    if (!all.length) return null;

    // 装備中の兵装と所持している同系統兵装のうち、最大DPSのものを基準にする。
    // 弱い兵装に付け替えてから強化する、といった抜け道を防ぐため。
    const owned = typeof getOwnedWeaponIds === 'function' ? getOwnedWeaponIds() : null;
    const ids = all
        .filter(w => w.id === 'railgun_tiphareth'
            || STARTER_WEAPON_IDS.includes(w.id)
            || (owned && owned.has(w.id)))
        .map(w => w.id);
    const equippedCar = state.cars.find(car => car.sephirahId === sephId
        && [CAR_SLOT_UPPER, CAR_SLOT_SIDE].some(slot => {
            const inst = getCarSlotWeaponInstance(car, slot);
            return inst && WEAPONS[inst.weaponId] && WEAPONS[inst.weaponId].type === s.specialty;
        }));
    if (equippedCar) {
        const equippedWeaponId = [CAR_SLOT_UPPER, CAR_SLOT_SIDE]
            .map(slot => getCarSlotWeaponId(equippedCar, slot))
            .find(wid => WEAPONS[wid] && WEAPONS[wid].type === s.specialty);
        if (equippedWeaponId && !ids.includes(equippedWeaponId)) ids.push(equippedWeaponId);
    }
    const pool = ids.length ? ids : all.map(w => w.id);

    // 実体があれば、その個体のLvで評価する（装備の実力が反映される）。
    let bestId = pool[0];
    let bestDps = -1;
    pool.forEach(id => {
        const inst = getBestWeaponInstance(id);
        const lv = inst ? inst.level : (state.weaponLevels[id] || 1);
        const dps = getWeaponDpsAtLevel(id, lv) * (inst ? (1 + getWeaponInstanceBonus(inst)) : 1);
        if (dps > bestDps) { bestDps = dps; bestId = id; }
    });
    return bestId;
}

// セフィラ固有の追加効果（常時攻撃力・会心）もDPS換算に含める。
function getSephirahPassiveDpsMult(sephId, level) {
    const lv = Math.max(1, Math.floor(level) || 1);
    if (sephId === 'netzach') return 1 + 0.10 + (lv - 1) * 0.04;
    if (sephId === 'kether') return 1 + 0.15 + (lv - 1) * 0.05;
    if (sephId === 'chokmah') {
        const rate = Math.min(0.65, 0.14 + (lv - 1) * 0.03);
        const mult = 1.8 + (lv - 1) * 0.15;
        return 1 + rate * (mult - 1);
    }
    return 1;
}

function getSephirahDpsAtLevel(sephId, level, weaponId) {
    const w = WEAPONS[weaponId];
    if (!w) return 0;
    const lv = Math.max(1, Math.floor(level) || 1);
    const weaponLv = state.weaponLevels[weaponId] || 1;
    const synergy = (0.45 + (lv - 1) * 0.18) * getPrestigeSynergyMult();
    const reload = (0.25 + (lv - 1) * 0.08) * getPrestigeSynergyMult();
    // getCarEffectiveStats と同じ丸め方で、実際のDPS上昇を求める。
    let damage = Math.round(getWeaponDamageAtLevel(weaponId, weaponLv) * (1 + synergy));
    damage = Math.round(damage * getSephirahPassiveDpsMult(sephId, lv));
    const cooldown = Math.max(5, Math.round(w.cooldown / (1 + reload)));
    return damage * 60 / cooldown;
}

function getSephirahUpgradeCost(sephId) {
    const s = SEPHIROTH.find(item => item.id === sephId);
    if (!s) return 999999;
    const lv = Math.max(1, Math.min(SEPHIRAH_MAX_LEVEL, state.sephirahLevels[sephId] || 1));
    if (lv >= SEPHIRAH_MAX_LEVEL) return Infinity;
    const weaponId = getSephirahMatchingWeaponId(sephId);
    if (!weaponId) {
        const fallback = s.upgradeBaseCost * Math.pow(COST_GROWTH, lv - 1) * getPrestigeCostMult();
        return Number.isFinite(fallback) ? Math.max(50, Math.floor(fallback)) : Infinity;
    }
    const gain = getSephirahDpsAtLevel(sephId, lv + 1, weaponId) - getSephirahDpsAtLevel(sephId, lv, weaponId);
    const cost = gain * UPGRADE_BASE_COST_PER_DPS * getUpgradeLevelCostMult(lv) * getPrestigeCostMult();
    if (!Number.isFinite(cost)) return Infinity;
    return Math.max(50, Math.ceil(cost));
}

function getArmorUpgradeCost() {
    if (state.armorLevel >= ARMOR_MAX_LEVEL) return Infinity;
    const cost = 200 * Math.pow(COST_GROWTH, state.armorLevel - 1) * getPrestigeCostMult();
    return Number.isFinite(cost) ? Math.max(50, Math.floor(cost)) : Infinity;
}

// セフィロトノードのコスト。上限レベルを設けず、Lvに応じて伸び続ける。
function getPrestigeNodeCost(node, level) {
    const lv = Math.max(0, Math.floor(level) || 0);
    const cost = node.baseCost * Math.pow(COST_GROWTH, lv);
    return Number.isFinite(cost) ? Math.max(1, Math.floor(cost)) : Infinity;
}

// アップグレード差分表示の共通ヘルパ。
// accent は各強化の既存テーマ色。背景は低彩度のティントに留め、文字と枠だけ色を合わせる。
// 暗い赤系などはそのままだと小さい文字でコントラストが足りないため、色相を保ったまま明度だけ上げる。
function lightenHex(hex, amount) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const mix = (c) => Math.round(c + (255 - c) * amount);
    return '#' + [mix(r), mix(g), mix(b)].map(c => c.toString(16).padStart(2, '0')).join('');
}

function deltaChipHTML(text, accent) {
    const textColor = lightenHex(accent, 0.22);
    return `<span class="delta-chip" style="color:${textColor};background:${accent}1f;border-color:${accent}55;">${text}</span>`;
}

function deltaStatHTML(fromText, toText, deltaText, accent) {
    const textColor = lightenHex(accent, 0.22);
    const chip = deltaText ? deltaChipHTML(deltaText, accent) : '';
    return `<span class="delta-stat"><span class="delta-from">${fromText}</span><span class="delta-arrow">→</span><span class="delta-to" style="color:${textColor};">${toText}</span>${chip}</span>`;
}
function calcMaxHpForArmor(armorLevel) {
    const lv = Math.max(1, Math.min(ARMOR_MAX_LEVEL, Math.floor(armorLevel) || 1));
    // 1Lvあたり乗算 +10%。ホドの加護はこの成長率そのものを底上げする。
    const growth = 1 + ARMOR_GROWTH * getHodArmorHpMult();
    return Math.round(1000 * Math.pow(growth, lv - 1) * getPrestigeHpMult());
}
function calcMaxHp() {
    return calcMaxHpForArmor(state.armorLevel);
}
function getCurrentFaction() {
    return FACTIONS.find(f => f.id === state.currentFactionId) || FACTIONS[0];
}

// 装甲列車の両数とスロット。1両目は機関車でレールガン固定、2〜4両目は上部・側面の2スロット。
const CAR_COUNT = 4;
const CAR_SLOT_UPPER = 'upper';
const CAR_SLOT_SIDE = 'side';
// 側面スロットは斜射になるため射程を落とし、空中目標への倍率も下げる。
// 上部＝主力（対空含む）、側面＝対地・対艦の補助という役割差を作るための係数。
const SIDE_SLOT_RANGE_MULT = 0.85;
const SIDE_SLOT_AIR_MULT = 0.8;
// 10両×1兵装（10スロット）から4両×2＋1（7スロット）へ減るぶんの火力補填。
// 旧仕様でも最初の2スロット（レールガン＋初期機関銃）は同じだけ埋まっていたので、
// その2枠は等倍のまま。3枠目以降を埋めたぶんだけ補填を効かせ、7枠で最大1.5倍。
// これで序盤の手応えは旧仕様と一致し、編成を埋めるほど旧仕様の総火力へ近づく。
const CAR_DPS_COMPENSATION = 1.5;
const CAR_TOTAL_SLOTS = 1 + (CAR_COUNT - 1) * 2;
const CAR_BASE_SLOTS = 2;

function getCarDpsCompensation() {
    const cars = Array.isArray(state.cars) ? state.cars : [];
    const filled = cars.reduce((n, car) =>
        n + (car.weaponUid ? 1 : 0) + (car.sideWeaponUid ? 1 : 0), 0);
    const extra = Math.max(0, filled - CAR_BASE_SLOTS);
    const extraSlots = Math.max(1, CAR_TOTAL_SLOTS - CAR_BASE_SLOTS);
    return 1 + (CAR_DPS_COMPENSATION - 1) * Math.min(1, extra / extraSlots);
}

// 車両スロットは「武装インスタンスのuid」を指す。
// 種別IDではなく実体を持つことで、レアリティ・＋値・Lvがそのまま戦闘に乗る。
function createCar(index) {
    if (index === 0) {
        return {
            index: 0,
            name: '第1両目（先頭機関車）',
            weaponUid: null,
            railgunFixed: true,
            sideWeaponUid: null,
            sephirahId: 'tiphareth',
            cdTimer: 0,
            sideCdTimer: 0,
            locked: true
        };
    }
    return {
        index,
        name: `第${index + 1}両目`,
        weaponUid: null,
        sideWeaponUid: null,
        sephirahId: null,
        cdTimer: 0,
        sideCdTimer: 0,
        locked: false
    };
}

function initCars() {
    state.cars = [];
    for (let i = 0; i < CAR_COUNT; i++) {
        state.cars.push(createCar(i));
    }
}

function getCarSlotWeaponUid(car, slot) {
    if (!car) return null;
    return slot === CAR_SLOT_SIDE ? car.sideWeaponUid : car.weaponUid;
}

function setCarSlotWeaponUid(car, slot, uid) {
    if (!car) return;
    if (slot === CAR_SLOT_SIDE) car.sideWeaponUid = uid;
    else car.weaponUid = uid;
}

// スロットに載っている武装の実体。uid が無い/見つからない場合は null。
function getCarSlotWeaponInstance(car, slot) {
    const uid = getCarSlotWeaponUid(car, slot);
    if (!uid) return null;
    return (state.weaponInstances || []).find(inst => inst && inst.uid === uid) || null;
}

// スロットに載っている武装の種別ID。描画や相性判定はこちらを使う。
function getCarSlotWeaponId(car, slot) {
    const inst = getCarSlotWeaponInstance(car, slot);
    if (inst) return inst.weaponId;
    // 機関車は固定でレールガンを積んでいる。
    if (slot !== CAR_SLOT_SIDE && car && car.railgunFixed) return 'railgun_tiphareth';
    return null;
}

// その兵装インスタンスが列車のどこかに搭載されているか（上部・側面の両方を見る）。
function isWeaponInstanceMounted(uid) {
    if (!uid) return false;
    return (state.cars || []).some(car => car.weaponUid === uid || car.sideWeaponUid === uid);
}

// その種別の武装が1つでも列車に載っているか。
function isWeaponMounted(weaponId) {
    return (state.cars || []).some(car =>
        getCarSlotWeaponId(car, CAR_SLOT_UPPER) === weaponId
        || getCarSlotWeaponId(car, CAR_SLOT_SIDE) === weaponId);
}

// マージで消えた実体を指しているスロットを空にする。
// これをしないと「空に見えるのに埋まっている扱い」になり、自動搭載も効かなくなる。
function pruneDanglingWeaponSlots() {
    (state.cars || []).forEach(car => {
        [CAR_SLOT_UPPER, CAR_SLOT_SIDE].forEach(slot => {
            const uid = getCarSlotWeaponUid(car, slot);
            if (uid && !getWeaponInstanceByUid(uid)) setCarSlotWeaponUid(car, slot, null);
        });
    });
}

// 列車に載っている個体のuid集合。載せた個体は在庫から消える（＝装備で消費）。
function getMountedWeaponUids() {
    const set = new Set();
    (state.cars || []).forEach(car => {
        [getCarSlotWeaponUid(car, CAR_SLOT_UPPER), getCarSlotWeaponUid(car, CAR_SLOT_SIDE)]
            .filter(Boolean)
            .forEach(uid => set.add(uid));
    });
    return set;
}

// 未装備＝在庫。育成・マージの対象はこちらだけ。
function getWeaponInventoryInstances() {
    const mounted = getMountedWeaponUids();
    return (state.weaponInstances || []).filter(inst => inst && !mounted.has(inst.uid));
}

function isWeaponInstanceEquipped(uid) {
    return getMountedWeaponUids().has(uid);
}

// マージで消えた個体が載っていたスロットを、マージ結果で埋め直す。
// 予備が無くて装備中を消費した場合、編成が空になって戦力が落ちるのを防ぐ。
function replaceConsumedWeaponSlots(consumedUids, resultUid) {
    if (!resultUid || !consumedUids || !consumedUids.size) return 0;
    let replaced = 0;
    (state.cars || []).forEach(car => {
        [CAR_SLOT_UPPER, CAR_SLOT_SIDE].forEach(slot => {
            const uid = getCarSlotWeaponUid(car, slot);
            if (uid && consumedUids.has(uid)) {
                setCarSlotWeaponUid(car, slot, resultUid);
                replaced++;
            }
        });
    });
    return replaced;
}

