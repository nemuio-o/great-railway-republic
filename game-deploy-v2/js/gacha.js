// ==========================================================
// ガチャ・武装レアリティ・武装マージ・上限突破
// レールガン系はこのファイルの全機能から除外する。
// ==========================================================

const GACHA_TICKET_LABELS = {
    normal: 'ノーマルチケット',
    rare: 'レアチケット'
};

const WEAPON_RARITIES = {
    Common: { label: 'コモン', color: '#94a3b8' },
    Uncommon: { label: 'アンコモン', color: '#34d399' },
    Rare: { label: 'レア', color: '#38bdf8' },
    Epic: { label: 'エピック', color: '#c084fc' },
    Legendary: { label: '伝説的', color: '#fbbf24' },
    Mythic: { label: '神話的', color: '#f43f5e' }
};

const WEAPON_RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];

const WEAPON_RARITY_TEMPLATE = {
    Common: { maxLevel: 20, softCap: 10, bonusAtCap: 0.10 },
    Uncommon: { maxLevel: 30, softCap: 15, bonusAtCap: 0.18 },
    Rare: { maxLevel: 45, softCap: 22, bonusAtCap: 0.30 },
    Epic: { maxLevel: 60, softCap: 30, bonusAtCap: 0.45 },
    Legendary: { maxLevel: 80, softCap: 40, bonusAtCap: 0.65 },
    Mythic: { maxLevel: 100, softCap: 50, bonusAtCap: 0.90 }
};

// 武装ごとの個別調整。空でもテンプレートで動作する。
const WEAPON_RARITY_OVERRIDES = {
    // missile_malkuth: { Legendary: { maxLevel: 90, softCap: 45 } }
};

const WEAPON_MAX_PLUS = 10;
const WEAPON_PLUS_MAX_LEVEL_BONUS = 5;
const WEAPON_PLUS_SOFT_CAP_BONUS = 2;
const WEAPON_PLUS_DAMAGE_BONUS = 0.05;

const CAP_UNLOCK_SEGMENT = 5;
const CAP_UNLOCK_MATERIAL_BASE = 1;
const SOFT_CAP_LEVEL_COST_MULT = 1.5;

const MERGE_LEVEL_MODE = 'max'; // max | average | reset
const MERGE_CONSUME_ORDER = 'lowest'; // lowest | highest

const ESCORT_MODULE_PER_LEVEL = 0.05;
const ESCORT_MODULE_MAX_LEVEL = 20;

const PITY_CONFIG = { enabled: false };

const MANUFACTURERS = [
    {
        id: 'usa',
        name: 'アメリカ製',
        color: '#38bdf8',
        unlockFactionId: 'usa',
        mythicWeaponId: 'howitzer_heavy',
        ticketType: 'rare',
        ticketCost: 1
    },
    {
        id: 'un',
        name: '地球連邦製',
        color: '#34d399',
        unlockFactionId: 'un',
        mythicWeaponId: 'missile_malkuth',
        ticketType: 'rare',
        ticketCost: 1
    },
    {
        id: 'gew',
        name: 'Gewinner製',
        color: '#fbbf24',
        unlockFactionId: 'gew',
        mythicWeaponId: 'laser_kether',
        ticketType: 'rare',
        ticketCost: 1
    }
];

const GACHA_POOLS = {
    normal: {
        label: 'ノーマルガチャ',
        ticketType: 'normal',
        ticketCost: 1,
        categories: { material: 70, escort_module: 15, weapon: 15 },
        weaponRarityWeights: {
            Common: 60, Uncommon: 25, Rare: 10, Epic: 4, Legendary: 1, Mythic: 0
        },
        materialMin: 1, materialMax: 3,
        moduleMin: 1, moduleMax: 1
    },
    rare: {
        label: 'レアガチャ',
        ticketType: 'rare',
        ticketCost: 1,
        categories: { material: 55, escort_module: 20, weapon: 25 },
        weaponRarityWeights: {
            Common: 35, Uncommon: 30, Rare: 20, Epic: 10, Legendary: 5, Mythic: 0
        },
        materialMin: 2, materialMax: 5,
        moduleMin: 1, moduleMax: 2
    },
    pickup: {
        label: '製造元ピックアップ',
        ticketType: 'rare',
        ticketCost: 1,
        categories: { material: 45, escort_module: 15, weapon: 40 },
        weaponRarityWeights: {
            Common: 30, Uncommon: 30, Rare: 22, Epic: 12, Legendary: 6, Mythic: 0
        },
        mythicChance: 0.03,
        materialMin: 2, materialMax: 6,
        moduleMin: 1, moduleMax: 2
    }
};

const TICKET_REWARDS = {
    normal: { normal: 1 },
    midBoss: { normal: 2 },
    bigBoss: { rare: 3 },
    bigBossRepeatBonus: { rare: 1 }
};

// レールガン専用の自動レアリティ。ガチャ／＋値／マージ／上限突破とは別系統。
// 最終段階は「転生15回 + クリフォト中枢（dark_abyss）制圧」でちょうど Legendary。
const RAILGUN_RARITY_STAGES = [
    { rarity: 'Common', prestige: 0, factionId: null, bonus: 0.00 },
    { rarity: 'Uncommon', prestige: 3, factionId: null, bonus: 0.12 },
    { rarity: 'Rare', prestige: 6, factionId: null, bonus: 0.28 },
    { rarity: 'Epic', prestige: 10, factionId: null, bonus: 0.48 },
    { rarity: 'Legendary', prestige: 15, factionId: 'dark_abyss', bonus: 0.70 }
];

// ==========================================================
// 共通ヘルパー
// ==========================================================

function isRailgunWeapon(weaponId) {
    return !!(WEAPONS[weaponId] && WEAPONS[weaponId].type === 'RAILGUN');
}

function toNonNegativeInt(value) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function clampInt(value, min, max, fallback) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n)) return fallback === undefined ? min : fallback;
    return Math.max(min, Math.min(max, n));
}

