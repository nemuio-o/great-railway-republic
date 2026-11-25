const canvas = document.getElementById('battleCanvas');
const ctx = canvas.getContext('2d');
let enemies = [];
let projectiles = [];
let particles = [];
let floatingTexts = [];
let bossUltimateEffects = [];
let allyEscorts = [];
let waveSpawnQueue = [];
let wheelAngle = 0;
let bgScroll = 0;
// 進軍距離（m）。ステージ開始でリセットし、走行に応じて増える。
let marchMeters = 0;
// 1フレームあたりの進軍距離。1ステージ(1000m)をおよそ一分半で走破する想定。
const MARCH_METERS_PER_FRAME = 0.14;
// 敵を出現させる距離間隔（最大構成でもボス前に収まるよう 20m 間隔）
const ENEMY_SPAWN_INTERVAL_M = 20;
// 次に通常敵を出現させる距離（m）
let nextSpawnMeters = 0;
let screenShake = 0;
let cutinTimeout = null;
let grandBossCutinTimeout = null;
let enemyPreviewHideTimer = null;

let weatherParticles = [];
let stormSlipTimer = 0;
let lightningFlash = 0;
let lightningBolt = null;

function initWeatherParticles() {
    weatherParticles = [];
    for (let i = 0; i < 65; i++) {
        weatherParticles.push({
            x: Math.random() * 1200,
            y: Math.random() * 500,
            speed: 2 + Math.random() * 4,
            size: 1.5 + Math.random() * 2.5,
            phase: Math.random() * Math.PI * 2
        });
    }
}

function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener('resize', resizeCanvas);

function showToast(msg) {
    const box = document.getElementById('toast-box');
    if (!box) return;
    box.textContent = msg;
    box.classList.remove('opacity-0');
    box.classList.add('opacity-100');
    clearTimeout(box._timer);
    box._timer = setTimeout(() => {
        box.classList.remove('opacity-100');
        box.classList.add('opacity-0');
    }, 3000);
}

// 大ボス専用 特殊登場演出
function triggerGrandBossEntrance(bossTmpl, faction) {
    const overlay = document.getElementById('grand-boss-overlay');
    const card = document.getElementById('grand-boss-card');
    const tagEl = document.getElementById('grand-boss-faction-tag');
    const nameEl = document.getElementById('grand-boss-name');
    const ultNameEl = document.getElementById('grand-boss-ult-name');
    const quoteEl = document.getElementById('grand-boss-quote');
    const gCanvas = document.getElementById('grand-boss-canvas');
    if (!overlay || !card) return;

    const ult = GRAND_BOSS_ULTIMATES[bossTmpl.id];
    const cleanName = bossTmpl.name.replace(/【.*?】/, '');

    clearTimeout(grandBossCutinTimeout);
    if (tagEl) tagEl.textContent = `${faction.name} // STAGE ${state.stage}`;
    if (nameEl) nameEl.textContent = cleanName;
    if (ultNameEl) ultNameEl.textContent = ult ? ult.name : '超出力殲滅波動';
    if (quoteEl) quoteEl.textContent = ult ? ult.entranceQuote : `「${cleanName}、最終防衛ラインへ降臨する！」`;

    if (gCanvas) {
        const gCtx = gCanvas.getContext('2d');
        gCtx.clearRect(0, 0, gCanvas.width, gCanvas.height);
        gCtx.save();
        gCtx.translate(gCanvas.width * 0.52, gCanvas.height * 0.56);
        const sc = Math.min(1.05, 32 / (bossTmpl.radius || 44));
        gCtx.scale(sc, sc);
        drawEnemySprite(gCtx, bossTmpl, 0, 0, faction);
        gCtx.restore();
    }

    overlay.classList.remove('hidden');
    card.classList.remove('grand-boss-cutin-active');
    void card.offsetWidth;
    card.classList.add('grand-boss-cutin-active');

    if (!state.muteBossCutscene) SoundEngine.playGrandBossEntrance();
    screenShake = Math.max(screenShake, 18);

    grandBossCutinTimeout = setTimeout(() => {
        overlay.classList.add('hidden');
    }, 4600);
}

// カットイン演出
function triggerCutin({ tag, title, sub, speech, themeColor, isBoss = false, bossId = null, faction = null, durationMs = 4200 }) {
    const overlay = document.getElementById('cutin-overlay');
    const banner = document.getElementById('cutin-banner');
    const content = document.getElementById('cutin-content');
    const topStripe = document.getElementById('cutin-top-stripe');
    const bottomStripe = document.getElementById('cutin-bottom-stripe');
    const tagEl = document.getElementById('cutin-tag');
    const titleEl = document.getElementById('cutin-title');
    const subEl = document.getElementById('cutin-sub');
    const speechEl = document.getElementById('cutin-speech');
    const visualBox = document.getElementById('cutin-visual-box');
    const bossCanvas = document.getElementById('cutin-boss-canvas');
    if (!overlay || !banner) return;

    clearTimeout(cutinTimeout);
    tagEl.textContent = tag || 'SECTOR ENGAGED';
    titleEl.textContent = title || '';
    subEl.textContent = sub || '';

    if (speechEl) {
        if (speech) {
            speechEl.textContent = speech;
            speechEl.style.borderColor = isBoss ? '#ef4444' : (themeColor || '#f59e0b');
            speechEl.classList.remove('hidden');
        } else {
            speechEl.classList.add('hidden');
        }
    }

    const accent = isBoss ? '#ef4444' : (themeColor || '#f59e0b');
    banner.style.borderColor = accent;
    tagEl.style.color = isBoss ? '#fca5a5' : accent;

    if (isBoss) {
        topStripe.className = 'h-2.5 w-full warning-hazard-strip';
        bottomStripe.className = 'h-2.5 w-full warning-hazard-strip';
        topStripe.style.backgroundColor = '';
        bottomStripe.style.backgroundColor = '';
    } else {
        topStripe.className = 'h-2 w-full';
        bottomStripe.className = 'h-2 w-full';
        topStripe.style.backgroundColor = accent;
        bottomStripe.style.backgroundColor = accent;
    }

    if (bossId && ENEMY_TYPES[bossId] && bossCanvas) {
        visualBox.classList.remove('hidden');
        visualBox.style.borderColor = accent;
        const bCtx = bossCanvas.getContext('2d');
        bCtx.clearRect(0, 0, bossCanvas.width, bossCanvas.height);
        const tmpl = ENEMY_TYPES[bossId];
        bCtx.save();
        bCtx.translate(bossCanvas.width * 0.52, bossCanvas.height * 0.56);
        const scale = Math.min(0.85, 24 / (tmpl.radius || 32));
        bCtx.scale(scale, scale);
        drawEnemySprite(bCtx, tmpl, 0, 0, faction || getCurrentFaction());
        bCtx.restore();
    } else {
        visualBox.classList.add('hidden');
    }

    overlay.classList.remove('hidden');
    banner.classList.remove('cutin-banner-active');
    content.classList.remove('cutin-content-active');
    void banner.offsetWidth;
    banner.classList.add('cutin-banner-active');
    content.classList.add('cutin-content-active');

    if (isBoss) {
        if (!state.muteBossCutscene) SoundEngine.playBossWarning();
        screenShake = Math.max(screenShake, 12);
    } else {
        SoundEngine.playFactionEntry();
    }

    cutinTimeout = setTimeout(() => {
        overlay.classList.add('hidden');
    }, durationMs);
}

// ステージごとの敵ウェーブ構成生成（勢力ティア・ステージ進行度に応じて雑魚敵が段階的に増加）
function getStageWaveConfig(faction, stage) {
    const queue = [];
    const previewCounts = {};
    const addUnit = (typeId, count = 1) => {
        const finalCount = Math.max(1, Math.floor(count));
        for (let i = 0; i < finalCount; i++) queue.push(typeId);
        previewCounts[typeId] = (previewCounts[typeId] || 0) + finalCount;
    };

    const factionIdx = Math.max(0, FACTIONS.findIndex(f => f.id === faction.id));
    const tierFactor = Math.max(0, factionIdx - 1);

    if (faction.isEndless) {
        const allBossIds = Object.keys(ENEMY_TYPES).filter(k => {
            const t = ENEMY_TYPES[k];
            if (!t.isBoss || t.isWeatherBoss) return false;
            if (faction.world === 'dark') return k.startsWith('drk_') || k.startsWith('gwb_');
            return !k.startsWith('drk_') && !k.startsWith('gwb_');
        });
        const darkBonus = faction.world === 'dark' ? 3 : 0;
        const bossCount = Math.min(5, 2 + Math.floor(stage / 4));
        addUnit('infantry', 5 + darkBonus + Math.floor(stage * 0.45));
        addUnit('tank', 3 + Math.floor(darkBonus * 0.6) + Math.floor(stage * 0.32));
        addUnit('jet', 3 + Math.floor(darkBonus * 0.6) + Math.floor(stage * 0.32));
        addUnit('gunship', 2 + Math.floor(darkBonus * 0.5) + Math.floor(stage * 0.26));
        addUnit('destroyer', 2 + Math.floor(darkBonus * 0.5) + Math.floor(stage * 0.24));
        for (let i = 0; i < bossCount; i++) {
            const pick = allBossIds[(stage * 3 + i * 5) % allBossIds.length];
            addUnit(pick, 1);
        }
        return { queue, previewCounts };
    }

    if (faction.isTutorial) {
        if (stage === 10) {
            addUnit('infantry', 5);
            addUnit('tank', 2);
            addUnit('jet', 2);
            addUnit('pol_final', 1);
        } else if (stage === 5) {
            addUnit('infantry', 4);
            addUnit('jet', 1);
            addUnit('pol_mid', 1);
        } else {
            addUnit('infantry', 2 + Math.floor(stage * 0.7));
            if (stage >= 2) addUnit('jet', 1 + Math.floor(stage / 3));
            if (stage >= 4) addUnit('tank', 1 + Math.floor(stage / 4));
            if (stage >= 7) addUnit('destroyer', 1 + Math.floor((stage - 6) / 2));
        }
        return { queue, previewCounts };
    }

    // 1ウェーブあたりの総数。終盤でも 40体前後に収め、処理落ちを避ける。
    const infCount = 4 + Math.floor(Math.min(6, tierFactor * 0.5)) + Math.floor(stage * 0.26);
    const jetCount = (stage >= 2 || tierFactor >= 1) ? (2 + Math.floor(Math.min(4, tierFactor * 0.35)) + Math.floor(stage * 0.18)) : 0;
    const tankCount = (stage >= 3 || tierFactor >= 1) ? (1 + Math.floor(Math.min(4, tierFactor * 0.35)) + Math.floor(stage * 0.17)) : 0;
    const gunshipCount = (stage >= 5 || tierFactor >= 2) ? (1 + Math.floor(Math.min(3, tierFactor * 0.3)) + Math.floor(Math.max(0, stage - 3) * 0.14)) : 0;
    const destroyerCount = (stage >= 7 || tierFactor >= 2) ? (1 + Math.floor(Math.min(3, tierFactor * 0.28)) + Math.floor(Math.max(0, stage - 5) * 0.13)) : 0;

    const maxWaves = Math.max(infCount, jetCount, tankCount, gunshipCount, destroyerCount);
    for (let w = 0; w < maxWaves; w++) {
        if (w < infCount) addUnit('infantry', 1);
        if (w < jetCount) addUnit('jet', 1);
        if (w < tankCount) addUnit('tank', 1);
        if (w < gunshipCount) addUnit('gunship', 1);
        if (w < destroyerCount) addUnit('destroyer', 1);
    }

    if (stage === 30) {
        addUnit(faction.bosses.final, 1);
    } else if (stage === 20) {
        addUnit(faction.bosses.n20, 1);
    } else if (stage === 10) {
        addUnit(faction.bosses.n10, 1);
    } else if (stage % 5 === 0) {
        addUnit(faction.bosses.mid, 1);
    }

    return { queue, previewCounts };
}

function showEnemyPreviewTemporarily(extraWeatherBossId = null) {
    const faction = getCurrentFaction();
    const weather = getCurrentWeather();
    const { previewCounts } = getStageWaveConfig(faction, state.stage);
    if (extraWeatherBossId) {
        previewCounts[extraWeatherBossId] = (previewCounts[extraWeatherBossId] || 0) + 1;
    }

    const boxEl = document.getElementById('enemy-preview-box');
    const titleEl = document.getElementById('ui-preview-faction');
    const listEl = document.getElementById('ui-enemy-preview');
    if (!boxEl || !titleEl || !listEl) return;

    titleEl.innerHTML = `<span class="text-[10px] text-red-400">◈</span> <span>${faction.name} ST.${state.stage} ${weather.icon}</span>`;

    const entries = Object.entries(previewCounts);
    listEl.innerHTML = entries.map(([typeId, count]) => {
        const t = ENEMY_TYPES[typeId];
        if (!t) return '';
        const attrBadge = t.attr === 'LAND'
            ? '<span class="text-amber-300">[陸]</span>'
            : t.attr === 'SEA'
                ? '<span class="text-cyan-300">[海]</span>'
                : '<span class="text-sky-300">[空]</span>';
        const nameCls = t.isWeatherBoss ? 'text-purple-300 font-black' : t.isBoss ? 'text-red-300 font-bold' : 'text-slate-200';
        return `<div class="flex justify-between items-center gap-2 leading-tight">
            <span class="truncate ${nameCls}">${attrBadge} ${t.name.replace(/【.*?】/, '')}</span>
            <span class="tech-font text-amber-300 flex-shrink-0">×${count}</span>
        </div>`;
    }).join('');

    boxEl.classList.remove('opacity-0');
    boxEl.classList.add('opacity-100');

    clearTimeout(enemyPreviewHideTimer);
    enemyPreviewHideTimer = setTimeout(() => {
        boxEl.classList.remove('opacity-100');
        boxEl.classList.add('opacity-0');
    }, 2000);
}

function spawnAllyEscorts() {
    allyEscorts = [];
    const h = canvas.height || 260;
    const frontX = getCarX(0);
    state.equippedEscorts.forEach((bossId, idx) => {
        const stats = getEscortStats(bossId);
        if (!stats) return;
        applyEscortModuleBonus(stats, bossId);

        let domainY = h * 0.71;
        if (stats.attr === 'AIR') {
            domainY = h * 0.25 + (idx % 3) * 14;
        } else if (stats.attr === 'SEA') {
            domainY = h * 0.88 + (idx % 2) * 5;
        } else {
            domainY = h * 0.71 - Math.min(6, stats.radius * 0.18) + (idx % 2) * 4;
        }

        allyEscorts.push({
            id: bossId,
            name: stats.name,
            attr: stats.attr,
            color: stats.color,
            hp: stats.maxHp,
            maxHp: stats.maxHp,
            damage: stats.damage,
            cooldown: stats.cooldown,
            moveSpeed: stats.moveSpeed,
            cdTimer: 10 + idx * 8,
            x: frontX + 34 + idx * 24,
            y: domainY,
            baseY: domainY,
            radius: Math.max(18, Math.round(stats.radius * 0.56)),
            origRadius: stats.radius
        });
    });
}

function startInitialOperation() {
    SoundEngine.init();
    SoundEngine.playUI('launch');
    closeStoryModal();
    if (!state.inWave) {
        startWave();
    }
}