function randInt(min, max) {
    const lo = Math.ceil(Number(min) || 0);
    const hi = Math.floor(Number(max) || 0);
    if (hi <= lo) return Math.max(0, lo);
    return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function pickWeighted(items, weightFn = item => item.weight) {
    const list = (items || []).filter(item => (Number(weightFn(item)) || 0) > 0);
    if (!list.length) return null;
    const total = list.reduce((sum, item) => sum + (Number(weightFn(item)) || 0), 0);
    let roll = Math.random() * total;
    for (const item of list) {
        roll -= Number(weightFn(item)) || 0;
        if (roll < 0) return item;
    }
    return list[list.length - 1];
}

function getRarityMeta(rarity) {
    return WEAPON_RARITIES[rarity] || WEAPON_RARITIES.Common;
}

function getRailgunRarityInfo() {
    const prestige = Math.max(0, Math.floor(Number(state.prestigeCount) || 0));
    const cleared = Array.isArray(state.clearedFactions) ? state.clearedFactions : [];
    let index = 0;
    for (let i = 0; i < RAILGUN_RARITY_STAGES.length; i++) {
        const stage = RAILGUN_RARITY_STAGES[i];
        if (prestige >= stage.prestige && (!stage.factionId || cleared.includes(stage.factionId))) {
            index = i;
        }
    }
    const current = RAILGUN_RARITY_STAGES[index];
    const next = RAILGUN_RARITY_STAGES[index + 1] || null;
    return {
        current,
        next,
        index,
        bonus: current.bonus,
        meta: getRarityMeta(current.rarity)
    };
}

function getRailgunRarityBonus() {
    return getRailgunRarityInfo().bonus;
}

function getRailgunRequirementText(stage) {
    if (!stage) return '';
    const prestige = Math.max(0, Math.floor(Number(state.prestigeCount) || 0));
    const cleared = Array.isArray(state.clearedFactions) ? state.clearedFactions : [];
    const parts = [];
    if (prestige < stage.prestige) parts.push(`転生${stage.prestige}回`);
    if (stage.factionId && !cleared.includes(stage.factionId)) {
        const faction = (typeof FACTIONS !== 'undefined' ? FACTIONS : []).find(f => f.id === stage.factionId);
        parts.push(`${faction ? faction.name : stage.factionId} 制圧`);
    }
    return parts.length ? parts.join(' + ') : '達成済み';
}

function getRarityData(weaponId, rarity) {
    const base = WEAPON_RARITY_TEMPLATE[rarity] || WEAPON_RARITY_TEMPLATE.Common;
    const override = (WEAPON_RARITY_OVERRIDES[weaponId] || {})[rarity] || {};
    return Object.assign({}, base, override);
}

// 武装の表示名。rarity を渡すとレアリティ固有の名称を返す。
// ＋値（マージ）では名称を変えないため、plus は引数に取らない。
// レールガンはレアリティ育成の対象外なので常に同一名称。
function getWeaponName(weaponId, rarity) {
    if (!weaponId) return '';
    const isRailgun = typeof isRailgunWeapon === 'function' && isRailgunWeapon(weaponId);
    if (!isRailgun && typeof getWeaponRarityName === 'function') {
        const named = getWeaponRarityName(weaponId, rarity);
        if (named) return named;
    }
    return WEAPONS[weaponId] ? WEAPONS[weaponId].name : weaponId;
}

// ==========================================================
// レアリティ・インスタンス計算
// ==========================================================

function getWeaponInstanceMaxLevel(inst) {
    if (!inst) return 1;
    const data = getRarityData(inst.weaponId, inst.rarity);
    return data.maxLevel + clampInt(inst.plus, 0, WEAPON_MAX_PLUS, 0) * WEAPON_PLUS_MAX_LEVEL_BONUS;
}

function getWeaponInstanceSoftCap(inst) {
    if (!inst) return 1;
    const data = getRarityData(inst.weaponId, inst.rarity);
    return Math.min(
        getWeaponInstanceMaxLevel(inst),
        data.softCap + clampInt(inst.plus, 0, WEAPON_MAX_PLUS, 0) * WEAPON_PLUS_SOFT_CAP_BONUS
    );
}

function getWeaponInstanceUnlockedMaxLevel(inst) {
    if (!inst) return 1;
    const max = getWeaponInstanceMaxLevel(inst);
    return clampInt(inst.unlockedMaxLevel, 1, max, max);
}

function getWeaponInstanceBonus(inst) {
    if (!inst) return 0;
    const data = getRarityData(inst.weaponId, inst.rarity);
    const max = getWeaponInstanceMaxLevel(inst);
    const level = Math.max(1, Math.floor(Number(inst.level) || 1));
    const ratio = max > 1 ? (level - 1) / (max - 1) : 0;
    const cappedRatio = Math.min(1, Math.max(0, ratio));
    const plus = clampInt(inst.plus, 0, WEAPON_MAX_PLUS, 0);
    return data.bonusAtCap * (0.20 + 0.80 * cappedRatio) + plus * WEAPON_PLUS_DAMAGE_BONUS;
}

function getBestWeaponInstanceInList(list) {
    return (list || []).slice().sort((a, b) => {
        const bonusDiff = getWeaponInstanceBonus(b) - getWeaponInstanceBonus(a);
        if (bonusDiff !== 0) return bonusDiff;
        if (b.level !== a.level) return b.level - a.level;
        if (b.plus !== a.plus) return b.plus - a.plus;
        return a.uid - b.uid;
    })[0] || null;
}

function getBestWeaponInstance(weaponId) {
    if (!weaponId || isRailgunWeapon(weaponId)) return null;
    const list = (state.weaponInstances || []).filter(inst =>
        inst && inst.weaponId === weaponId && !isRailgunWeapon(inst.weaponId)
    );
    return getBestWeaponInstanceInList(list);
}

function getBestWeaponInstanceBonus(weaponId) {
    const best = getBestWeaponInstance(weaponId);
    return best ? getWeaponInstanceBonus(best) : 0;
}

function getOwnedWeaponIds() {
    const ids = new Set();
    (state.weaponInstances || []).forEach(inst => {
        if (inst && !isRailgunWeapon(inst.weaponId)) ids.add(inst.weaponId);
    });
    return ids;
}

// 初期配備の武装。この2つは最初から車両に載っているため、ガチャを引かなくても使える。
// それ以外の武装はガチャで1つ以上所持しないと使えない。
const STARTER_WEAPON_IDS = ['mg_vulcan', 'aa_flak'];

// その武装を使えるか。レールガンと初期配備は常に使え、それ以外はガチャ所持が条件。
function canUseWeapon(weaponId, ownedIds) {
    if (isRailgunWeapon(weaponId)) return true;
    if (STARTER_WEAPON_IDS.includes(weaponId)) return true;
    const owned = ownedIds || getOwnedWeaponIds();
    return owned.has(weaponId);
}

function getEffectiveWeaponDamage(weaponId) {
    const base = getWeaponDamage(weaponId);
    if (isRailgunWeapon(weaponId)) {
        const railBonus = getRailgunRarityBonus();
        return railBonus > 0 ? Math.round(base * (1 + railBonus)) : base;
    }
    if (!canUseWeapon(weaponId)) return base;
    const bonus = getBestWeaponInstanceBonus(weaponId);
    return bonus > 0 ? Math.round(base * (1 + bonus)) : base;
}

function createWeaponInstance(weaponId, rarity, options = {}) {
    if (!WEAPONS[weaponId] || isRailgunWeapon(weaponId) || !WEAPON_RARITIES[rarity]) return null;
    const plus = clampInt(options.plus, 0, WEAPON_MAX_PLUS, 0);
    const data = getRarityData(weaponId, rarity);
    const max = data.maxLevel + plus * WEAPON_PLUS_MAX_LEVEL_BONUS;
    const unlocked = clampInt(options.unlockedMaxLevel, 1, max, max);
    const level = clampInt(options.level, 1, unlocked, 1);
    if (!Number.isFinite(Number(state.weaponNextUid)) || Number(state.weaponNextUid) < 1) {
        state.weaponNextUid = 1;
    }
    return {
        uid: state.weaponNextUid++,
        weaponId,
        rarity,
        plus,
        level,
        unlockedMaxLevel: unlocked,
        createdAt: Date.now()
    };
}

function getWeaponInstanceUpgradeCost(inst) {
    if (!inst) return Infinity;
    const unlocked = getWeaponInstanceUnlockedMaxLevel(inst);
    const level = clampInt(inst.level, 1, unlocked, 1);
    if (level >= unlocked) return Infinity;
    const baseDps = getWeaponDpsAtLevel(inst.weaponId, state.weaponLevels[inst.weaponId] || 1);
    const nextInst = Object.assign({}, inst, { level: level + 1 });
    const gain = getWeaponInstanceBonus(nextInst) - getWeaponInstanceBonus(inst);
    if (!(gain > 0)) return Infinity;
    let cost = baseDps * gain * UPGRADE_BASE_COST_PER_DPS
        * getUpgradeLevelCostMult(level) * getPrestigeCostMult();
    if (level >= getWeaponInstanceSoftCap(inst)) cost *= SOFT_CAP_LEVEL_COST_MULT;
    if (!Number.isFinite(cost)) return Infinity;
    return Math.max(30, Math.ceil(cost));
}

function getWeaponInstanceCapUnlockCost(inst) {
    if (!inst) return Infinity;
    const max = getWeaponInstanceMaxLevel(inst);
    const unlocked = getWeaponInstanceUnlockedMaxLevel(inst);
    if (unlocked >= max) return Infinity;
    const baseMax = getRarityData(inst.weaponId, inst.rarity).maxLevel;
    const done = Math.max(0, Math.ceil((unlocked - baseMax) / CAP_UNLOCK_SEGMENT));
    return CAP_UNLOCK_MATERIAL_BASE + done;
}

function getWeaponInstanceGroups() {
    const map = new Map();
    (state.weaponInstances || []).forEach(inst => {
        if (!inst || !WEAPONS[inst.weaponId] || isRailgunWeapon(inst.weaponId) || !WEAPON_RARITIES[inst.rarity]) return;
        const key = `${inst.weaponId}|${inst.rarity}|${inst.plus}`;
        let group = map.get(key);
        if (!group) {
            group = {
                key,
                weaponId: inst.weaponId,
                rarity: inst.rarity,
                plus: inst.plus,
                instances: []
            };
            map.set(key, group);
        }
        group.instances.push(inst);
    });
    return Array.from(map.values()).map(group => {
        group.count = group.instances.length;
        group.best = getBestWeaponInstanceInList(group.instances);
        return group;
    });
}

function getWeaponInstanceGroup(weaponId, rarity, plus) {
    return getWeaponInstanceGroups().find(group =>
        group.weaponId === weaponId && group.rarity === rarity && group.plus === Number(plus)
    ) || null;
}

function getActiveWeaponInstanceForType(weaponId) {
    return getBestWeaponInstance(weaponId);
}

function isWeaponGroupActive(group) {
    if (!group) return false;
    const active = getActiveWeaponInstanceForType(group.weaponId);
    return !!(active && group.best && active.uid === group.best.uid);
}

// ==========================================================
// 製造元・ピックアップ
// ==========================================================

function getManufacturer(id) {
    return MANUFACTURERS.find(man => man.id === id) || null;
}

function getManufacturerWeaponIds(man) {
    if (!man) return [];
    return Object.keys(WEAPONS).filter(id =>
        !isRailgunWeapon(id) && WEAPONS[id].manufacturerId === man.id
    );
}

function isManufacturerUnlocked(man) {
    if (!man) return false;
    if (Array.isArray(state.clearedFactions) && state.clearedFactions.includes(man.unlockFactionId)) return true;
    return !!(state.manufacturerGachaUnlocked && state.manufacturerGachaUnlocked[man.id]);
}

function syncManufacturerGachaUnlocks() {
    if (!state.manufacturerGachaUnlocked || typeof state.manufacturerGachaUnlocked !== 'object') {
        state.manufacturerGachaUnlocked = {};
    }
    const cleared = Array.isArray(state.clearedFactions) ? state.clearedFactions : [];
    MANUFACTURERS.forEach(man => {
        if (cleared.includes(man.unlockFactionId)) {
            state.manufacturerGachaUnlocked[man.id] = true;
        } else if (typeof state.manufacturerGachaUnlocked[man.id] !== 'boolean') {
            state.manufacturerGachaUnlocked[man.id] = false;
        }
    });
}

// ==========================================================
// チケット・ステージ報酬
// ==========================================================

function getGachaTicketCount(type) {
    if (!state.gachaTickets || typeof state.gachaTickets !== 'object') {
        state.gachaTickets = { normal: 0, rare: 0 };
    }
    return toNonNegativeInt(state.gachaTickets[type]);
}

function spendGachaTickets(type, amount) {
    const cost = toNonNegativeInt(amount);
    if (getGachaTicketCount(type) < cost) return false;
    state.gachaTickets[type] -= cost;
    return true;
}

function getStageTicketType(faction, stage) {
    if (!faction) return 'normal';
    if (faction.isEndless) {
        if (stage % 10 === 0) return 'bigBoss';
        if (stage % 5 === 0) return 'midBoss';
        return 'normal';
    }
    if (stage >= (faction.stageCount || 30)) return 'bigBoss';
    if (stage === 10 || stage === 20 || stage === 30) return 'bigBoss';
    if (stage % 5 === 0) return 'midBoss';
    return 'normal';
}

function grantStageClearTickets(faction, stage, clearAttempt) {
    const type = getStageTicketType(faction, stage);
    const base = TICKET_REWARDS[type] || {};
    const reward = {
        normal: toNonNegativeInt(base.normal),
        rare: toNonNegativeInt(base.rare)
    };
    if (type === 'bigBoss' && clearAttempt > 1) {
        reward.rare += toNonNegativeInt(TICKET_REWARDS.bigBossRepeatBonus.rare);
    }
    if (!state.gachaTickets || typeof state.gachaTickets !== 'object') {
        state.gachaTickets = { normal: 0, rare: 0 };
    }
    state.gachaTickets.normal = toNonNegativeInt(state.gachaTickets.normal) + reward.normal;
    state.gachaTickets.rare = toNonNegativeInt(state.gachaTickets.rare) + reward.rare;
    return reward;
}

function formatTicketReward(reward) {
    if (!reward) return '';
    const parts = [];
    if (reward.normal > 0) parts.push(`ノーマルチケット×${reward.normal}`);
    if (reward.rare > 0) parts.push(`レアチケット×${reward.rare}`);
    return parts.length ? ` 🎟 ${parts.join(' / ')}` : '';
}

// ==========================================================
// ガチャ抽選
// ==========================================================

function getGachaWeaponIds(poolKey, manufacturerId) {
    if (poolKey === 'pickup') {
        return getManufacturerWeaponIds(getManufacturer(manufacturerId));
    }
    return Object.keys(WEAPONS).filter(id => !isRailgunWeapon(id));
}

function rollGachaReward(poolKey, manufacturerId) {
    const pool = GACHA_POOLS[poolKey];
    if (!pool) return null;
    const man = poolKey === 'pickup' ? getManufacturer(manufacturerId) : null;
    if (poolKey === 'pickup' && !man) return null;

    const weaponIds = getGachaWeaponIds(poolKey, manufacturerId);
    if (poolKey === 'pickup' && weaponIds.length === 0) return null;

    // 神話的は通常のレアリティ抽選とは別枠
    if (poolKey === 'pickup' && man.mythicWeaponId
        && !isRailgunWeapon(man.mythicWeaponId)
        && Math.random() < (pool.mythicChance || 0)) {
        return {
            type: 'weapon',
            weaponId: man.mythicWeaponId,
            rarity: 'Mythic',
            plus: 0,
            level: 1,
            quantity: 1
        };
    }

    const categories = Object.keys(pool.categories || {}).map(type => ({
        type,
        weight: pool.categories[type]
    }));
    const category = pickWeighted(categories);
    if (!category) return null;

    if (category.type === 'material') {
        return {
            type: 'material',
            id: 'enhance_mat',
            name: '強化素材',
            quantity: randInt(pool.materialMin || 1, pool.materialMax || 1)
        };
    }
    if (category.type === 'escort_module') {
        return {
            type: 'escort_module',
            id: 'escort_module',
            name: '鹵獲機強化モジュール',
            quantity: randInt(pool.moduleMin || 1, pool.moduleMax || 1)
        };
    }

    const rarityEntries = Object.keys(pool.weaponRarityWeights || {})
        .filter(rarity => rarity !== 'Mythic'
            && WEAPON_RARITIES[rarity]
            && (pool.weaponRarityWeights[rarity] || 0) > 0)
        .map(rarity => ({ rarity, weight: pool.weaponRarityWeights[rarity] }));
    if (!rarityEntries.length || !weaponIds.length) return null;
    const rarity = pickWeighted(rarityEntries).rarity;
    const weaponId = weaponIds[Math.floor(Math.random() * weaponIds.length)];
    if (isRailgunWeapon(weaponId)) return null;
    return {
        type: 'weapon',
        weaponId,
        rarity,
        plus: 0,
        level: 1,
        quantity: 1
    };
}

function applyGachaReward(reward) {
    if (!reward) return null;
    if (reward.type === 'material') {
        state.enhanceMaterials = toNonNegativeInt(state.enhanceMaterials) + toNonNegativeInt(reward.quantity);
        return null;
    }
    if (reward.type === 'escort_module') {
        state.escortEnhanceModules = toNonNegativeInt(state.escortEnhanceModules) + toNonNegativeInt(reward.quantity);
        return null;
    }
    if (reward.type === 'weapon') {
        const inst = createWeaponInstance(reward.weaponId, reward.rarity, {
            plus: reward.plus || 0,
            level: reward.level || 1
        });
        if (inst) state.weaponInstances.push(inst);
        return inst;
    }
    return null;
}

function formatGachaReward(reward) {
    if (!reward) return '';
    if (reward.type === 'weapon') {
        const meta = getRarityMeta(reward.rarity);
        return `${getWeaponName(reward.weaponId, reward.rarity)} [${meta.label}] +${reward.plus || 0}`;
    }
    if (reward.type === 'material') return `強化素材 ×${reward.quantity}`;
    if (reward.type === 'escort_module') return `鹵獲機強化モジュール ×${reward.quantity}`;
    return '';
}

// 連続抽選の回数。UI とロジックの両方がこの配列を参照する。
const GACHA_BULK_COUNTS = [10, 50, 100];

// count 回まとめて引く。チケットが足りなければ何も消費しない。
// 1回ずつと同じ抽選経路を通すので、排出率は単発と完全に一致する。
function drawGachaBulk(poolKey, count, manufacturerId) {
    const pool = GACHA_POOLS[poolKey];
    if (!pool) return;
    const n = Math.max(1, Math.floor(Number(count) || 1));
    const man = poolKey === 'pickup' ? getManufacturer(manufacturerId) : null;
    if (poolKey === 'pickup') {
        if (!man) { showToast('ピックアップ対象が不明です'); return; }
        if (!isManufacturerUnlocked(man)) {
            showToast('この製造元のピックアップは未解放です');
            return;
        }
    }
    const ticketType = (poolKey === 'pickup' && man && man.ticketType)
        ? man.ticketType
        : (pool.ticketType || 'normal');
    const unitCost = toNonNegativeInt((poolKey === 'pickup' && man && man.ticketCost)
        ? man.ticketCost
        : (pool.ticketCost || 1));
    const totalCost = unitCost * n;
    const owned = getGachaTicketCount(ticketType);
    if (owned < totalCost) {
        showToast(`${GACHA_TICKET_LABELS[ticketType] || ticketType}が不足しています（必要 ${totalCost} / 所持 ${owned}）`);
        return;
    }

    const rewards = [];
    for (let i = 0; i < n; i++) {
        const reward = rollGachaReward(poolKey, manufacturerId);
        if (!reward) break;
        rewards.push(reward);
    }
    if (rewards.length === 0) {
        showToast('抽選できる報酬がありません');
        return;
    }
    // 実際に引けた回数ぶんだけ消費する。
    if (!spendGachaTickets(ticketType, unitCost * rewards.length)) {
        showToast('チケットが不足しています');
        return;
    }

    const summary = { weapon: 0, material: 0, escort_module: 0, quantity: 0, mythic: 0 };
    rewards.forEach(reward => {
        applyGachaReward(reward);
        summary[reward.type] = (summary[reward.type] || 0) + 1;
        if (reward.type === 'material' || reward.type === 'escort_module') {
            summary.quantity += toNonNegativeInt(reward.quantity);
        }
        if (reward.rarity === 'Mythic') summary.mythic += 1;
    });

    state.gachaLastResult = {
        type: 'bulk',
        count: rewards.length,
        summary,
        rewards: rewards.slice(0, 100),
        at: Date.now(),
        poolKey,
        manufacturerId: manufacturerId || null
    };
    SoundEngine.playUI('upgrade');
    showToast(`🎟 ${rewards.length}連 完了！ 武装${summary.weapon} / 素材${summary.material} / モジュール${summary.escort_module}` + (summary.mythic ? ` ／ Mythic ×${summary.mythic}‼` : ''));
    updateHeaderUI();
    renderGachaTab();
    saveGame(true);
}

function drawGachaFromPool(poolKey, manufacturerId) {
    const pool = GACHA_POOLS[poolKey];
    if (!pool) return;
    const man = poolKey === 'pickup' ? getManufacturer(manufacturerId) : null;
    if (poolKey === 'pickup') {
        if (!man) {
            showToast('ピックアップ対象が不明です');
            return;
        }
        if (!isManufacturerUnlocked(man)) {
            showToast('この製造元のピックアップは未解放です');
            return;
        }
    }
    const ticketType = (poolKey === 'pickup' && man && man.ticketType)
        ? man.ticketType
        : (pool.ticketType || 'normal');
    const cost = toNonNegativeInt((poolKey === 'pickup' && man && man.ticketCost)
        ? man.ticketCost
        : (pool.ticketCost || 1));
    if (getGachaTicketCount(ticketType) < cost) {
        showToast(`${GACHA_TICKET_LABELS[ticketType] || ticketType}が不足しています`);
        return;
    }

    const reward = rollGachaReward(poolKey, manufacturerId);
    if (!reward) {
        showToast('抽選できる報酬がありません');
        return;
    }
    if (!spendGachaTickets(ticketType, cost)) {
        showToast('チケットが不足しています');
        return;
    }
    const inst = applyGachaReward(reward);
    if (reward.type === 'weapon' && !inst) {
        showToast('武装の獲得に失敗しました');
        return;
    }

    state.gachaLastResult = Object.assign({}, reward, {
        at: Date.now(),
        poolKey,
        manufacturerId: manufacturerId || null,
        instanceUid: inst ? inst.uid : null
    });
    SoundEngine.playUI('upgrade');
    showToast(`🎟 ${formatGachaReward(reward)} を獲得！`);
    updateHeaderUI();
    renderGachaTab();
    saveGame(true);
}

// ==========================================================
// ガチャUI
// ==========================================================

function getPoolRateHTML(poolKey) {
    const pool = GACHA_POOLS[poolKey];
    if (!pool) return '';
    const categoryLabels = {
        material: '強化素材',
        escort_module: '鹵獲モジュール',
        weapon: '武装'
    };
    const categoryTotal = Object.keys(pool.categories || {}).reduce((sum, key) => sum + (pool.categories[key] || 0), 0);
    const categoryText = Object.keys(pool.categories || {})
        .filter(key => (pool.categories[key] || 0) > 0)
        .map(key => `${categoryLabels[key] || key} ${Math.round((pool.categories[key] / categoryTotal) * 100)}%`)
        .join(' / ');
    const rarityTotal = Object.keys(pool.weaponRarityWeights || {})
        .filter(key => key !== 'Mythic')
        .reduce((sum, key) => sum + (pool.weaponRarityWeights[key] || 0), 0);
    const rarityText = Object.keys(pool.weaponRarityWeights || {})
        .filter(key => key !== 'Mythic' && (pool.weaponRarityWeights[key] || 0) > 0)
        .map(key => `${getRarityMeta(key).label} ${Math.round((pool.weaponRarityWeights[key] / rarityTotal) * 100)}%`)
        .join(' / ');
    const mythicText = poolKey === 'pickup'
        ? `<div class="text-[10px] text-rose-300 mt-1">神話的ピックアップ: ${(pool.mythicChance * 100).toFixed(1)}%（通常抽選とは別枠）</div>`
        : '';
    return `
        <div class="text-[11px] text-slate-300 space-y-1">
            <div>排出: ${categoryText}</div>
            <div>武装レアリティ: ${rarityText}</div>
            ${mythicText}
            <div class="text-slate-400">レールガン系は全ガチャ排出対象外です。</div>
        </div>
    `;
}

function renderGachaResultCard(result) {
    if (!result) {
        return `
            <div class="bg-slate-900/80 border border-slate-700 rounded-lg p-4 text-center text-xs text-slate-400">
                まだ抽選していません。チケットを集めてガチャを引いてください。
            </div>
        `;
    }
    const timeText = result.at
        ? new Date(result.at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '';
    if (result.type === 'weapon') {
        const meta = getRarityMeta(result.rarity);
        const weapon = WEAPONS[result.weaponId];
        return `
            <div class="bg-slate-900/80 border-2 rounded-lg p-3 sm:p-4" style="border-color:${meta.color}88">
                <div class="flex flex-wrap justify-between items-center gap-2">
                    <div class="text-[10px] tech-font text-slate-400">LAST SUPPLY // ${timeText}</div>
                    <span class="text-[10px] font-black px-2 py-0.5 rounded" style="background:${meta.color}22;color:${meta.color};border:1px solid ${meta.color}66">${meta.label}</span>
                </div>
                <div class="mt-2 text-base sm:text-lg font-black text-white">${getWeaponName(result.weaponId, result.rarity)}</div>
                <div class="mt-0.5 text-[10px] text-slate-400">${weapon ? weapon.name : ''}の上位設計</div>
                <div class="mt-1 text-xs tech-font text-slate-300">
                    +${result.plus || 0} / Lv.${result.level || 1}
                    <span class="text-slate-500">|</span>
                    <span class="text-emerald-300">武装管理タブで育成できます</span>
                </div>
            </div>
        `;
    }
    if (result.type === 'bulk') {
        const s = result.summary || {};
        const counts = [
            { label: '武装', n: s.weapon || 0, color: '#38bdf8' },
            { label: '強化素材', n: s.material || 0, color: '#fbbf24' },
            { label: '強化モジュール', n: s.escort_module || 0, color: '#c084fc' }
        ];
        const mythicLine = s.mythic
            ? `<div class="gacha-bulk-mythic">神話的 ×${s.mythic} 獲得！</div>`
            : '';
        return `
            <div class="gacha-bulk-result">
                <div class="gacha-bulk-head">
                    <span class="text-[10px] tech-font text-slate-400">LAST SUPPLY // ${timeText}</span>
                    <span class="gacha-bulk-count">${result.count} 連</span>
                </div>
                <div class="gacha-bulk-grid">
                    ${counts.map(c => `
                        <div class="gacha-bulk-cell">
                            <span class="gacha-bulk-num" style="color:${c.color}">${c.n}</span>
                            <span class="gacha-bulk-label">${c.label}</span>
                        </div>
                    `).join('')}
                </div>
                ${mythicLine}
                <div class="gacha-bulk-note">武装は「武装」タブ、素材とモジュールは各画面で確認できます。</div>
            </div>
        `;
    }
    if (result.type === 'material') {
        return `
            <div class="bg-slate-900/80 border-2 border-amber-600/70 rounded-lg p-3 sm:p-4">
                <div class="text-[10px] tech-font text-slate-400">LAST SUPPLY // ${timeText}</div>
                <div class="mt-2 text-base sm:text-lg font-black text-amber-200">🔩 強化素材 ×${result.quantity || 1}</div>
                <div class="text-xs text-slate-300 mt-1">武装の上限突破に使用します。</div>
            </div>
        `;
    }
    if (result.type === 'escort_module') {
        return `
            <div class="bg-slate-900/80 border-2 border-purple-500/70 rounded-lg p-3 sm:p-4">
                <div class="text-[10px] tech-font text-slate-400">LAST SUPPLY // ${timeText}</div>
                <div class="mt-2 text-base sm:text-lg font-black text-purple-200">🛠 鹵獲機強化モジュール ×${result.quantity || 1}</div>
                <div class="text-xs text-slate-300 mt-1">鹵獲超兵器のHP・攻撃力を強化します。</div>
            </div>
        `;
    }
    return '';
}

function renderManufacturerPickupCards() {
    return MANUFACTURERS.map(man => {
        const ticketType = man.ticketType || GACHA_POOLS.pickup.ticketType;
        const ticketCost = toNonNegativeInt(man.ticketCost || GACHA_POOLS.pickup.ticketCost || 1);
        const unlocked = isManufacturerUnlocked(man);
        const weaponIds = getManufacturerWeaponIds(man);
        const target = WEAPONS[man.mythicWeaponId];
        const faction = (typeof FACTIONS !== 'undefined' ? FACTIONS : []).find(f => f.id === man.unlockFactionId);
        const ticketCount = getGachaTicketCount(ticketType);
        const disabled = !unlocked || weaponIds.length === 0 || ticketCount < ticketCost;
        const weaponNames = weaponIds.map(id => getWeaponName(id)).join(' / ') || '対象武装なし';
        return `
            <div class="bg-slate-800/90 border-2 rounded-lg p-3 flex flex-col gap-2" style="border-color:${man.color}66">
                <div class="flex justify-between items-start gap-2">
                    <div class="min-w-0">
                        <div class="text-sm font-bold" style="color:${man.color}">${man.name}</div>
                        <div class="text-[10px] text-slate-400">
                            ${unlocked ? '解放済み' : `${faction ? faction.name : man.unlockFactionId} を制圧すると解放`}
                        </div>
                    </div>
                    <span class="text-[10px] tech-font px-1.5 py-0.5 rounded ${unlocked ? 'bg-emerald-900 text-emerald-200' : 'bg-slate-900 text-slate-400'}" style="border:1px solid ${man.color}55">
                        ${unlocked ? 'OPEN' : 'LOCKED'}
                    </span>
                </div>
                <div class="text-[10px] text-slate-300">
                    <span class="text-rose-300 font-bold">Mythic:</span> ${target ? getWeaponName(target.id, 'Mythic') : '—'}
                </div>
                <div class="text-[10px] text-slate-400">対象: ${weaponNames}</div>
                <button type="button" onclick="drawGachaFromPool('pickup','${man.id}')"
                    class="gacha-pickup-draw w-full min-h-[44px] rounded font-black text-xs transition ${unlocked && !disabled ? 'bg-amber-600 hover:bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-500 border border-slate-700 cursor-not-allowed'} disabled:opacity-30 disabled:pointer-events-none"
                    ${disabled ? 'disabled' : ''}>
                    ${unlocked ? `🎟 ${GACHA_TICKET_LABELS[ticketType]}で抽選 (所持 ${ticketCount})` : '🔒 未解放'}
                </button>
                <div class="gacha-bulk-row is-compact" data-bulk-pool="pickup" data-bulk-man="${man.id}">
                    ${GACHA_BULK_COUNTS.map(n => {
                        const enough = unlocked && ticketCount >= ticketCost * n;
                        return `<button type="button" data-bulk-count="${n}"
                            class="${enough ? '' : 'is-short'}"
                            ${unlocked ? '' : 'disabled'}>${n}連</button>`;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// 連続抽選ボタンは描画のたびに作り直されるので、委譲で1回だけ拾う。
// 単発ボタンと同じ判定（残数・解放）をここでも反映する。
function syncGachaBulkRows() {
    document.querySelectorAll('.gacha-bulk-row').forEach(row => {
        const poolKey = row.dataset.bulkPool;
        const manId = row.dataset.bulkMan || null;
        const pool = GACHA_POOLS[poolKey];
        if (!pool) return;
        const man = poolKey === 'pickup' ? getManufacturer(manId) : null;
        const ticketType = (poolKey === 'pickup' && man && man.ticketType) ? man.ticketType : (pool.ticketType || 'normal');
        const unitCost = toNonNegativeInt((poolKey === 'pickup' && man && man.ticketCost) ? man.ticketCost : (pool.ticketCost || 1));
        const owned = getGachaTicketCount(ticketType);
        const unlocked = poolKey === 'pickup' ? isManufacturerUnlocked(man) : true;
        row.querySelectorAll('[data-bulk-count]').forEach(btn => {
            const n = toNonNegativeInt(btn.dataset.bulkCount);
            const enough = unlocked && owned >= unitCost * n;
            btn.disabled = !enough;
            btn.classList.toggle('is-short', !enough);
            btn.title = enough
                ? `${n}回抽選（${GACHA_TICKET_LABELS[ticketType] || ticketType} ${unitCost * n}枚）`
                : `${GACHA_TICKET_LABELS[ticketType] || ticketType}が足りません（必要 ${unitCost * n} / 所持 ${owned}）`;
        });
    });
}

let gachaBulkHandlerBound = false;

function bindGachaBulkHandlers() {
    if (gachaBulkHandlerBound) return;
    gachaBulkHandlerBound = true;
    document.addEventListener('click', event => {
        const btn = event.target.closest('.gacha-bulk-row [data-bulk-count]');
        if (!btn || btn.disabled) return;
        const row = btn.closest('.gacha-bulk-row');
        if (!row) return;
        event.preventDefault();
        drawGachaBulk(row.dataset.bulkPool, toNonNegativeInt(btn.dataset.bulkCount), row.dataset.bulkMan || null);
    });
}

function renderGachaTab() {
    if (!document.getElementById('tab-content-gacha')) return;
    const normalEl = document.getElementById('gacha-normal-tickets');
    const rareEl = document.getElementById('gacha-rare-tickets');
    const materialEl = document.getElementById('gacha-material-count');
    const moduleEl = document.getElementById('gacha-module-count');
    if (normalEl) normalEl.textContent = formatNumber(getGachaTicketCount('normal'));
    if (rareEl) rareEl.textContent = formatNumber(getGachaTicketCount('rare'));
    if (materialEl) materialEl.textContent = formatNumber(toNonNegativeInt(state.enhanceMaterials));
    if (moduleEl) moduleEl.textContent = formatNumber(toNonNegativeInt(state.escortEnhanceModules));

    const tabs = ['normal', 'rare', 'pickup'];
    tabs.forEach(tab => {
        const btn = document.getElementById(`gacha-subtab-${tab}`);
        if (!btn) return;
        const active = state.gachaSubTab === tab;
        btn.className = active
            ? 'px-2 py-2 rounded text-xs font-black border-2 border-amber-400 bg-amber-950/80 text-amber-200 transition'
            : 'px-2 py-2 rounded text-xs font-black border border-slate-600 bg-slate-900 text-slate-300 hover:border-amber-400 transition';
    });

    tabs.forEach(tab => {
        const view = document.getElementById(`gacha-subview-${tab}`);
        if (!view) return;
        if (state.gachaSubTab === tab) {
            view.classList.remove('hidden');
            view.classList.add('flex');
        } else {
            view.classList.add('hidden');
            view.classList.remove('flex');
        }
    });

    const normalInfo = document.getElementById('gacha-normal-info');
    const rareInfo = document.getElementById('gacha-rare-info');
    const pickupInfo = document.getElementById('gacha-pickup-info');
    if (normalInfo) normalInfo.innerHTML = getPoolRateHTML('normal');
    if (rareInfo) rareInfo.innerHTML = getPoolRateHTML('rare');
    if (pickupInfo) pickupInfo.innerHTML = getPoolRateHTML('pickup');

    const normalBtn = document.getElementById('gacha-normal-draw');
    const rareBtn = document.getElementById('gacha-rare-draw');
    if (normalBtn) {
        const count = getGachaTicketCount('normal');
        normalBtn.disabled = count < GACHA_POOLS.normal.ticketCost;
        normalBtn.textContent = `🎟 ノーマルチケットで抽選 (所持 ${count})`;
    }
    if (rareBtn) {
        const count = getGachaTicketCount('rare');
        rareBtn.disabled = count < GACHA_POOLS.rare.ticketCost;
        rareBtn.textContent = `🎟 レアチケットで抽選 (所持 ${count})`;
    }

    const pickupGrid = document.getElementById('gacha-pickup-grid');
    if (pickupGrid) pickupGrid.innerHTML = renderManufacturerPickupCards();

    syncGachaBulkRows();

    const resultEl = document.getElementById('gacha-last-result');
    if (resultEl) resultEl.innerHTML = renderGachaResultCard(state.gachaLastResult);
}

function switchGachaSubTab(tab) {
    if (!['normal', 'rare', 'pickup'].includes(tab)) return;
    state.gachaSubTab = tab;
    renderGachaTab();
}

// ==========================================================
// 武装管理UI
// ==========================================================

// 武装タブは廃止し、研究開発タブの「武装」セクションへ統合した。
// 旧名で呼ばれる箇所（ガチャ後の再描画など）は研究開発の再描画に流す。
function renderWeaponsTab() {
  if (typeof renderRDTab === 'function') renderRDTab();
}

// ==========================================================
// マージ
// ==========================================================

let pendingWeaponMerge = null;

function getMergeConsumeCandidates(group) {
    if (!group) return [];
    const sorted = group.instances.slice().sort((a, b) => {
        if (MERGE_CONSUME_ORDER === 'highest') return b.level - a.level || a.uid - b.uid;
        return a.level - b.level || a.uid - b.uid;
    });
    return sorted.slice(0, 3);
}

function getMergeResultPreview(consume, weaponId, rarity, plus) {
    const levels = consume.map(inst => inst.level);
    let level = 1;
    if (MERGE_LEVEL_MODE === 'average') {
        level = Math.max(1, Math.floor(levels.reduce((sum, value) => sum + value, 0) / Math.max(1, levels.length)));
    } else if (MERGE_LEVEL_MODE === 'max') {
        level = Math.max(1, ...levels);
    }
    const resultInst = createMergePreviewInstance(weaponId, rarity, plus + 1);
    const unlocked = Math.min(
        getWeaponInstanceMaxLevel(resultInst),
        Math.max(...consume.map(inst => getWeaponInstanceUnlockedMaxLevel(inst)))
    );
    return {
        plus: plus + 1,
        level: Math.min(level, unlocked),
        unlockedMaxLevel: unlocked,
        maxLevel: getWeaponInstanceMaxLevel(resultInst),
        softCap: getWeaponInstanceSoftCap(resultInst)
    };
}

function createMergePreviewInstance(weaponId, rarity, plus) {
    return {
        weaponId,
        rarity,
        plus,
        level: 1,
        unlockedMaxLevel: getRarityData(weaponId, rarity).maxLevel + plus * WEAPON_PLUS_MAX_LEVEL_BONUS
    };
}

function openWeaponMergeConfirm(weaponId, rarity, plus) {
    const group = getWeaponInstanceGroup(weaponId, rarity, plus);
    if (!group || group.instances.length < 3) {
        showToast('同じ武装・レアリティ・＋値が3個以上必要です');
        return;
    }
    if (group.plus >= WEAPON_MAX_PLUS) {
        showToast('＋値が最大です');
        return;
    }
    const consume = getMergeConsumeCandidates(group);
    if (consume.length < 3) {
        showToast('マージ素材が不足しています');
        return;
    }
    const preview = getMergeResultPreview(consume, weaponId, rarity, group.plus);
    pendingWeaponMerge = {
        weaponId,
        rarity,
        plus: group.plus,
        uids: consume.map(inst => inst.uid)
    };
    const meta = getRarityMeta(rarity);
    const currentMax = getWeaponInstanceMaxLevel(group.best);
    const currentSoft = getWeaponInstanceSoftCap(group.best);
    const currentUnlocked = Math.max(...consume.map(inst => getWeaponInstanceUnlockedMaxLevel(inst)));
    const body = document.getElementById('weapon-merge-confirm-body');
    const execBtn = document.getElementById('weapon-merge-confirm-execute');
    const modal = document.getElementById('weapon-merge-confirm-modal');
    if (!body || !execBtn || !modal) {
        pendingWeaponMerge = null;
        return;
    }
    body.innerHTML = `
        <div class="rounded-lg border p-3" style="border-color:${meta.color}77;background:${meta.color}12">
            <div class="text-sm font-bold text-white">${getWeaponName(weaponId, rarity)}</div>
            <div class="mt-1 flex flex-wrap items-center gap-2">
                <span class="text-[10px] font-black px-1.5 py-0.5 rounded" style="background:${meta.color}22;color:${meta.color};border:1px solid ${meta.color}66">${meta.label}</span>
                <span class="text-xs tech-font text-amber-300 font-bold">+${group.plus} → +${preview.plus}</span>
            </div>
        </div>
        <div class="text-xs text-slate-300 space-y-1">
            <div>消費する武装: ${consume.map(inst => `Lv.${inst.level}`).join(' / ')}</div>
            <div>現在: 最大Lv.${currentMax} / ソフトキャップ ${currentSoft} / 解禁上限 ${currentUnlocked}</div>
            <div>結果: <span class="text-emerald-300 font-bold">Lv.${preview.level}</span> / 最大Lv.${preview.maxLevel} / ソフトキャップ ${preview.softCap} / 解禁上限 ${preview.unlockedMaxLevel}</div>
        </div>
        <div class="text-[11px] text-amber-200 bg-amber-950/40 border border-amber-700/60 rounded p-2">
            合成元3個は消滅します。結果の武装はLv.${preview.level}で生成され、＋値で伸びた上限の一部は強化素材で解禁する必要があります。
        </div>
    `;
    execBtn.textContent = `+${preview.plus} にマージする`;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    SoundEngine.playUI('click');
}

function closeWeaponMergeConfirmModal() {
    pendingWeaponMerge = null;
    const modal = document.getElementById('weapon-merge-confirm-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function executeWeaponMerge() {
    const pending = pendingWeaponMerge;
    if (!pending) return;
    const instances = pending.uids
        .map(uid => (state.weaponInstances || []).find(inst => inst.uid === uid))
        .filter(Boolean);
    const valid = instances.length === 3 && instances.every(inst =>
        inst.weaponId === pending.weaponId
        && inst.rarity === pending.rarity
        && inst.plus === pending.plus
        && !isRailgunWeapon(inst.weaponId)
    );
    if (!valid) {
        closeWeaponMergeConfirmModal();
        showToast('マージ対象が変更されたため中断しました');
        return;
    }
    const preview = getMergeResultPreview(instances, pending.weaponId, pending.rarity, pending.plus);
    const result = createWeaponInstance(pending.weaponId, pending.rarity, {
        plus: pending.plus + 1,
        level: preview.level,
        unlockedMaxLevel: preview.unlockedMaxLevel
    });
    if (!result) {
        closeWeaponMergeConfirmModal();
        showToast('マージ結果の生成に失敗しました');
        return;
    }
    closeWeaponMergeConfirmModal();
    const uidSet = new Set(pending.uids);
    state.weaponInstances = (state.weaponInstances || []).filter(inst => !uidSet.has(inst.uid));
    state.weaponInstances.push(result);
    SoundEngine.playUI('upgrade');
    showToast(`🔧 マージ完了！ ${getWeaponName(result.weaponId, result.rarity)} +${result.plus} (Lv.${result.level})`);
    updateHeaderUI();
    renderWeaponsTab();
    saveGame(true);
}

// ==========================================================
// 一括合成
// ==========================================================

// その武器・レアリティで、3個以上そろっている最小の＋値を探す。
// マージすると＋値が繰り上がるので、毎回引き直す必要がある。
function getMergeablePlus(weaponId, rarity) {
    const groups = getWeaponInstanceGroups().filter(g =>
        g.weaponId === weaponId && g.rarity === rarity && g.count >= 3 && g.plus < WEAPON_MAX_PLUS
    );
    if (!groups.length) return -1;
    return Math.min(...groups.map(g => g.plus));
}

// 1グループぶんのマージを、条件を満たす限り繰り返す。
function mergeGroupRepeatedly(weaponId, rarity) {
    let merged = 0;
    // 暴走しないための上限（＋値の最大段数ぶん）。
    for (let guard = 0; guard <= WEAPON_MAX_PLUS + 1; guard++) {
        const plus = getMergeablePlus(weaponId, rarity);
        if (plus < 0) break;
        const group = getWeaponInstanceGroup(weaponId, rarity, plus);
        if (!group) break;
        const consume = getMergeConsumeCandidates(group);
        if (consume.length < 3) break;
        const preview = getMergeResultPreview(consume, weaponId, rarity, plus);
        const result = createWeaponInstance(weaponId, rarity, {
            plus: plus + 1,
            level: preview.level,
            unlockedMaxLevel: preview.unlockedMaxLevel
        });
        if (!result) break;
        const uidSet = new Set(consume.map(inst => inst.uid));
        state.weaponInstances = (state.weaponInstances || []).filter(inst => !uidSet.has(inst.uid));
        state.weaponInstances.push(result);
        merged++;
    }
    return merged;
}

// すべての武装・レアリティを対象に、可能なマージを一気に実行する。
function executeBulkMergeAll() {
    const groups = getWeaponInstanceGroups()
        .filter(g => !isRailgunWeapon(g.weaponId) && g.plus < WEAPON_MAX_PLUS)
        .sort((a, b) =>
            WEAPON_RARITY_ORDER.indexOf(a.rarity) - WEAPON_RARITY_ORDER.indexOf(b.rarity)
            || a.plus - b.plus
            || getWeaponName(a.weaponId).localeCompare(getWeaponName(b.weaponId), 'ja'));
    if (!groups.length) {
        showToast('合成できる武装がありません（同条件3個以上）');
        return;
    }

    let totalMerged = 0;
    let touchedKinds = 0;
    const seen = new Set();
    groups.forEach(group => {
        const key = `${group.weaponId}|${group.rarity}`;
        if (seen.has(key)) return;
        seen.add(key);
        const merged = mergeGroupRepeatedly(group.weaponId, group.rarity);
        if (merged > 0) { totalMerged += merged; touchedKinds++; }
    });

    if (totalMerged === 0) {
        showToast('合成できる組み合わせがありませんでした');
        return;
    }
    SoundEngine.playUI('upgrade');
    showToast(`🔧 一括合成 完了！ ${touchedKinds}種 ${totalMerged}回マージしました`);
    updateHeaderUI();
    renderWeaponsTab();
    saveGame(true);
}

// ==========================================================
// レベルアップ・上限突破
// ==========================================================

function upgradeWeaponInstanceByUid(uid) {
    const inst = (state.weaponInstances || []).find(item => item.uid === uid);
    if (!inst || isRailgunWeapon(inst.weaponId)) return;
    const unlocked = getWeaponInstanceUnlockedMaxLevel(inst);
    if (inst.level >= unlocked) {
        showToast('上限突破が必要です');
        return;
    }
    const cost = getWeaponInstanceUpgradeCost(inst);
    if (!Number.isFinite(cost)) {
        showToast('これ以上強化できません');
        return;
    }
    if (state.gold < cost) {
        showToast('資金が不足しています！');
        return;
    }
    state.gold -= cost;
    inst.level += 1;
    SoundEngine.playUI('upgrade');
    updateHeaderUI();
    renderWeaponsTab();
    saveGame(true);
}

function unlockWeaponInstanceCap(uid) {
    const inst = (state.weaponInstances || []).find(item => item.uid === uid);
    if (!inst || isRailgunWeapon(inst.weaponId)) return;
    const max = getWeaponInstanceMaxLevel(inst);
    const unlocked = getWeaponInstanceUnlockedMaxLevel(inst);
    if (unlocked >= max) {
        showToast('上限はすでに最大です');
        return;
    }
    const cost = getWeaponInstanceCapUnlockCost(inst);
    if (!Number.isFinite(cost)) {
        showToast('これ以上上限突破できません');
        return;
    }
    if (toNonNegativeInt(state.enhanceMaterials) < cost) {
        showToast('強化素材が不足しています！');
        return;
    }
    state.enhanceMaterials = toNonNegativeInt(state.enhanceMaterials) - cost;
    inst.unlockedMaxLevel = Math.min(max, unlocked + CAP_UNLOCK_SEGMENT);
    SoundEngine.playUI('upgrade');
    updateHeaderUI();
    renderWeaponsTab();
    saveGame(true);
}

// ==========================================================
// 鹵獲機強化モジュール
// ==========================================================

function applyEscortModuleBonus(stats, bossId) {
    if (!stats || !bossId) return stats;
    const lv = clampInt((state.escortModuleLevels || {})[bossId], 0, ESCORT_MODULE_MAX_LEVEL, 0);
    if (lv <= 0) return stats;
    const mult = 1 + lv * ESCORT_MODULE_PER_LEVEL;
    stats.maxHp = Math.floor(stats.maxHp * mult);
    stats.damage = Math.floor(stats.damage * mult);
    return stats;
}

function enhanceEscortWithModule(bossId) {
    if (!state.escortLevels[bossId]) return;
    if (!state.escortModuleLevels || typeof state.escortModuleLevels !== 'object') {
        state.escortModuleLevels = {};
    }
    const lv = clampInt(state.escortModuleLevels[bossId], 0, ESCORT_MODULE_MAX_LEVEL, 0);
    if (lv >= ESCORT_MODULE_MAX_LEVEL) {
        showToast('モジュール強化は最大です');
        return;
    }
    if (toNonNegativeInt(state.escortEnhanceModules) < 1) {
        showToast('鹵獲機強化モジュールが不足しています！');
        return;
    }
    state.escortEnhanceModules = toNonNegativeInt(state.escortEnhanceModules) - 1;
    state.escortModuleLevels[bossId] = lv + 1;
    const bossName = (ENEMY_TYPES[bossId] && ENEMY_TYPES[bossId].name) || bossId;
    SoundEngine.playUI('upgrade');
    showToast(`🛠 ${bossName} のモジュール強化 Lv.${lv + 1}`);
    updateHeaderUI();
    renderEscortTab();
    saveGame(true);
}

// ==========================================================
// セーブ補正・初期化
// ==========================================================

function normalizeGachaState() {
    if (!state.gachaTickets || typeof state.gachaTickets !== 'object') {
        state.gachaTickets = { normal: 0, rare: 0 };
    }
    state.gachaTickets.normal = toNonNegativeInt(state.gachaTickets.normal);
    state.gachaTickets.rare = toNonNegativeInt(state.gachaTickets.rare);

    state.enhanceMaterials = toNonNegativeInt(state.enhanceMaterials);
    state.escortEnhanceModules = toNonNegativeInt(state.escortEnhanceModules);

    if (!['normal', 'rare', 'pickup'].includes(state.gachaSubTab)) state.gachaSubTab = 'normal';
    if (!['inventory', 'merge'].includes(state.weaponSubTab)) state.weaponSubTab = 'inventory';

    if (state.gachaLastResult && typeof state.gachaLastResult === 'object') {
        const type = state.gachaLastResult.type;
        if (!['weapon', 'material', 'escort_module'].includes(type)) {
            state.gachaLastResult = null;
        } else if (type === 'weapon' && (!WEAPONS[state.gachaLastResult.weaponId] || isRailgunWeapon(state.gachaLastResult.weaponId))) {
            state.gachaLastResult = null;
        }
    } else {
        state.gachaLastResult = null;
    }

    if (!state.escortModuleLevels || typeof state.escortModuleLevels !== 'object') {
        state.escortModuleLevels = {};
    }
    Object.keys(state.escortModuleLevels).forEach(bossId => {
        if (!ENEMY_TYPES[bossId]) {
            delete state.escortModuleLevels[bossId];
            return;
        }
        const lv = clampInt(state.escortModuleLevels[bossId], 0, ESCORT_MODULE_MAX_LEVEL, 0);
        if (lv <= 0) delete state.escortModuleLevels[bossId];
        else state.escortModuleLevels[bossId] = lv;
    });

    const rawInstances = Array.isArray(state.weaponInstances) ? state.weaponInstances : [];
    let nextUid = Math.max(1, Math.floor(Number(state.weaponNextUid) || 1));
    const seen = new Set();
    const normalized = [];
    rawInstances.forEach(raw => {
        if (!raw || typeof raw !== 'object') return;
        if (!WEAPONS[raw.weaponId] || isRailgunWeapon(raw.weaponId)) return;
        if (!WEAPON_RARITIES[raw.rarity]) return;
        const plus = clampInt(raw.plus, 0, WEAPON_MAX_PLUS, 0);
        const data = getRarityData(raw.weaponId, raw.rarity);
        const max = data.maxLevel + plus * WEAPON_PLUS_MAX_LEVEL_BONUS;
        const unlocked = clampInt(raw.unlockedMaxLevel, 1, max, max);
        const level = clampInt(raw.level, 1, unlocked, 1);
        let uid = Math.floor(Number(raw.uid));
        if (!Number.isFinite(uid) || uid <= 0 || seen.has(uid)) {
            uid = nextUid++;
        } else {
            nextUid = Math.max(nextUid, uid + 1);
        }
        seen.add(uid);
        normalized.push({
            uid,
            weaponId: raw.weaponId,
            rarity: raw.rarity,
            plus,
            level,
            unlockedMaxLevel: unlocked,
            createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : 0
        });
    });
    state.weaponInstances = normalized;
    state.weaponNextUid = nextUid;

    if (!state.manufacturerGachaUnlocked || typeof state.manufacturerGachaUnlocked !== 'object') {
        state.manufacturerGachaUnlocked = {};
    }
    syncManufacturerGachaUnlocks();
}

function initializeGacha() {
    syncManufacturerGachaUnlocks();
    bindGachaBulkHandlers();
}