function closeStoryModal() {
    const modal = document.getElementById('story-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function openStoryModal() {
    const modal = document.getElementById('story-modal');
    if (!modal) return;
    document.getElementById('story-title').textContent = '大鉄道共和国 作戦概要';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function startWave() {
    if (state.inWave) return;
    SoundEngine.init();
    SoundEngine.playUI('launch');

    const faction = getCurrentFaction();
    const { queue } = getStageWaveConfig(faction, state.stage);

    const weather = getCurrentWeather();
    let spawnedWeatherBossId = null;
    if (weather.weatherBossId && Math.random() < 0.03) {
        spawnedWeatherBossId = weather.weatherBossId;
        queue.push(spawnedWeatherBossId);
    }

    const regenRatio = getRelicRegenRatio();
    if (regenRatio > 0 && state.hp < state.maxHp) {
        state.hp = Math.min(state.maxHp, state.hp + Math.round(state.maxHp * regenRatio));
    }

    enemies = [];
    projectiles = [];
    particles = [];
    floatingTexts = [];
    // 進軍距離をリセットし、最初の敵は少し走ってから出現させる
    marchMeters = 0;
    nextSpawnMeters = 40;
    bossUltimateEffects = [];
    waveSpawnQueue = [...queue];
    stormSlipTimer = 60;
    state.inWave = true;

    spawnAllyEscorts();

    const bossIdInWave = spawnedWeatherBossId || queue.find(id => ENEMY_TYPES[id] && ENEMY_TYPES[id].isBoss);
    if (bossIdInWave) {
        const bTmpl = ENEMY_TYPES[bossIdInWave];
        const alreadySeen = !!(state.bossRecords[bossIdInWave] && state.bossRecords[bossIdInWave].seen);
        if (!state.bossRecords[bossIdInWave]) {
            state.bossRecords[bossIdInWave] = { seen: true, defeated: 0 };
        } else {
            state.bossRecords[bossIdInWave].seen = true;
        }

        // 図鑑設定「一度見たボスの演出をカット」が有効な場合は、遭遇済みボスの演出を省略する
        const skipCutscene = alreadySeen && state.skipSeenBossCutscene;
        if (skipCutscene) {
            // 演出なし
        } else if (bTmpl.isGrandBoss) {
            triggerGrandBossEntrance(bTmpl, faction);
        } else {
            triggerCutin({
                tag: spawnedWeatherBossId ? `${weather.icon} WEATHER ANOMALY BOSS // 気象特殊ボス出現` : 'WARNING // BOSS UNIT DETECTED',
                title: bTmpl.name.replace(/【.*?】/, ''),
                sub: `${faction.name} // STAGE ${state.stage}`,
                speech: `「アイン・ソフ・オウル捕捉――目標『${bTmpl.name.replace(/【.*?】/, '')}』が交戦領域に進入！」`,
                themeColor: spawnedWeatherBossId ? bTmpl.color : '#ef4444',
                isBoss: true,
                bossId: bossIdInWave,
                faction
            });
        }
    }

    showEnemyPreviewTemporarily(spawnedWeatherBossId);
    updateHeaderUI();
}

// 大ボス必殺技の最終ダメージ。計算結果が5桁（10,000以上）に達する場合は半減させる。
function calcGrandBossUltimateDamage(boss, ult) {
    const trait = boss.trait || {};
    const enraged = trait.enrageHp && boss.hp / boss.maxHp <= trait.enrageHp;
    const traitDmgMult = (trait.contactDmgMult || 1) * (enraged ? (trait.enrageAtkMult || 1) : 1);
    const raw = boss.damage * traitDmgMult * ult.dmgMult * getActiveSkillDamageTakenMult();
    const adjusted = raw >= 10000 ? raw * 0.5 : raw;
    return Math.max(1, Math.round(adjusted));
}

// 大ボスの特別必殺技発動（出現時＆時間経過で定期発動）
function triggerGrandBossUltimate(boss, isEntranceCast = false) {
    if (!boss || boss.hp <= 0) return;
    const ult = GRAND_BOSS_ULTIMATES[boss.id];
    if (!ult) return;

    const w = canvas.width || 800;
    const h = canvas.height || 260;
    const frontTrainX = getCarX(0);
    const backTrainX = getCarX(CAR_COUNT - 1);
    const trainMidX = (frontTrainX + backTrainX) * 0.5;
    const railY = h * 0.72;

    SoundEngine.playGrandBossUltimate(ult.style);
    screenShake = Math.max(screenShake, isEntranceCast ? 18 : 14);

    // 自己修復効果を持つ大ボス必殺技
    if (ult.healRatio && ult.healRatio > 0 && boss.hp < boss.maxHp) {
        const healVal = Math.round(boss.maxHp * ult.healRatio);
        boss.hp = Math.min(boss.maxHp, boss.hp + healVal);
        floatingTexts.push({
            x: boss.x,
            y: boss.y - boss.radius - 24,
            text: `✨+${healVal.toLocaleString()}`,
            color: '#34d399',
            life: 44
        });
    }

    // 必殺技の標的: 通常敵と同じ方式で選ぶ。
    // 同属性かつ護衛範囲内の鹵獲超兵器を配列の先頭から1機。いなければ列車本体。
    // 肩代わり回数に上限は設けない（ボス撃破まで何度でも護衛機が身代わりになる）。
    const aliveEscorts = allyEscorts.filter(esc => esc.hp > 0);
    const guardLeftX = getCarX(CAR_COUNT - 1) - 60;
    const guardRightX = getCarX(0) + 280;
    const targetEscort = aliveEscorts.find(esc =>
        esc.attr === boss.attr && esc.x >= guardLeftX && esc.x <= guardRightX
    ) || null;

    let finalTrainDmg = 0;
    let escortDmg = 0;

    if (targetEscort) {
        // 鹵獲個体単体への攻撃（列車本体は無傷）
        escortDmg = calcGrandBossUltimateDamage(boss, ult);
        targetEscort.hp = Math.max(0, targetEscort.hp - escortDmg);
        floatingTexts.push({
            x: targetEscort.x,
            y: targetEscort.y - targetEscort.radius - 12,
            text: `⚡${ult.name} -${escortDmg.toLocaleString()}`,
            color: '#f43f5e',
            life: 46
        });
        if (targetEscort.hp <= 0) {
            targetEscort.hp = 0;
            floatingTexts.push({
                x: targetEscort.x,
                y: targetEscort.y - targetEscort.radius - 28,
                text: '💥 大破',
                color: '#f43f5e',
                life: 64
            });
            showToast(`💥 護衛機「${targetEscort.name}」大破`);
        }
    } else {
        // 護衛機がいなければ本体へ
        finalTrainDmg = calcGrandBossUltimateDamage(boss, ult);
        state.hp = Math.max(0, state.hp - finalTrainDmg);

        floatingTexts.push({
            x: trainMidX,
            y: railY - 38,
            text: `⚡${ult.name} -${finalTrainDmg.toLocaleString()}`,
            color: '#fda4af',
            life: 52
        });
    }

    // 攻撃エフェクトの生成（標的へ集中させる）
    const subTargets = [];
    if (targetEscort) {
        subTargets.push({ x: targetEscort.x, y: targetEscort.y });
    } else {
        for (let i = 0; i < 6; i++) {
            subTargets.push({
                x: backTrainX + (frontTrainX - backTrainX) * (i / 5) + (Math.random() - 0.5) * 24,
                y: railY - 6 + (Math.random() - 0.5) * 10
            });
        }
    }

    const targetX = targetEscort ? targetEscort.x : trainMidX;
    const targetY = targetEscort ? targetEscort.y : railY - 8;

    bossUltimateEffects.push({
        style: ult.style,
        name: ult.name,
        color: ult.color,
        secondaryColor: ult.secondaryColor,
        sx: boss.x - boss.radius * 0.5,
        sy: boss.y,
        tx: targetX,
        ty: targetY,
        subTargets,
        life: 52,
        maxLife: 52
    });

    // 爆発パーティクル生成
    for (let i = 0; i < 24; i++) {
        particles.push({
            x: targetX + (Math.random() - 0.5) * 110,
            y: targetY + (Math.random() - 0.5) * 24,
            vx: (Math.random() - 0.5) * 7,
            vy: -1.5 - Math.random() * 5,
            color: i % 2 === 0 ? ult.color : ult.secondaryColor,
            life: 32
        });
    }

    if (!isEntranceCast) {
        showToast(targetEscort
            ? `⚠️ 大ボス必殺技【${ult.name}】発動！鹵獲護衛機「${targetEscort.name}」へ集中攻撃！（-${escortDmg.toLocaleString()} DMG）`
            : `⚠️ 大ボス必殺技【${ult.name}】発動！（-${finalTrainDmg.toLocaleString()} DMG）`);
    }

    if (state.hp <= 0) {
        handleStageDefeat();
    }
}

// 転生回数による敵戦力の補正。
// 方針: 「転生するほど、ぎりぎり有利」になる程度に留める。
//   HP     +2%/転生（転生50回で×2.0）      … 兵器成長(+3%/転生)より小さい
//   攻撃   +3%/転生（最大HPの伸び +1000/Lv より十分緩い）
//   報酬  +10%/転生（敵HPの伸びを大きく上回る）
// 実際の効率（転生0=1.00基準）:
//   撃破効率(火力÷敵HP) は転生20回あたりでピーク(×1.48)、以降は緩やかに減衰(転生50で×1.17)
//   総合効率(撃破×報酬) は単調に増加(転生50で×7.0) ため、周回するほど得になる
const PRESTIGE_ENEMY_HP_RATE = 0.02;
const PRESTIGE_ENEMY_DMG_RATE = 0.03;
const PRESTIGE_ENEMY_REWARD_RATE = 0.10;
const PRESTIGE_ENEMY_SCALE_CAP = 50;

function getPrestigeEnemyScaling() {
    const p = Math.min(PRESTIGE_ENEMY_SCALE_CAP, Math.max(0, Number(state.prestigeCount) || 0));
    const hpMult = 1 + p * PRESTIGE_ENEMY_HP_RATE;
    const dmgMult = 1 + p * PRESTIGE_ENEMY_DMG_RATE;
    const rewardMult = 1 + p * PRESTIGE_ENEMY_REWARD_RATE;
    return { hpMult, dmgMult, rewardMult };
}

// 画面に同時滞在させる敵の上限。ボスは別枠で1〜2体まで許容する。
// 端末性能に左右されにくいよう、基準値は控えめにしている。
const MAX_ALIVE_ENEMIES_BASE = 18;

// ============================================================
// 進軍距離（m）と地名
// ステージ内を走行距離として扱い、一定距離ごとに敵が出現する。
// 表記は「STAGE n」ではなく「n m地点 / 地名」で出す。
// ============================================================
// 勢力ごとの戦区名（ステージ10ごとに切り替わる区間名）
const FACTION_DISTRICTS = {
    pol: ['東京環状線', '横浜臨海区', '名古屋工業帯'],
    un: ['中部山岳線', '大阪湾岸区', '瀬戸内回廊'],
    usa: ['ロッキー山脈線', '五大湖工業帯', 'フロリダ沿岸区'],
    chn: ['黄河平原線', '長江デルタ区', '南嶺山脈線'],
    isl: ['アナトリア高原線', 'ペルシャ砂漠線', '紅海沿岸区'],
    rus: ['ウラル山脈線', 'シベリア永久凍土帯', '極東沿海区'],
    eu: ['アルプス山岳線', 'ライン工業地帯', '地中海沿岸区'],
    ter: ['成層圏軌道線', 'オービタルリング区', '大気圏外縁帯'],
    corp: ['データ回廊線', 'ネオ東京金融区', '海上データセンター帯'],
    gew: ['地下鉄道網', '黒曜採掘区', '廃都ヴィクター区'],
    ant: ['南極氷床線', '極夜回廊区', '次元ゲート前哨帯'],
    endless: ['現実無限戦区', '因果外縁帯', '終端座標区'],
    gew_beacon: ['反転ビーコン回廊', '暗黒橋頭堡区', '次元境界帯'],
    dark_abyss: ['クリフォト深層線', '深淵エーテル帯', '虚無海溝区'],
    dark_endless: ['暗黒無限領域', '終焉座標帯', 'オメガ区']
};

function getDistrictName(faction, stage, meters) {
    const list = FACTION_DISTRICTS[faction.id] || FACTION_DISTRICTS.endless;
    const idx = Math.min(list.length - 1, Math.floor((stage - 1) / 10));
    const base = list[idx];
    // 同一10ステージ内でも細かく地名が変わるよう、累計キロ程で区切った小地名を足す
    const totalM = getTotalMeters(faction, stage, meters);
    const km = Math.floor(totalM / 1000);
    const sub = ['起点', '市街', '丘陵', '橋梁', '隧道', '平原', '海峡', '終端'][km % 8];
    return `${base}・${sub}`;
}

// 進軍距離の扱い:
//   marchMeters      … 現在のステージ内の進捗（0〜STAGE_LENGTH_M）
//   getTotalMeters() … 勢力のスタート地点からの累計距離（ステージをまたいで加算）
// 表示は累計側を使い、「この勢力でどこまで進んだか」が分かるようにする。
const STAGE_LENGTH_M = 1000;
const BOSS_SPAWN_M = 950;
// 雑魚を片付けたあと、残りがボスだけなら早期出現させる。ただし最低限の助走距離は残す。
const BOSS_EARLY_SPAWN_MIN_M = 200;

function getTotalMeters(faction, stage, metersInStage) {
    const completed = Math.max(0, (stage || 1) - 1) * STAGE_LENGTH_M;
    return completed + Math.max(0, metersInStage || 0);
}

function getStageDistanceLabel(faction, stage, meters) {
    return `${Math.floor(getTotalMeters(faction, stage, meters)).toLocaleString()} m / ${(faction.stageCount || 30) * STAGE_LENGTH_M} m`;
}

function getMaxAliveEnemies() {
    const faction = getCurrentFaction();
    // 無限戦区は敵の湧きが速いので少しだけ枠を広げる
    return MAX_ALIVE_ENEMIES_BASE + (faction.isEndless ? 6 : 0);
}

// ============================================================
// 敵の勢力倍率
// 旧 powerMult（0.65〜180,000 の巨大な指数）は廃止。
// 敵の強さは getGlobalStageMult()、報酬は getGlobalRewardMult() が
// 通しステージ番号から算出する。
// ============================================================
// ボス種別の重さ（中ボス・ネームド・大ボス共通の係数）。
// テンプレHPがネームドで突出しているため、係数で平準化する。
const ENEMY_BOSS_HP_SCALE = 0.28;

function getFactionTier(faction) {
    return Math.max(0, FACTIONS.findIndex(f => f.id === faction.id));
}

// チュートリアル（国連警察）も通し番号カーブに従う。
// ただし初期装備（レールガン1両＋ティファレト）で挑むため、
// ST1-2 は軽く、ST3 で段差を作り、ST10 で通し番号カーブに合流させる。
// 全区間で厳密に単調増加するように、各ステージの下限を前ステージ+εで担保する。
const TUTORIAL_START_SCALE = 0.35;   // 初期装備で ST1-2 を突破できる強さ

function getTutorialStageMult(stage) {
    const endMult = getGlobalStageMult({ id: 'pol' }, 10);  // ST10 で合流する倍率
    if (stage <= 1) return TUTORIAL_START_SCALE;
    if (stage === 2) return TUTORIAL_START_SCALE * 1.15;
    // ST3 以降: 初期係数 → ST10倍率 へ指数的に収束（ST3で段差、以降なだらか）
    const t = (stage - 2) / 8;                               // ST3=0.125 … ST10=1.0
    const base2 = TUTORIAL_START_SCALE * 1.15;
    return base2 * Math.pow(endMult / base2, Math.pow(t, 0.45));
}
// ============================================================
// 敵の強さは「通しステージ番号」で決める
// ------------------------------------------------------------
// 重要: 勢力N の ST1 は、勢力N-1 の ST30 より必ず強い。
// 各勢力ごとにカーブを作ると入口で難度が逆戻りするため、
// 全370ステージを1本の単調増加関数に通す。
//
//   倍率 = 1.12^(通し番号 - 1)
//
// 1ステージあたり ×1.12。コインも同じ ×1.12 で伸ばすので、
// 「1ステージ稼いで得られる強化量」がどこまで進んでも一定になる。
// コスト(1.10/Lv)が火力(1.08/Lv)より重いぶん、進むほど1ステージが
// 相対的に重くなり、周回して稼ぐ必要が出てくる。
// 370ステージ通しても最終倍率は ×4.0e18 程度に収まる。
// ============================================================
const GLOBAL_STAGE_STEP = 1.12;

// 通しステージ番号を返す（チュートリアルの10ステージを含む）
function getGlobalStageNumber(faction, stage) {
    let n = 0;
    for (const f of FACTIONS) {
        if (f.id === faction.id || f.isEndless) {
            if (f.id === faction.id) {
                return n + Math.max(1, stage);
            }
            continue;
        }
        n += f.stageCount || 30;
    }
    return Math.max(1, stage);
}

function getGlobalStageMult(faction, stage) {
    const n = getGlobalStageNumber(faction, stage);
    return Math.pow(GLOBAL_STAGE_STEP, n - 1);
}

// 報酬（コイン）の伸び。敵HPと同じ ×1.12 に揃える。
//
// これが揃っていることが「詰まったら周回して稼ぐ」を成立させる鍵。
//   コイン/秒 ∝ DPS / 敵HP
// なので、コインと敵HPが同じ率で伸びれば、どのステージを周回しても
// 「1秒あたりに買える強化量」が変わらない。深いステージを周回するほど
// 得をする、という破綻も起きない。
//
// もしコインが敵HPより速く伸びると（例: コイン1.15 / 敵1.12）、進むほど
// 楽になって壁が消え、周回が一度も発生しなくなる。
const REWARD_STAGE_STEP = 1.12;

function getGlobalRewardMult(faction, stage) {
    const n = getGlobalStageNumber(faction, stage);
    return Math.pow(REWARD_STAGE_STEP, n - 1);
}

// ============================================================
// 敵の勢力倍率
// 旧 powerMult（0.65〜180,000 の巨大な指数）は廃止。
// 敵の強さは getGlobalStageMult()、報酬は getGlobalRewardMult() が
// 通しステージ番号から算出する。
//
// ボス面が重く入口ST1が軽いのは意図した設計。ウェーブ構成の山を
// そのまま残す（正規化して潰さない）。
// ============================================================
function getEnemyFactionMult(faction, tmpl) {
    const bossScale = (tmpl && tmpl.isBoss) ? ENEMY_BOSS_HP_SCALE : 1;
    const stageMult = faction.isTutorial
        ? getTutorialStageMult(state.stage)
        : getGlobalStageMult(faction, state.stage);
    const hpMult = stageMult * bossScale;
    // 攻撃力はHPほど急がせない（HPの平方根相当）。急に即死させないため。
    const dmgMult = Math.sqrt(stageMult) * 1.15;

    return {
        hpMult,
        dmgMult,
        rewardMult: getGlobalRewardMult(faction, state.stage)
    };
}

// ステージ周回報酬。クリア回数が増えるほど報酬を減衰させる（最低50%は保証）。
const STAGE_CLEAR_REWARDS = {
    first: 1.00,   // 1回目
    mid: 0.80,     // 2〜29回目
    late: 0.70,    // 30〜99回目
    floor: 0.50    // 100回目以降
};

function getStageClearKey(factionId, stage) {
    return `${factionId}:${Math.max(1, Math.floor(stage) || 1)}`;
}

function getStageClearCount(factionId, stage) {
    const counts = state.stageClearCounts;
    if (!counts || typeof counts !== 'object') return 0;
    const raw = Number(counts[getStageClearKey(factionId, stage)]);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

function getStageRewardMultiplier(clearCount) {
    const n = Math.max(1, Math.floor(clearCount) || 1);
    if (n <= 1) return STAGE_CLEAR_REWARDS.first;
    if (n <= 29) return STAGE_CLEAR_REWARDS.mid;
    if (n <= 99) return STAGE_CLEAR_REWARDS.late;
    return STAGE_CLEAR_REWARDS.floor;
}

function spawnEnemyUnit(typeId) {
    const tmpl = ENEMY_TYPES[typeId];
    if (!tmpl) return;
    const faction = getCurrentFaction();
    const weather = getCurrentWeather();
    const w = canvas.width || 800;
    const h = canvas.height || 260;
    const sephPassive = getSephirahPassiveEffects();
    const pr = getPrestigeEnemyScaling();
    const fm = getEnemyFactionMult(faction, tmpl);

    const trait = BOSS_TRAITS[tmpl.id] || null;
    const finalHp = Math.max(40, Math.round(tmpl.hp * fm.hpMult * weather.enemyHpMult * pr.hpMult));
    const finalDmg = Math.max(5, Math.round(tmpl.damage * fm.dmgMult * pr.dmgMult));
    const traitRewardMult = trait && trait.rewardMult ? trait.rewardMult : 1;
    const finalReward = Math.max(5, Math.round(tmpl.reward * fm.rewardMult * getPrestigeGoldMult() * sephPassive.goldMult * pr.rewardMult * traitRewardMult * getStageRewardMultiplier(getStageClearCount(faction.id, state.stage) + 1)));

    let yPos = h * 0.70;
    if (tmpl.attr === 'AIR') {
        yPos = h * 0.24 + Math.random() * (h * 0.18);
    } else if (tmpl.attr === 'SEA') {
        yPos = h * 0.87 + (Math.random() - 0.5) * 8;
    } else {
        yPos = h * 0.71 + (Math.random() - 0.5) * 12;
    }

    const ultData = tmpl.isGrandBoss ? GRAND_BOSS_ULTIMATES[tmpl.id] : null;
    const spawned = {
        id: tmpl.id,
        name: tmpl.name,
        attr: tmpl.attr,
        hp: finalHp,
        maxHp: finalHp,
        speed: tmpl.speed * getRelicEnemySlowMult() * sephPassive.enemySlowMult * weather.enemySpeedMult * (trait && trait.speedMult ? trait.speedMult : 1),
        reward: finalReward,
        damage: finalDmg,
        color: tmpl.color,
        radius: tmpl.radius,
        isBoss: !!tmpl.isBoss,
        isGrandBoss: !!tmpl.isGrandBoss,
        isWeatherBoss: !!tmpl.isWeatherBoss,
        trait: trait,
        traitRegenTimer: trait && trait.regenInterval ? trait.regenInterval : 0,
        traitSummonTimer: trait && trait.summonInterval ? trait.summonInterval : 0,
        traitSummons: 0,
        ultMaxCd: ultData ? ultData.interval : 0,
        ultCd: ultData ? ultData.interval : 0,
        entranceUltDelay: ultData ? 32 : 0,
        x: w + tmpl.radius + 20,
        y: yPos
    };

    enemies.push(spawned);
}

function getCarX(carIndex) {
    const w = canvas.width || 800;
    const leadX = w * 0.41;
    // 4両編成。車体を大きめに見せられるよう、両数ぶんの幅で間隔を決める。
    const spacing = Math.min(42, Math.max(26, (w * 0.3) / (CAR_COUNT - 1)));
    return leadX - carIndex * spacing;
}

// 1スロットぶんの発射処理。装填タイマーはスロットごとに独立している。
function fireCarSlot(car, slot) {
    const isSide = slot === CAR_SLOT_SIDE;
    const timerKey = isSide ? 'sideCdTimer' : 'cdTimer';
    if (!getCarSlotWeaponId(car, slot)) return;
    if (car[timerKey] > 0) {
        car[timerKey]--;
        return;
    }

    const stats = getCarEffectiveStats(car, slot);
    if (!stats) return;

    const carX = getCarX(car.index);
    let bestTarget = null;
    let bestScore = -Infinity;

    enemies.forEach(e => {
        if (e.hp <= 0) return;
        const dist = e.x - carX;
        if (dist <= stats.range && dist >= -80) {
            const mult = stats.multipliers[e.attr] || 1.0;
            const score = mult * 1000 - dist;
            if (score > bestScore) {
                bestScore = score;
                bestTarget = e;
            }
        }
    });

    if (bestTarget) {
        fireCarWeapon(car, stats, bestTarget, slot);
        car[timerKey] = stats.cooldown;
    }
}

function getCarEffectiveStats(car, slot = CAR_SLOT_UPPER) {
    const weaponId = getCarSlotWeaponId(car, slot);
    if (!weaponId) return null;
    const w = WEAPONS[weaponId];
    if (!w) return null;
    const isSide = slot === CAR_SLOT_SIDE;
    const sephPassive = getSephirahPassiveEffects();

    let dmg = getEffectiveWeaponDamage(weaponId);
    let reloadMult = getRelicReloadMult() * getActiveSkillSpeedMult();
    let isSynergy = false;

    if (car.sephirahId) {
        const s = SEPHIROTH.find(item => item.id === car.sephirahId);
        const sLv = state.sephirahLevels[car.sephirahId] || 1;
        if (s && s.specialty === w.type) {
            isSynergy = true;
            const synBonus = (0.45 + (sLv - 1) * 0.18) * getPrestigeSynergyMult();
            dmg = Math.round(dmg * (1 + synBonus));
            reloadMult *= (1 + (0.25 + (sLv - 1) * 0.08) * getPrestigeSynergyMult());
        } else if (s) {
            dmg = Math.round(dmg * (1 + 0.10 + (sLv - 1) * 0.04));
        }
    }

    dmg = Math.round(dmg * getActiveSkillAtkMult() * sephPassive.atkMult * getEffectiveWeatherAllyAtkMult());
    // 4両化でスロット総数が減るぶんの補填。埋まっているスロットの比率ぶんだけ効かせる。
    dmg = Math.round(dmg * getCarDpsCompensation());
    // 側面スロットは斜射。空中目標への倍率だけを落とし、射程も詰める。
    const multipliers = isSide
        ? { ...w.multipliers, AIR: (w.multipliers.AIR || 1) * SIDE_SLOT_AIR_MULT }
        : w.multipliers;
    const range = isSide ? Math.round(w.range * SIDE_SLOT_RANGE_MULT) : w.range;
    const effectiveCd = Math.max(5, Math.round(w.cooldown / reloadMult));
    return { weapon: w, weaponId, damage: dmg, cooldown: effectiveCd, isSynergy, multipliers, range, isSide };
}

function fireCarWeapon(car, stats, target, slot = CAR_SLOT_UPPER) {
    const startX = getCarX(car.index);
    const isSide = slot === CAR_SLOT_SIDE;
    // 上部は車体上端の砲塔、側面は車体中央の副砲から撃つ。見た目でも区別できる。
    const startY = (canvas.height || 260) * (isSide ? 0.72 : 0.65);
    SoundEngine.playWeaponFire(stats.weapon.id);

    const sephPassive = getSephirahPassiveEffects();
    const chokmahBonus = getChokmahTreeCritBonus();
    const isCrit = Math.random() < sephPassive.critRate;
    // コクマーの加護は「会心倍率 +0.25倍/Lv」の加算扱い（カード表記と一致させる）。
    const finalShotDmg = isCrit ? Math.round(stats.damage * (sephPassive.critMult + chokmahBonus.critMultBonus)) : stats.damage;

    projectiles.push({
        weaponId: stats.weapon.id,
        type: stats.weapon.type,
        color: isCrit ? '#f43f5e' : stats.weapon.color,
        multipliers: stats.multipliers,
        damage: finalShotDmg,
        isCrit,
        x: startX,
        y: startY,
        targetX: target.x,
        targetY: target.y,
        targetRef: target,
        speed: stats.weapon.type === 'RAILGUN' || stats.weapon.id === 'laser_kether' ? 28 : 13,
        isBeam: stats.weapon.type === 'RAILGUN' || stats.weapon.id === 'laser_kether',
        life: stats.weapon.type === 'RAILGUN' || stats.weapon.id === 'laser_kether' ? 10 : 80
    });
}

// ダメージ適用の唯一の出口。呼び出し側は属性倍率・天候・クリティカルを積んだ「素の値」を渡す。
// ここでは異常値の防御（NaN/負数/非有限）とビナーの対ボス補正、最小1保証だけを行う。
function damageEnemy(enemy, dmg, hitColor = '#fbbf24') {
    if (!enemy || enemy.hp <= 0) return;
    const base = Number(dmg);
    if (!Number.isFinite(base) || base <= 0) return;
    const bossBonusMult = enemy.isBoss ? getBinahBossDmgMult() * getActiveTacticBossDmgMult() : 1.0;
    const traitTakenMult = enemy.trait && enemy.trait.damageTakenMult ? enemy.trait.damageTakenMult : 1.0;
    const scaled = Number.isFinite(bossBonusMult) ? base * bossBonusMult : base;
    const finalDmg = Math.max(1, Math.round(scaled * traitTakenMult));
    enemy.hp -= finalDmg;

    floatingTexts.push({
        x: enemy.x + (Math.random() - 0.5) * 16,
        y: enemy.y - enemy.radius - 6,
        text: finalDmg >= 10000 ? `${(finalDmg / 1000).toFixed(1)}k` : `${finalDmg}`,
        color: hitColor,
        life: 32
    });

    if (enemy.hp <= 0) {
        handleEnemyDefeated(enemy);
    } else if (enemy.trait && enemy.trait.reflectPct > 0) {
        // 太陽炉などの反射特性。撃破時は反射しない。
        const reflected = Math.max(1, Math.round(finalDmg * enemy.trait.reflectPct * getActiveSkillDamageTakenMult()));
        state.hp = Math.max(0, state.hp - reflected);
        floatingTexts.push({
            x: getCarX(1),
            y: (canvas.height || 260) * 0.58,
            text: `↩-${reflected}`,
            color: '#f43f5e',
            life: 30
        });
        if (state.hp <= 0) {
            handleStageDefeat();
        }
    }
}

function registerEscortCapture(enemyId, enemyName) {
    if (!enemyId) return;
    if (!state.escortDuplicateCounts || typeof state.escortDuplicateCounts !== 'object') {
        state.escortDuplicateCounts = {};
    }
    const name = enemyName || enemyId;
    if (!state.escortLevels[enemyId]) {
        state.escortLevels[enemyId] = 1;
        state.escortDuplicateCounts[enemyId] = 0;
        showToast(`🤖 鹵獲超兵器「${name}」を格納庫へ収容しました！`);
        return;
    }
    const lv = Math.max(1, Math.floor(Number(state.escortLevels[enemyId]) || 1));
    if (lv >= ESCORT_MAX_LEVEL) {
        showToast(`⚡ 鹵獲超兵器「${name}」は最大Lv.${ESCORT_MAX_LEVEL}です`);
        return;
    }
    const dup = Math.min(9, Math.max(0, Math.floor(Number(state.escortDuplicateCounts[enemyId]) || 0))) + 1;
    if (dup >= 10) {
        state.escortDuplicateCounts[enemyId] = dup - 10;
        state.escortLevels[enemyId] = Math.min(ESCORT_MAX_LEVEL, lv + 1);
        showToast(`⚡ 鹵獲超兵器「${name}」10体集めて1凸！ 機体Lv.${state.escortLevels[enemyId]} に上昇！`);
    } else {
        state.escortDuplicateCounts[enemyId] = dup;
        showToast(`⚡ 鹵獲超兵器「${name}」の重複 ${dup}/10（あと${10 - dup}体で1凸）`);
    }
}

function handleEnemyDefeated(enemy) {
    SoundEngine.playEnemyExplode(enemy.isBoss);
    const gainGold = Math.max(1, Math.round(enemy.reward * getActiveSkillGoldMult()));
    state.gold += gainGold;

    floatingTexts.push({
        x: enemy.x,
        y: enemy.y - enemy.radius - 18,
        text: `+${gainGold}G`,
        color: '#fde047',
        life: 42
    });

    const burstCount = enemy.isGrandBoss ? 36 : enemy.isBoss ? 24 : 10;
    for (let i = 0; i < burstCount; i++) {
        particles.push({
            x: enemy.x,
            y: enemy.y,
            vx: (Math.random() - 0.5) * (enemy.isGrandBoss ? 11 : enemy.isBoss ? 8 : 5),
            vy: (Math.random() - 0.5) * (enemy.isGrandBoss ? 11 : enemy.isBoss ? 8 : 5),
            color: i % 2 === 0 ? enemy.color : '#f59e0b',
            life: enemy.isGrandBoss ? 46 : enemy.isBoss ? 36 : 22
        });
    }

    if (enemy.isBoss) {
        screenShake = Math.max(screenShake, enemy.isGrandBoss ? 16 : 10);
        if (!state.bossRecords[enemy.id]) {
            state.bossRecords[enemy.id] = { seen: true, defeated: 1 };
        } else {
            state.bossRecords[enemy.id].seen = true;
            state.bossRecords[enemy.id].defeated = (state.bossRecords[enemy.id].defeated || 0) + 1;
        }

        triggerSephirahBossKillCallout(enemy);

        if (state.soldEscorts.includes(enemy.id)) {
            const sellBonus = Math.max(50, Math.round(enemy.reward * 1.5));
            state.gold += sellBonus;
            showToast(`💰 ロック中機体「${enemy.name.replace(/【.*?】/, '')}」を即時自動売却 (+${sellBonus}G)`);
        } else {
            registerEscortCapture(enemy.id, enemy.name.replace(/【.*?】/, ''));
        }

        if (enemy.isWeatherBoss) {
            const wItem = COLLECTIBLES.find(c => c.sourceType === 'weather' && c.bossId === enemy.id);
            if (wItem) {
                state.relics[wItem.id] = (state.relics[wItem.id] || 0) + 1;
                showToast(`💎 天候ボス撃破！収集アイテム「${wItem.name} (Lv.${state.relics[wItem.id]})」を獲得！`);
            }
        } else {
            const colItem = COLLECTIBLES.find(c => c.sourceType === 'boss' && c.bossId === enemy.id);
            if (colItem && Math.random() < colItem.dropRate) {
                state.relics[colItem.id] = (state.relics[colItem.id] || 0) + 1;
                showToast(`💎 奇跡のドロップ！収集アイテム「${colItem.name} (Lv.${state.relics[colItem.id]})」を獲得！`);
            }
        }
    }
}

function handleStageVictory() {
    state.inWave = false;
    SoundEngine.playStageClear();

    const faction = getCurrentFaction();
    // ステージ周回報酬: 今回が何回目のクリアかを先に確定させ、報酬倍率を掛ける。
    const clearKey = getStageClearKey(faction.id, state.stage);
    const clearAttempt = getStageClearCount(faction.id, state.stage) + 1;
    const stageRewardMult = getStageRewardMultiplier(clearAttempt);
    const ticketReward = grantStageClearTickets(faction, state.stage, clearAttempt);
    const ticketMsg = formatTicketReward(ticketReward);
    if (!state.stageClearCounts || typeof state.stageClearCounts !== 'object') state.stageClearCounts = {};
    state.stageClearCounts[clearKey] = clearAttempt;

    // ステージクリア報酬も、敵の勢力倍率と同じ報酬補正で伸ばす
    const clearBonus = Math.round((40 + state.stage * 22) * getEnemyFactionMult(faction, null).rewardMult * getPrestigeGoldMult() * getActiveSkillGoldMult() * getPrestigeEnemyScaling().rewardMult * stageRewardMult);
    state.gold += clearBonus;

    // 勝利時は最大HPの30%だけ回復する（全回復はしない）
    state.hp = Math.min(state.maxHp, state.hp + Math.round(state.maxHp * 0.30));

    const currentMax = state.maxReachedStages[faction.id] || 1;
    if (state.stage >= currentMax) {
        state.maxReachedStages[faction.id] = faction.isEndless ? state.stage + 1 : Math.min(faction.stageCount, state.stage + 1);
    }

    const isFactionFinalClear = !faction.isEndless && state.stage >= faction.stageCount;
    if (isFactionFinalClear) {
        if (!state.clearedFactions.includes(faction.id)) {
            state.clearedFactions.push(faction.id);
            syncManufacturerGachaUnlocks();
        }
        // 転生条件は「今回の周回での制圧」だけを見るため、累積とは別に記録する。
        if (!Array.isArray(state.runClearedFactions)) state.runClearedFactions = [];
        if (!state.runClearedFactions.includes(faction.id)) {
            state.runClearedFactions.push(faction.id);
        }

        const keyItem = BEACON_KEYS.find(k => k.factionId === faction.id);
        let keyMsg = '';
        if (keyItem && !state.beaconKeys[keyItem.id]) {
            state.beaconKeys[keyItem.id] = true;
            keyMsg = ` ＆ 🔑レリック「${keyItem.name}」獲得！`;
        }

        const unlockedAntarctica = checkAndUnlockAntarcticBase(false);
        if (unlockedAntarctica) {
            keyMsg += ' ＆ 🧊極秘戦線「Gewinner南極基地」解放！';
        }

        if (faction.id === 'ant' && !state.darkWorldUnlocked) {
            state.darkWorldUnlocked = true;
            if (!state.unlockedFactions.includes('gew_beacon')) state.unlockedFactions.push('gew_beacon');

            triggerCutin({
                tag: 'DIMENSIONAL BEACON ACTIVATED // ビーコン作動イベント発生',
                title: '新世界「暗黒世界」出現 ＆「Gewinnerビーコン基地」解放！',
                sub: 'ALL BEACON KEYS RESONATED // DARK WORLD TAB ADDED',
                speech: '「――9本のビーコンキーが南極中枢と共鳴し、次元境界が反転する！『🌐 世界』タブに新たなる次元【🌑 暗黒世界】が追加され、最初の戦線『Gewinnerビーコン基地』が出現した！」',
                themeColor: '#c084fc',
                isBoss: false,
                durationMs: 5400
            });
            showToast(`🌌 ビーコン作動イベント発生！「暗黒世界」タブが追加され「Gewinnerビーコン基地」が解放されました！ (+${clearBonus}G)${ticketMsg}`);
            showEnemyPreviewTemporarily();
            updateHeaderUI();
            renderCurrentTab();
            saveGame(true);
            return;
        }

        if (faction.id === 'ter') {
            if (!state.unlockedFactions.includes('corp')) state.unlockedFactions.push('corp');
            if (!state.unlockedFactions.includes('gew')) state.unlockedFactions.push('gew');

            if (state.loopStage) {
                rollStageWeather(state.stage, faction.id, true);
                showToast(`🏆 ${faction.name} 制圧！(+${clearBonus}G)${keyMsg} 周回継続${ticketMsg}`);
            } else {
                showToast(`🚩 国家統治崩壊！「世界企業連合」とテロ組織「Gewinner」が同時に出現！${keyMsg}${ticketMsg}`);
                switchFaction('corp', true);
            }
            showEnemyPreviewTemporarily();
            updateHeaderUI();
            renderCurrentTab();
            saveGame(true);
            return;
        }

        let nextFactionId = null;
        if (faction.id === 'pol') nextFactionId = 'un';
        else if (faction.id === 'un') nextFactionId = 'usa';
        else if (faction.id === 'usa') nextFactionId = 'chn';
        else if (faction.id === 'chn') nextFactionId = 'isl';
        else if (faction.id === 'isl') nextFactionId = 'rus';
        else if (faction.id === 'rus') nextFactionId = 'eu';
        else if (faction.id === 'eu') nextFactionId = 'ter';
        else if (faction.id === 'corp') nextFactionId = state.unlockedFactions.includes('gew') && !state.clearedFactions.includes('gew') ? 'gew' : (unlockedAntarctica ? 'ant' : 'endless');
        else if (faction.id === 'gew') nextFactionId = unlockedAntarctica || state.unlockedFactions.includes('ant') ? 'ant' : (state.unlockedFactions.includes('corp') && !state.clearedFactions.includes('corp') ? 'corp' : 'endless');
        else if (faction.id === 'ant') nextFactionId = 'gew_beacon';
        else if (faction.id === 'gew_beacon') nextFactionId = 'dark_abyss';
        else if (faction.id === 'dark_abyss') nextFactionId = 'dark_endless';

        const nextFaction = nextFactionId ? FACTIONS.find(f => f.id === nextFactionId) : null;
        if (nextFaction && !state.unlockedFactions.includes(nextFaction.id)) {
            state.unlockedFactions.push(nextFaction.id);
        }

        if (state.loopStage) {
            rollStageWeather(state.stage, faction.id, true);
            showToast(`🏆 ${faction.name} ST.${state.stage} 制圧＆装甲30%回復！(+${clearBonus}G)${keyMsg} 周回継続${ticketMsg}`);
        } else if (nextFaction) {
            showToast(`🚩 チェックポイント更新！${faction.name} 制圧${keyMsg} → 新戦線「${nextFaction.name}」へ転進！${ticketMsg}`);
            switchFaction(nextFaction.id, true);
        } else {
            rollStageWeather(state.stage, faction.id, true);
            showToast(`👑 戦線完全制覇！(+${clearBonus}G)${keyMsg}${ticketMsg}`);
        }
    } else {
        if (!state.loopStage) {
            state.stage += 1;
            state.factionStages[faction.id] = state.stage;
            if (faction.isEndless) {
                state.maxStage = Math.max(state.maxStage, state.stage);
            }
        }
        rollStageWeather(state.stage, faction.id, true);
        showToast(`✅ STAGE CLEAR! 装甲30%回復 ＆ 報酬 +${clearBonus}G（${Math.round(stageRewardMult * 100)}%）${ticketMsg}`);
    }

    if (state.autoMarch) {
        state.autoMarchTimer = 36;
    }

    showEnemyPreviewTemporarily();
    updateHeaderUI();
    renderCurrentTab();
    saveGame(true);
}

function handleStageDefeat() {
    state.inWave = false;
    enemies = [];
    projectiles = [];
    waveSpawnQueue = [];
    bossUltimateEffects = [];
    // 敗北時は最大HPの40%まで回復して立て直す（全回復はしない）
    state.hp = Math.min(state.maxHp, Math.max(1, Math.round(state.maxHp * 0.40)));

    if (state.autoMarch) {
        if (state.stage > 1) {
            state.stage -= 1;
            state.factionStages[state.currentFactionId] = state.stage;
        }
        state.loopStage = true;
        state.autoMarchTimer = 45;
        rollStageWeather(state.stage, state.currentFactionId, false);
        syncPlaybackControlsUI();
        showToast(`⚠️ 装甲大破… AUTO防衛プロトコル作動：STAGE ${state.stage} へ後退し、装甲40%で自動周回へ移行します`);
    } else {
        rollStageWeather(state.stage, state.currentFactionId, false);
        showToast('⚠️ 装甲大破… 装甲40%まで応急復旧。兵装強化や編成を見直して再出撃せよ！');
    }

    showEnemyPreviewTemporarily();
    updateHeaderUI();
    renderCurrentTab();
    saveGame(true);
}

function updateWeatherAnimation() {
    const w = canvas.width || 800;
    const h = canvas.height || 260;
    const weather = getCurrentWeather();

    if (lightningFlash > 0) {
        lightningFlash *= 0.82;
        if (lightningFlash < 0.02) {
            lightningFlash = 0;
            lightningBolt = null;
        }
    }

    weatherParticles.forEach(p => {
        if (weather.id === 'rain') {
            p.x -= p.speed * 1.4;
            p.y += p.speed * 3.8;
            if (p.y > h) { p.y = -10; p.x = Math.random() * (w + 150); }
            if (p.x < -50) { p.x = w + 50; }
        } else if (weather.id === 'storm') {
            p.x -= p.speed * 3.2;
            p.y += p.speed * 4.4;
            if (p.y > h) { p.y = -10; p.x = Math.random() * (w + 250); }
            if (p.x < -80) { p.x = w + 80; }
        } else if (weather.id === 'snow') {
            p.phase += 0.04;
            p.x -= 0.6 + Math.sin(p.phase) * 0.7;
            p.y += p.speed * 0.45;
            if (p.y > h) { p.y = -8; p.x = Math.random() * (w + 80); }
            if (p.x < -20) { p.x = w + 20; }
        } else if (weather.id === 'cloudy') {
            p.x -= 0.45 + p.size * 0.12;
            if (p.x < -60) p.x = w + 60;
        } else {
            p.phase += 0.02;
            p.x += Math.cos(p.phase) * 0.25;
            p.y += Math.sin(p.phase) * 0.2;
            if (p.x > w) p.x = 0;
            if (p.x < 0) p.x = w;
            if (p.y > h * 0.75) p.y = 10;
        }
    });
}

function updateSimulation() {
    const w = canvas.width || 800;
    const h = canvas.height || 260;
    const frontX = getCarX(0) + 18;
    const weather = getCurrentWeather();

    updateWeatherAnimation();

    // 演出表示中は戦闘を止める（敵の接近・ボス必殺技・天候ダメージを進めない）
    if (isCutsceneActive()) return;

    if (screenShake > 0) screenShake *= 0.85;
    if (screenShake < 0.2) screenShake = 0;

    wheelAngle += state.inWave ? 0.16 : 0.08;
    bgScroll += state.inWave ? 1.8 : 0.7;

    // 走行距離（m）を進める。一定距離ごとに敵が出現する仕組みの基準。
    // 速度倍率は gameLoop 側でステップ数が増えるため、ここでは等速で加算する。
    if (state.inWave) {
        marchMeters += MARCH_METERS_PER_FRAME;
        if (marchMeters >= STAGE_LENGTH_M) marchMeters = STAGE_LENGTH_M;
    }

    if (!state.inWave) {
        if (state.autoMarch) {
            if (state.autoMarchTimer > 0) {
                state.autoMarchTimer--;
            } else {
                startWave();
            }
        }
        return;
    }

    if (weather.stormSlip) {
        stormSlipTimer--;
        if (stormSlipTimer <= 0) {
            stormSlipTimer = 90;
            lightningFlash = 0.65;
            const boltX = w * (0.2 + Math.random() * 0.7);
            lightningBolt = [];
            let bx = boltX;
            let by = 0;
            while (by < h * 0.76) {
                lightningBolt.push({ x: bx, y: by });
                bx += (Math.random() - 0.5) * 34;
                by += 22 + Math.random() * 18;
            }
            SoundEngine.playThunder();

            const wb = getWeatherCollectibleBonuses();
            const allyResistMult = 1 - wb.stormSlipResist;

            const trainSlip = Math.max(1, Math.round(state.maxHp * 0.025 * getActiveSkillDamageTakenMult() * allyResistMult));
            state.hp = Math.max(0, state.hp - trainSlip);
            floatingTexts.push({ x: getCarX(1), y: h * 0.58, text: `⛈️-${trainSlip}`, color: '#c084fc', life: 34 });
            if (state.hp <= 0) {
                handleStageDefeat();
                return;
            }

            allyEscorts.forEach(esc => {
                if (esc.hp <= 0) return;
                const escSlip = Math.max(1, Math.round(esc.maxHp * 0.03 * allyResistMult));
                esc.hp = Math.max(0, esc.hp - escSlip);
                floatingTexts.push({ x: esc.x, y: esc.y - esc.radius - 10, text: `⛈️-${escSlip}`, color: '#c084fc', life: 30 });
            });

            enemies.forEach(e => {
                if (e.hp <= 0) return;
                const ratio = e.isBoss ? 0.02 : 0.035;
                const eSlip = Math.max(2, Math.round(e.maxHp * ratio));
                damageEnemy(e, eSlip, '#c084fc');
            });
        }
    }

    updateSephirahAutoSkills();

    if (waveSpawnQueue.length > 0) {
        // 一定距離ごとに敵を出す。ボスは基本 BOSS_SPAWN_M まで待つが、
        // 雑魚をすべて片付けて残りがボスだけになったら早期に出現させる。
        // 敵数が少ないステージで終盤に何百mも空白が続くのを防ぐ。
        const nextType = waveSpawnQueue[0];
        const isBossNext = !!(ENEMY_TYPES[nextType] && ENEMY_TYPES[nextType].isBoss);
        const onlyBossesLeft = waveSpawnQueue.every(id => ENEMY_TYPES[id] && ENEMY_TYPES[id].isBoss);
        const bossGate = (onlyBossesLeft && enemies.length === 0)
            ? Math.max(BOSS_EARLY_SPAWN_MIN_M, Math.min(BOSS_SPAWN_M, marchMeters))
            : BOSS_SPAWN_M;
        const gate = isBossNext ? bossGate : nextSpawnMeters;
        if (marchMeters >= gate) {
            // 画面に同時滞在できる敵数に上限を設ける（処理落ち防止）
            if (enemies.length < getMaxAliveEnemies()) {
                waveSpawnQueue.shift();
                spawnEnemyUnit(nextType);
                nextSpawnMeters = Math.min(BOSS_SPAWN_M, marchMeters + ENEMY_SPAWN_INTERVAL_M);
            }
        }
    }

    state.cars.forEach(car => {
        fireCarSlot(car, CAR_SLOT_UPPER);
        fireCarSlot(car, CAR_SLOT_SIDE);
    });

    const escortFrontLineLimit = w * 0.88;
    allyEscorts.forEach((esc, idx) => {
        if (esc.hp <= 0) return;

        if (esc.attr === 'AIR') {
            esc.y = h * 0.25 + (idx % 3) * 14;
        } else if (esc.attr === 'SEA') {
            esc.y = h * 0.88 + (idx % 2) * 5;
        } else {
            esc.y = h * 0.71 - Math.min(6, esc.radius * 0.18) + (idx % 2) * 4;
        }

        const engagedEnemy = enemies.find(e => e.hp > 0 && e.attr === esc.attr && e.x - e.radius <= esc.x + esc.radius + 18 && e.x + e.radius >= esc.x - esc.radius);
        if (!engagedEnemy && esc.x < escortFrontLineLimit) {
            esc.x = Math.min(escortFrontLineLimit, esc.x + (esc.moveSpeed || 0.7));

            if (esc.attr === 'LAND' && Math.random() < 0.25) {
                particles.push({
                    x: esc.x - esc.radius * 0.6,
                    y: h * 0.75,
                    vx: -0.8 - Math.random() * 0.8,
                    vy: -0.4 - Math.random() * 0.6,
                    color: '#94a3b8',
                    life: 14
                });
            } else if (esc.attr === 'SEA' && Math.random() < 0.30) {
                particles.push({
                    x: esc.x - esc.radius * 0.7,
                    y: esc.y + 4,
                    vx: -1.0 - Math.random() * 0.8,
                    vy: -0.3 + (Math.random() - 0.5) * 0.5,
                    color: '#7dd3fc',
                    life: 16
                });
            } else if (esc.attr === 'AIR' && Math.random() < 0.30) {
                particles.push({
                    x: esc.x - esc.radius * 0.8,
                    y: esc.y,
                    vx: -1.4 - Math.random() * 1.0,
                    vy: (Math.random() - 0.5) * 0.4,
                    color: '#e0f2fe',
                    life: 14
                });
            }
        }

        if (esc.cdTimer > 0) {
            esc.cdTimer--;
            return;
        }

        let bestTarget = null;
        let bestScore = -Infinity;
        enemies.forEach(e => {
            if (e.hp <= 0) return;
            const d = e.x - esc.x;
            if (d <= 460 && d >= -80) {
                const sameDomainBonus = e.attr === esc.attr ? 500 : 0;
                const score = sameDomainBonus - Math.abs(d);
                if (score > bestScore) {
                    bestScore = score;
                    bestTarget = e;
                }
            }
        });

        if (bestTarget) {
            const dmg = Math.max(1, Math.round(esc.damage * getEffectiveWeatherAllyAtkMult()));
            const shotColor = esc.attr === 'AIR' ? '#38bdf8' : esc.attr === 'SEA' ? '#2dd4bf' : '#22d3ee';
            projectiles.push({
                weaponId: 'escort_shot',
                type: 'ESCORT',
                color: shotColor,
                multipliers: { LAND: 1.2, SEA: 1.2, AIR: 1.2 },
                damage: dmg,
                x: esc.x + esc.radius,
                y: esc.y,
                targetX: bestTarget.x,
                targetY: bestTarget.y,
                targetRef: bestTarget,
                speed: 16,
                isBeam: false,
                life: 60
            });
            esc.cdTimer = esc.cooldown;
        }
    });

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.life--;
        if (p.life <= 0) {
            projectiles.splice(i, 1);
            continue;
        }

        if (p.isBeam) {
            if (!p.hitApplied) {
                p.hitApplied = true;
                if (p.targetRef && p.targetRef.hp > 0) {
                    const mult = p.multipliers[p.targetRef.attr] || 1.0;
                    damageEnemy(p.targetRef, Math.round(p.damage * mult), p.color);
                }
            }
            continue;
        }

        const tx = p.targetRef && p.targetRef.hp > 0 ? p.targetRef.x : p.targetX;
        const ty = p.targetRef && p.targetRef.hp > 0 ? p.targetRef.y : p.targetY;
        const dx = tx - p.x;
        const dy = ty - p.y;
        const dist = Math.hypot(dx, dy);

        if (dist <= p.speed + 10) {
            const hitTarget = (p.targetRef && p.targetRef.hp > 0)
                ? p.targetRef
                : enemies.find(e => e.hp > 0 && Math.hypot(e.x - tx, e.y - ty) <= e.radius + 18);
            if (hitTarget) {
                const mult = p.multipliers[hitTarget.attr] || 1.0;
                damageEnemy(hitTarget, Math.round(p.damage * mult), p.color);
            }
            for (let k = 0; k < 4; k++) {
                particles.push({
                    x: tx,
                    y: ty,
                    vx: (Math.random() - 0.5) * 4,
                    vy: (Math.random() - 0.5) * 4,
                    color: p.color,
                    life: 14
                });
            }
            projectiles.splice(i, 1);
        } else {
            p.x += (dx / dist) * p.speed;
            p.y += (dy / dist) * p.speed;
        }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (e.hp <= 0) {
            enemies.splice(i, 1);
            continue;
        }

        // 大ボス固有特別必殺技（出現直後＋時間経過で定期発動）
        if (e.isGrandBoss) {
            if (e.entranceUltDelay > 0) {
                e.entranceUltDelay--;
                if (e.entranceUltDelay === 0) {
                    triggerGrandBossUltimate(e, true);
                    if (!state.inWave) return;
                }
            } else if (e.ultCd > 0) {
                e.ultCd--;
                if (e.ultCd <= 0) {
                    e.ultCd = e.ultMaxCd || 360;
                    triggerGrandBossUltimate(e, false);
                    if (!state.inWave) return;
                }
            }
        }

        // ボス固有特性: 自己修復・増援召喚・激昂
        const trait = e.trait;
        if (trait) {
            if (trait.regenPct && trait.regenInterval && e.traitRegenTimer > 0) {
                e.traitRegenTimer--;
                if (e.traitRegenTimer <= 0) {
                    e.traitRegenTimer = trait.regenInterval;
                    if (e.hp > 0 && e.hp < e.maxHp) {
                        const heal = Math.max(1, Math.round(e.maxHp * trait.regenPct));
                        e.hp = Math.min(e.maxHp, e.hp + heal);
                        floatingTexts.push({ x: e.x, y: e.y - e.radius - 24, text: `✨+${heal}`, color: '#34d399', life: 40 });
                    }
                }
            }
            if (trait.summonInterval && trait.summonType && (e.traitSummons || 0) < (trait.summonMax || 1)) {
                e.traitSummonTimer = (e.traitSummonTimer || trait.summonInterval) - 1;
                if (e.traitSummonTimer <= 0) {
                    e.traitSummonTimer = trait.summonInterval;
                    spawnEnemyUnit(trait.summonType);
                    e.traitSummons = (e.traitSummons || 0) + 1;
                    showToast(`🌀 ${e.name.replace(/【.*?】/, '')} が増援を召喚！`);
                }
            }
        }
        const enraged = !!(trait && trait.enrageHp && (e.hp / e.maxHp) <= trait.enrageHp);
        const traitContactMult = (trait && trait.contactDmgMult ? trait.contactDmgMult : 1) * (enraged && trait.enrageAtkMult ? trait.enrageAtkMult : 1);
        const traitAttackIntervalMult = trait && trait.attackIntervalMult ? trait.attackIntervalMult : 1;

        const blocker = allyEscorts.find(esc => esc.hp > 0 && esc.attr === e.attr && e.x - e.radius <= esc.x + esc.radius + 18 && e.x + e.radius >= esc.x - esc.radius);
        if (blocker) {
            e.attackCd = (e.attackCd || 0) - 1;
            if (e.attackCd <= 0) {
                // 列車本体への被弾と同じく、電磁障壁を適用してから最小1ダメージで丸める
                const escortTaken = Math.max(1, Math.round(e.damage * traitContactMult * getActiveSkillDamageTakenMult()));
                blocker.hp = Math.max(0, blocker.hp - escortTaken);
                e.attackCd = Math.max(1, Math.round(45 * traitAttackIntervalMult));
                particles.push({
                    x: blocker.x + blocker.radius * 0.5,
                    y: blocker.y,
                    vx: (Math.random() - 0.5) * 4,
                    vy: (Math.random() - 0.5) * 4,
                    color: '#22d3ee',
                    life: 14
                });
                if (blocker.hp <= 0) {
                    blocker.hp = 0;
                    floatingTexts.push({
                        x: blocker.x,
                        y: blocker.y - blocker.radius - 26,
                        text: '💥 大破',
                        color: '#f43f5e',
                        life: 64
                    });
                    showToast(`💥 護衛機「${blocker.name}」大破`);
                }
            }
            continue;
        }

        if (e.x - e.radius <= frontX) {
            e.attackCd = (e.attackCd || 0) - 1;
            if (e.attackCd <= 0) {
                const rawDmg = e.damage * traitContactMult * getActiveSkillDamageTakenMult();
                const finalDmg = Math.max(1, Math.round(rawDmg));
                state.hp = Math.max(0, state.hp - finalDmg);
                e.attackCd = Math.max(1, Math.round(48 * traitAttackIntervalMult));
                SoundEngine.playTrainDamage();
                screenShake = Math.max(screenShake, e.isBoss ? 8 : 3);
                floatingTexts.push({
                    x: frontX - 8,
                    y: h * 0.60,
                    text: `-${finalDmg}`,
                    color: '#f87171',
                    life: 32
                });
                if (state.hp <= 0) {
                    handleStageDefeat();
                    return;
                }
            }
        } else {
            e.x -= e.speed * (enraged && trait.enrageSpeedMult ? trait.enrageSpeedMult : 1);
        }
    }

    for (let i = bossUltimateEffects.length - 1; i >= 0; i--) {
        bossUltimateEffects[i].life--;
        if (bossUltimateEffects[i].life <= 0) {
            bossUltimateEffects.splice(i, 1);
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life--;
        if (pt.life <= 0) particles.splice(i, 1);
    }
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.y -= 0.75;
        ft.life--;
        if (ft.life <= 0) floatingTexts.splice(i, 1);
    }

    if (waveSpawnQueue.length === 0 && enemies.length === 0) {
        handleStageVictory();
    }
}

// 敵ユニット＆ボス固有シルエット描画関数
function drawEnemySprite(ctx, unit, x, y, faction) {
    ctx.save();
    ctx.translate(x, y);
    const r = unit.radius || 14;
    const id = unit.id;
    const color = unit.color || '#94a3b8';

    if (!unit.isBoss) {
        switch (id) {
            case 'infantry':
                ctx.fillStyle = '#365314';
                ctx.fillRect(-10, -4, 20, 9);
                ctx.fillStyle = '#a3e635';
                ctx.fillRect(-7, -8, 12, 4);
                ctx.fillRect(-14, -7, 8, 2);
                break;
            case 'tank':
                ctx.fillStyle = '#1a2e05';
                ctx.fillRect(-16, -2, 32, 9);
                ctx.fillStyle = '#4d7c0f';
                ctx.beginPath();
                ctx.moveTo(-13, -2); ctx.lineTo(-8, -9); ctx.lineTo(10, -9); ctx.lineTo(14, -2);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#84cc16';
                ctx.fillRect(-22, -7, 15, 2.8);
                break;
            case 'jet':
                ctx.fillStyle = '#0369a1';
                ctx.beginPath();
                ctx.moveTo(-16, 0); ctx.lineTo(12, -5); ctx.lineTo(15, 0); ctx.lineTo(12, 5);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#38bdf8';
                ctx.beginPath();
                ctx.moveTo(-2, -2); ctx.lineTo(8, -11); ctx.lineTo(11, -2);
                ctx.moveTo(-2, 2); ctx.lineTo(8, 11); ctx.lineTo(11, 2);
                ctx.fill();
                break;
            case 'gunship':
                ctx.fillStyle = '#075985';
                ctx.beginPath(); ctx.ellipse(0, 0, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#7dd3fc';
                ctx.fillRect(-18, -9, 36, 2);
                ctx.fillRect(10, -3, 10, 4);
                break;
            case 'destroyer':
                ctx.fillStyle = '#115e59';
                ctx.beginPath();
                ctx.moveTo(-20, 2); ctx.lineTo(-14, -5); ctx.lineTo(18, -5); ctx.lineTo(20, 2);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#2dd4bf';
                ctx.fillRect(-4, -12, 10, 7);
                ctx.fillRect(-16, -8, 8, 2.5);
                break;
            default:
                ctx.fillStyle = color;
                ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
                break;
        }
        ctx.restore();
        return;
    }

    ctx.shadowColor = color;
    ctx.shadowBlur = unit.isGrandBoss ? 18 : 10;

    switch (id) {
        case 'wboss_clear': {
            ctx.strokeStyle = '#fde047';
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#f59e0b';
            for (let k = 0; k < 12; k++) {
                const a = (Math.PI * 2 / 12) * k;
                ctx.save();
                ctx.rotate(a);
                ctx.beginPath();
                ctx.moveTo(14, 0); ctx.lineTo(r * 1.18, -4); ctx.lineTo(r * 1.18, 4);
                ctx.closePath(); ctx.fill();
                ctx.restore();
            }
            ctx.fillStyle = '#fef9c3';
            ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'wboss_rain': {
            ctx.fillStyle = '#0369a1';
            ctx.beginPath();
            ctx.moveTo(-r * 1.3, 4); ctx.quadraticCurveTo(-r * 0.4, -18, r * 0.6, -12); ctx.lineTo(r * 1.35, -20); ctx.lineTo(r * 1.1, 6);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.moveTo(-14, -12); ctx.lineTo(-4, -24); ctx.lineTo(6, -12);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#bae6fd';
            ctx.beginPath(); ctx.arc(-r * 0.8, -2, 3, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'wboss_snow': {
            ctx.fillStyle = '#0e7490';
            ctx.beginPath();
            ctx.moveTo(-r * 1.3, 6); ctx.lineTo(-r * 0.7, -14); ctx.lineTo(r * 0.8, -14); ctx.lineTo(r * 1.2, 6);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#67e8f9';
            ctx.beginPath();
            ctx.moveTo(0, -14); ctx.lineTo(22, -r * 0.9); ctx.lineTo(14, -6);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#ecfeff';
            ctx.fillRect(-r * 1.35, -10, r * 0.8, 4);
            break;
        }
        case 'wboss_storm': {
            ctx.strokeStyle = '#c084fc';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-r, -12); ctx.lineTo(0, -24); ctx.lineTo(r, -12); ctx.lineTo(r * 0.8, 12); ctx.lineTo(-r * 0.8, 12);
            ctx.closePath(); ctx.stroke();
            ctx.fillStyle = '#581c87';
            ctx.fillRect(-22, -10, 44, 20);
            ctx.fillStyle = '#fef08a';
            ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'pol_mid': {
            ctx.fillStyle = '#1e3a8a';
            ctx.fillRect(-r, -6, r * 2, 16);
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.moveTo(-r - 7, 10); ctx.lineTo(-r, -4); ctx.lineTo(-r, 10);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#93c5fd';
            ctx.fillRect(-10, -16, 20, 10);
            ctx.fillRect(-26, -13, 18, 4);
            break;
        }
        case 'pol_final': {
            ctx.fillStyle = '#172554';
            ctx.fillRect(-r, -6, r * 2.1, 18);
            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(-16, -18, 32, 12);
            ctx.fillStyle = '#60a5fa';
            ctx.fillRect(-34, -16, 20, 3);
            ctx.fillRect(-36, -12, 22, 3);
            ctx.fillRect(-34, -8, 20, 3);
            ctx.fillStyle = '#93c5fd';
            ctx.beginPath(); ctx.arc(-16, -28, 5, 0, Math.PI * 2); ctx.arc(14, -28, 5, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'un_mid': {
            ctx.fillStyle = '#431407';
            ctx.fillRect(-r, -4, r * 2.1, 16);
            ctx.fillStyle = '#ea580c';
            ctx.fillRect(-18, -14, 34, 10);
            ctx.fillStyle = '#fb923c';
            ctx.fillRect(-10, -23, 20, 9);
            ctx.fillRect(-34, -11, 18, 4);
            ctx.fillRect(-28, -20, 20, 4);
            break;
        }
        case 'un_n10': {
            ctx.fillStyle = '#115e59';
            ctx.beginPath();
            ctx.moveTo(-r * 1.2, 4); ctx.lineTo(-r * 0.9, -8); ctx.lineTo(r * 1.1, -8); ctx.lineTo(r * 1.2, 4);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#2dd4bf';
            ctx.fillRect(-r * 1.0, -11, r * 2.0, 3);
            ctx.fillStyle = '#0f766e';
            ctx.fillRect(6, -22, 14, 11);
            break;
        }
        case 'un_n20': {
            ctx.fillStyle = '#1d4ed8';
            ctx.beginPath();
            ctx.moveTo(-r * 1.2, 0); ctx.lineTo(r * 0.8, -8); ctx.lineTo(r * 1.1, 0); ctx.lineTo(r * 0.8, 8);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#60a5fa';
            ctx.beginPath();
            ctx.moveTo(4, -3); ctx.lineTo(-12, -20); ctx.lineTo(-4, -3);
            ctx.moveTo(4, 3); ctx.lineTo(-12, 20); ctx.lineTo(-4, 3);
            ctx.closePath(); ctx.fill();
            break;
        }
        case 'un_final': {
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = 'rgba(244, 63, 94, 0.75)';
            for (let k = 0; k < 6; k++) {
                const ang = (Math.PI * 2 / 6) * k;
                ctx.save();
                ctx.rotate(ang);
                ctx.beginPath();
                ctx.moveTo(10, 0); ctx.lineTo(r * 1.15, -7); ctx.lineTo(r * 1.25, 0); ctx.lineTo(r * 1.15, 7);
                ctx.closePath(); ctx.fill();
                ctx.restore();
            }
            ctx.fillStyle = '#fff1f2';
            ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'usa_mid': {
            ctx.fillStyle = '#1e3a8a';
            ctx.beginPath();
            ctx.moveTo(-r * 1.1, 8); ctx.lineTo(-r * 0.8, -5); ctx.lineTo(r * 0.9, -5); ctx.lineTo(r * 1.1, 8);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(-14, -15, 28, 10);
            ctx.fillStyle = '#93c5fd';
            ctx.fillRect(-r * 1.35, -12, r * 0.95, 4);
            break;
        }
        case 'usa_n10': {
            ctx.fillStyle = '#172554';
            ctx.fillRect(-r * 1.25, -7, r * 2.5, 13);
            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(-r * 1.3, -10, r * 2.6, 3);
            ctx.fillStyle = '#60a5fa';
            for (let t = -12; t <= 18; t += 10) {
                ctx.fillRect(t, -20, 6, 10);
            }
            break;
        }
        case 'usa_n20': {
            ctx.fillStyle = '#1e293b';
            ctx.beginPath();
            ctx.moveTo(-r * 1.3, 0);
            ctx.lineTo(r * 0.7, -r * 0.85);
            ctx.lineTo(r * 0.4, -r * 0.35);
            ctx.lineTo(r * 0.9, 0);
            ctx.lineTo(r * 0.4, r * 0.35);
            ctx.lineTo(r * 0.7, r * 0.85);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth = 1.8;
            ctx.stroke();
            break;
        }
        case 'usa_final': {
            ctx.fillStyle = '#1e3a8a';
            ctx.fillRect(-16, 4, 11, 22);
            ctx.fillRect(5, 4, 11, 22);
            ctx.fillStyle = '#dc2626';
            ctx.fillRect(-22, -20, 44, 26);
            ctx.fillStyle = '#93c5fd';
            ctx.fillRect(-12, -32, 24, 12);
            ctx.fillStyle = '#fef08a';
            ctx.fillRect(-14, -28, 16, 4);
            ctx.fillStyle = '#f97316';
            ctx.fillRect(-34, -24, 12, 16);
            break;
        }
        case 'chn_mid': {
            ctx.fillStyle = '#7f1d1d';
            ctx.fillRect(-r, -5, r * 2, 15);
            ctx.fillStyle = '#dc2626';
            ctx.beginPath();
            ctx.moveTo(-16, -5); ctx.lineTo(-8, -16); ctx.lineTo(14, -16); ctx.lineTo(18, -5);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(-r * 1.35, -13, r * 1.0, 3.5);
            break;
        }
        case 'chn_n10': {
            ctx.fillStyle = '#7f1d1d';
            ctx.beginPath();
            ctx.moveTo(-r * 1.25, 4); ctx.lineTo(-r * 1.25, -13); ctx.lineTo(-r * 0.6, -8); ctx.lineTo(r * 1.2, -8); ctx.lineTo(r * 1.25, 4);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-r * 1.15, -11); ctx.lineTo(r * 0.9, -9);
            ctx.stroke();
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(8, -21, 14, 13);
            break;
        }
        case 'chn_n20': {
            ctx.fillStyle = '#b91c1c';
            ctx.beginPath();
            ctx.moveTo(-r * 1.35, 0); ctx.lineTo(r * 0.95, -r * 0.65); ctx.lineTo(r * 0.7, 0); ctx.lineTo(r * 0.95, r * 0.65);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#fde047';
            ctx.fillRect(r * 0.75, -5, 16, 10);
            break;
        }
        case 'chn_final': {
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(10, -4, r * 0.78, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#991b1b';
            ctx.fillRect(-16, -16, 36, 26);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(-r * 1.3, -15, r * 1.1, 6);
            ctx.fillRect(-r * 1.3, -3, r * 1.1, 6);
            ctx.fillStyle = '#fef08a';
            ctx.fillRect(-r * 1.2, -9, r * 0.9, 5);
            break;
        }
        case 'isl_mid': {
            ctx.fillStyle = '#065f46';
            ctx.fillRect(-r, -4, r * 2, 15);
            ctx.fillStyle = '#10b981';
            ctx.beginPath(); ctx.arc(0, -4, 16, Math.PI, 0); ctx.fill();
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(-5, -18); ctx.lineTo(5, -18); ctx.closePath(); ctx.fill();
            ctx.fillRect(-r * 1.3, -10, r * 0.9, 4);
            break;
        }
        case 'isl_n10': {
            ctx.fillStyle = '#047857';
            ctx.beginPath();
            ctx.moveTo(-r * 1.3, -2); ctx.quadraticCurveTo(-r * 0.8, 8, r * 1.2, 6); ctx.lineTo(r * 1.1, -8); ctx.lineTo(-r * 0.9, -8);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(-8, -20, 18, 12);
            break;
        }
        case 'isl_n20': {
            ctx.fillStyle = '#d97706';
            ctx.beginPath();
            ctx.moveTo(-r * 1.2, 0);
            ctx.quadraticCurveTo(-4, -r * 0.9, r * 0.9, -r * 0.7);
            ctx.lineTo(r * 0.5, 0);
            ctx.lineTo(r * 0.9, r * 0.7);
            ctx.quadraticCurveTo(-4, r * 0.9, -r * 1.2, 0);
            ctx.fill();
            break;
        }
        case 'isl_final': {
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(4, 0, r * 0.85, Math.PI * 0.3, Math.PI * 1.7);
            ctx.stroke();
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath(); ctx.arc(-4, 0, 14, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fef08a';
            ctx.beginPath(); ctx.arc(-4, 0, 7, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'rus_mid': {
            ctx.fillStyle = '#334155';
            ctx.fillRect(-r * 1.15, -4, r * 2.3, 16);
            ctx.fillStyle = '#64748b';
            ctx.fillRect(-16, -18, 36, 14);
            ctx.fillStyle = '#cbd5e1';
            ctx.fillRect(-r * 1.4, -16, r * 1.1, 7);
            break;
        }
        case 'rus_n10': {
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(-r * 1.2, -6, r * 2.4, 12);
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(-6, -16, 20, 10);
            ctx.fillRect(-2, -24, 12, 8);
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(-24, -6); ctx.lineTo(-30, -15);
            ctx.moveTo(-18, -6); ctx.lineTo(-24, -15);
            ctx.stroke();
            break;
        }
        case 'rus_n20': {
            ctx.fillStyle = '#e2e8f0';
            ctx.beginPath();
            ctx.moveTo(-r * 1.35, 0); ctx.lineTo(r * 1.0, -4); ctx.lineTo(r * 1.1, 4);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#94a3b8';
            ctx.beginPath();
            ctx.moveTo(-4, -2); ctx.lineTo(16, -r * 0.85); ctx.lineTo(22, -2);
            ctx.moveTo(-4, 2); ctx.lineTo(16, r * 0.85); ctx.lineTo(22, 2);
            ctx.fill();
            break;
        }
        case 'rus_final': {
            ctx.strokeStyle = '#7dd3fc';
            ctx.lineWidth = 3;
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
                const a = (Math.PI / 3) * k;
                const px = Math.cos(a) * r * 0.92;
                const py = Math.sin(a) * r * 0.92;
                if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath(); ctx.stroke();
            ctx.fillStyle = '#0284c7';
            ctx.fillRect(-18, -14, 36, 28);
            ctx.fillStyle = '#e0f2fe';
            ctx.fillRect(-r * 1.15, -5, r * 0.9, 10);
            break;
        }
        case 'eu_mid': {
            ctx.fillStyle = '#312e81';
            ctx.beginPath();
            ctx.moveTo(-r * 1.1, 4); ctx.lineTo(-r * 0.8, -8); ctx.lineTo(r * 0.9, -8); ctx.lineTo(r * 1.0, 8);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#6366f1';
            ctx.fillRect(-12, -17, 26, 9);
            ctx.fillStyle = '#a5b4fc';
            ctx.fillRect(-r * 1.3, -14, r * 0.95, 3.5);
            break;
        }
        case 'eu_n10': {
            ctx.fillStyle = '#3730a3';
            ctx.fillRect(-r * 1.25, -7, r * 2.5, 13);
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(-8, -22, 22, 15);
            ctx.fillStyle = '#818cf8';
            ctx.fillRect(-26, -13, 14, 6);
            break;
        }
        case 'eu_n20': {
            ctx.fillStyle = '#c084fc';
            ctx.fillRect(-r * 1.35, -3, r * 2.5, 6);
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(-4, -r * 0.85, 8, r * 1.7);
            break;
        }
        case 'eu_final': {
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#fef08a';
            for (let k = 0; k < 12; k++) {
                const a = (Math.PI * 2 / 12) * k;
                ctx.beginPath();
                ctx.arc(Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88, 2.3, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = '#4f46e5';
            ctx.fillRect(-r * 1.15, -5, r * 2.1, 10);
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(4, -18, 7, 36);
            break;
        }
        case 'ter_mid': {
            ctx.fillStyle = '#0e7490';
            ctx.fillRect(-r, -6, r * 2, 12);
            ctx.fillStyle = '#22d3ee';
            ctx.fillRect(-r * 0.9, 8, r * 1.8, 3);
            ctx.fillRect(-r * 1.3, -12, r * 1.0, 3);
            ctx.fillRect(-r * 1.3, -7, r * 1.0, 3);
            break;
        }
        case 'ter_n10': {
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(0, 0, r * 1.3, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#155e75';
            ctx.beginPath();
            ctx.moveTo(-r * 1.15, 0); ctx.lineTo(-r * 0.7, -10); ctx.lineTo(r * 1.0, -10); ctx.lineTo(r * 1.1, 6); ctx.lineTo(-r * 0.7, 6);
            ctx.closePath(); ctx.fill();
            break;
        }
        case 'ter_n20': {
            ctx.fillStyle = '#0891b2';
            ctx.beginPath(); ctx.moveTo(-r * 1.3, 0); ctx.lineTo(r * 0.9, -7); ctx.lineTo(r * 0.9, 7); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#67e8f9';
            ctx.beginPath();
            ctx.moveTo(0, -4); ctx.lineTo(14, -r * 0.9); ctx.lineTo(20, -4);
            ctx.moveTo(0, 4); ctx.lineTo(14, r * 0.9); ctx.lineTo(20, 4);
            ctx.fill();
            break;
        }
        case 'ter_final': {
            ctx.strokeStyle = '#34d399';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = 'rgba(52, 211, 153, 0.7)';
            for (let k = 0; k < 8; k++) {
                const a = (Math.PI * 2 / 8) * k;
                ctx.save();
                ctx.rotate(a);
                ctx.beginPath();
                ctx.moveTo(12, 0); ctx.lineTo(r * 1.12, -5); ctx.lineTo(r * 1.12, 5);
                ctx.closePath(); ctx.fill();
                ctx.restore();
            }
            ctx.fillStyle = '#ecfdf5';
            ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'corp_mid': {
            ctx.fillStyle = '#18181b';
            ctx.fillRect(-r, -6, r * 2, 16);
            ctx.fillStyle = '#eab308';
            ctx.fillRect(-14, -18, 28, 12);
            ctx.fillStyle = '#fef08a';
            ctx.fillRect(-r * 1.35, -15, r * 1.0, 3);
            ctx.fillRect(-r * 1.35, -10, r * 1.0, 3);
            break;
        }
        case 'corp_n10': {
            ctx.fillStyle = '#27272a';
            ctx.fillRect(-r * 1.25, -8, r * 2.5, 14);
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(-16, -22, 12, 14);
            ctx.fillRect(0, -26, 12, 18);
            ctx.fillRect(16, -20, 10, 12);
            break;
        }
        case 'corp_n20': {
            ctx.strokeStyle = '#fde047';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-r * 1.3, 0); ctx.lineTo(0, -r * 0.75); ctx.lineTo(r * 1.2, 0); ctx.lineTo(0, r * 0.75);
            ctx.closePath(); ctx.stroke();
            ctx.fillStyle = '#eab308';
            ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'corp_final': {
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(0, 0, r * 0.96, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#18181b';
            ctx.beginPath();
            ctx.moveTo(0, -r * 0.85); ctx.lineTo(r * 0.85, r * 0.65); ctx.lineTo(-r * 0.85, r * 0.65);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#eab308';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.fillStyle = '#fef08a';
            ctx.beginPath(); ctx.arc(0, 2, 10, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'gew_mid': {
            ctx.fillStyle = '#1f050a';
            ctx.fillRect(-r * 1.15, -5, r * 2.3, 15);
            ctx.fillStyle = '#e11d48';
            ctx.beginPath();
            ctx.moveTo(-r * 1.35, 10); ctx.lineTo(-r * 1.0, -8); ctx.lineTo(r * 0.8, -8); ctx.lineTo(r * 1.0, 10);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#fda4af';
            ctx.fillRect(-r * 1.4, -14, r * 1.1, 4);
            break;
        }
        case 'gew_n10': {
            ctx.fillStyle = '#090d16';
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 1.3, 9, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#e11d48';
            ctx.fillRect(-8, -16, 16, 9);
            break;
        }
        case 'gew_n20': {
            ctx.fillStyle = '#4c0519';
            ctx.beginPath();
            ctx.moveTo(-r * 1.25, 0); ctx.lineTo(0, -r * 0.85); ctx.lineTo(r * 1.25, 0); ctx.lineTo(0, r * 0.85);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#fb7185';
            ctx.lineWidth = 2;
            ctx.stroke();
            break;
        }
        case 'gew_final': {
            ctx.fillStyle = '#09090b';
            ctx.fillRect(-r * 1.1, -18, r * 2.2, 30);
            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(-r * 1.1, -18, r * 2.2, 30);
            ctx.fillStyle = '#ef4444';
            ctx.beginPath(); ctx.arc(-8, -4, 9, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fecdd3';
            ctx.fillRect(-r * 1.4, -10, r * 0.8, 5);
            break;
        }
        case 'ant_mid': {
            ctx.fillStyle = '#0c4a6e';
            ctx.fillRect(-r, -7, r * 2, 16);
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.moveTo(-r * 1.45, 2); ctx.lineTo(-r, -9); ctx.lineTo(-r, 11);
            ctx.closePath(); ctx.fill();
            break;
        }
        case 'ant_n10': {
            ctx.fillStyle = '#075985';
            ctx.beginPath();
            ctx.moveTo(-r * 1.35, 6); ctx.lineTo(-r * 1.0, -9); ctx.lineTo(r * 1.2, -9); ctx.lineTo(r * 1.25, 6);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#bae6fd';
            ctx.fillRect(-10, -21, 22, 12);
            break;
        }
        case 'ant_n20': {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(-r * 1.3, 0); ctx.lineTo(r * 0.8, -r * 0.8); ctx.lineTo(r * 0.5, 0); ctx.lineTo(r * 0.8, r * 0.8);
            ctx.closePath(); ctx.stroke();
            ctx.fillStyle = '#e0f2fe';
            ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'ant_final': {
            ctx.strokeStyle = '#c084fc';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0, 0, r * 0.96, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = '#38bdf8';
            ctx.beginPath(); ctx.arc(0, 0, r * 0.65, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#f0f9ff';
            ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'gwb_mid': {
            ctx.fillStyle = '#2a0512';
            ctx.fillRect(-r * 1.15, -6, r * 2.3, 16);
            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 2;
            ctx.strokeRect(-r * 1.15, -6, r * 2.3, 16);
            ctx.fillStyle = '#e879f9';
            ctx.fillRect(-r * 1.4, -14, r * 1.1, 5);
            break;
        }
        case 'gwb_n10': {
            ctx.fillStyle = '#180529';
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 1.35, 11, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#a855f7';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.fillStyle = '#f43f5e';
            ctx.fillRect(-10, -20, 20, 11);
            break;
        }
        case 'gwb_n20': {
            ctx.strokeStyle = '#e879f9';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(0, -r * 0.95); ctx.lineTo(r * 1.1, 0); ctx.lineTo(0, r * 0.95); ctx.lineTo(-r * 1.1, 0);
            ctx.closePath(); ctx.stroke();
            ctx.fillStyle = '#f43f5e';
            ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'gwb_final': {
            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#09090b';
            ctx.fillRect(-r * 1.05, -16, r * 2.1, 28);
            ctx.strokeStyle = '#e879f9';
            ctx.lineWidth = 2;
            ctx.strokeRect(-r * 1.05, -16, r * 2.1, 28);
            ctx.fillStyle = '#fef08a';
            ctx.beginPath(); ctx.arc(0, -2, 10, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'drk_mid': {
            ctx.fillStyle = '#2e1065';
            ctx.fillRect(-r * 1.1, -8, r * 2.2, 18);
            ctx.fillStyle = '#a855f7';
            ctx.beginPath();
            ctx.moveTo(-r * 1.4, -12); ctx.lineTo(-r * 0.6, -22); ctx.lineTo(0, -8);
            ctx.closePath(); ctx.fill();
            break;
        }
        case 'drk_n10': {
            ctx.fillStyle = '#1e1b4b';
            ctx.beginPath();
            ctx.moveTo(-r * 1.35, 4); ctx.lineTo(-r * 0.9, -12); ctx.lineTo(r * 1.2, -12); ctx.lineTo(r * 1.3, 6);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#c084fc';
            ctx.fillRect(-12, -24, 24, 12);
            break;
        }
        case 'drk_n20': {
            ctx.fillStyle = 'rgba(192, 132, 252, 0.78)';
            for (let k = 0; k < 10; k++) {
                const a = (Math.PI * 2 / 10) * k;
                ctx.save();
                ctx.rotate(a);
                ctx.beginPath();
                ctx.moveTo(8, 0); ctx.lineTo(r * 1.2, -5); ctx.lineTo(r * 1.2, 5);
                ctx.closePath(); ctx.fill();
                ctx.restore();
            }
            ctx.fillStyle = '#09090b';
            ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'drk_final':
        default: {
            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0, 0, r * 0.98, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = '#c084fc';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(0, -r * 0.9); ctx.lineTo(r * 0.85, r * 0.55); ctx.lineTo(-r * 0.85, r * 0.55);
            ctx.closePath(); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, r * 0.9); ctx.lineTo(r * 0.85, -r * 0.55); ctx.lineTo(-r * 0.85, -r * 0.55);
            ctx.closePath(); ctx.stroke();
            ctx.fillStyle = '#09090b';
            ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#f43f5e';
            ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
            break;
        }
    }

    ctx.restore();
}

// 大ボス必殺技の特別攻撃エフェクト描画
function drawBossUltimateEffects(ctx, w, h) {
    bossUltimateEffects.forEach(fx => {
        const progress = 1 - (fx.life / fx.maxLife);
        const alpha = Math.max(0, Math.min(1, fx.life / (fx.maxLife * 0.35)));
        ctx.save();

        // 画面全体のフラッシュ
        if (progress < 0.25) {
            ctx.fillStyle = fx.color;
            ctx.globalAlpha = (0.25 - progress) * 0.55;
            ctx.fillRect(0, 0, w, h);
        }

        ctx.globalAlpha = alpha;

        if (fx.style === 'beam') {
            // 軌道・収束極太レーザー＆衝撃波
            const beamWidth = (1 - progress * 0.6) * 26;
            ctx.strokeStyle = fx.color;
            ctx.lineWidth = beamWidth;
            ctx.shadowColor = fx.color;
            ctx.shadowBlur = 24;
            ctx.beginPath();
            ctx.moveTo(fx.sx, fx.sy);
            ctx.lineTo(fx.tx, fx.ty);
            ctx.stroke();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = beamWidth * 0.38;
            ctx.beginPath();
            ctx.moveTo(fx.sx, fx.sy);
            ctx.lineTo(fx.tx, fx.ty);
            ctx.stroke();

            // 副次レーザー
            (fx.subTargets || []).slice(0, 4).forEach(st => {
                ctx.strokeStyle = fx.secondaryColor;
                ctx.lineWidth = beamWidth * 0.25;
                ctx.beginPath();
                ctx.moveTo(fx.sx, fx.sy - 14);
                ctx.lineTo(st.x, st.y);
                ctx.stroke();
            });

            // 着弾点の拡大エネルギーリング
            const ringR = 16 + progress * 85;
            ctx.strokeStyle = fx.secondaryColor;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(fx.tx, fx.ty, ringR, 0, Math.PI * 2);
            ctx.stroke();
        } else if (fx.style === 'missiles') {
            // 絨毯ミサイル＆クラスター連弾の弾道と爆発
            (fx.subTargets || []).forEach((st, idx) => {
                const stagger = (idx * 0.08);
                const localP = Math.max(0, Math.min(1, (progress - stagger) / 0.65));
                if (localP <= 0) return;

                const curX = fx.sx + (st.x - fx.sx) * localP;
                const arcHeight = Math.sin(localP * Math.PI) * (55 + (idx % 3) * 18);
                const curY = fx.sy + (st.y - fx.sy) * localP - arcHeight;

                if (localP < 0.92) {
                    ctx.strokeStyle = fx.secondaryColor;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(fx.sx, fx.sy);
                    ctx.quadraticCurveTo((fx.sx + st.x) * 0.5, Math.min(fx.sy, st.y) - 65, curX, curY);
                    ctx.stroke();

                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(curX, curY, 4, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    const blastR = 14 + ((localP - 0.92) / 0.08) * 34;
                    ctx.fillStyle = fx.color;
                    ctx.beginPath();
                    ctx.arc(st.x, st.y, blastR, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#fef08a';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            });
        } else {
            // ノヴァ・コロナ・重力崩壊波動
            const maxR = w * 0.72;
            for (let k = 0; k < 3; k++) {
                const waveP = Math.max(0, Math.min(1, progress * 1.25 - k * 0.14));
                if (waveP <= 0) continue;
                const rad = 18 + waveP * maxR;
                ctx.strokeStyle = k % 2 === 0 ? fx.color : fx.secondaryColor;
                ctx.lineWidth = 5 - k;
                ctx.shadowColor = fx.color;
                ctx.shadowBlur = 18;
                ctx.beginPath();
                ctx.arc(fx.sx, fx.sy, rad, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        // 画面上部に必殺技名カットアウト表示
        ctx.fillStyle = 'rgba(9, 13, 22, 0.86)';
        ctx.fillRect(w * 0.25, 36, w * 0.50, 22);
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(w * 0.25, 36, w * 0.50, 22);
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 11px "Noto Serif JP", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`⚠️ 必殺技発動：${fx.name}`, w * 0.50, 51);

        ctx.restore();
    });
}

function drawWeatherEffects(ctx, w, h) {
    const weather = getCurrentWeather();
    ctx.save();

    if (weather.id === 'cloudy') {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.08)';
        weatherParticles.slice(0, 12).forEach(p => {
            const px = (p.x % (w + 180)) - 90;
            const py = 18 + (p.y % (h * 0.35));
            ctx.beginPath();
            ctx.ellipse(px, py, 55 + p.size * 12, 10 + p.size * 2, 0, 0, Math.PI * 2);
            ctx.fill();
        });
    } else if (weather.id === 'clear') {
        const sunGrad = ctx.createLinearGradient(w * 0.85, 0, w * 0.35, h * 0.78);
        sunGrad.addColorStop(0, 'rgba(253, 224, 71, 0.16)');
        sunGrad.addColorStop(1, 'rgba(253, 224, 71, 0)');
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.moveTo(w * 0.68, 0);
        ctx.lineTo(w, 0);
        ctx.lineTo(w * 0.75, h * 0.78);
        ctx.lineTo(w * 0.15, h * 0.78);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(254, 240, 138, 0.32)';
        weatherParticles.slice(0, 22).forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x % w, p.y % (h * 0.75), p.size * 0.7, 0, Math.PI * 2);
            ctx.fill();
        });
    } else if (weather.id === 'rain') {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(125, 211, 252, 0.45)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        weatherParticles.forEach(p => {
            const px = p.x % w;
            const py = p.y % h;
            ctx.moveTo(px, py);
            ctx.lineTo(px - 6, py + 15);
        });
        ctx.stroke();
    } else if (weather.id === 'snow') {
        ctx.fillStyle = 'rgba(224, 242, 254, 0.08)';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        weatherParticles.forEach(p => {
            const px = p.x % w;
            const py = p.y % h;
            ctx.beginPath();
            ctx.arc(px, py, p.size * 0.9, 0, Math.PI * 2);
            ctx.fill();
        });
    } else if (weather.id === 'storm') {
        ctx.fillStyle = 'rgba(9, 13, 22, 0.34)';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(192, 132, 252, 0.5)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        weatherParticles.forEach(p => {
            const px = p.x % w;
            const py = p.y % h;
            ctx.moveTo(px, py);
            ctx.lineTo(px - 14, py + 18);
        });
        ctx.stroke();

        if (lightningFlash > 0) {
            ctx.fillStyle = `rgba(243, 232, 255, ${lightningFlash * 0.45})`;
            ctx.fillRect(0, 0, w, h);

            if (lightningBolt && lightningBolt.length > 1) {
                ctx.strokeStyle = `rgba(254, 240, 138, ${Math.min(1, lightningFlash * 1.5)})`;
                ctx.lineWidth = 2.6;
                ctx.shadowColor = '#c084fc';
                ctx.shadowBlur = 12;
                ctx.beginPath();
                lightningBolt.forEach((pt, idx) => {
                    if (idx === 0) ctx.moveTo(pt.x, pt.y);
                    else ctx.lineTo(pt.x, pt.y);
                });
                ctx.stroke();
            }
        }
    }

    ctx.restore();
}

// 車体に載る兵装シルエット。上部・側面で共用し、側面は呼び出し側で縮小する。
function drawCarWeaponSprite(ctx, weaponId) {
    switch (weaponId) {
        case 'railgun_tiphareth':
            ctx.fillStyle = '#d97706';
            ctx.fillRect(-8, -5.5, 14, 5.5);
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(4, -5, 16, 1.6);
            ctx.fillRect(4, -2.5, 16, 1.6);
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(6, -3.7, 12, 1.2);
            break;
        case 'mg_vulcan':
            ctx.fillStyle = '#475569';
            ctx.fillRect(-5, -4, 9, 4);
            ctx.fillStyle = '#fde047';
            ctx.fillRect(4, -3.6, 10, 1.2);
            ctx.fillRect(4, -1.8, 10, 1.2);
            break;
        case 'aa_flak':
            ctx.fillStyle = '#0284c7';
            ctx.fillRect(-5, -4, 9, 4);
            ctx.save();
            ctx.rotate(-0.42);
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(1.5, -3.2, 12, 1.6);
            ctx.fillRect(1.5, -1.2, 12, 1.6);
            ctx.restore();
            break;
        case 'torpedo_launcher':
            ctx.fillStyle = '#0f766e';
            ctx.fillRect(-6, -5.5, 14, 5.5);
            ctx.fillStyle = '#2dd4bf';
            ctx.fillRect(6, -5, 5, 1.6);
            ctx.fillRect(6, -2.6, 5, 1.6);
            break;
        case 'howitzer_heavy':
            ctx.fillStyle = '#9a3412';
            ctx.fillRect(-7, -5.5, 13, 5.5);
            ctx.save();
            ctx.rotate(-0.22);
            ctx.fillStyle = '#f97316';
            ctx.fillRect(4, -4.4, 14, 3.2);
            ctx.fillStyle = '#fdba74';
            ctx.fillRect(16, -5.2, 2.5, 4.8);
            ctx.restore();
            break;
        case 'missile_malkuth':
            ctx.fillStyle = '#881337';
            ctx.fillRect(-6, -7, 12, 7);
            ctx.fillStyle = '#f43f5e';
            ctx.fillRect(5, -6.2, 3.5, 1.6);
            ctx.fillRect(5, -3.8, 3.5, 1.6);
            ctx.fillRect(5, -1.5, 3.5, 1.6);
            break;
        case 'laser_kether':
            ctx.fillStyle = '#701a75';
            ctx.fillRect(-7, -6.5, 13, 6.5);
            ctx.strokeStyle = '#e879f9';
            ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.arc(5.5, -3.2, 4, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
            ctx.fillStyle = '#f5d0fe';
            ctx.beginPath(); ctx.arc(7, -3.2, 2, 0, Math.PI * 2); ctx.fill();
            break;
    }
}

function drawScene() {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const faction = getCurrentFaction();
    const nowSec = performance.now() * 0.001;

    ctx.save();
    if (screenShake > 0) {
        ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    }

    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.78);
    skyGrad.addColorStop(0, faction.skyTop || '#090d16');
    skyGrad.addColorStop(1, faction.skyBottom || '#1e293b');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
    for (let x = -(bgScroll * 0.25) % 160; x < w + 160; x += 160) {
        ctx.beginPath();
        ctx.moveTo(x, h * 0.76);
        ctx.lineTo(x + 55, h * 0.50);
        ctx.lineTo(x + 115, h * 0.62);
        ctx.lineTo(x + 160, h * 0.76);
        ctx.closePath();
        ctx.fill();
    }

    const railY = h * 0.76;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, railY, w, h * 0.08);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, railY, w, 3);

    ctx.fillStyle = '#475569';
    for (let x = -(bgScroll * 1.4) % 18; x < w; x += 18) {
        ctx.fillRect(x, railY + 3, 10, 4);
    }

    const seaY = h * 0.84;
    const seaGrad = ctx.createLinearGradient(0, seaY, 0, h);
    if (faction.world === 'dark') {
        seaGrad.addColorStop(0, '#2e1065');
        seaGrad.addColorStop(1, '#090314');
    } else {
        seaGrad.addColorStop(0, '#0f2942');
        seaGrad.addColorStop(1, '#061526');
    }
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, seaY, w, h - seaY);
    ctx.strokeStyle = faction.world === 'dark' ? 'rgba(192, 132, 252, 0.3)' : 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1;
    for (let x = -(bgScroll * 0.9) % 48; x < w; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, seaY + 8);
        ctx.lineTo(x + 24, seaY + 8);
        ctx.stroke();
    }

    for (let i = state.cars.length - 1; i >= 0; i--) {
        const car = state.cars[i];
        const cx = getCarX(i);
        const isLead = i === 0;
        const carW = isLead ? 36 : 30;
        const carH = isLead ? 22 : 18;
        const carTop = railY - carH - 4;
        const stats = getCarEffectiveStats(car);

        if (i > 0) {
            ctx.fillStyle = '#475569';
            ctx.fillRect(cx + carW * 0.5, railY - 11, 8, 4);
        }

        if (stats && stats.isSynergy) {
            ctx.save();
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(cx - carW * 0.5 - 2, carTop - 2, carW + 4, carH + 4);
            ctx.restore();
        }

        ctx.fillStyle = isLead ? '#1e293b' : '#273142';
        ctx.fillRect(cx - carW * 0.5, carTop, carW, carH);
        ctx.strokeStyle = isLead ? '#f59e0b' : '#64748b';
        ctx.lineWidth = isLead ? 1.5 : 1;
        ctx.strokeRect(cx - carW * 0.5, carTop, carW, carH);

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(cx - carW * 0.5 + 2, railY - 9, carW - 4, 5);

        if (isLead) {
            ctx.fillStyle = '#b45309';
            ctx.beginPath();
            ctx.moveTo(cx + carW * 0.5, carTop + 4);
            ctx.lineTo(cx + carW * 0.5 + 14, railY - 4);
            ctx.lineTo(cx + carW * 0.5, railY - 4);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(cx + 4, carTop + 4, 10, 4);

            const beamGrad = ctx.createLinearGradient(cx + carW * 0.5 + 10, carTop + 8, cx + 130, railY);
            beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.25)');
            beamGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
            ctx.fillStyle = beamGrad;
            ctx.beginPath();
            ctx.moveTo(cx + carW * 0.5 + 10, carTop + 6);
            ctx.lineTo(cx + 135, railY - 22);
            ctx.lineTo(cx + 135, railY);
            ctx.closePath();
            ctx.fill();
        }

        [-9, 9].forEach(offset => {
            const wx = cx + offset;
            const wy = railY - 3.5;
            ctx.fillStyle = '#0f172a';
            ctx.beginPath(); ctx.arc(wx, wy, 3.8, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1;
            ctx.stroke();
        });
        const rodOffset = Math.cos(wheelAngle) * 2.5;
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx - 9 + rodOffset, railY - 3.5);
        ctx.lineTo(cx + 9 + rodOffset, railY - 3.5);
        ctx.stroke();

        // 上部スロット：車体上端の主砲塔。
        if (car.weaponId) {
            ctx.save();
            ctx.translate(cx, carTop);
            drawCarWeaponSprite(ctx, car.weaponId);
            ctx.restore();
        }
        // 側面スロット：車体中央の副砲。小さく描いて主砲と区別する。
        if (car.sideWeaponId && !isLead) {
            ctx.save();
            ctx.translate(cx, carTop + carH - 5);
            ctx.scale(0.62, 0.62);
            drawCarWeaponSprite(ctx, car.sideWeaponId);
            ctx.restore();
        }
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.16)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(w * 0.5, 14);
    ctx.lineTo(w * 0.5, railY);
    ctx.stroke();
    ctx.restore();

    if (isTacticSelected('shield')) {
        const frontTrainX = getCarX(0);
        const backTrainX = getCarX(CAR_COUNT - 1);
        const midX = (frontTrainX + backTrainX) * 0.5;
        const domeR = (frontTrainX - backTrainX) * 0.58;
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
        ctx.fillStyle = 'rgba(56, 189, 248, 0.10)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(midX, railY, domeR, Math.PI, 0);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    allyEscorts.forEach(esc => {
        if (esc.hp <= 0) return;
        const bossTmpl = ENEMY_TYPES[esc.id] || { id: esc.id, radius: 32, color: esc.color, attr: esc.attr, isBoss: true };
        const scaleFactor = 0.52;
        const bobY = esc.attr === 'AIR'
            ? Math.sin(nowSec * 5 + esc.x * 0.05) * 4.0
            : esc.attr === 'SEA'
                ? Math.sin(nowSec * 4 + esc.x * 0.05) * 2.2
                : Math.sin(nowSec * 14 + esc.x * 0.1) * 1.1;

        ctx.save();
        ctx.translate(esc.x, esc.y + bobY);

        if (esc.attr === 'LAND') {
            ctx.fillStyle = 'rgba(2, 6, 23, 0.65)';
            ctx.beginPath();
            ctx.ellipse(0, esc.radius * 0.55, esc.radius * 0.9, 4, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (esc.attr === 'SEA') {
            ctx.strokeStyle = 'rgba(45, 212, 191, 0.75)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(0, esc.radius * 0.35, esc.radius * 1.15, 4.5, 0, 0, Math.PI);
            ctx.stroke();
        } else if (esc.attr === 'AIR') {
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-esc.radius * 0.8, 0);
            ctx.lineTo(-esc.radius * 1.6, -3);
            ctx.moveTo(-esc.radius * 0.8, 2);
            ctx.lineTo(-esc.radius * 1.6, 5);
            ctx.stroke();
        }

        ctx.save();
        ctx.strokeStyle = esc.attr === 'AIR' ? 'rgba(56, 189, 248, 0.55)' : esc.attr === 'SEA' ? 'rgba(45, 212, 191, 0.55)' : 'rgba(34, 211, 238, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, esc.radius + 5, nowSec * 1.5, nowSec * 1.5 + Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.scale(-scaleFactor, scaleFactor);
        drawEnemySprite(ctx, bossTmpl, 0, 0, faction);
        ctx.restore();

        const barW = 38;
        const ratio = Math.max(0, esc.hp / esc.maxHp);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(esc.x - barW * 0.5, esc.y - esc.radius - 13, barW, 4.5);
        ctx.fillStyle = ratio > 0.35 ? '#22d3ee' : '#f43f5e';
        ctx.fillRect(esc.x - barW * 0.5, esc.y - esc.radius - 13, barW * ratio, 4.5);

        ctx.fillStyle = '#67e8f9';
        ctx.font = 'bold 8px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`HP ${Math.ceil(esc.hp)}`, esc.x, esc.y - esc.radius - 15);
    });

    enemies.forEach(e => {
        if (e.hp <= 0) return;

        // 大ボス専用オーラ＆必殺技チャージリング描画
        if (e.isGrandBoss) {
            ctx.save();
            ctx.translate(e.x, e.y);
            const auraR = e.radius + 14 + Math.sin(nowSec * 6) * 3;
            ctx.strokeStyle = e.color;
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 5]);
            ctx.beginPath();
            ctx.arc(0, 0, auraR, -nowSec * 1.8, -nowSec * 1.8 + Math.PI * 2);
            ctx.stroke();

            // 必殺技チャージ進捗リング
            if (e.ultMaxCd > 0) {
                const ultRatio = Math.max(0, Math.min(1, 1 - (e.ultCd / e.ultMaxCd)));
                ctx.setLineDash([]);
                ctx.strokeStyle = ultRatio > 0.8 ? '#fef08a' : 'rgba(239, 68, 68, 0.85)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(0, 0, e.radius + 8, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * ultRatio);
                ctx.stroke();
            }
            ctx.restore();
        }

        drawEnemySprite(ctx, e, e.x, e.y, faction);

        const barW = e.isGrandBoss ? 68 : e.isBoss ? 56 : 24;
        const barH = e.isGrandBoss ? 6 : e.isBoss ? 5 : 3;
        const ratio = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(e.x - barW * 0.5, e.y - e.radius - 9, barW, barH);
        ctx.fillStyle = e.isGrandBoss ? '#f43f5e' : e.isWeatherBoss ? '#c084fc' : e.isBoss ? '#ef4444' : '#f59e0b';
        ctx.fillRect(e.x - barW * 0.5, e.y - e.radius - 9, barW * ratio, barH);
    });

    projectiles.forEach(p => {
        ctx.save();
        if (p.isBeam) {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.weaponId === 'laser_kether' ? 4 : 3;
            ctx.globalAlpha = Math.max(0.1, p.life / 10);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.targetX, p.targetY);
            ctx.stroke();
        } else {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.type === 'CANNON' || p.type === 'TORPEDO' ? 3.8 : 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    });

    // 大ボス必殺技の特別攻撃エフェクト描画
    drawBossUltimateEffects(ctx, w, h);

    particles.forEach(pt => {
        ctx.save();
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, pt.life / 28);
        ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
        ctx.restore();
    });

    drawWeatherEffects(ctx, w, h);

    floatingTexts.forEach(ft => {
        ctx.save();
        ctx.fillStyle = ft.color;
        ctx.globalAlpha = Math.max(0, ft.life / 35);
        ctx.font = 'bold 11px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
    });

    ctx.restore();
}

// ==========================================
// UI更新・レンダリング関数群
// ==========================================

function syncPlaybackControlsUI() {
    const btnAuto = document.getElementById('btn-auto');
    const autoInd = document.getElementById('auto-indicator');
    if (btnAuto && autoInd) {
        if (state.autoMarch) {
            btnAuto.className = 'px-1.5 sm:px-2 py-1 text-[10px] sm:text-[11px] font-bold text-emerald-300 bg-emerald-950/80 transition flex items-center gap-1 border-r border-slate-800';
            autoInd.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse';
        } else {
            btnAuto.className = 'px-1.5 sm:px-2 py-1 text-[10px] sm:text-[11px] font-bold text-slate-400 hover:bg-slate-800 transition flex items-center gap-1 border-r border-slate-800';
            autoInd.className = 'w-1.5 h-1.5 rounded-full bg-slate-500';
        }
    }

    const btnLoop = document.getElementById('btn-loop');
    const loopInd = document.getElementById('loop-indicator');
    if (btnLoop && loopInd) {
        if (state.loopStage) {
            btnLoop.className = 'px-1.5 sm:px-2 py-1 text-[10px] sm:text-[11px] font-bold text-amber-300 bg-amber-950/80 transition flex items-center gap-1 border-r border-slate-800';
            loopInd.className = 'w-1.5 h-1.5 rounded-full bg-amber-400';
        } else {
            btnLoop.className = 'px-1.5 sm:px-2 py-1 text-[10px] sm:text-[11px] font-bold text-slate-400 hover:bg-slate-800 transition flex items-center gap-1 border-r border-slate-800';
            loopInd.className = 'w-1.5 h-1.5 rounded-full bg-slate-500';
        }
    }

    const btnSpeed = document.getElementById('btn-speed');
    if (btnSpeed) {
        btnSpeed.textContent = `${state.gameSpeed}x`;
        const maxSpeed = getAvailableSpeeds()[getAvailableSpeeds().length - 1];
        btnSpeed.title = `ゲーム速度切替 (1x〜${maxSpeed}x${state.prestigeCount < 20 ? ' / 転生20回で10x解禁' : state.prestigeCount < 50 ? ' / 転生50回で20x解禁' : ''})`;
    }
}

function toggleAutoMarch(forceVal = null) {
    state.autoMarch = forceVal !== null ? forceVal : !state.autoMarch;
    if (state.autoMarch && !state.inWave) {
        state.autoMarchTimer = 15;
    }
    syncPlaybackControlsUI();
    saveGame(true);
}

function toggleLoopStage() {
    state.loopStage = !state.loopStage;
    syncPlaybackControlsUI();
    showToast(state.loopStage ? `🔁 STAGE ${state.stage} の連続周回を ON にしました` : '▶ ステージ自動進行モードへ戻しました');
    saveGame(true);
}

function getAvailableSpeeds() {
    const speeds = [1, 2, 3, 5];
    if (state.prestigeCount >= 20) speeds.push(10);
    if (state.prestigeCount >= 50) speeds.push(20);
    return speeds;
}

function toggleSpeed() {
    const speeds = getAvailableSpeeds();
    const idx = speeds.indexOf(state.gameSpeed);
    state.gameSpeed = idx === -1 ? speeds[0] : speeds[(idx + 1) % speeds.length];
    syncPlaybackControlsUI();
    saveGame(true);
}

function updateHeaderUI() {
    const faction = getCurrentFaction();
    state.maxStage = faction.isEndless ? Math.max(10, state.maxReachedStages[faction.id] || 1) : faction.stageCount;

    const worldBadgeEl = document.getElementById('ui-world-badge');
    if (worldBadgeEl) {
        if (faction.world === 'dark') {
            worldBadgeEl.textContent = '[🌑 暗黒世界]';
            worldBadgeEl.className = 'text-purple-300 font-bold';
        } else {
            worldBadgeEl.textContent = '[🌍 現実世界]';
            worldBadgeEl.className = 'text-sky-300 font-bold';
        }
    }

    const fNameEl = document.getElementById('ui-faction-name');
    if (fNameEl) fNameEl.textContent = faction.name;

    const stEl = document.getElementById('ui-stage');
    if (stEl) stEl.textContent = state.stage;

    const maxStEl = document.getElementById('ui-max-stage-label');
    if (maxStEl) maxStEl.textContent = faction.isEndless ? '/∞' : `/${faction.stageCount}`;

    // 進軍距離と地名を更新する（距離は勢力スタートからの累計）
    const distEl = document.getElementById('ui-distance');
    if (distEl) distEl.textContent = `${Math.floor(getTotalMeters(faction, state.stage, marchMeters)).toLocaleString()} m`;
    const districtEl = document.getElementById('ui-district');
    if (districtEl) districtEl.textContent = getDistrictName(faction, state.stage, marchMeters);
    const dockStageEl = document.getElementById('mobile-dock-stage');
    const dockRouteEl = document.getElementById('mobile-dock-route');
    if (dockStageEl) {
        const stageSuffix = maxStEl ? maxStEl.textContent : `/${faction.stageCount}`;
        dockStageEl.textContent = `ST.${state.stage}${stageSuffix}`;
    }
    if (dockRouteEl) {
        const distanceText = distEl ? distEl.textContent : '';
        const districtText = districtEl ? districtEl.textContent : '';
        dockRouteEl.textContent = `${distanceText} · ${districtText}`;
    }
    syncMobileDockUI();

    const bossBadge = document.getElementById('ui-boss-badge');
    if (bossBadge) {
        if (state.stage % 5 === 0 || faction.isEndless) bossBadge.classList.remove('hidden');
        else bossBadge.classList.add('hidden');
    }

    document.querySelectorAll('.ui-gold-display').forEach(el => {
        el.textContent = state.gold.toLocaleString();
    });

    const hpPct = Math.max(0, Math.min(100, Math.round((state.hp / state.maxHp) * 100)));
    const hpEl = document.getElementById('ui-hp');
    const maxHpEl = document.getElementById('ui-max-hp');
    const hpPctEl = document.getElementById('ui-hp-percent');
    const hpBarEl = document.getElementById('ui-hp-bar');
    if (hpEl) hpEl.textContent = Math.ceil(state.hp).toLocaleString();
    if (maxHpEl) maxHpEl.textContent = state.maxHp.toLocaleString();
    if (hpPctEl) hpPctEl.textContent = `${hpPct}%`;
    if (hpBarEl) {
        hpBarEl.style.width = `${hpPct}%`;
        hpBarEl.className = `h-full transition-all duration-150 ${hpPct > 40 ? 'bg-emerald-500' : hpPct > 20 ? 'bg-amber-500' : 'bg-red-500'}`;
    }

    const waveText = document.getElementById('btn-wave-text');
    const startBtn = document.getElementById('btn-start-wave');
    if (waveText && startBtn) {
        const district = getDistrictName(faction, state.stage, 0).split('・')[0];
        if (state.inWave) {
            waveText.textContent = `${Math.floor(getTotalMeters(faction, state.stage, marchMeters)).toLocaleString()}m 進軍中...`;
            startBtn.classList.add('opacity-75');
        } else {
            waveText.textContent = `${district} 出撃`;
            startBtn.classList.remove('opacity-75');
        }
    }

    const prevBtn = document.getElementById('btn-prev-stage');
    const nextBtn = document.getElementById('btn-next-stage');
    const maxReached = state.maxReachedStages[faction.id] || 1;
    if (prevBtn) prevBtn.disabled = state.inWave || state.stage <= 1;
    if (nextBtn) nextBtn.disabled = state.inWave || state.stage >= maxReached;

    const escCountEl = document.getElementById('tab-escort-count');
    if (escCountEl) escCountEl.textContent = `${state.equippedEscorts.length}/${getMaxEscortSlots()}`;

    const ticketCountEl = document.getElementById('tab-gacha-ticket-count');
    if (ticketCountEl) {
        const tickets = state.gachaTickets || {};
        ticketCountEl.textContent = (toNonNegativeInt(tickets.normal) + toNonNegativeInt(tickets.rare)).toLocaleString();
    }
}

function changeStage(delta) {
    if (state.inWave) return;
    const faction = getCurrentFaction();
    const maxReached = state.maxReachedStages[faction.id] || 1;
    const nextSt = Math.max(1, Math.min(maxReached, state.stage + delta));
    if (nextSt !== state.stage) {
        state.stage = nextSt;
        state.factionStages[faction.id] = state.stage;
        rollStageWeather(state.stage, faction.id, true);
        showEnemyPreviewTemporarily();
        updateHeaderUI();
        saveGame(true);
    }
}

function switchTab(tabId) {
    if (tabId === 'faction') tabId = 'world';
    if (tabId === 'bossdex' || tabId === 'relicdex') {
        state.dexSubTab = tabId === 'relicdex' ? 'relic' : 'boss';
        tabId = 'dex';
    }
    state.activeTab = tabId;
    const tabs = ['train', 'staff', 'rd', 'skills', 'escort', 'gacha', 'weapons', 'world', 'prestige', 'dex'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        const content = document.getElementById(`tab-content-${t}`);
        if (!btn || !content) return;
        if (t === tabId) {
            btn.className = 'px-1.5 py-1.5 text-[11px] sm:text-xs font-bold rounded border-2 border-amber-400 bg-slate-800 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.25)] transition text-center truncate';
            content.classList.remove('hidden');
            content.classList.add('flex');
        } else {
            const baseTextColor = t === 'skills' ? 'text-amber-300' : t === 'escort' ? 'text-cyan-400' : t === 'gacha' ? 'text-purple-300' : t === 'weapons' ? 'text-emerald-300' : t === 'world' ? 'text-sky-300' : t === 'prestige' ? 'text-emerald-400' : t === 'dex' ? 'text-amber-300' : 'text-slate-300';
            btn.className = `px-1.5 py-1.5 text-[11px] sm:text-xs font-bold rounded border border-slate-700 bg-slate-900/80 ${baseTextColor} hover:text-white hover:border-slate-500 transition text-center truncate`;
            content.classList.add('hidden');
            content.classList.remove('flex');
        }
    });
    renderCurrentTab();
    syncMobileTabRail(tabId);
    if (window.matchMedia('(max-width: 639px)').matches) {
        closeMobileCommandPanels();
    }
}

function renderCurrentTab() {
    switch (state.activeTab) {
        case 'train': renderTrainSlots(); break;
        case 'staff': renderStaffTab(); break;
        case 'rd': renderRDTab(); break;
        case 'skills': renderSkillsTab(); break;
        case 'escort': renderEscortTab(); break;
        case 'gacha': renderGachaTab(); break;
        case 'weapons': renderWeaponsTab(); break;
        case 'world': renderWorldTab(); break;
        case 'prestige': renderPrestigeTab(); break;
        case 'dex': renderDexTab(); break;
    }
}

// --- タブ1: 車両編成 ---
function renderTrainSlots() {
    const container = document.getElementById('train-slots-container');
    if (!container) return;
    container.innerHTML = '';

    state.cars.forEach((car, idx) => {
        const s = car.sephirahId ? SEPHIROTH.find(item => item.id === car.sephirahId) : null;
        const upperStats = getCarEffectiveStats(car, CAR_SLOT_UPPER);
        const sideStats = getCarEffectiveStats(car, CAR_SLOT_SIDE);
        const isSynergy = !!(upperStats && upperStats.isSynergy) || !!(sideStats && sideStats.isSynergy);

        const slotRow = (slot, stats, label) => {
            const weaponId = getCarSlotWeaponId(car, slot);
            const w = weaponId ? WEAPONS[weaponId] : null;
            if (car.locked && slot === CAR_SLOT_SIDE) {
                return `<div class="train-slot-row is-disabled" role="button" tabindex="-1" aria-disabled="true">
                    <span class="train-slot-tag">${label}</span>
                    <span class="train-slot-main">側面スロットなし（機関車）</span>
                </div>`;
            }
            return `<div class="train-slot-row${w ? '' : ' is-empty'}" role="button" tabindex="0"
                    data-car="${idx}" data-slot="${slot}"
                    aria-label="${car.name} ${label}スロット ${w ? w.name : '未搭載。選択する'}">
                <span class="train-slot-tag">${label}</span>
                <span class="train-slot-main">${w ? `${w.name} <span class="train-slot-lv">Lv.${state.weaponLevels[w.id] || 1}</span>` : '未搭載'}</span>
                <span class="train-slot-power">${stats ? stats.damage.toLocaleString() : '—'}</span>
            </div>`;
        };

        const card = document.createElement('div');
        card.className = `train-car-card flex-shrink-0 w-44 sm:w-48 bg-slate-800 border-2 ${isSynergy ? 'synergy-active' : 'border-slate-700'} rounded-lg p-3 cursor-pointer flex flex-col justify-between gap-2`;
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-center border-b border-slate-700 pb-1">
                    <span class="text-xs font-bold text-amber-400">${idx === 0 ? '👑 第1両目' : `🚃 第${idx + 1}両目`}</span>
                    ${isSynergy ? '<span class="text-[10px] font-black bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded">SYN</span>' : ''}
                </div>
                <div class="mt-2 flex flex-col gap-1">
                    ${slotRow(CAR_SLOT_UPPER, upperStats, '上部')}
                    ${slotRow(CAR_SLOT_SIDE, sideStats, '側面')}
                </div>
            </div>
            <div class="bg-slate-900/80 p-1.5 rounded border border-slate-700/80 flex items-center gap-2">
                ${s ? getSephirahPortraitSVG(s.id, 'w-9 h-11') : '<div class="w-9 h-11 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 text-xs">＋</div>'}
                <div class="min-w-0 flex-1">
                    <div class="text-[10px] text-slate-400">配属セフィラ</div>
                    <div class="text-[11px] font-bold ${s ? 'text-purple-300' : 'text-slate-500'} truncate">
                        ${s ? `${s.name.split(' ')[0]} Lv.${state.sephirahLevels[s.id] || 1}` : (car.locked ? '艦長 固定' : '未配属')}
                    </div>
                    ${s ? `<div class="text-[9px] text-amber-300/90 truncate">⚡${s.autoSkillName}</div>` : ''}
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    container.querySelectorAll('.train-slot-row[data-car]').forEach(row => {
        const carIdx = Number(row.dataset.car);
        const slot = row.dataset.slot;
        const open = () => openConfigModal(carIdx, slot);
        row.addEventListener('click', open);
        row.addEventListener('keydown', ev => {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
        });
    });
}

function openConfigModal(carIdx, slot = CAR_SLOT_UPPER) {
    state.selectedCarIndex = carIdx;
    const car = state.cars[carIdx];
    const modal = document.getElementById('config-modal');
    if (!modal || !car) return;
    const activeSlot = slot === CAR_SLOT_SIDE ? CAR_SLOT_SIDE : CAR_SLOT_UPPER;

    document.getElementById('modal-car-title').textContent =
        `${car.name} 編成設定（${activeSlot === CAR_SLOT_SIDE ? '側面' : '上部'}スロット）`;

    // 上部・側面の両リストを描画する。どちらも同じ兵装プールから選べる。
    const renderWeaponList = (listEl, slot) => {
        if (!listEl) return;
        listEl.innerHTML = '';
        if (car.locked && slot === CAR_SLOT_UPPER) {
            listEl.innerHTML = `<div class="col-span-2 bg-slate-800 border border-amber-500/60 p-3 rounded text-xs text-amber-200">
                👑 1両目は決戦兵器「レールガン・ティファレト」および艦長「ティファレト」の固定編成です。
            </div>`;
            return;
        }
        if (car.locked && slot === CAR_SLOT_SIDE) {
            listEl.innerHTML = `<div class="col-span-2 bg-slate-800 border border-slate-600 p-3 rounded text-xs text-slate-400">
                機関車に側面スロットはありません。
            </div>`;
            return;
        }
        const mounted = getCarSlotWeaponId(car, slot);
        Object.values(WEAPONS).forEach(w => {
            if (w.id === 'railgun_tiphareth') return;
            const unlocked = state.unlockedWeapons.includes(w.id);
            const selected = mounted === w.id;
            const sideMult = slot === CAR_SLOT_SIDE
                ? ` / 空×${(w.multipliers.AIR * SIDE_SLOT_AIR_MULT).toFixed(1)}`
                : ` / 空×${w.multipliers.AIR}`;
            const btn = document.createElement('button');
            btn.disabled = !unlocked;
            btn.onclick = () => {
                setCarSlotWeaponId(car, slot, selected ? null : w.id);
                openConfigModal(carIdx, slot);
                renderTrainSlots();
                saveGame(true);
            };
            btn.className = `p-2.5 rounded border text-left transition ${selected ? 'bg-amber-900/50 border-amber-400' : unlocked ? 'bg-slate-800 hover:bg-slate-700 border-slate-700' : 'bg-slate-900 border-slate-800 opacity-45'}`;
            btn.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="text-xs font-bold text-white">${w.name}</span>
                    <span class="text-[10px] tech-font text-amber-300">${unlocked ? `Lv.${state.weaponLevels[w.id] || 1}` : '未開発'}</span>
                </div>
                <div class="text-[10px] text-slate-400 mt-0.5">[${w.typeName}] 陸×${w.multipliers.LAND} / 海×${w.multipliers.SEA}${sideMult}${slot === CAR_SLOT_SIDE ? ' / 射程−15%' : ''}</div>
            `;
            listEl.appendChild(btn);
        });
    };

    renderWeaponList(document.getElementById('modal-weapon-list'), CAR_SLOT_UPPER);
    renderWeaponList(document.getElementById('modal-side-weapon-list'), CAR_SLOT_SIDE);
    setConfigSection(activeSlot === CAR_SLOT_SIDE ? 'side' : 'upper');

    const sList = document.getElementById('modal-sephirah-list');
    sList.innerHTML = '';
    if (!car.locked) {
        SEPHIROTH.forEach(s => {
            if (s.id === 'tiphareth') return;
            const hired = state.hiredSephiroth.includes(s.id);
            const selected = car.sephirahId === s.id;
            const assignedCar = state.cars.find(c => c.sephirahId === s.id);
            const btn = document.createElement('button');
            btn.disabled = !hired;
            btn.onclick = () => {
                state.cars.forEach(c => { if (c.sephirahId === s.id) c.sephirahId = null; });
                car.sephirahId = selected ? null : s.id;
                openConfigModal(carIdx, activeSlot);
                renderTrainSlots();
                saveGame(true);
            };
            btn.className = `p-2 rounded border text-left flex items-center gap-2 transition ${selected ? 'bg-purple-900/50 border-purple-400' : hired ? 'bg-slate-800 hover:bg-slate-700 border-slate-700' : 'bg-slate-900 border-slate-800 opacity-45'}`;
            btn.innerHTML = `
                ${getSephirahPortraitSVG(s.id, 'w-10 h-12')}
                <div class="min-w-0 flex-1">
                    <div class="text-xs font-bold text-purple-200 truncate">${s.name}</div>
                    <div class="text-[10px] text-amber-300">得意: ${s.specialtyName} / ⚡${s.autoSkillName}</div>
                    <div class="text-[10px] text-slate-400">${!hired ? '未雇用' : assignedCar ? `現在: ${assignedCar.name}` : '待機中'}</div>
                </div>
            `;
            sList.appendChild(btn);
        });
    }

    const upperStats = getCarEffectiveStats(car, CAR_SLOT_UPPER);
    const sideStats = getCarEffectiveStats(car, CAR_SLOT_SIDE);
    const statusBox = document.getElementById('modal-synergy-status');
    const synergySlots = [];
    if (upperStats && upperStats.isSynergy) synergySlots.push('上部');
    if (sideStats && sideStats.isSynergy) synergySlots.push('側面');
    statusBox.innerHTML = synergySlots.length
        ? `<span class="text-amber-400 font-bold">✨ セフィロト・シナジー発動中（${synergySlots.join('・')}）！</span> 駅員の得意兵装と一致しているため攻撃力と装填速度が大幅に強化されています。`
        : `<span class="text-slate-400">搭載兵装と得意分野が一致するセフィラを配属すると【セフィロト・シナジー】が発動します。</span>`;

    setConfigSection(activeSlot);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function setConfigSection(section) {
    configSectionFocus = ['upper', 'side', 'sephirah'].includes(section) ? section : 'upper';
    document.querySelectorAll('#config-modal .config-mobile-section').forEach(panel => {
        panel.classList.toggle('is-active', panel.id === `config-section-${configSectionFocus}`);
    });
    const accent = configSectionFocus === 'sephirah'
        ? 'border-purple-500 bg-purple-900/50 text-purple-200'
        : configSectionFocus === 'side'
            ? 'border-sky-500 bg-sky-900/50 text-sky-200'
            : 'border-amber-500 bg-amber-900/50 text-amber-200';
    document.querySelectorAll('#config-modal .config-mobile-tab').forEach(tab => {
        const selected = tab.id === `config-tab-${configSectionFocus}`;
        tab.setAttribute('aria-pressed', String(selected));
        tab.className = `config-mobile-tab px-2 py-2 text-[11px] font-black rounded border ${selected ? accent : 'border-slate-700 bg-slate-800 text-slate-300'}`;
    });
}

function closeConfigModal() {
    const modal = document.getElementById('config-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function autoEquipAllWeapons() {
    const unlocked = state.unlockedWeapons.filter(id => id !== 'railgun_tiphareth');
    if (unlocked.length === 0) return;

    let synergyMatchedCount = 0;
    let filledSlots = 0;

    // 2両目以降の上部・側面を順に埋める。シナジーは上部を優先する。
    for (let i = 1; i < state.cars.length; i++) {
        const car = state.cars[i];
        const seph = car.sephirahId ? SEPHIROTH.find(s => s.id === car.sephirahId) : null;
        const matchingWeapons = seph
            ? unlocked
                .map(wid => WEAPONS[wid])
                .filter(w => w && w.type === seph.specialty)
                .sort((a, b) => getWeaponDamage(b.id) - getWeaponDamage(a.id))
            : [];

        [CAR_SLOT_UPPER, CAR_SLOT_SIDE].forEach((slot, slotIdx) => {
            if (getCarSlotWeaponId(car, slot)) return;
            let chosenWeaponId = null;
            // 上部はシナジー一致を優先。側面は対地・対艦向きの兵装を優先する。
            if (matchingWeapons.length > 0 && slotIdx === 0) {
                chosenWeaponId = matchingWeapons[0].id;
                synergyMatchedCount++;
            }
            if (!chosenWeaponId) {
                const pool = unlocked.map(wid => WEAPONS[wid]).filter(Boolean);
                const preferred = slot === CAR_SLOT_SIDE
                    ? pool.slice().sort((a, b) =>
                        (b.multipliers.LAND + b.multipliers.SEA) - (a.multipliers.LAND + a.multipliers.SEA))
                    : pool;
                chosenWeaponId = (preferred[(filledSlots) % preferred.length] || preferred[0]).id;
            }
            setCarSlotWeaponId(car, slot, chosenWeaponId);
            filledSlots++;
        });
    }

    SoundEngine.playUI('upgrade');
    renderTrainSlots();
    showToast(`⚡ 2〜4両目の上部・側面に兵装を自動搭載しました（シナジー一致: ${synergyMatchedCount}枠）`);
    saveGame(true);
}

function repairTrain() {
    if (state.hp >= state.maxHp) {
        showToast('装甲耐久はすでに満タンです！');
        return;
    }
    if (state.gold < 100) {
        showToast('資金が不足しています（100G必要）');
        return;
    }
    state.gold -= 100;
    state.hp = state.maxHp;
    SoundEngine.playUI('upgrade');
    updateHeaderUI();
    showToast('🔧 装甲列車の耐久力を全回復しました！');
    saveGame(true);
}

// --- タブ: 駅員管理 ---
function renderStaffTab() {
    const grid = document.getElementById('staff-list-grid');
    if (!grid) return;
    grid.innerHTML = '';

    SEPHIROTH.forEach(s => {
        const hired = state.hiredSephiroth.includes(s.id);
        const lv = state.sephirahLevels[s.id] || 1;
        const isMax = lv >= SEPHIRAH_MAX_LEVEL;
        const upgCost = isMax ? Infinity : getSephirahUpgradeCost(s.id);
        const assignedCar = state.cars.find(c => c.sephirahId === s.id);

        const card = document.createElement('div');
        card.className = `bg-slate-800 border ${hired ? 'border-purple-600/70' : 'border-slate-700'} rounded-lg p-3 flex flex-col justify-between gap-2.5`;
        card.innerHTML = `
            <div class="space-y-2">
                <div class="flex gap-3">
                    ${getSephirahPortraitSVG(s.id, 'w-14 h-16')}
                    <div class="min-w-0 flex-1">
                        <div class="flex justify-between items-center">
                            <span class="text-xs sm:text-sm font-bold text-purple-300 truncate">${s.name}</span>
                            <span class="text-xs tech-font text-amber-300 font-bold">${hired ? `Lv.${lv}/${SEPHIRAH_MAX_LEVEL}${isMax ? ' MAX' : ''}` : '未雇用'}</span>
                        </div>
                        <div class="text-[11px] text-amber-400 font-bold mt-0.5">得意兵装: ${s.specialtyName}</div>
                        <p class="text-[11px] text-slate-400 mt-0.5 line-clamp-2">${s.desc}</p>
                        <div class="text-[10px] text-slate-400 mt-0.5">${assignedCar ? `配置: ${assignedCar.name}` : hired ? '配置: 待機中' : ''}</div>
                    </div>
                </div>
                <div class="bg-slate-900/90 border border-amber-600/40 rounded p-2 text-[11px]">
                    <div class="text-amber-300 font-bold flex items-center justify-between">
                        <span>⚡ 固有自動スキル: ${s.autoSkillName}</span>
                        <span class="text-[9px] text-emerald-300 bg-emerald-950 px-1.5 py-0.2 rounded">AUTO</span>
                    </div>
                    <div class="text-slate-200 mt-0.5 leading-snug">${s.getAutoSkillDesc(lv)}</div>
                    ${hired && !isMax && s.getAutoSkillDelta ? (() => {
                        const d = s.getAutoSkillDelta(lv);
                        if (!d) return '';
                        return `<div class="mt-1.5 pt-1.5 border-t border-slate-700/80 flex items-baseline gap-1.5 text-[10px] tech-font">
                            <span class="text-slate-400">${d.label}</span>
                            ${deltaStatHTML(d.from, d.to, d.delta, '#c084fc')}
                        </div>`;
                    })() : ''}
                </div>
            </div>
            <div>
                ${!hired
                    ? `<button onclick="hireSephirah('${s.id}')" class="w-full bg-amber-600 hover:bg-amber-500 text-slate-950 font-black py-1.5 rounded text-xs tech-font transition">雇用する (${s.cost} G)</button>`
                    : isMax
                        ? `<button disabled class="w-full bg-slate-900 text-slate-500 font-bold py-1.5 rounded text-xs tech-font cursor-not-allowed">MAX Lv.${SEPHIRAH_MAX_LEVEL}</button>`
                        : Number.isFinite(upgCost)
                            ? `<button onclick="upgradeSephirah('${s.id}')" class="w-full bg-purple-700 hover:bg-purple-600 text-white font-bold py-1.5 rounded text-xs tech-font transition">Lv.${lv + 1} へ強化 (${upgCost.toLocaleString()} G)</button>`
                            : `<button disabled class="w-full bg-slate-900 text-slate-500 font-bold py-1.5 rounded text-xs tech-font cursor-not-allowed">強化不可</button>`
                }
            </div>
        `;
        grid.appendChild(card);
    });
}

function hireSephirah(id) {
    const s = SEPHIROTH.find(item => item.id === id);
    if (!s || state.hiredSephiroth.includes(id)) return;
    if (state.gold < s.cost) {
        showToast('資金が不足しています！');
        return;
    }
    state.gold -= s.cost;
    state.hiredSephiroth.push(id);
    const emptyCar = state.cars.find(c => !c.locked && !c.sephirahId);
    if (emptyCar) emptyCar.sephirahId = id;
    SoundEngine.playUI('upgrade');
    updateHeaderUI();
    renderStaffTab();
    showToast(`👤 ${s.name} を雇用しました！`);
    saveGame(true);
}

function upgradeSephirah(id) {
    if (!state.hiredSephiroth.includes(id)) return;
    const cost = getSephirahUpgradeCost(id);
    if (!Number.isFinite(cost)) {
        showToast('これ以上強化できません');
        return;
    }
    if (state.gold < cost) {
        showToast('資金が不足しています！');
        return;
    }
    state.gold -= cost;
    state.sephirahLevels[id] = (state.sephirahLevels[id] || 1) + 1;
    SoundEngine.playUI('upgrade');
    updateHeaderUI();
    renderStaffTab();
    saveGame(true);
}

function bulkHireSephiroth() {
    let count = 0;
    SEPHIROTH.forEach(s => {
        if (!state.hiredSephiroth.includes(s.id) && state.gold >= s.cost) {
            state.gold -= s.cost;
            state.hiredSephiroth.push(s.id);
            const emptyCar = state.cars.find(c => !c.locked && !c.sephirahId);
            if (emptyCar) emptyCar.sephirahId = s.id;
            count++;
        }
    });
    if (count > 0) {
        SoundEngine.playUI('upgrade');
        updateHeaderUI();
        renderStaffTab();
        showToast(`👤 ${count}名の駅員を一括雇用＆自動配備しました！`);
        saveGame(true);
    } else {
        showToast('雇用可能な未雇用駅員がいないか、資金が不足しています');
    }
}

function bulkUpgradeSephiroth() {
    let count = 0;
    let upgraded = true;
    while (upgraded && count < 500) {
        upgraded = false;
        let cheapestId = null;
        let cheapestCost = Infinity;
        state.hiredSephiroth.forEach(id => {
            const c = getSephirahUpgradeCost(id);
            if (c < cheapestCost) {
                cheapestCost = c;
                cheapestId = id;
            }
        });
        if (cheapestId && state.gold >= cheapestCost) {
            state.gold -= cheapestCost;
            state.sephirahLevels[cheapestId] = (state.sephirahLevels[cheapestId] || 1) + 1;
            count++;
            upgraded = true;
        }
    }
    if (count > 0) {
        SoundEngine.playUI('upgrade');
        updateHeaderUI();
        renderStaffTab();
        showToast(`⚡ 雇用済み駅員を合計 ${count} 回強化しました！`);
        saveGame(true);
    } else {
        showToast('強化に必要な資金が不足しています');
    }
}

// --- タブ: 研究開発 ---
function renderRDTab() {
    const lvEl = document.getElementById('rd-armor-lv');
    const deltaEl = document.getElementById('rd-armor-delta');
    const btnEl = document.getElementById('btn-upgrade-armor');
    const armorCost = getArmorUpgradeCost();
    const armorMax = state.armorLevel >= ARMOR_MAX_LEVEL;
    if (lvEl) lvEl.textContent = `Lv.${state.armorLevel}/${ARMOR_MAX_LEVEL}${armorMax ? ' MAX' : ''}`;
    if (deltaEl) {
        if (armorMax || !Number.isFinite(armorCost)) {
            deltaEl.textContent = `最大耐久: ${state.maxHp.toLocaleString()}（MAX）`;
        } else {
            const cur = state.maxHp;
            const next = calcMaxHpForArmor(state.armorLevel + 1);
            deltaEl.innerHTML = deltaStatHTML(cur.toLocaleString(), next.toLocaleString(), `+${(next - cur).toLocaleString()}`, '#34d399');
        }
    }
    if (btnEl) {
        btnEl.disabled = armorMax || !Number.isFinite(armorCost);
        btnEl.textContent = armorMax
            ? `MAX Lv.${ARMOR_MAX_LEVEL}`
            : Number.isFinite(armorCost)
                ? `強化する (${armorCost.toLocaleString()} G)`
                : '強化不可';
    }

    const grid = document.getElementById('rd-weapons-grid');
    if (!grid) return;
    grid.innerHTML = '';

    Object.values(WEAPONS).forEach(w => {
        const unlocked = state.unlockedWeapons.includes(w.id);
        const reqMet = !w.reqWeapon || state.unlockedWeapons.includes(w.reqWeapon);
        const lv = state.weaponLevels[w.id] || 1;
        const isMax = lv >= WEAPON_MAX_LEVEL;
        const dmg = getWeaponDamage(w.id);
        const upgCost = isMax ? Infinity : getWeaponUpgradeCost(w.id);
        // 次のレベルの威力（getWeaponDamageAtLevel と同式）
        const nextDmg = isMax ? dmg : getWeaponDamageAtLevel(w.id, lv + 1);
        const railInfo = isRailgunWeapon(w.id) ? getRailgunRarityInfo() : null;
        const railBlock = railInfo ? `
            <div class="mt-1.5 rounded border p-2" style="border-color:${railInfo.meta.color}66;background:${railInfo.meta.color}12">
                <div class="flex justify-between items-center gap-2">
                    <span class="text-[10px] font-black px-1.5 py-0.5 rounded" style="background:${railInfo.meta.color}22;color:${railInfo.meta.color};border:1px solid ${railInfo.meta.color}66">${railInfo.meta.label}</span>
                    <span class="text-[9px] tech-font text-slate-400">レールガン自動レアリティ</span>
                </div>
                <div class="text-[10px] tech-font text-slate-300 mt-1">
                    補正: <span class="text-emerald-300">+${Math.round(railInfo.bonus * 100)}%</span>
                    <span class="text-slate-500">|</span>
                    実効威力: <span class="text-amber-300">${getEffectiveWeaponDamage(w.id).toLocaleString()}</span>
                </div>
                <div class="text-[10px] text-slate-400 mt-0.5">
                    ${railInfo.next ? `次: ${getRarityMeta(railInfo.next.rarity).label}（${getRailgunRequirementText(railInfo.next)}）` : '最大レアリティ'}
                </div>
            </div>
        ` : '';

        const card = document.createElement('div');
        card.className = `bg-slate-800 border ${unlocked ? 'border-amber-600/60' : 'border-slate-700'} rounded-lg p-3 flex flex-col justify-between gap-2`;
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-center">
                    <span class="text-xs font-bold text-amber-300">${w.name}</span>
                    <span class="text-xs tech-font text-slate-300">${unlocked ? `Lv.${lv}/${WEAPON_MAX_LEVEL}${isMax ? ' MAX' : ''}` : `Tier ${w.tier}`}</span>
                </div>
                <div class="text-[10px] text-slate-400 mt-0.5">[${w.typeName}] 陸×${w.multipliers.LAND} / 海×${w.multipliers.SEA} / 空×${w.multipliers.AIR}</div>
                <p class="text-[11px] text-slate-300 mt-1">${w.desc}</p>
                <div class="text-xs tech-font text-amber-400 mt-1">
                    現在基礎威力: ${unlocked
                        ? (isMax ? dmg.toLocaleString() : deltaStatHTML(dmg.toLocaleString(), nextDmg.toLocaleString(), `+${(nextDmg - dmg).toLocaleString()}`, '#fbbf24'))
                        : dmg.toLocaleString()}
                </div>
                ${railBlock}
            </div>
            <div>
                ${unlocked
                    ? (isMax
                        ? `<button disabled class="w-full bg-slate-900 text-slate-500 font-black py-1.5 rounded text-xs tech-font cursor-not-allowed">MAX Lv.${WEAPON_MAX_LEVEL}</button>`
                        : Number.isFinite(upgCost)
                            ? `<button onclick="upgradeWeapon('${w.id}')" class="w-full bg-amber-600 hover:bg-amber-500 text-slate-950 font-black py-1.5 rounded text-xs tech-font transition">Lv.${lv + 1} へ強化 (${upgCost.toLocaleString()} G)</button>`
                            : `<button disabled class="w-full bg-slate-900 text-slate-500 font-black py-1.5 rounded text-xs tech-font cursor-not-allowed">強化不可</button>`)
                    : reqMet
                        ? `<button onclick="unlockWeapon('${w.id}')" class="w-full bg-sky-700 hover:bg-sky-600 text-white font-bold py-1.5 rounded text-xs tech-font transition">研究開発する (${w.unlockCost.toLocaleString()} G)</button>`
                        : `<div class="text-center text-[11px] text-slate-500 bg-slate-900 py-1.5 rounded">前提兵装「${WEAPONS[w.reqWeapon].name}」が必要</div>`
                }
            </div>
        `;
        grid.appendChild(card);
    });
}

function upgradeTrainArmor() {
    const cost = getArmorUpgradeCost();
    if (!Number.isFinite(cost)) {
        showToast('これ以上強化できません');
        return;
    }
    if (state.gold < cost) {
        showToast('資金が不足しています！');
        return;
    }
    const prevMax = state.maxHp;
    state.gold -= cost;
    state.armorLevel += 1;
    state.maxHp = calcMaxHp();
    state.hp += (state.maxHp - prevMax);
    SoundEngine.playUI('upgrade');
    updateHeaderUI();
    renderRDTab();
    showToast(`🛡️ 装甲レベルが Lv.${state.armorLevel} に上昇しました！`);
    saveGame(true);
}

function unlockWeapon(id) {
    const w = WEAPONS[id];
    if (!w || state.unlockedWeapons.includes(id)) return;
    if (state.gold < w.unlockCost) {
        showToast('資金が不足しています！');
        return;
    }
    state.gold -= w.unlockCost;
    state.unlockedWeapons.push(id);
    SoundEngine.playUI('upgrade');
    updateHeaderUI();
    renderRDTab();
    showToast(`🔬 新兵装「${w.name}」を開発しました！`);
    saveGame(true);
}

function upgradeWeapon(id) {
    if (!state.unlockedWeapons.includes(id)) return;
    const cost = getWeaponUpgradeCost(id);
    if (!Number.isFinite(cost)) {
        showToast('これ以上強化できません');
        return;
    }
    if (state.gold < cost) {
        showToast('資金が不足しています！');
        return;
    }
    state.gold -= cost;
    state.weaponLevels[id] = (state.weaponLevels[id] || 1) + 1;
    SoundEngine.playUI('upgrade');
    updateHeaderUI();
    renderRDTab();
    saveGame(true);
}

function bulkUnlockWeapons() {
    let count = 0;
    Object.values(WEAPONS).forEach(w => {
        const reqMet = !w.reqWeapon || state.unlockedWeapons.includes(w.reqWeapon);
        if (!state.unlockedWeapons.includes(w.id) && reqMet && state.gold >= w.unlockCost) {
            state.gold -= w.unlockCost;
            state.unlockedWeapons.push(w.id);
            count++;
        }
    });
    if (count > 0) {
        SoundEngine.playUI('upgrade');
        updateHeaderUI();
        renderRDTab();
        showToast(`🔬 ${count}種の新兵装を一括開発しました！`);
        saveGame(true);
    } else {
        showToast('開発可能な兵装がないか、資金が不足しています');
    }
}

function bulkUpgradeWeapons() {
    let count = 0;
    let upgraded = true;
    while (upgraded && count < 500) {
        upgraded = false;
        let cheapestId = null;
        let cheapestCost = Infinity;
        state.unlockedWeapons.forEach(id => {
            const c = getWeaponUpgradeCost(id);
            if (c < cheapestCost) {
                cheapestCost = c;
                cheapestId = id;
            }
        });
        if (cheapestId && state.gold >= cheapestCost) {
            state.gold -= cheapestCost;
            state.weaponLevels[cheapestId] = (state.weaponLevels[cheapestId] || 1) + 1;
            count++;
            upgraded = true;
        }
    }
    if (count > 0) {
        SoundEngine.playUI('upgrade');
        updateHeaderUI();
        renderRDTab();
        showToast(`⚡ 全開発済み兵装を合計 ${count} 回一括強化しました！`);
        saveGame(true);
    } else {
        showToast('強化に必要な資金が不足しています');
    }
}

// --- タブ: 戦術 ---
// 4種の戦術から1つを選択し、常時稼働させる。レベルは Lv1〜30。
let mobileSkillFocusId = null;
let configSectionFocus = 'weapon';

function renderSkillsTab() {
    const grid = document.getElementById('skills-list-grid');
    const mobileTabs = document.getElementById('mobile-skills-tabs');
    const mobileDetail = document.getElementById('mobile-skill-detail');
    if (!grid) return;
    grid.innerHTML = '';

    TACTICAL_SKILLS.forEach(sk => {
        const lv = getSkillLevel(sk.id);
        const upgCost = getSkillUpgradeCost(sk.id);
        const maxed = isSkillMaxed(sk.id);
        const selected = isTacticSelected(sk.id);

        const card = document.createElement('div');
        card.id = `skill-card-${sk.id}`;
        card.className = `bg-slate-800 border-2 ${selected ? 'border-amber-400 shadow-lg' : sk.borderClass + '/70'} rounded-lg p-3 flex flex-col justify-between gap-2.5`;
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-center">
                    <span class="text-sm font-bold text-white">${sk.icon} ${sk.name}</span>
                    <span id="skill-lv-badge-${sk.id}" class="text-xs tech-font text-amber-300 font-bold">Lv.${lv}/${TACTICAL_MAX_LEVEL}</span>
                </div>
                <p class="text-[11px] text-slate-300 mt-1">${sk.desc}</p>
                <div id="skill-summary-${sk.id}" class="bg-slate-900/90 border border-slate-700 rounded p-2 mt-2 text-[11px] text-amber-200 font-bold">
                    ${sk.getEffectSummary(lv)}
                </div>
                ${sk.getEffectParts && !maxed ? `
                <div class="bg-slate-900/60 border border-slate-700/70 rounded p-2 mt-1 space-y-0.5">
                    <div class="text-[10px] tech-font text-slate-400">Lv.${lv} → Lv.${lv + 1}</div>
                    ${sk.getEffectParts(lv).map(part => `
                        <div class="flex items-center justify-between gap-2 text-[10px] tech-font">
                            <span class="text-slate-400">${part.label}</span>
                            ${deltaStatHTML(part.now, part.next, '', sk.color)}
                        </div>
                    `).join('')}
                </div>` : ''}
                ${selected ? '<div class="text-[10px] text-emerald-300 font-bold mt-1">✅ 常時稼働中（この戦術が有効）</div>' : ''}
            </div>
            <div class="space-y-1.5">
                <button id="skill-select-btn-${sk.id}" onclick="selectTacticalSkill('${sk.id}')" ${selected ? 'disabled' : ''} class="w-full ${selected ? 'bg-emerald-700 text-slate-950' : 'bg-slate-700 hover:bg-slate-600 text-emerald-200'} font-black py-2 rounded text-xs tech-font border border-slate-600 transition ${selected ? '' : 'cursor-pointer'}">
                    ${selected ? '✅ 選択中（常時稼働）' : 'この戦術を選択'}
                </button>
                <button id="skill-upg-btn-${sk.id}" onclick="upgradeTacticalSkill('${sk.id}')" ${maxed ? 'disabled' : ''} class="w-full ${maxed ? 'bg-slate-900 text-slate-500 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-600 text-amber-300 cursor-pointer'} font-bold py-1.5 rounded text-xs tech-font transition">
                    ${maxed ? `⚡ MAX LEVEL（Lv.${TACTICAL_MAX_LEVEL}）` : `戦術強化 Lv.${lv + 1} (${upgCost.toLocaleString()} G)`}
                </button>
            </div>
        `;
        grid.appendChild(card);
    });

    if (!mobileTabs || !mobileDetail) return;
    mobileTabs.innerHTML = '';
    TACTICAL_SKILLS.forEach(sk => {
        const lv = getSkillLevel(sk.id);
        const active = isTacticSelected(sk.id);
        const maxed = isSkillMaxed(sk.id);
        const cost = getSkillUpgradeCost(sk.id);
        const card = document.createElement('article');
        card.id = `mobile-skill-card-${sk.id}`;
        card.className = `mobile-skill-card ${active ? 'is-active' : ''}`;
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-start gap-1"><h4 class="mobile-skill-card-title ${active ? 'text-amber-200' : 'text-white'}">${sk.icon} ${sk.name}</h4><span class="flex-shrink-0 text-[9px] tech-font text-amber-300 font-bold">Lv.${lv}/${TACTICAL_MAX_LEVEL}</span></div>
                <p class="mobile-skill-card-desc mt-1">${sk.desc}</p>
            </div>
            <div class="mobile-skill-card-effect">${sk.getEffectSummary(lv)}</div>
            <div class="mobile-skill-card-actions">
                <button class="rounded border ${active ? 'border-emerald-600 bg-emerald-900/70 text-emerald-200' : 'border-slate-600 bg-slate-700 text-slate-100'}" onclick="selectTacticalSkill('${sk.id}')" ${active ? 'disabled' : ''}>${active ? '● 稼働中' : 'この戦術を選択'}</button>
                <button class="rounded border border-amber-700 ${maxed ? 'bg-slate-900 text-slate-500' : 'bg-amber-900/70 text-amber-200'}" onclick="upgradeTacticalSkill('${sk.id}')" ${maxed ? 'disabled' : ''}>${maxed ? 'MAX Lv.30' : `強化 ${cost.toLocaleString()} G`}</button>
            </div>
        `;
        mobileTabs.appendChild(card);
    });
    mobileDetail.innerHTML = '';
}

function focusMobileTactic(skillId) {
    if (!TACTICAL_SKILLS.some(sk => sk.id === skillId)) return;
    mobileSkillFocusId = skillId;
    renderSkillsTab();
}

function selectTacticalSkill(skillId) {
    const sk = getTacticById(skillId);
    if (!sk) return;
    state.activeTactic = skillId;
    SoundEngine.playUI('click');
    updateHeaderUI();
    renderSkillsTab();
    showToast(`${sk.icon} 戦術「${sk.name}」を選択しました（常時稼働）`);
    saveGame(true);
}

function upgradeTacticalSkill(skillId) {
    const sk = getTacticById(skillId);
    if (!sk) return;
    if (isSkillMaxed(skillId)) {
        showToast('この戦術は最大レベルに到達しています');
        return;
    }
    if (!state.skillLevels || typeof state.skillLevels !== 'object') {
        state.skillLevels = { salvo: 1, overdrive: 1, goldrush: 1, shield: 1 };
    }
    const lv = getSkillLevel(skillId);
    const cost = getSkillUpgradeCost(skillId);
    if (!Number.isFinite(cost)) {
        showToast('これ以上強化できません');
        return;
    }
    if (state.gold < cost) {
        showToast(`資金が不足しています！（必要: ${cost.toLocaleString()} G）`);
        return;
    }
    state.gold -= cost;
    const nextLv = lv + 1;
    state.skillLevels[skillId] = nextLv;

    SoundEngine.playUI('upgrade');
    updateHeaderUI();
    renderSkillsTab();
    showToast(`${sk.icon} 戦術「${sk.name}」を Lv.${nextLv} に強化しました`);
    saveGame(true);
}

// --- タブ: 鹵獲超兵器 ---
function getEscortDpsAtLevel(bossId, level) {
    const stats = getEscortStatsAtLevel(bossId, level);
    if (!stats) return 0;
    return stats.damage * 60 / stats.cooldown;
}

// コスト計算用のDPS。実ステータスはLv100以降ソフトキャップするが、
// 価格は「普段通り」1.18/Lvの成長を維持して上がり続ける。
function getEscortCostDpsAtLevel(bossId, level) {
    const base = ENEMY_TYPES[bossId];
    if (!base) return 0;
    const lv = Math.max(1, Math.floor(level) || 1);
    const lvMult = Math.pow(1.18, lv - 1);
    const netzachMult = getNetzachEscortMult();
    const malkuthMult = 1 + getMalkuthEscortBonus();
    const dmg = Math.floor((base.damage * 0.48 + 36) * lvMult * getPrestigeAtkMult() * netzachMult * malkuthMult);
    const cooldown = base.attr === 'AIR' ? 38 : base.attr === 'SEA' ? 55 : 46;
    return dmg * 60 / cooldown;
}

function getEscortCostHpAtLevel(bossId, level) {
    const base = ENEMY_TYPES[bossId];
    if (!base) return 0;
    const lv = Math.max(1, Math.floor(level) || 1);
    const lvMult = Math.pow(1.18, lv - 1);
    const netzachMult = getNetzachEscortMult();
    const malkuthMult = 1 + getMalkuthEscortBonus();
    return Math.floor((base.hp * 0.75 + 850) * lvMult * getPrestigeHpMult() * netzachMult * malkuthMult);
}

function getEscortUpgradeCost(bossId, lv) {
    if (!ENEMY_TYPES[bossId]) return Infinity;
    const level = Math.max(1, Math.min(ESCORT_MAX_LEVEL, Math.floor(lv) || 1));
    if (level >= ESCORT_MAX_LEVEL) return Infinity;
    const dpsGain = getEscortCostDpsAtLevel(bossId, level + 1) - getEscortCostDpsAtLevel(bossId, level);
    const hpGain = getEscortCostHpAtLevel(bossId, level + 1) - getEscortCostHpAtLevel(bossId, level);
    const gain = dpsGain + hpGain * ESCORT_HP_COST_WEIGHT;
    const cost = gain * UPGRADE_BASE_COST_PER_DPS * getUpgradeLevelCostMult(level) * getPrestigeCostMult();
    if (!Number.isFinite(cost)) return Infinity;
    return Math.max(60, Math.ceil(cost));
}
function getEscortSellPrice(bossId) {
    const base = ENEMY_TYPES[bossId];
    const lv = state.escortLevels[bossId] || 1;
    return Math.max(80, Math.round((base ? base.reward : 100) * (1.2 + lv * 0.5)));
}

function renderEscortTab() {
    const grid = document.getElementById('escort-list-grid');
    const usageEl = document.getElementById('escort-slot-usage');
    if (usageEl) usageEl.textContent = `${state.equippedEscorts.length} / ${getMaxEscortSlots()}`;
    if (!grid) return;
    grid.innerHTML = '';

    const ownedIds = Array.from(new Set([...Object.keys(state.escortLevels), ...state.soldEscorts]));
    if (ownedIds.length === 0) {
        grid.innerHTML = `<div class="col-span-full bg-slate-800/70 border border-slate-700 rounded-lg p-6 text-center text-xs text-slate-400">
            まだ鹵獲した超兵器がありません。各ステージのボス（STAGE 5, 10, 15...）や天候ボスを撃破すると鹵獲機体として出撃編成できます！
        </div>`;
        return;
    }

    ownedIds.sort((a, b) => {
        const aSold = state.soldEscorts.includes(a) ? 2 : state.equippedEscorts.includes(a) ? 0 : 1;
        const bSold = state.soldEscorts.includes(b) ? 2 : state.equippedEscorts.includes(b) ? 0 : 1;
        return aSold - bSold;
    });

    ownedIds.forEach(bid => {
        const isSold = state.soldEscorts.includes(bid);
        const isEquipped = state.equippedEscorts.includes(bid);
        const stats = getEscortStats(bid);
        if (!stats) return;
        const isMax = stats.lv >= ESCORT_MAX_LEVEL;
        const upgCost = isMax ? Infinity : getEscortUpgradeCost(bid, stats.lv);
        const sellPrice = getEscortSellPrice(bid);
        const nextStats = isMax ? stats : getEscortStatsAtLevel(bid, stats.lv + 1);
        const moduleLv = clampInt((state.escortModuleLevels || {})[bid], 0, ESCORT_MODULE_MAX_LEVEL, 0);
        const modulePct = Math.round(moduleLv * ESCORT_MODULE_PER_LEVEL * 100);
        const moduleMaxed = moduleLv >= ESCORT_MODULE_MAX_LEVEL;
        const moduleCount = toNonNegativeInt(state.escortEnhanceModules);
        const dupCount = Math.min(9, Math.max(0, Math.floor(Number((state.escortDuplicateCounts || {})[bid]) || 0)));

        const card = document.createElement('div');
        if (isSold) {
            card.className = 'bg-slate-900/80 border border-slate-700/80 rounded-lg p-2 flex items-center justify-between gap-2 opacity-75';
            card.innerHTML = `
                <div class="min-w-0">
                    <div class="text-[10px] text-amber-400 font-bold">🔒 売却済み・即時自動売却ロック中</div>
                    <div class="text-xs text-slate-300 font-bold truncate">${stats.name}</div>
                </div>
                <button onclick="unlockSoldEscort('${bid}')" class="bg-slate-700 hover:bg-slate-600 text-amber-200 px-2.5 py-1 rounded text-[11px] font-bold flex-shrink-0 transition">
                    🔓 ロック解除
                </button>
            `;
        } else {
            card.className = `bg-slate-800 border-2 ${isEquipped ? 'border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.3)]' : 'border-emerald-700/70'} rounded-lg p-3 flex flex-col justify-between gap-2`;
            card.innerHTML = `
                <div>
                    <div class="flex justify-between items-center">
                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${isEquipped ? 'bg-cyan-900 text-cyan-200' : 'bg-emerald-950 text-emerald-300'}">
                            ${isEquipped ? `★ 出撃編成中（${stats.attr === 'AIR' ? '空域' : stats.attr === 'SEA' ? '海域' : '地上'}）` : '● 保有・待機中'}
                        </span>
                        <span class="text-xs tech-font text-amber-300 font-bold">Lv.${stats.lv}/${ESCORT_MAX_LEVEL}${isMax ? ' MAX' : ''}</span>
                    </div>
                    <div class="relative mt-1.5 h-20 w-full bg-slate-950 rounded border ${isEquipped ? 'border-cyan-500/70' : 'border-slate-700'} overflow-hidden flex items-center justify-center">
                        <div class="hq-scanlines absolute inset-0 pointer-events-none opacity-40"></div>
                        <canvas id="escort-canvas-${bid}" width="220" height="80" class="w-full h-full block"></canvas>
                        <span class="absolute top-1 left-1.5 text-[9px] tech-font px-1.5 py-0.2 rounded bg-slate-900/90 border border-cyan-500/50 text-cyan-300">
                            ${stats.attr === 'LAND' ? '[陸] 地上強襲機' : stats.attr === 'SEA' ? '[海] 海域強襲艦' : '[空] 航空制圧機'}
                        </span>
                    </div>
                    <div class="text-xs sm:text-sm font-bold text-white mt-1.5 truncate">${stats.name}</div>
                    <div class="text-[11px] tech-font text-slate-300 mt-0.5 space-y-0.5">
                        <div>耐久(HP): ${isMax ? stats.maxHp.toLocaleString() : deltaStatHTML(stats.maxHp.toLocaleString(), nextStats.maxHp.toLocaleString(), `+${(nextStats.maxHp - stats.maxHp).toLocaleString()}`, '#34d399')}</div>
                        <div>火力: ${isMax ? stats.damage.toLocaleString() : deltaStatHTML(stats.damage.toLocaleString(), nextStats.damage.toLocaleString(), `+${(nextStats.damage - stats.damage).toLocaleString()}`, '#fbbf24')}</div>
                    </div>
                    <div class="text-[10px] tech-font text-cyan-300 mt-0.5">
                        重複: ${dupCount}/10 体（${isMax ? 'Lv.MAX' : `あと${10 - dupCount}体で1凸`}）
                    </div>
                </div>
                <div class="rounded border border-purple-500/40 bg-purple-950/25 px-2 py-1.5 flex items-center justify-between gap-2">
                    <div class="min-w-0 text-[10px] tech-font">
                        <div class="text-purple-200 font-bold">🛠 強化モジュール Lv.${moduleLv}/${ESCORT_MODULE_MAX_LEVEL}</div>
                        <div class="text-purple-300/80">戦闘時 +${modulePct}% HP/攻撃</div>
                    </div>
                    <button onclick="enhanceEscortWithModule('${bid}')" class="flex-shrink-0 bg-purple-700 hover:bg-purple-600 text-white px-2.5 py-1 rounded text-[10px] font-bold transition disabled:opacity-30 disabled:pointer-events-none" ${moduleMaxed || moduleCount < 1 ? 'disabled' : ''}>
                        ${moduleMaxed ? 'MAX' : `強化 (所持 ${moduleCount})`}
                    </button>
                </div>
                <div class="grid grid-cols-3 gap-1.5 pt-1">
                    <button onclick="toggleEquipEscort('${bid}')" class="${isEquipped ? 'bg-slate-700 hover:bg-slate-600 text-slate-200' : 'bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black'} py-1.5 rounded text-[11px] transition">
                        ${isEquipped ? '編成解除' : '出撃編成'}
                    </button>
                    ${isMax ? `
                    <button disabled class="bg-slate-900 text-slate-500 font-bold py-1.5 rounded text-[11px] tech-font cursor-not-allowed">
                        MAX Lv.${ESCORT_MAX_LEVEL}
                    </button>` : `
                    <button onclick="upgradeEscort('${bid}')" class="bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold py-1.5 rounded text-[11px] tech-font transition">
                        強化 ${Number.isFinite(upgCost) ? upgCost.toLocaleString() : '不可'}G
                    </button>`}
                    <button onclick="sellEscort('${bid}')" class="bg-red-900/80 hover:bg-red-800 text-red-200 border border-red-600/70 py-1.5 rounded text-[11px] tech-font transition">
                        売却 +${sellPrice}G
                    </button>
                </div>
            `;
        }
        grid.appendChild(card);

        if (!isSold) {
            const cv = document.getElementById(`escort-canvas-${bid}`);
            const bossTmpl = ENEMY_TYPES[bid];
            if (cv && bossTmpl) {
                const eCtx = cv.getContext('2d');
                const fPrefix = bid.split('_')[0];
                const ownerFaction = fPrefix === 'gwb'
                    ? (FACTIONS.find(f => f.id === 'gew_beacon') || FACTIONS[0])
                    : fPrefix === 'drk'
                        ? (FACTIONS.find(f => f.id === 'dark_abyss') || FACTIONS[0])
                        : (FACTIONS.find(f => f.id === fPrefix) || FACTIONS[0]);
                eCtx.save();
                eCtx.translate(cv.width * 0.5, cv.height * 0.54);
                const sc = Math.min(0.95, 28 / (bossTmpl.radius || 32));
                eCtx.scale(-sc, sc);
                drawEnemySprite(eCtx, bossTmpl, 0, 0, ownerFaction);
                eCtx.restore();
            }
        }
    });
}

function toggleEquipEscort(bossId) {
    const idx = state.equippedEscorts.indexOf(bossId);
    if (idx >= 0) {
        state.equippedEscorts.splice(idx, 1);
    } else {
        if (state.equippedEscorts.length >= getMaxEscortSlots()) {
            showToast(`同時出撃枠（最大${getMaxEscortSlots()}体）がいっぱいです！`);
            return;
        }
        state.equippedEscorts.push(bossId);
    }
    SoundEngine.playUI('click');
    updateHeaderUI();
    renderEscortTab();
    saveGame(true);
}

function upgradeEscort(bossId) {
    const lv = state.escortLevels[bossId] || 1;
    if (lv >= ESCORT_MAX_LEVEL) {
        showToast(`鹵獲機は最大Lv.${ESCORT_MAX_LEVEL}です`);
        return;
    }
    const cost = getEscortUpgradeCost(bossId, lv);
    if (!Number.isFinite(cost)) {
        showToast('これ以上強化できません');
        return;
    }
    if (state.gold < cost) {
        showToast('資金が不足しています！');
        return;
    }
    state.gold -= cost;
    state.escortLevels[bossId] = lv + 1;
    SoundEngine.playUI('upgrade');
    updateHeaderUI();
    renderEscortTab();
    saveGame(true);
}

let pendingEscortSellId = null;

function sellEscort(bossId) {
    if (!state.escortLevels[bossId]) return;
    const stats = getEscortStats(bossId);
    if (!stats) return;
    const modal = document.getElementById('escort-sell-confirm-modal');
    const body = document.getElementById('escort-sell-confirm-body');
    const execBtn = document.getElementById('escort-sell-confirm-execute');
    if (!modal || !body || !execBtn) return;

    pendingEscortSellId = bossId;
    const price = getEscortSellPrice(bossId);
    const equipped = state.equippedEscorts.includes(bossId);
    body.innerHTML = `
        <p>この鹵獲兵器を売却しますか？</p>
        <div class="bg-slate-800 border border-slate-700 rounded p-3 space-y-1 text-xs">
            <div class="text-white font-bold">🤖 ${stats.name}</div>
            <div class="text-slate-300">機体Lv: ${stats.lv}</div>
            <div class="text-amber-300 font-bold">売却額: +${price.toLocaleString()} G</div>
            ${equipped ? '<div class="text-cyan-300">編成からも外れます</div>' : ''}
        </div>
        <div class="bg-red-950/60 border border-red-700 rounded p-3 text-xs text-red-200 leading-relaxed">
            売却すると格納庫から失われ、再び鹵獲するまで使用できません。<br>
            売却後はロック解除するまで、討伐時に自動売却されます。
        </div>
    `;
    execBtn.textContent = `売却する (+${price.toLocaleString()} G)`;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    SoundEngine.playUI('click');
}

function closeEscortSellConfirmModal() {
    pendingEscortSellId = null;
    const modal = document.getElementById('escort-sell-confirm-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function executeSellEscort() {
    const bossId = pendingEscortSellId;
    if (!bossId) return;
    closeEscortSellConfirmModal();

    const price = getEscortSellPrice(bossId);
    state.gold += price;
    state.equippedEscorts = state.equippedEscorts.filter(id => id !== bossId);
    delete state.escortLevels[bossId];
    if (state.escortDuplicateCounts) delete state.escortDuplicateCounts[bossId];
    if (!state.soldEscorts.includes(bossId)) {
        state.soldEscorts.push(bossId);
    }
    SoundEngine.playUI('upgrade');
    updateHeaderUI();
    renderEscortTab();
    showToast(`💰 鹵獲兵器を売却し +${price.toLocaleString()}G 獲得（ロック解除まで討伐時即売却）`);
    saveGame(true);
}

function unlockSoldEscort(bossId) {
    state.soldEscorts = state.soldEscorts.filter(id => id !== bossId);
    SoundEngine.playUI('click');
    renderEscortTab();
    showToast('🔓 即時自動売却ロックを解除しました！次回討伐時から再び鹵獲できます');
    saveGame(true);
}

// --- タブ: 世界（ビーコン作動イベント未発生時は「暗黒世界」タブそのものを生成しない） ---
function switchWorldSubTab(worldId) {
    if (worldId === 'dark' && !state.darkWorldUnlocked) return;
    state.currentWorldTab = worldId;
    renderWorldTab();
}

function renderWorldTab() {
    checkAndUnlockAntarcticBase(false);

    const subtabContainer = document.getElementById('world-subtab-container');
    const descEl = document.getElementById('world-subtab-desc');

    if (!state.darkWorldUnlocked) {
        state.currentWorldTab = 'real';
    }

    if (subtabContainer) {
        let buttonsHtml = `
            <button onclick="switchWorldSubTab('real')" class="${state.currentWorldTab === 'real'
                ? 'px-3.5 py-1.5 rounded text-xs font-black border-2 border-sky-400 bg-sky-950/90 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.25)] transition'
                : 'px-3.5 py-1.5 rounded text-xs font-black border border-slate-600 bg-slate-900 text-sky-300 hover:border-sky-400 transition'}">
                🌍 現実世界
            </button>
        `;
        if (state.darkWorldUnlocked) {
            buttonsHtml += `
                <button onclick="switchWorldSubTab('dark')" class="${state.currentWorldTab === 'dark'
                    ? 'px-3.5 py-1.5 rounded text-xs font-black border-2 border-purple-400 bg-purple-950/90 text-purple-200 shadow-[0_0_12px_rgba(192,132,252,0.3)] transition'
                    : 'px-3.5 py-1.5 rounded text-xs font-black border border-purple-500 bg-purple-950/80 text-purple-200 hover:border-purple-300 transition'}">
                    🌑 暗黒世界
                </button>
            `;
        }
        subtabContainer.innerHTML = buttonsHtml;
    }

    if (descEl) {
        if (state.currentWorldTab === 'dark') {
            descEl.textContent = 'ビーコン作動によって開かれた反転次元「暗黒世界」の戦線を選択できます。';
        } else {
            descEl.textContent = '現実世界の各勢力を突破し、永続チェックポイントとビーコンキー（レリック）を獲得せよ！';
        }
    }

    const grid = document.getElementById('faction-list-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const visibleFactions = FACTIONS.filter(f => {
        if ((f.world || 'real') !== state.currentWorldTab) return false;
        if (f.secretUntilUnlocked && !state.unlockedFactions.includes(f.id)) return false;
        return true;
    });

    visibleFactions.forEach(f => {
        const unlocked = state.unlockedFactions.includes(f.id);
        const cleared = state.clearedFactions.includes(f.id);
        const isCurrent = state.currentFactionId === f.id;
        const maxSt = state.maxReachedStages[f.id] || 1;
        const bKey = BEACON_KEYS.find(k => k.factionId === f.id);

        const card = document.createElement('div');
        card.className = `mobile-faction-card bg-slate-800 border-2 ${isCurrent ? 'border-amber-400' : unlocked ? 'border-slate-700' : 'border-slate-800 opacity-50'} rounded-lg p-3.5 flex flex-col justify-between gap-2.5`;
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-center">
                    <span class="mobile-faction-title text-sm font-black text-white">${f.name}</span>
                    <span class="mobile-faction-status text-[10px] font-bold px-2 py-0.5 rounded ${cleared ? 'bg-emerald-900 text-emerald-200' : isCurrent ? 'bg-amber-900 text-amber-200' : unlocked ? 'bg-cyan-950 text-cyan-200 border border-cyan-700/60' : 'bg-slate-900 text-slate-400'}">
                        ${cleared ? '🚩 制圧済みCP' : isCurrent ? '⚔️ 交戦中' : unlocked ? '🚩 CP解放済み' : '未解放'}
                    </span>
                </div>
                <div class="mobile-faction-subtitle text-[10px] tech-font text-slate-400 mt-0.5">${f.subtitle}</div>
                <p class="world-faction-description text-xs text-slate-300 mt-1.5">${f.desc}</p>
                <details class="mobile-world-lore"><summary>戦線の説明</summary><p>${f.desc}</p></details>
                ${bKey ? `<div class="text-[10px] mt-1 ${state.beaconKeys[bKey.id] ? 'text-cyan-300 font-bold' : 'text-slate-400'}">🔑 制圧報酬レリック: ${bKey.name} ${state.beaconKeys[bKey.id] ? '（入手済）' : ''}</div>` : ''}
                <div class="mobile-faction-progress flex justify-between items-center text-[11px] tech-font mt-1.5">
                    <span class="text-amber-300">到達: STAGE ${maxSt}${f.isEndless ? '' : `/${f.stageCount}`}</span>
                    <span class="text-red-300">敵: HP×${Math.round(getGlobalStageMult(f, 1)).toLocaleString()} / 報酬×${Math.round(getGlobalRewardMult(f, 1)).toLocaleString()}</span>
                </div>
            </div>
            <div>
                ${unlocked
                    ? `<button onclick="switchFaction('${f.id}')" class="mobile-faction-action w-full ${isCurrent ? 'bg-slate-700 text-amber-300' : 'bg-amber-600 hover:bg-amber-500 text-slate-950 font-black'} py-1.5 rounded text-xs transition">
                        ${isCurrent ? '現在この戦線に展開中' : 'この戦線へ転進する ▶'}
                    </button>`
                    : `<div class="text-center text-[11px] text-slate-500 bg-slate-900 py-1.5 rounded">前の戦線を制圧すると解放</div>`
                }
            </div>
        `;
        grid.appendChild(card);
    });
}

function switchFaction(factionId, isAutoAdvance = false) {
    if (!state.unlockedFactions.includes(factionId)) return;
    if (state.inWave) {
        state.inWave = false;
        enemies = [];
        projectiles = [];
        waveSpawnQueue = [];
        bossUltimateEffects = [];
    }

    state.factionStages[state.currentFactionId] = state.stage;
    state.currentFactionId = factionId;
    const f = getCurrentFaction();
    state.currentWorldTab = f.world || 'real';
    state.stage = state.factionStages[factionId] || 1;
    rollStageWeather(state.stage, factionId, false);

    triggerCutin({
        tag: f.world === 'dark'
            ? 'DARK WORLD SECTOR // 暗黒世界戦線突入'
            : factionId === 'corp' || factionId === 'gew'
                ? 'WORLD REGIME COLLAPSE // 新勢力出現'
                : factionId === 'ant'
                    ? 'SECRET FORTRESS LOCATED // 極秘拠点突入'
                    : 'FRONT SECTOR ENGAGED // 敵対勢力通信',
        title: f.name,
        sub: f.subtitle,
        speech: f.cutinQuote || `「アイン・ソフ・オウルを確認。これより迎撃体制に移行する！」`,
        themeColor: f.themeColor,
        isBoss: false,
        faction: f
    });

    showEnemyPreviewTemporarily();
    syncPlaybackControlsUI();
    updateHeaderUI();
    if (!isAutoAdvance) {
        switchTab('train');
    } else {
        renderCurrentTab();
    }
    saveGame(true);
}

// --- タブ: プレステージ（セフィロトの樹 デザイン＆10ノード配置） ---
// 欠片の供給は「今回の到達度」を平方根カーブで変換する。
//
// インクリメンタルゲームの定石:
//   MetaCurrency = k × (生涯進行度)^p    (p < 1、多くは 0.5)
// 線形だと進行度に比例して供給が膨らみ、周回を重ねるほど強化が簡単になり
// 難度が消えてしまう。平方根にすると、
//   - 浅い周回でも一定量はもらえる（取りこぼしがない）
//   - 深く潜るほど1点あたりの効率は下がる（インフレを抑える）
// という、長期運用に耐える曲線になる。
//
// 注意: clearedFactions は永続なので加算に含めない（連打で増殖するため）。
const PRESTIGE_SHARD_COEF = 1.6;      // k: 進行度1あたりの基礎効率
const PRESTIGE_SHARD_EXP = 0.5;       // p: 平方根

function calcPrestigeRawScore() {
    let score = 0;
    FACTIONS.forEach((f, idx) => {
        if (f.isTutorial) return;
        const reached = state.maxReachedStages[f.id] || 1;
        if (reached > 1) score += (reached - 1) * (1 + idx * 0.65);
    });
    return score;
}

// 転生回数による僅かな効率上昇（+1.5%/回、最大+45%）。
// 周回そのものへの報酬は残しつつ、主効果は平方根側で抑える。
function getPrestigeRerunMultiplier() {
    const count = Math.max(0, Math.min(30, Number(state.prestigeCount) || 0));
    return 1 + count * 0.015;
}

function calcPrestigeGainShards() {
    const score = calcPrestigeRawScore();
    if (score <= 0) return 0;
    const shards = PRESTIGE_SHARD_COEF * Math.pow(score, PRESTIGE_SHARD_EXP) * getPrestigeRerunMultiplier();
    return Math.floor(shards);
}

function selectSephirothTreeNode(nodeId) {
    state.selectedSephirothTreeNode = nodeId;
    renderPrestigeTab();
}
// 転生（プレステージ）の実行条件。転生2回ごとに要求戦線が1つ先へ進む。
// 例: 0〜1回目=アメリカ大ボス / 2〜3回目=中華 / 4〜5回目=イスラム …
const PRESTIGE_REQUIRE_FACTIONS = ['usa', 'chn', 'isl', 'rus', 'eu', 'ter', 'corp', 'gew', 'ant'];

function getPrestigeRequirement() {
    const step = Math.max(0, Math.floor((Number(state.prestigeCount) || 0) / 2));
    const factionId = PRESTIGE_REQUIRE_FACTIONS[Math.min(step, PRESTIGE_REQUIRE_FACTIONS.length - 1)];
    const faction = FACTIONS.find(f => f.id === factionId);
    const requiredStage = faction ? faction.stageCount : 30;
    return {
        factionId,
        factionName: faction ? faction.name : 'アメリカ合衆国',
        requiredStage,
        reached: state.maxReachedStages[factionId] || 1,
        // 累積の clearedFactions ではなく、今回の周回で制圧した記録だけを見る。
        cleared: (state.runClearedFactions || []).includes(factionId)
    };
}

function canPrestigeNow() {
    const req = getPrestigeRequirement();
    return req.cleared || req.reached >= req.requiredStage;
}


function renderPrestigeTab() {
    const countEl = document.getElementById('ui-prestige-count');
    const curEl = document.getElementById('prestige-current-shards');
    const gainEl = document.getElementById('prestige-gain-shards');
    const resumeEl = document.getElementById('prestige-resume-target');
    const btnEl = document.getElementById('btn-do-prestige');
    const gain = calcPrestigeGainShards();
    const req = getPrestigeRequirement();
    const canPrestige = canPrestigeNow();

    if (countEl) countEl.textContent = `転生回数: ${state.prestigeCount}回`;
    if (curEl) curEl.textContent = state.sephirothShards.toLocaleString();
    if (gainEl) gainEl.textContent = `+${gain.toLocaleString()}`;
    if (resumeEl) resumeEl.textContent = '国連防衛軍 STAGE 1';
    if (btnEl) btnEl.disabled = !canPrestige || gain <= 0;

    // 転生条件は回数ごとに要求戦線が進む。未達なら現在の進捗を添えて表示する。
    const reqEl = document.getElementById('prestige-requirement');
    if (reqEl) {
        const progress = req.cleared ? '制圧済み' : `到達 ST.${req.reached}/${req.requiredStage}`;
        reqEl.textContent = canPrestige
            ? `条件達成: ${req.factionName}（${progress}）`
            : `次の条件: ${req.factionName} 大ボス突破（${progress}）`;
        reqEl.className = canPrestige
            ? 'text-[10px] tech-font text-emerald-300'
            : 'text-[10px] tech-font text-amber-300';
    }

    const speedStatusEl = document.getElementById('prestige-speed-status');
    if (speedStatusEl) {
        const maxSpeed = getAvailableSpeeds()[getAvailableSpeeds().length - 1];
        const nextLock = state.prestigeCount < 20 ? '（転生20回で10x解禁）' : state.prestigeCount < 50 ? '（転生50回で20x解禁）' : '（最大解放済み）';
        speedStatusEl.textContent = `最大 ${maxSpeed}x ${nextLock}`;
    }

    // 転生回数に応じた敵戦力と報酬の補正を可視化する
    const scaleEl = document.getElementById('prestige-scale-status');
    if (scaleEl) {
        const pr = getPrestigeEnemyScaling();
        scaleEl.textContent = `敵: HP×${pr.hpMult.toFixed(2)} / 攻撃×${pr.dmgMult.toFixed(2)} ・ 報酬×${pr.rewardMult.toFixed(2)}`;
    }

    const treeStage = document.getElementById('sephiroth-tree-stage');
    const inspector = document.getElementById('sephiroth-node-inspector');
    if (!treeStage || !inspector) return;

    const nodeMap = {};
    SEPHIROTH_TREE_NODES.forEach(n => { nodeMap[n.id] = n; });

    let linesSvg = `
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="absolute inset-0 w-full h-full pointer-events-none">
            <line x1="22" y1="20" x2="22" y2="72" stroke="rgba(148,163,184,0.12)" stroke-width="0.6" stroke-dasharray="1.5,1.5"/>
            <line x1="50" y1="8" x2="50" y2="94" stroke="rgba(251,191,36,0.15)" stroke-width="0.7" stroke-dasharray="1.5,1.5"/>
            <line x1="78" y1="20" x2="78" y2="72" stroke="rgba(148,163,184,0.12)" stroke-width="0.6" stroke-dasharray="1.5,1.5"/>
    `;
    SEPHIROTH_TREE_PATHS.forEach(([aId, bId]) => {
        const a = nodeMap[aId];
        const b = nodeMap[bId];
        if (!a || !b) return;
        const aLv = getTreeLv(aId);
        const bLv = getTreeLv(bId);
        const activePath = aLv > 0 && bLv > 0;
        const partialPath = aLv > 0 || bLv > 0;
        const strokeColor = activePath ? 'rgba(52, 211, 153, 0.72)' : partialPath ? 'rgba(251, 191, 36, 0.35)' : 'rgba(100, 116, 139, 0.28)';
        const strokeWidth = activePath ? '0.95' : '0.6';
        linesSvg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
    });
    linesSvg += `</svg>`;

    const selectedId = nodeMap[state.selectedSephirothTreeNode] ? state.selectedSephirothTreeNode : 'tiphareth';
    state.selectedSephirothTreeNode = selectedId;

    let nodesHtml = '';
    SEPHIROTH_TREE_NODES.forEach(n => {
        const lv = getTreeLv(n.id);
        const isSelected = n.id === selectedId;
        const isMax = n.maxLevel && lv >= n.maxLevel;
        const cost = getPrestigeNodeCost(n, lv);
        const canAfford = !isMax && state.sephirothShards >= cost;

        nodesHtml += `
            <button onclick="selectSephirothTreeNode('${n.id}')"
                style="left: ${n.x}%; top: ${n.y}%; transform: translate(-50%, -50%); border-color: ${isSelected ? '#ffffff' : lv > 0 ? n.borderHex : '#475569'}; box-shadow: ${isSelected ? `0 0 18px ${n.color}` : lv > 0 ? `0 0 10px ${n.borderHex}66` : 'none'};"
                class="sephira-node-btn absolute w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-900/95 border-2 flex flex-col items-center justify-center p-1 cursor-pointer">
                <span class="text-[9px] sm:text-[10px] font-black leading-tight truncate max-w-full" style="color: ${n.color};">
                    ${n.sephirahName.split('（')[0]}
                </span>
                <span class="text-[10px] tech-font font-bold ${lv > 0 ? 'text-emerald-300' : 'text-slate-400'} leading-none mt-0.5">
                    Lv.${lv}${n.maxLevel ? `/${n.maxLevel}` : ''}
                </span>
                ${canAfford ? `<span class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 border border-slate-950 animate-ping"></span>` : ''}
                ${canAfford ? `<span class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 border border-slate-950"></span>` : ''}
            </button>
        `;
    });

    treeStage.innerHTML = linesSvg + nodesHtml;

    const sel = nodeMap[selectedId];
    const selLv = getTreeLv(sel.id);
    const selMax = sel.maxLevel && selLv >= sel.maxLevel;
    const selCost = getPrestigeNodeCost(sel, selLv);

    inspector.innerHTML = `
        <div class="space-y-2.5">
            <div class="flex items-center gap-3 border-b border-slate-700 pb-2.5">
                ${getSephirahPortraitSVG(sel.id, 'w-14 h-16')}
                <div class="min-w-0 flex-1">
                    <div class="text-[10px] tech-font tracking-wider font-bold" style="color: ${sel.color};">SEPHIRAH NODE // ${sel.sephirahName}</div>
                    <h4 class="text-sm sm:text-base font-black text-white truncate mt-0.5">${sel.title}</h4>
                    <div class="text-xs tech-font text-emerald-300 font-bold mt-0.5">
                        現在レベル: Lv.${selLv}${sel.maxLevel ? ` / MAX ${sel.maxLevel}` : ''}
                    </div>
                </div>
            </div>
            <p class="text-xs text-slate-300 leading-relaxed">${sel.desc}</p>
            <div class="bg-slate-950/90 border border-emerald-600/50 rounded-lg p-2.5 space-y-1.5">
                <div class="text-[10px] tech-font text-slate-400">現在の永続加護効果${selMax ? '' : ' → 次Lv'}</div>
                ${sel.bonusParts.map(part => `
                    <div class="text-[11px] tech-font flex items-center justify-between gap-2">
                        <span class="text-slate-400">${part.label}</span>
                        ${selMax
                            ? `<span class="font-black" style="color:${sel.color};">${part.get(selLv)}</span>`
                            : deltaStatHTML(part.get(selLv), part.get(selLv + 1), '', sel.color)}
                    </div>
                `).join('')}
                ${selMax ? `<div class="text-[10px] tech-font text-slate-500 pt-1 border-t border-slate-800">MAX LEVEL 到達済み</div>` : ''}
            </div>
        </div>
        <div class="space-y-1.5">
            <button onclick="buyPrestigeUpgrade('${sel.id}')" ${selMax ? 'disabled' : ''} class="w-full ${selMax ? 'bg-slate-900 text-slate-500' : 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black'} py-2.5 rounded-lg text-xs sm:text-sm tech-font shadow-lg border border-emerald-300/60 transition cursor-pointer">
                ${selMax ? 'MAX LEVEL 到達済み' : `🌳 欠片 ${selCost} 個を捧げて強化する`}
            </button>
            <div class="text-center text-[10px] text-slate-400">
                所持欠片: <span class="text-emerald-300 font-bold tech-font">${state.sephirothShards.toLocaleString()}</span> 個（全10セフィラのノードを自由に選択可能）
            </div>
        </div>
    `;
}

function buyPrestigeUpgrade(id) {
    const u = SEPHIROTH_TREE_NODES.find(item => item.id === id);
    if (!u) return;
    const lv = getTreeLv(id);
    if (u.maxLevel && lv >= u.maxLevel) return;
    const cost = getPrestigeNodeCost(u, lv);
    if (state.sephirothShards < cost) {
        showToast('セフィロトの木の欠片が不足しています！');
        return;
    }
    state.sephirothShards -= cost;
    const prevMaxHp = state.maxHp;
    state.prestigeUpgrades[id] = lv + 1;
    const newMaxHp = calcMaxHp();
    if (newMaxHp !== prevMaxHp) {
        state.maxHp = newMaxHp;
        state.hp = Math.min(newMaxHp, state.hp + (newMaxHp - prevMaxHp));
    }
    SoundEngine.playUI('upgrade');
    updateHeaderUI();
    renderPrestigeTab();
    showToast(`🌳 ${u.sephirahName}「${u.title}」が Lv.${lv + 1} に昇華しました！`);
    saveGame(true);
}

function openPrestigeConfirmModal() {
    const gain = calcPrestigeGainShards();
    if (!canPrestigeNow()) {
        const req = getPrestigeRequirement();
        showToast(`転生には「${req.factionName}」の大ボス突破が必要です`);
        return;
    }
    if (gain <= 0) {
        showToast('新たに獲得できるセフィロトの木の欠片がありません。進行度を伸ばしてください。');
        return;
    }
    const modal = document.getElementById('prestige-confirm-modal');
    const body = document.getElementById('prestige-confirm-body');
    const execBtn = document.getElementById('prestige-confirm-execute');
    if (!modal || !body || !execBtn) return;

    body.innerHTML = `
        <p>現在の戦線進行をリセットし、新たな輪廻へと旅立ちます。</p>
        <div class="bg-emerald-950/70 border border-emerald-500 p-3 rounded text-center">
            <div class="text-xs text-emerald-200">今回獲得できる強化素材</div>
            <div class="text-xl font-black text-emerald-300 mt-0.5">🌳 セフィロトの木の欠片 +${gain.toLocaleString()} 個</div>
        </div>
        <div class="bg-slate-800 p-3 rounded border border-slate-700 text-xs space-y-1">
            <div class="text-red-300 font-bold">【リセットされる項目】</div>
            <div>・所持資金、ステージ・勢力進行（<strong class="text-cyan-300">国連防衛軍 STAGE 1</strong>へ）</div>
            <div>・兵装の開発状態・レベル、セフィラの雇用状態・レベル、車体装甲レベル</div>
            <div class="text-emerald-300 font-bold pt-1">【永続引き継ぎされる項目】</div>
            <div>・セフィロトの木の欠片、欠片による永続強化レベル（出撃枠含む）、ボス図鑑・鹵獲記録</div>
            <div>・解放済み戦線・ビーコンキー・収集品・暗黒世界</div>
            <div class="text-cyan-300">・国連警察は制圧済み扱い（STAGE 1〜10をスキップ）</div>
        </div>
        <div class="text-[11px] text-amber-300/90">※欠片は「まだ欠片化していない進行度」の分だけ付与されます。同じ進行度から重複して獲得することはできません。</div>
    `;
    execBtn.textContent = `🌳 転生を実行する (+${gain.toLocaleString()} 個)`;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closePrestigeConfirmModal() {
    const modal = document.getElementById('prestige-confirm-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function executePrestige() {
    const gain = calcPrestigeGainShards();
    closePrestigeConfirmModal();
    if (!canPrestigeNow() || gain <= 0) return;

    // 再開地点は常に国連防衛軍 STAGE 1（国連警察は制圧済み扱いでスキップ）
    const resumeFactionId = 'un';
    if (!state.unlockedFactions.includes('un')) state.unlockedFactions.push('un');
    if (!state.clearedFactions.includes('pol')) state.clearedFactions.push('pol');

    state.sephirothShards += gain;
    state.prestigeCount += 1;

    // 転生条件の判定用に「今回の周回の制圧記録」をリセットする。
    // 累積の clearedFactions は図鑑・解放状態のため保持する。
    state.runClearedFactions = ['pol'];

    state.currentFactionId = resumeFactionId;
    state.factionStages = { pol: 1, un: 1, usa: 1, chn: 1, isl: 1, rus: 1, eu: 1, ter: 1, corp: 1, gew: 1, ant: 1, endless: 1, gew_beacon: 1, dark_abyss: 1, dark_endless: 1 };
    state.maxReachedStages = { pol: 10, un: 1, usa: 1, chn: 1, isl: 1, rus: 1, eu: 1, ter: 1, corp: 1, gew: 1, ant: 1, endless: 1, gew_beacon: 1, dark_abyss: 1, dark_endless: 1 };
    state.stage = 1;
    rollStageWeather(1, resumeFactionId, false);

    const fIndex = Math.max(0, FACTIONS.findIndex(f => f.id === resumeFactionId));
    state.gold = 300 + state.prestigeCount * 150 + fIndex * 250;
    state.armorLevel = 1;
    state.maxHp = calcMaxHp();
    state.hp = state.maxHp;
    state.inWave = false;
    enemies = [];
    projectiles = [];
    waveSpawnQueue = [];
    bossUltimateEffects = [];

    state.unlockedWeapons = ['railgun_tiphareth', 'mg_vulcan', 'aa_flak'];
    state.weaponLevels = {
        railgun_tiphareth: 1, mg_vulcan: 1, aa_flak: 1,
        torpedo_launcher: 1, howitzer_heavy: 1, missile_malkuth: 1, laser_kether: 1
    };
    state.hiredSephiroth = ['tiphareth'];
    state.sephirahLevels = {
        tiphareth: 1, geburah: 1, netzach: 1, chokmah: 1, hod: 1,
        binah: 1, yesod: 1, chesed: 1, malkuth: 1, kether: 1
    };
    state.skillLevels = { salvo: 1, overdrive: 1, goldrush: 1, shield: 1 };
    initCars();

    const resumeFaction = getCurrentFaction();
    SoundEngine.playStageClear();
    showEnemyPreviewTemporarily();
    syncPlaybackControlsUI();
    updateHeaderUI();
    renderPrestigeTab();
    showToast(`🌳 プレステージ完了！欠片 +${gain} 個獲得 ＆ チェックポイント「${resumeFaction.name} STAGE 1」から再開！`);
    saveGame(true);
}

// --- 統合タブ: 図鑑 ---
function switchDexSubTab(subTab) {
    state.dexSubTab = subTab;
    renderDexTab();
}

function getVisibleBossIdsForDex() {
    return Object.keys(ENEMY_TYPES).filter(k => {
        if (!ENEMY_TYPES[k].isBoss) return false;
        if (k.startsWith('ant_') && !state.unlockedFactions.includes('ant')) return false;
        if ((k.startsWith('gwb_') || k.startsWith('drk_')) && !state.darkWorldUnlocked) return false;
        return true;
    });
}

function renderDexTab() {
    const visibleBossIds = getVisibleBossIdsForDex();
    const seenBossCount = visibleBossIds.filter(id => state.bossRecords[id] && state.bossRecords[id].seen).length;
    const ownedKeyCount = BEACON_KEYS.filter(k => !!state.beaconKeys[k.id]).length;
    const ownedColCount = COLLECTIBLES.filter(c => (state.relics[c.id] || 0) > 0).length;

    const bossCountEl = document.getElementById('dex-boss-count');
    const relicCountEl = document.getElementById('dex-relic-count');
    const colCountEl = document.getElementById('dex-collectible-count');
    if (bossCountEl) bossCountEl.textContent = `${seenBossCount}/${visibleBossIds.length}`;
    if (relicCountEl) relicCountEl.textContent = `${ownedKeyCount}/${BEACON_KEYS.length}`;
    if (colCountEl) colCountEl.textContent = `${ownedColCount}/${COLLECTIBLES.length}`;

    const btnBoss = document.getElementById('subtab-btn-boss');
    const btnRelic = document.getElementById('subtab-btn-relic');
    const btnCol = document.getElementById('subtab-btn-collectible');
    const viewBoss = document.getElementById('dex-subview-boss');
    const viewRelic = document.getElementById('dex-subview-relic');
    const viewCol = document.getElementById('dex-subview-collectible');
    const descEl = document.getElementById('dex-header-desc');

    [viewBoss, viewRelic, viewCol].forEach(v => {
        if (v) { v.classList.add('hidden'); v.classList.remove('flex'); }
    });
    if (btnBoss) btnBoss.className = 'px-3 py-1.5 rounded text-xs font-black border border-slate-600 bg-slate-900 text-red-300 hover:border-red-400 transition';
    if (btnRelic) btnRelic.className = 'px-3 py-1.5 rounded text-xs font-black border border-slate-600 bg-slate-900 text-cyan-300 hover:border-cyan-400 transition';
    if (btnCol) btnCol.className = 'px-3 py-1.5 rounded text-xs font-black border border-slate-600 bg-slate-900 text-amber-300 hover:border-amber-400 transition';

    if (state.dexSubTab === 'relic') {
        if (btnRelic) btnRelic.className = 'px-3 py-1.5 rounded text-xs font-black border-2 border-cyan-400 bg-cyan-950/80 text-cyan-200 transition';
        if (viewRelic) { viewRelic.classList.remove('hidden'); viewRelic.classList.add('flex'); }
        if (descEl) descEl.textContent = '各勢力の最終ステージ制圧で獲得できる「○○のビーコンキー」一覧です（バフ効果なし）。';
        renderBeaconKeyGrid();
    } else if (state.dexSubTab === 'collectible') {
        if (btnCol) btnCol.className = 'px-3 py-1.5 rounded text-xs font-black border-2 border-amber-400 bg-amber-950/80 text-amber-200 transition';
        if (viewCol) { viewCol.classList.remove('hidden'); viewCol.classList.add('flex'); }
        if (descEl) descEl.textContent = '大ボス3%ドロップ品および天候ボス撃破で得られる気象バフ収集品です。';
        renderCollectiblesGrid();
    } else {
        if (btnBoss) btnBoss.className = 'px-3 py-1.5 rounded text-xs font-black border-2 border-red-400 bg-red-950/80 text-red-200 transition';
        if (viewBoss) { viewBoss.classList.remove('hidden'); viewBoss.classList.add('flex'); }
        if (descEl) descEl.textContent = '戦場で遭遇・撃破した各勢力のボスおよび天候特殊ボスの機体データを閲覧できます。';
        renderBossDexGrid();
    }
}

function toggleSkipSeenBossCutscene() {
    state.skipSeenBossCutscene = !state.skipSeenBossCutscene;
    renderBossCutsceneToggles();
    showToast(state.skipSeenBossCutscene
        ? '🎬 遭遇済みボスの登場演出をカットします'
        : '🎬 ボスの登場演出を毎回表示します');
    saveGame(true);
}

function toggleMuteBossCutscene() {
    state.muteBossCutscene = !state.muteBossCutscene;
    renderBossCutsceneToggles();
    showToast(state.muteBossCutscene ? '🔇 ボス演出のSEをミュートしました' : '🔊 ボス演出のSEをONにしました');
    saveGame(true);
}

function renderBossCutsceneToggles() {
    const skipBtn = document.getElementById('dex-toggle-skip-seen');
    if (skipBtn) {
        const on = !!state.skipSeenBossCutscene;
        skipBtn.textContent = `遭遇済み演出: ${on ? 'カット' : 'OFF'}`;
        skipBtn.className = on
            ? 'px-2.5 py-1 rounded text-[11px] font-bold border-2 border-emerald-400 bg-emerald-950/80 text-emerald-200 transition'
            : 'px-2.5 py-1 rounded text-[11px] font-bold border border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-400 transition';
    }
    const muteBtn = document.getElementById('dex-toggle-mute-boss');
    if (muteBtn) {
        const muted = !!state.muteBossCutscene;
        muteBtn.textContent = `演出SE: ${muted ? 'ミュート' : 'ON'}`;
        muteBtn.className = muted
            ? 'px-2.5 py-1 rounded text-[11px] font-bold border-2 border-amber-400 bg-amber-950/80 text-amber-200 transition'
            : 'px-2.5 py-1 rounded text-[11px] font-bold border border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-400 transition';
    }
}

function renderBossDexGrid() {
    renderBossCutsceneToggles();
    const visibleBossIds = getVisibleBossIdsForDex();
    const filterBar = document.getElementById('bossdex-filter-bar');
    if (filterBar) {
        const filters = [
            { id: 'all', name: '全勢力・天候' },
            { id: 'wboss', name: '🌦️ 天候特殊ボス' },
            ...FACTIONS.filter(f => !f.isEndless && (!f.secretUntilUnlocked || state.unlockedFactions.includes(f.id))).map(f => ({
                id: f.id === 'gew_beacon' ? 'gwb' : f.id === 'dark_abyss' ? 'drk' : f.id,
                name: f.name
            }))
        ];
        filterBar.innerHTML = filters.map(fl => `
            <button onclick="setBossDexFilter('${fl.id}')" class="px-2.5 py-1 rounded text-[11px] font-bold transition ${state.bossDexFilter === fl.id ? 'bg-amber-600 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}">
                ${fl.name}
            </button>
        `).join('');
    }

    const grid = document.getElementById('bossdex-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const filtered = visibleBossIds.filter(id => state.bossDexFilter === 'all' || id.startsWith(state.bossDexFilter + '_'));
    filtered.forEach(bid => {
        const tmpl = ENEMY_TYPES[bid];
        const rec = state.bossRecords[bid] || { seen: false, defeated: 0 };
        const lore = BOSS_LORE[bid] || { rank: 'BOSS', lore: '詳細データ解析中' };
        const ult = GRAND_BOSS_ULTIMATES[bid];
        const fPrefix = bid.split('_')[0];
        const ownerFaction = fPrefix === 'wboss'
            ? { name: '気象異常領域', skyTop: '#0f172a', skyBottom: '#1e1b4b' }
            : fPrefix === 'gwb'
                ? (FACTIONS.find(f => f.id === 'gew_beacon') || FACTIONS[0])
                : fPrefix === 'drk'
                    ? (FACTIONS.find(f => f.id === 'dark_abyss') || FACTIONS[0])
                    : (FACTIONS.find(f => f.id === fPrefix) || FACTIONS[0]);

        const card = document.createElement('div');
        card.className = `bg-slate-800 border ${rec.seen ? (tmpl.isGrandBoss ? 'border-amber-400' : tmpl.isWeatherBoss ? 'border-purple-500/80' : 'border-red-600/70') : 'border-slate-700'} rounded-lg p-3 flex flex-col justify-between gap-2`;
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-center text-[10px] tech-font">
                    <span class="${tmpl.isGrandBoss ? 'text-red-300' : tmpl.isWeatherBoss ? 'text-purple-300' : 'text-amber-400'} font-bold">${ownerFaction.name} // ${lore.rank}</span>
                    <span class="text-slate-400">撃破: ${rec.defeated || 0}</span>
                </div>
                <div class="relative mt-1.5 h-24 w-full bg-slate-950 rounded border border-slate-700 overflow-hidden flex items-center justify-center">
                    <div class="hq-scanlines absolute inset-0 pointer-events-none opacity-45"></div>
                    <canvas id="dex-canvas-${bid}" width="220" height="96" class="w-full h-full block"></canvas>
                    ${!rec.seen ? '<span class="absolute text-[10px] tech-font text-slate-500 bg-slate-950/80 px-2 py-0.5 rounded">[ NO SIGNAL ]</span>' : ''}
                </div>
                <div class="text-xs font-bold text-white mt-1.5">${rec.seen ? tmpl.name.replace(/【.*?】/, '') : '？？？ 未遭遇超兵器'}</div>
                ${rec.seen && ult ? `<div class="text-[10px] text-amber-300 font-bold mt-0.5">⚡ 必殺技: ${ult.name}</div>` : ''}
                ${rec.seen && BOSS_TRAITS[bid] ? `<div class="text-[10px] text-cyan-300 font-bold mt-0.5">🔰 固有特性: ${BOSS_TRAITS[bid].name}</div>` : ''}
                ${rec.seen && BOSS_TRAITS[bid] ? `<div class="text-[10px] text-slate-400 mt-0.5">${BOSS_TRAITS[bid].desc}</div>` : ''}
                <p class="text-[11px] text-slate-400 mt-1 line-clamp-3">${rec.seen ? lore.lore : '該当戦線または対応天候へ出撃し、目標と交戦することで機体データが記録されます。'}</p>
            </div>
            <div class="text-[10px] tech-font text-slate-300 border-t border-slate-700/80 pt-1 flex justify-between">
                <span>属性: ${tmpl.attr}</span>
                <span>基準HP: ${rec.seen ? tmpl.hp.toLocaleString() : '???'}</span>
            </div>
        `;
        grid.appendChild(card);

        const cv = document.getElementById(`dex-canvas-${bid}`);
        if (cv) {
            const dCtx = cv.getContext('2d');
            dCtx.save();
            dCtx.translate(cv.width * 0.5, cv.height * 0.54);
            const sc = Math.min(1.05, 34 / (tmpl.radius || 32));
            dCtx.scale(sc, sc);
            if (!rec.seen) dCtx.filter = 'brightness(0.18)';
            drawEnemySprite(dCtx, tmpl, 0, 0, ownerFaction);
            dCtx.restore();
        }
    });
}

function setBossDexFilter(fId) {
    state.bossDexFilter = fId;
    renderBossDexGrid();
}

function renderBeaconKeyGrid() {
    const grid = document.getElementById('relicdex-grid');
    if (!grid) return;
    grid.innerHTML = '';

    BEACON_KEYS.forEach(k => {
        const owned = !!state.beaconKeys[k.id];
        const fObj = FACTIONS.find(f => f.id === k.factionId);
        const card = document.createElement('div');
        card.className = `bg-slate-800 border-2 ${owned ? 'border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.25)]' : 'border-slate-700 opacity-65'} rounded-lg p-3 flex flex-col justify-between gap-2`;
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-center">
                    <span class="text-xl">${k.icon}</span>
                    <span class="text-[10px] tech-font font-bold px-2 py-0.5 rounded ${owned ? 'bg-cyan-950 text-cyan-200 border border-cyan-500/50' : 'bg-slate-900 text-slate-500'}">
                        ${owned ? 'OBTAINED // 所持済' : '未入手'}
                    </span>
                </div>
                <div class="text-xs sm:text-sm font-bold text-white mt-1.5">${k.name}</div>
                <div class="text-[10px] text-amber-300 mt-0.5">入手条件: ${fObj ? fObj.name : ''} STAGE 30 制圧</div>
                <p class="text-[11px] text-slate-400 mt-1.5">${k.lore}</p>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderCollectiblesGrid() {
    const grid = document.getElementById('collectible-grid');
    if (!grid) return;
    grid.innerHTML = '';

    COLLECTIBLES.forEach(c => {
        const lv = state.relics[c.id] || 0;
        const isWeatherItem = c.sourceType === 'weather';
        const wObj = isWeatherItem ? WEATHERS[c.weatherKey] : null;
        const bossObj = ENEMY_TYPES[c.bossId];

        const card = document.createElement('div');
        card.className = `bg-slate-800 border-2 ${lv > 0 ? (isWeatherItem ? 'border-purple-400' : 'border-amber-400') : 'border-slate-700 opacity-65'} rounded-lg p-3 flex flex-col justify-between gap-2`;
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-center">
                    <span class="text-xl">${c.icon}</span>
                    <span class="text-xs tech-font font-bold ${lv > 0 ? (isWeatherItem ? 'text-purple-300' : 'text-amber-300') : 'text-slate-500'}">${lv > 0 ? `Lv.${lv}` : '未所持'}</span>
                </div>
                <div class="text-xs sm:text-sm font-bold text-white mt-1">${lv > 0 ? c.name : '？？？ 未解析収集品'}</div>
                <div class="text-[10px] ${isWeatherItem ? 'text-purple-300' : 'text-slate-400'} mt-0.5">
                    ${isWeatherItem
                        ? `入手: ${wObj ? wObj.icon + wObj.name : ''}時 天候ボス撃破`
                        : `入手: ${bossObj ? bossObj.name.replace(/【.*?】/, '') : ''} (3%ドロップ)`}
                </div>
                <div class="text-[11px] text-emerald-300 font-bold mt-1">${c.effectText(Math.max(1, lv))}</div>
                <p class="text-[11px] text-slate-400 mt-1">${c.lore}</p>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- モーダル制御（ステージ選択・セーブ管理） ---
function openStageSelectModal() {
    const modal = document.getElementById('stage-select-modal');
    const grid = document.getElementById('stage-select-grid');
    const title = document.getElementById('stage-select-title');
    if (!modal || !grid) return;

    const faction = getCurrentFaction();
    const maxReached = state.maxReachedStages[faction.id] || 1;
    const totalShow = faction.isEndless ? Math.max(15, maxReached + 2) : faction.stageCount;
    if (title) title.textContent = `${faction.name} // ステージ選択`;

    grid.innerHTML = '';
    for (let s = 1; s <= totalShow; s++) {
        const unlocked = s <= maxReached;
        const isCurrent = s === state.stage;
        const isBoss = s % 5 === 0;
        const btn = document.createElement('button');
        btn.disabled = !unlocked || state.inWave;
        btn.onclick = () => {
            state.stage = s;
            state.factionStages[faction.id] = s;
            rollStageWeather(s, faction.id, true);
            showEnemyPreviewTemporarily();
            updateHeaderUI();
            closeStageSelectModal();
            saveGame(true);
        };
        btn.className = `py-2 px-1 rounded text-xs tech-font font-bold border transition ${
            isCurrent ? 'bg-amber-600 text-slate-950 border-amber-300'
            : unlocked ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-600'
            : 'bg-slate-950 text-slate-600 border-slate-800'
        }`;
        btn.innerHTML = `ST.${s}${isBoss ? '<div class="text-[8px] text-red-400">BOSS</div>' : ''}`;
        grid.appendChild(btn);
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeStageSelectModal() {
    const modal = document.getElementById('stage-select-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function openSaveManageModal() {
    const modal = document.getElementById('save-manage-modal');
    if (!modal) return;
    hideResetConfirm();
    updateSaveModalInfo();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeSaveManageModal() {
    const modal = document.getElementById('save-manage-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function updateSaveModalInfo() {
    const el = document.getElementById('save-last-time');
    if (!el) return;
    try {
        const raw = localStorage.getItem(SAVE_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            el.textContent = parsed.savedAt || '保存済み';
        } else {
            el.textContent = '未保存';
        }
    } catch (e) {
        el.textContent = '保存済み';
    }
}

function showResetConfirm() {
    const box = document.getElementById('reset-confirm-box');
    if (box) box.classList.remove('hidden');
}

function hideResetConfirm() {
    const box = document.getElementById('reset-confirm-box');
    if (box) box.classList.add('hidden');
}

function executeResetSaveData() {
    try {
        localStorage.removeItem(SAVE_STORAGE_KEY);
    } catch (e) {}
    location.reload();
}

// ==========================================
// セーブ・ロード＆メインゲームループ
// ==========================================

function saveGame(silent = false) {
    try {
        const payload = {
            savedAt: new Date().toLocaleString('ja-JP'),
            soundEnabled: SoundEngine.enabled,
            state: {
                ...state,
                inWave: false
            }
        };
        localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(payload));
        if (!silent) {
            showToast('💾 現在の作戦進行状況をセーブしました！');
        }
    } catch (e) {}
}

function manualSaveGame() {
    SoundEngine.init();
    SoundEngine.playUI('click');
    saveGame(false);
}

function loadGame() {
    try {
        const raw = localStorage.getItem(SAVE_STORAGE_KEY);
        if (!raw) return false;
        let parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return false;

        // 旧フラット形式セーブ（{...state, seEnabled, savedAt}）を新形式へ移行
        if (!parsed.state) {
            const legacy = { ...parsed };
            delete legacy.savedAt;
            delete legacy.seEnabled;
            parsed = {
                savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
                soundEnabled: typeof parsed.seEnabled === 'boolean' ? parsed.seEnabled : true,
                state: legacy,
                migratedFromFlat: true
            };
        }

        if (typeof parsed.soundEnabled === 'boolean') {
            SoundEngine.enabled = parsed.soundEnabled;
        }
        Object.assign(state, parsed.state);
        state.inWave = false;
        if (!WEATHERS[state.weather]) state.weather = 'cloudy';

        if (!Array.isArray(state.unlockedFactions)) state.unlockedFactions = ['pol'];
        if (!Array.isArray(state.clearedFactions)) state.clearedFactions = [];
        if (!Array.isArray(state.runClearedFactions)) state.runClearedFactions = [];
        if (!state.stageClearCounts || typeof state.stageClearCounts !== 'object') state.stageClearCounts = {};
        if (!state.factionStages || typeof state.factionStages !== 'object') state.factionStages = {};
        if (!state.maxReachedStages || typeof state.maxReachedStages !== 'object') state.maxReachedStages = {};
        if (!state.weaponLevels || typeof state.weaponLevels !== 'object') state.weaponLevels = {};
        Object.keys(state.weaponLevels).forEach(id => {
            const v = Number(state.weaponLevels[id]);
            state.weaponLevels[id] = Number.isFinite(v) && v >= 1 ? Math.min(WEAPON_MAX_LEVEL, Math.floor(v)) : 1;
        });
        if (!state.sephirahLevels || typeof state.sephirahLevels !== 'object') state.sephirahLevels = {};
        Object.keys(state.sephirahLevels).forEach(id => {
            const v = Number(state.sephirahLevels[id]);
            state.sephirahLevels[id] = Number.isFinite(v) && v >= 1 ? Math.min(SEPHIRAH_MAX_LEVEL, Math.floor(v)) : 1;
        });
        if (!state.bossRecords || typeof state.bossRecords !== 'object') state.bossRecords = {};
        if (typeof state.muteBossCutscene !== 'boolean') state.muteBossCutscene = false;
        if (typeof state.skipSeenBossCutscene !== 'boolean') state.skipSeenBossCutscene = false;
        if (!state.escortLevels || typeof state.escortLevels !== 'object') state.escortLevels = {};
        Object.keys(state.escortLevels).forEach(id => {
            const v = Number(state.escortLevels[id]);
            state.escortLevels[id] = Number.isFinite(v) && v >= 1 ? Math.min(ESCORT_MAX_LEVEL, Math.floor(v)) : 1;
        });
        if (!state.escortDuplicateCounts || typeof state.escortDuplicateCounts !== 'object') state.escortDuplicateCounts = {};
        Object.keys(state.escortDuplicateCounts).forEach(id => {
            if (!ENEMY_TYPES[id]) {
                delete state.escortDuplicateCounts[id];
                return;
            }
            const v = Number(state.escortDuplicateCounts[id]);
            state.escortDuplicateCounts[id] = Number.isFinite(v) && v >= 0 ? Math.min(9, Math.floor(v)) : 0;
        });
        if (!state.relics || typeof state.relics !== 'object') state.relics = {};
        if (!Array.isArray(state.unlockedWeapons)) state.unlockedWeapons = ['railgun_tiphareth', 'mg_vulcan', 'aa_flak'];
        if (!Array.isArray(state.hiredSephiroth)) state.hiredSephiroth = ['tiphareth'];
        if (typeof state.gold !== 'number' || !isFinite(state.gold)) state.gold = 300;
        if (typeof state.stage !== 'number' || state.stage < 1) state.stage = 1;
        if (typeof state.armorLevel !== 'number' || state.armorLevel < 1) state.armorLevel = 1;
        state.armorLevel = Math.min(ARMOR_MAX_LEVEL, Math.floor(state.armorLevel));
        if (typeof state.currentFactionId !== 'string') state.currentFactionId = 'pol';
        if (!['train', 'skills', 'escort', 'rd', 'staff', 'gacha', 'weapons', 'world', 'prestige', 'dex'].includes(state.activeTab)) state.activeTab = 'train';

        if (!state.prestigeUpgrades || typeof state.prestigeUpgrades !== 'object') {
            state.prestigeUpgrades = {
                kether: 0, chokmah: 0, binah: 0, chesed: 0, geburah: 0,
                tiphareth: 0, netzach: 0, hod: 0, yesod: 0, malkuth: 0
            };
        } else {
            if (state.prestigeUpgrades.atk && !state.prestigeUpgrades.geburah) state.prestigeUpgrades.geburah = state.prestigeUpgrades.atk;
            if (state.prestigeUpgrades.hp && !state.prestigeUpgrades.yesod) state.prestigeUpgrades.yesod = state.prestigeUpgrades.hp;
            if (state.prestigeUpgrades.gold && !state.prestigeUpgrades.chesed) state.prestigeUpgrades.chesed = state.prestigeUpgrades.gold;
            if (state.prestigeUpgrades.synergy && !state.prestigeUpgrades.tiphareth) state.prestigeUpgrades.tiphareth = state.prestigeUpgrades.synergy;
            if (state.prestigeUpgrades.escortSlots && !state.prestigeUpgrades.malkuth) state.prestigeUpgrades.malkuth = state.prestigeUpgrades.escortSlots;
            SEPHIROTH_TREE_NODES.forEach(n => {
                if (typeof state.prestigeUpgrades[n.id] !== 'number') state.prestigeUpgrades[n.id] = 0;
                const cap = n.maxLevel || 5;
                if (state.prestigeUpgrades[n.id] > cap) state.prestigeUpgrades[n.id] = cap;
            });
        }

        if (typeof state.prestigeCount !== 'number' || !isFinite(state.prestigeCount) || state.prestigeCount < 0) {
            state.prestigeCount = 0;
        }
        const allowedSpeeds = getAvailableSpeeds();
        if (!allowedSpeeds.includes(state.gameSpeed)) {
            const clamped = allowedSpeeds.filter(s => s <= (Number(state.gameSpeed) || 1)).pop();
            state.gameSpeed = clamped || allowedSpeeds[0];
        }

        ['corp', 'gew', 'ant', 'gew_beacon', 'dark_abyss', 'dark_endless'].forEach(fid => {
            if (!state.factionStages[fid]) state.factionStages[fid] = 1;
            if (!state.maxReachedStages[fid]) state.maxReachedStages[fid] = 1;
        });

        if (state.clearedFactions.includes('ter')) {
            if (!state.unlockedFactions.includes('corp')) state.unlockedFactions.push('corp');
            if (!state.unlockedFactions.includes('gew')) state.unlockedFactions.push('gew');
        }

        if (!state.beaconKeys || typeof state.beaconKeys !== 'object') {
            state.beaconKeys = {};
        }
        BEACON_KEYS.forEach(k => {
            if (state.clearedFactions.includes(k.factionId)) {
                state.beaconKeys[k.id] = true;
            }
        });

        checkAndUnlockAntarcticBase(false);
        if (state.clearedFactions.includes('ant')) {
            state.darkWorldUnlocked = true;
            if (!state.unlockedFactions.includes('gew_beacon')) state.unlockedFactions.push('gew_beacon');
        }
        if (state.clearedFactions.includes('gew_beacon')) {
            if (!state.unlockedFactions.includes('dark_abyss')) state.unlockedFactions.push('dark_abyss');
        }
        if (state.clearedFactions.includes('dark_abyss')) {
            if (!state.unlockedFactions.includes('dark_endless')) state.unlockedFactions.push('dark_endless');
        }

        if (!state.skillLevels || typeof state.skillLevels !== 'object') {
            state.skillLevels = { salvo: 1, overdrive: 1, goldrush: 1, shield: 1 };
        }
        ['salvo', 'overdrive', 'goldrush', 'shield'].forEach(k => {
            const val = Number(state.skillLevels[k]);
            state.skillLevels[k] = Number.isFinite(val) && val >= 1 ? Math.min(TACTICAL_MAX_LEVEL, Math.floor(val)) : 1;
        });
        if (!TACTICAL_SKILLS.some(s => s.id === state.activeTactic)) state.activeTactic = 'salvo';

        if (state.activeTab === 'faction') state.activeTab = 'world';
        if (state.activeTab === 'bossdex' || state.activeTab === 'relicdex') {
            state.dexSubTab = state.activeTab === 'relicdex' ? 'relic' : 'boss';
            state.activeTab = 'dex';
        }
        migrateCarsToCurrentLayout();
        if (!Array.isArray(state.soldEscorts)) state.soldEscorts = [];
        if (!Array.isArray(state.equippedEscorts)) state.equippedEscorts = [];
        if (typeof normalizeGachaState === 'function') normalizeGachaState();
        if (typeof syncManufacturerGachaUnlocks === 'function') syncManufacturerGachaUnlocks();
        state.maxHp = calcMaxHp();
        state.hp = Math.min(state.maxHp, Math.max(1, state.hp));
        return true;
    } catch (e) {
        return false;
    }
}

// 旧セーブ（10両・1両1兵装）を4両×2スロットへ縮約する。
// 兵装を捨てず、はみ出したぶんは予備兵装として保持する。
function migrateCarsToCurrentLayout() {
    if (!Array.isArray(state.reserveWeapons)) state.reserveWeapons = [];
    if (!Array.isArray(state.reserveSephiroth)) state.reserveSephiroth = [];

    if (!Array.isArray(state.cars) || state.cars.length === 0) {
        initCars();
        return;
    }

    const needsMigration = state.cars.length !== CAR_COUNT
        || state.cars.some(car => !('sideWeaponId' in car) || !('sideCdTimer' in car));
    if (!needsMigration) return;

    const oldCars = state.cars;
    const nextCars = [];
    for (let i = 0; i < CAR_COUNT; i++) nextCars.push(createCar(i));
    // 移行先は旧セーブの内容だけで埋める（初期装備の既定値は使わない）。
    nextCars.slice(1).forEach(car => { car.weaponId = null; car.sideWeaponId = null; });

    // 1両目（機関車）は固定。旧セーブの値は使わない。
    oldCars.slice(1).forEach((old, idx) => {
        const weaponId = old && old.weaponId ? old.weaponId : null;
        if (!weaponId) return;
        // 旧2,3両目 → 新2両目、旧4,5両目 → 新3両目、旧6,7両目 → 新4両目。
        const carIndex = Math.min(CAR_COUNT - 1, 1 + Math.floor(idx / 2));
        const slot = idx % 2 === 0 ? CAR_SLOT_UPPER : CAR_SLOT_SIDE;
        const target = nextCars[carIndex];
        if (!target) return;
        if (slot === CAR_SLOT_UPPER && !target.weaponId) {
            target.weaponId = weaponId;
        } else if (slot === CAR_SLOT_SIDE && !target.sideWeaponId) {
            target.sideWeaponId = weaponId;
        } else if (!target.weaponId) {
            target.weaponId = weaponId;
        } else if (!target.sideWeaponId) {
            target.sideWeaponId = weaponId;
        } else {
            state.reserveWeapons.push(weaponId);
        }
        // セフィラは兵装と同じ車両へ。埋まっていれば予備へ。
        if (old && old.sephirahId && old.sephirahId !== 'tiphareth') {
            if (!target.sephirahId) target.sephirahId = old.sephirahId;
            else state.reserveSephiroth.push(old.sephirahId);
        }
    });

    // 想定より残った兵装・セフィラも失わない。
    oldCars.slice(1 + CAR_COUNT * 2).forEach(old => {
        if (old && old.weaponId) state.reserveWeapons.push(old.weaponId);
        if (old && old.sephirahId && old.sephirahId !== 'tiphareth') state.reserveSephiroth.push(old.sephirahId);
    });

    state.reserveWeapons = [...new Set(state.reserveWeapons)].filter(Boolean);
    state.reserveSephiroth = [...new Set(state.reserveSephiroth)].filter(Boolean);
    state.cars = nextCars;
}

function gameLoop() {
    const steps = state.gameSpeed || 1;
    for (let s = 0; s < steps; s++) {
        updateSimulation();
    }
    updateHeaderUI();
    drawScene();
    requestAnimationFrame(gameLoop);
}

let mobileCommandDockMedia = null;
const mobileDockPlacements = [];

function initializeMobileCommandDock() {
    const locations = [
        ['mobile-battle-controls', 'mobile-battle-slot'],
        ['mobile-header-controls', 'mobile-header-slot']
    ];
    locations.forEach(([elementId, slotId]) => {
        const element = document.getElementById(elementId);
        const slot = document.getElementById(slotId);
        if (!element || !slot || !element.parentNode) return;
        const placeholder = document.createComment(`restore:${elementId}`);
        element.parentNode.insertBefore(placeholder, element);
        mobileDockPlacements.push({ element, slot, placeholder });
    });

    const moveForViewport = event => {
        const isMobile = typeof event === 'boolean' ? event : event.matches;
        mobileDockPlacements.forEach(({ element, slot, placeholder }) => {
            if (isMobile) {
                if (element.parentNode !== slot) slot.appendChild(element);
            } else if (placeholder.parentNode && element.parentNode !== placeholder.parentNode) {
                placeholder.parentNode.insertBefore(element, placeholder.nextSibling);
            }
        });
    };

    mobileCommandDockMedia = window.matchMedia('(max-width: 639px)');
    moveForViewport(mobileCommandDockMedia.matches);
    mobileCommandDockMedia.addEventListener('change', moveForViewport);
}

// モバイルでは艦橋タブを常設レールへ複製する（元のDOMはデスクトップ用に残す）。
const MOBILE_TAB_RAIL = [
    ['train', '車両編成'],
    ['staff', '駅員'],
    ['rd', '研究開発'],
    ['skills', '戦術'],
    ['escort', '鹵獲'],
    ['gacha', 'ガチャ'],
    ['weapons', '武装'],
    ['world', '世界'],
    ['prestige', 'プレステージ'],
    ['dex', '図鑑']
];

function buildMobileTabRail() {
    const slot = document.getElementById('mobile-tab-rail-slot');
    if (!slot || slot.dataset.built === '1') return;
    slot.dataset.built = '1';
    const rail = document.createElement('nav');
    rail.className = 'mobile-tab-rail';
    rail.setAttribute('aria-label', '艦橋タブ');
    MOBILE_TAB_RAIL.forEach(([tab, label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mobile-tab-rail-button';
        button.dataset.railTab = tab;
        button.setAttribute('aria-current', 'false');
        button.textContent = label;
        button.addEventListener('click', () => switchTab(tab));
        rail.appendChild(button);
    });
    slot.appendChild(rail);
}

function syncMobileTabRail(activeTab) {
    document.querySelectorAll('.mobile-tab-rail-button').forEach(button => {
        const isActive = button.dataset.railTab === activeTab;
        button.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
    const active = document.querySelector(`.mobile-tab-rail-button[data-rail-tab="${activeTab}"]`);
    if (active && typeof active.scrollIntoView === 'function') {
        active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
}

function closeMobileCommandPanels() {
    document.querySelectorAll('.mobile-command-panel').forEach(panel => panel.classList.remove('is-open'));
    document.querySelectorAll('.mobile-dock-button[aria-expanded="true"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
}

// ドック中央の主操作。戦闘中は進行状況、待機中は出撃として振る舞う。
function handleMobileLaunch() {
    closeMobileCommandPanels();
    if (state.inWave) {
        showToast(`STAGE ${state.stage} 進軍中 — ${Math.floor(getTotalMeters(getCurrentFaction(), state.stage, marchMeters)).toLocaleString()} m`);
        return;
    }
    startWave();
}

function syncMobileDockUI() {
    const labelEl = document.getElementById('mobile-launch-label');
    const subEl = document.getElementById('mobile-launch-sub');
    const launchBtn = document.getElementById('btn-mobile-launch');
    if (!labelEl || !subEl || !launchBtn) return;
    if (state.inWave) {
        labelEl.textContent = '進軍中';
        subEl.textContent = `${Math.floor(marchMeters).toLocaleString()} m`;
        launchBtn.classList.add('is-marching');
        launchBtn.setAttribute('aria-label', `STAGE ${state.stage} 進軍中。${Math.floor(marchMeters)}メートル`);
    } else {
        labelEl.textContent = '出撃';
        subEl.textContent = `ST.${state.stage}`;
        launchBtn.classList.remove('is-marching');
        launchBtn.setAttribute('aria-label', `STAGE ${state.stage} へ出撃`);
    }
}

function toggleMobileCommandPanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const wasOpen = panel.classList.contains('is-open');
    closeMobileCommandPanels();
    if (!wasOpen) {
        panel.classList.add('is-open');
        const button = document.querySelector(`.mobile-dock-button[aria-controls="${panelId}"]`);
        if (button) button.setAttribute('aria-expanded', 'true');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    initCars();
    initWeatherParticles();
    const hasSave = loadGame();
    if (!hasSave) {
        state.weather = 'cloudy';
    }
    resizeCanvas();
    updateSoundToggleButton();
    syncPlaybackControlsUI();
    syncWeatherUI();
    showEnemyPreviewTemporarily();
    updateHeaderUI();
    buildMobileTabRail();
    switchTab(state.activeTab || 'train');
    initializeGacha();
    initializeMobileCommandDock();

    if (hasSave) {
        closeStoryModal();
    }
    requestAnimationFrame(gameLoop);
});
