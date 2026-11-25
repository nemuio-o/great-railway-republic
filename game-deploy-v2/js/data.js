
const SAVE_STORAGE_KEY = 'great_railway_republic_save_v1';

// 天候マスターデータ（デフォルト：曇り）
const WEATHERS = {
    cloudy: {
        id: 'cloudy',
        name: '曇り',
        icon: '☁️',
        effectText: '通常気象・補正なし',
        textColor: 'text-slate-200',
        borderColor: 'border-slate-500/70',
        enemyHpMult: 1.00,
        allyAtkMult: 1.00,
        enemySpeedMult: 1.00,
        stormSlip: false,
        weatherBossId: null
    },
    clear: {
        id: 'clear',
        name: '晴れ',
        icon: '☀️',
        effectText: '敵軍HP 20%増加',
        textColor: 'text-amber-300',
        borderColor: 'border-amber-500/70',
        enemyHpMult: 1.20,
        allyAtkMult: 1.00,
        enemySpeedMult: 1.00,
        stormSlip: false,
        weatherBossId: 'wboss_clear'
    },
    rain: {
        id: 'rain',
        name: '雨',
        icon: '🌧️',
        effectText: '自軍・友軍の火力 5%低下',
        textColor: 'text-sky-300',
        borderColor: 'border-sky-500/70',
        enemyHpMult: 1.00,
        allyAtkMult: 0.95,
        enemySpeedMult: 1.00,
        stormSlip: false,
        weatherBossId: 'wboss_rain'
    },
    snow: {
        id: 'snow',
        name: '雪',
        icon: '❄️',
        effectText: '敵軍移動速度 20%低下',
        textColor: 'text-cyan-200',
        borderColor: 'border-cyan-400/70',
        enemyHpMult: 1.00,
        allyAtkMult: 1.00,
        enemySpeedMult: 0.80,
        stormSlip: false,
        weatherBossId: 'wboss_snow'
    },
    storm: {
        id: 'storm',
        name: '嵐',
        icon: '⛈️',
        effectText: '両軍に暴風落雷スリップダメージ',
        textColor: 'text-purple-300',
        borderColor: 'border-purple-500/80',
        enemyHpMult: 1.00,
        allyAtkMult: 1.00,
        enemySpeedMult: 1.00,
        stormSlip: true,
        weatherBossId: 'wboss_storm'
    }
};

const SPECIAL_WEATHER_KEYS = ['clear', 'rain', 'snow', 'storm'];

function getCurrentWeather() {
    return WEATHERS[state.weather] || WEATHERS.cloudy;
}

function rollStageWeather(stageNum, factionId, notifyChange = true) {
    const prevWeather = state.weather || 'cloudy';
    let nextWeather = 'cloudy';
    if (Math.random() < 0.18) {
        nextWeather = SPECIAL_WEATHER_KEYS[Math.floor(Math.random() * SPECIAL_WEATHER_KEYS.length)];
    }
    state.weather = nextWeather;
    syncWeatherUI();
    if (notifyChange && nextWeather !== 'cloudy' && nextWeather !== prevWeather) {
        const w = WEATHERS[nextWeather];
        showToast(`${w.icon} 気象変動！戦場の天候が「${w.name}（${w.effectText}）」へ変化しました！`);
    }
}

function syncWeatherUI() {
    const w = getCurrentWeather();
    const hEl = document.getElementById('ui-weather-header');
    const bEl = document.getElementById('ui-weather-badge');
    const iconEl = document.getElementById('ui-weather-icon');
    const nameEl = document.getElementById('ui-weather-name');
    const effEl = document.getElementById('ui-weather-effect');

    if (hEl) {
        hEl.textContent = `${w.icon} ${w.name} (${w.effectText})`;
        hEl.className = `${w.textColor} font-bold`;
    }
    if (bEl) {
        bEl.className = `bg-slate-950/90 backdrop-blur border ${w.borderColor} rounded px-2.5 py-1 text-[11px] shadow-lg flex items-center gap-1.5`;
    }
    if (iconEl) iconEl.textContent = w.icon;
    if (nameEl) {
        nameEl.textContent = w.name;
        nameEl.className = `font-bold ${w.textColor}`;
    }
    if (effEl) effEl.textContent = w.effectText;
}

// --- Web Audio API サウンドエフェクト（SE）エンジン ---
const SoundEngine = {
    ctx: null,
    enabled: true,
    noiseBuffer: null,
    lastFireTime: {},

    init() {
        try {
            if (!this.ctx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) {
                    this.ctx = new AudioCtx();
                    this.createNoiseBuffer();
                }
            }
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        } catch (e) {}
    },

    createNoiseBuffer() {
        if (!this.ctx) return;
        const sampleRate = this.ctx.sampleRate;
        const length = sampleRate * 1.5;
        const buffer = this.ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        this.noiseBuffer = buffer;
    },

    playNoise(duration, filterFreq, filterType = 'lowpass', volume = 0.15) {
        if (!this.enabled || !this.ctx || !this.noiseBuffer) return;
        const now = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.setValueAtTime(filterFreq, now);
        filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterFreq * 0.2), now + duration);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        src.start(now);
        src.stop(now + duration);
    },

    playTone(type, startFreq, endFreq, duration, volume = 0.1, delay = 0) {
        if (!this.enabled || !this.ctx) return;
        const now = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);

        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + duration);
    },

    playWeaponFire(weaponId) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const nowMs = performance.now();
        const minGap = weaponId === 'mg_vulcan' ? 75 : 55;
        if (this.lastFireTime[weaponId] && nowMs - this.lastFireTime[weaponId] < minGap) return;
        this.lastFireTime[weaponId] = nowMs;

        switch (weaponId) {
            case 'railgun_tiphareth':
                this.playTone('sawtooth', 980, 140, 0.26, 0.11);
                this.playTone('sine', 1650, 320, 0.22, 0.08);
                this.playNoise(0.16, 1800, 'bandpass', 0.09);
                break;
            case 'mg_vulcan':
                this.playNoise(0.055, 2200, 'bandpass', 0.065);
                this.playTone('square', 320, 95, 0.045, 0.04);
                break;
            case 'aa_flak':
                this.playNoise(0.09, 1500, 'bandpass', 0.08);
                this.playTone('triangle', 420, 110, 0.08, 0.06);
                break;
            case 'torpedo_launcher':
                this.playTone('sine', 240, 85, 0.18, 0.09);
                this.playNoise(0.14, 700, 'lowpass', 0.08);
                break;
            case 'howitzer_heavy':
                this.playNoise(0.24, 480, 'lowpass', 0.16);
                this.playTone('sine', 150, 38, 0.24, 0.14);
                break;
            case 'missile_malkuth':
                this.playNoise(0.22, 2600, 'highpass', 0.06);
                this.playTone('sawtooth', 460, 780, 0.16, 0.05);
                break;
            case 'laser_kether':
                this.playTone('sawtooth', 1400, 420, 0.3, 0.09);
                this.playTone('sine', 2100, 880, 0.28, 0.07);
                break;
            default:
                this.playNoise(0.06, 1200, 'lowpass', 0.06);
                break;
        }
    },

    playEnemyExplode(isBoss = false) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        if (isBoss) {
            this.playNoise(0.65, 340, 'lowpass', 0.26);
            this.playTone('sawtooth', 130, 28, 0.6, 0.2);
            setTimeout(() => {
                this.playNoise(0.55, 520, 'lowpass', 0.22);
                this.playTone('square', 160, 32, 0.5, 0.16);
            }, 140);
            this.playTone('triangle', 523.25, 523.25, 0.16, 0.11, 0.22);
            this.playTone('triangle', 659.25, 659.25, 0.16, 0.11, 0.34);
            this.playTone('triangle', 783.99, 783.99, 0.18, 0.12, 0.46);
            this.playTone('triangle', 1046.5, 1046.5, 0.45, 0.14, 0.58);
        } else {
            const nowMs = performance.now();
            if (this.lastFireTime['explode'] && nowMs - this.lastFireTime['explode'] < 50) return;
            this.lastFireTime['explode'] = nowMs;
            this.playNoise(0.16, 650, 'lowpass', 0.09);
            this.playTone('sine', 140, 42, 0.14, 0.07);
        }
    },

    playGrandBossEntrance() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        this.playTone('sawtooth', 95, 42, 0.95, 0.22, 0);
        this.playTone('square', 580, 880, 0.22, 0.13, 0.05);
        this.playTone('square', 580, 880, 0.22, 0.13, 0.32);
        this.playTone('sawtooth', 130.81, 65.41, 0.85, 0.18, 0.15);
        this.playNoise(0.65, 420, 'lowpass', 0.20);
    },

    playGrandBossUltimate(style = 'beam') {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        if (style === 'beam') {
            this.playTone('sawtooth', 1400, 110, 0.65, 0.20, 0);
            this.playTone('sine', 2200, 260, 0.60, 0.15, 0.04);
            this.playNoise(0.55, 950, 'bandpass', 0.18);
        } else if (style === 'missiles') {
            for (let i = 0; i < 4; i++) {
                this.playTone('sawtooth', 480, 140, 0.25, 0.12, i * 0.09);
                this.playNoise(0.28, 520, 'lowpass', 0.15);
            }
        } else {
            this.playTone('sawtooth', 260, 38, 0.72, 0.22, 0);
            this.playTone('triangle', 840, 95, 0.65, 0.14, 0.05);
            this.playNoise(0.60, 380, 'lowpass', 0.20);
        }
    },

    playStageClear() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        this.playTone('triangle', 440, 440, 0.12, 0.09, 0);
        this.playTone('triangle', 554.37, 554.37, 0.12, 0.09, 0.1);
        this.playTone('triangle', 659.25, 659.25, 0.14, 0.1, 0.2);
        this.playTone('triangle', 880, 880, 0.32, 0.12, 0.3);
    },

    playTrainDamage() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const nowMs = performance.now();
        if (this.lastFireTime['trainHit'] && nowMs - this.lastFireTime['trainHit'] < 120) return;
        this.lastFireTime['trainHit'] = nowMs;
        this.playNoise(0.18, 320, 'lowpass', 0.14);
        this.playTone('sawtooth', 95, 35, 0.18, 0.12);
    },

    playThunder() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        this.playNoise(0.32, 260, 'lowpass', 0.12);
        this.playTone('sawtooth', 120, 32, 0.28, 0.08);
    },

    playBossWarning() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        this.playTone('sawtooth', 520, 780, 0.24, 0.12, 0);
        this.playTone('sawtooth', 520, 780, 0.24, 0.12, 0.32);
        this.playTone('sine', 110, 55, 0.55, 0.16, 0.05);
    },

    playFactionEntry() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        this.playTone('sawtooth', 220, 220, 0.16, 0.08, 0);
        this.playTone('sawtooth', 277.18, 277.18, 0.16, 0.08, 0.12);
        this.playTone('sawtooth', 329.63, 329.63, 0.18, 0.09, 0.24);
        this.playTone('sawtooth', 440, 440, 0.42, 0.11, 0.36);
    },

    playUI(type = 'click') {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        if (type === 'upgrade') {
            this.playTone('sine', 520, 1040, 0.14, 0.08);
        } else if (type === 'launch') {
            this.playTone('sawtooth', 180, 540, 0.25, 0.1);
            this.playNoise(0.2, 900, 'bandpass', 0.08);
        } else {
            this.playTone('sine', 660, 880, 0.06, 0.05);
        }
    }
};

function toggleSoundEffect() {
    SoundEngine.enabled = !SoundEngine.enabled;
    if (SoundEngine.enabled) {
        SoundEngine.init();
        SoundEngine.playUI('click');
    }
    updateSoundToggleButton();
    saveGame(true);
    showToast(SoundEngine.enabled ? '🔊 効果音（SE）を ON にしました' : '🔇 効果音（SE）を OFF にしました');
}

function updateSoundToggleButton() {
    const btn = document.getElementById('btn-se-toggle');
    if (!btn) return;
    if (SoundEngine.enabled) {
        btn.textContent = '🔊';
        btn.className = 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/60 px-1.5 sm:px-2 py-1 rounded text-[10px] sm:text-[11px] font-bold transition';
    } else {
        btn.textContent = '🔇';
        btn.className = 'bg-slate-900 hover:bg-slate-800 text-slate-500 border border-slate-700 px-1.5 sm:px-2 py-1 rounded text-[10px] sm:text-[11px] font-bold transition';
    }
}

// 兵装マスターデータ
const WEAPONS = {
    'railgun_tiphareth': {
        id: 'railgun_tiphareth',
        name: 'レールガン・ティファレト',
        type: 'RAILGUN',
        typeName: '荷電粒子砲',
        tier: 1,
        locked: true,
        unlockCost: 0,
        upgradeBaseCost: 420,
        damage: 95,
        cooldown: 65,
        range: 640,
        color: '#fbbf24',
        multipliers: { LAND: 1.5, SEA: 1.5, AIR: 1.5 },
        desc: '1両目固定の決戦兵器。全属性に高い貫通ダメージを与える。'
    },
    'mg_vulcan': {
        id: 'mg_vulcan',
        manufacturerId: 'usa',
        name: '重機関銃バルカン',
        type: 'MG',
        typeName: '機関銃',
        tier: 1,
        unlockCost: 260,
        upgradeBaseCost: 260,
        damage: 18,
        cooldown: 16,
        range: 460,
        color: '#fde047',
        multipliers: { LAND: 1.4, SEA: 0.7, AIR: 1.2 },
        desc: '高速連射兵装。歩兵や軽装甲目標の掃討に適している。'
    },
    'aa_flak': {
        id: 'aa_flak',
        manufacturerId: 'gew',
        name: '88mm対空機関砲',
        type: 'AA',
        typeName: '対空砲',
        tier: 1,
        unlockCost: 300,
        upgradeBaseCost: 300,
        damage: 32,
        cooldown: 32,
        range: 520,
        color: '#38bdf8',
        multipliers: { LAND: 0.7, SEA: 0.5, AIR: 2.5 },
        desc: '対空特化兵装。[空]ユニットに対して2.5倍の絶大な威力を発揮。'
    },
    'torpedo_launcher': {
        id: 'torpedo_launcher',
        manufacturerId: 'un',
        name: '対艦重魚雷発射管',
        type: 'TORPEDO',
        typeName: '対艦兵装',
        tier: 2,
        reqWeapon: 'aa_flak',
        unlockCost: 520,
        upgradeBaseCost: 420,
        damage: 78,
        cooldown: 75,
        range: 550,
        color: '#2dd4bf',
        multipliers: { LAND: 0.8, SEA: 2.5, AIR: 0.1 },
        desc: '【第2段階】沿岸の敵艦船を粉砕する。[海]ユニットに2.5倍ダメージ。'
    },
    'howitzer_heavy': {
        id: 'howitzer_heavy',
        manufacturerId: 'usa',
        name: '155mm重榴弾砲',
        type: 'CANNON',
        typeName: '重砲',
        tier: 2,
        reqWeapon: 'mg_vulcan',
        unlockCost: 560,
        upgradeBaseCost: 450,
        damage: 88,
        cooldown: 80,
        range: 600,
        color: '#f97316',
        multipliers: { LAND: 2.2, SEA: 1.3, AIR: 0.2 },
        desc: '【第2段階】重装甲の戦車を砕く。[陸]ユニットに2.2倍ダメージ。'
    },
    'missile_malkuth': {
        id: 'missile_malkuth',
        manufacturerId: 'un',
        name: '多連装誘導ミサイル',
        type: 'SUPER',
        typeName: '超兵器',
        tier: 3,
        reqWeapon: 'torpedo_launcher',
        unlockCost: 1100,
        upgradeBaseCost: 700,
        damage: 68,
        cooldown: 45,
        range: 620,
        color: '#f43f5e',
        multipliers: { LAND: 1.4, SEA: 1.6, AIR: 2.0 },
        desc: '【第3段階・超兵器】全領域対応の誘導弾幕。航空目標への追尾性が高い。'
    },
    'laser_kether': {
        id: 'laser_kether',
        manufacturerId: 'gew',
        name: '超兵器・焦熱光線砲',
        type: 'SUPER',
        typeName: '超兵器',
        tier: 3,
        reqWeapon: 'howitzer_heavy',
        unlockCost: 1400,
        upgradeBaseCost: 850,
        damage: 165,
        cooldown: 110,
        range: 680,
        color: '#e879f9',
        multipliers: { LAND: 1.8, SEA: 1.8, AIR: 1.8 },
        desc: '【第3段階・超兵器】国連の禁断技術を転用。全属性に高倍率の焼灼ダメージ。'
    }
};

// セフィラ（駅員）マスターデータ
const SEPHIROTH = [
    {
        id: 'tiphareth',
        name: 'ティファレト (美)',
        specialty: 'RAILGUN',
        specialtyName: '荷電粒子砲',
        cost: 0,
        upgradeBaseCost: 450,
        locked: true,
        desc: '列車艦長。1両目のレールガンと完全同調する。',
        victoryQuotes: [
            '「ふふっ、アイン・ソフ・オウルの鉄路を阻むには役不足だったようだな。」',
            '「大鉄道共和国の前進は誰にも止められん。全車両、次の座標へ進軍せよ！」',
            '「見事な砲撃だ。旧世界の亡霊どもに我らの自由の重みを刻み込んでやれ。」'
        ],
        autoSkillName: '王の裁定ビーム',
        autoInterval: 240,
        getAutoSkillDesc: (lv) => {
            const mult = (3.2 + (lv - 1) * 0.85).toFixed(2);
            return `4.0秒毎に最高HPの敵へレールガン威力 ×${mult} 倍の裁定荷電砲を自動照射`;
        },
        getAutoSkillDelta: (lv) => {
            const cur = 3.2 + (lv - 1) * 0.85;
            const next = 3.2 + lv * 0.85;
            return { label: '裁定荷電砲 倍率', from: `×${cur.toFixed(2)}`, to: `×${next.toFixed(2)}`, delta: `+${(next - cur).toFixed(2)}` };
        }
    },
    {
        id: 'geburah',
        name: 'ゲブラー (峻厳)',
        specialty: 'MG',
        specialtyName: '機関銃',
        cost: 240,
        upgradeBaseCost: 280,
        desc: '苛烈な弾幕指揮により、機関銃の連射性能を底上げする。',
        victoryQuotes: [
            '「目標沈黙を確認。甘い慈悲など不要、阻む者はすべて鉄屑に変えるのみだ！」',
            '「弾幕はまだ尽きんぞ。次の敵影が見え次第、即座に掃射を開始する！」'
        ],
        autoSkillName: '峻厳の鉄槌掃射',
        autoInterval: 210,
        getAutoSkillDesc: (lv) => {
            const mult = (1.6 + (lv - 1) * 0.45).toFixed(2);
            return `3.5秒毎に前線の敵最大4体へ搭乗車両威力 ×${mult} 倍の制圧弾幕を自動発射`;
        },
        getAutoSkillDelta: (lv) => {
            const cur = 1.6 + (lv - 1) * 0.45;
            const next = 1.6 + lv * 0.45;
            return { label: '制圧弾幕 倍率', from: `×${cur.toFixed(2)}`, to: `×${next.toFixed(2)}`, delta: `+${(next - cur).toFixed(2)}` };
        }
    },
    {
        id: 'netzach',
        name: 'ネツァク (勝利)',
        specialty: 'MG',
        specialtyName: '機関銃',
        cost: 260,
        upgradeBaseCost: 300,
        desc: '前線維持のエキスパート。機関銃兵装と好相性。',
        victoryQuotes: [
            '「よっしゃあ！また俺たちの勝利だ！どんな巨大兵器だろうと押し切ってやるぜ！」',
            '「前線クリア！このまま一気に敵の本陣まで突き進もうぜ、艦長！」'
        ],
        autoSkillName: '不屈の凱歌連撃',
        autoInterval: 270,
        getAutoSkillDesc: (lv) => {
            const mult = (2.2 + (lv - 1) * 0.55).toFixed(2);
            const atkPct = 10 + (lv - 1) * 4;
            return `全車両の攻撃力 +${atkPct}%（常時）＋ 4.5秒毎に最前線の敵へ ×${mult} 倍の集中連撃`;
        },
        getAutoSkillDelta: (lv) => {
            const curAtk = 10 + (lv - 1) * 4;
            const curMult = 2.2 + (lv - 1) * 0.55;
            const nextMult = 2.2 + lv * 0.55;
            return { label: '攻撃力 / 連撃倍率', from: `+${curAtk}% / ×${curMult.toFixed(2)}`, to: `+${curAtk + 4}% / ×${nextMult.toFixed(2)}`, delta: `+4% / +${(nextMult - curMult).toFixed(2)}` };
        }
    },
    {
        id: 'chokmah',
        name: 'コクマー (知恵)',
        specialty: 'AA',
        specialtyName: '対空砲',
        cost: 280,
        upgradeBaseCost: 320,
        desc: '空の軌道を先読みし、対空砲の命中と威力を高める。',
        victoryQuotes: [
            '「弾道計算通りだ。装甲の継ぎ目もエネルギー炉の癖も、すべて見抜いていたよ。」',
            '「合理的な戦果だね。回収できる残骸データはすべて次の演算に活かそう。」'
        ],
        autoSkillName: '叡智の弱点解析',
        autoInterval: 240,
        getAutoSkillDesc: (lv) => {
            const critRate = Math.min(65, 14 + (lv - 1) * 3);
            const critMult = (1.8 + (lv - 1) * 0.15).toFixed(2);
            return `全車両に会心率 ${critRate}%（会心ダメージ ×${critMult}倍）を常時付与＋対空自動迎撃`;
        },
        getAutoSkillDelta: (lv) => {
            const curRate = Math.min(65, 14 + (lv - 1) * 3);
            const nextRate = Math.min(65, 14 + lv * 3);
            const curMult = 1.8 + (lv - 1) * 0.15;
            const nextMult = 1.8 + lv * 0.15;
            return { label: '会心率 / 会心倍率', from: `${curRate}% / ×${curMult.toFixed(2)}`, to: `${nextRate}% / ×${nextMult.toFixed(2)}`, delta: `+${nextRate - curRate}% / +${(nextMult - curMult).toFixed(2)}` };
        }
    },
    {
        id: 'hod',
        name: 'ホド (栄光)',
        specialty: 'AA',
        specialtyName: '対空砲',
        cost: 300,
        upgradeBaseCost: 340,
        desc: '精密な対空レーダー管制を得意とする通信士。',
        victoryQuotes: [
            '「全レーダーから敵大型反応が消失！精密管制の勝利だね、みんなお疲れさま！」',
            '「通信傍受完了、敵司令部はパニック状態だよ！この調子で押し切っちゃおう！」'
        ],
        autoSkillName: '栄光の誘導光弾',
        autoInterval: 195,
        getAutoSkillDesc: (lv) => {
            const mult = (2.4 + (lv - 1) * 0.6).toFixed(2);
            return `3.25秒毎に航空・高速目標を優先して搭乗車両威力 ×${mult} 倍の誘導光弾を自動発射`;
        },
        getAutoSkillDelta: (lv) => {
            const cur = 2.4 + (lv - 1) * 0.6;
            const next = 2.4 + lv * 0.6;
            return { label: '誘導光弾 倍率', from: `×${cur.toFixed(2)}`, to: `×${next.toFixed(2)}`, delta: `+${(next - cur).toFixed(2)}` };
        }
    },
    {
        id: 'binah',
        name: 'ビナー (理解)',
        specialty: 'TORPEDO',
        specialtyName: '対艦兵装',
        cost: 360,
        upgradeBaseCost: 380,
        desc: '海流と艦船の装甲構造を見抜き、魚雷の威力を高める。',
        victoryQuotes: [
            '「どれほど分厚い装甲を纏おうと、構造の急所を突けば沈むのは必然です。」',
            '「敵大型ユニットの沈黙を確認しました。海も陸も、私達の航路を阻めません。」'
        ],
        autoSkillName: '深淵の誘導魚雷群',
        autoInterval: 250,
        getAutoSkillDesc: (lv) => {
            const mult = (2.8 + (lv - 1) * 0.7).toFixed(2);
            return `4.2秒毎に敵艦・重装甲目標へ搭乗車両威力 ×${mult} 倍の重魚雷追撃を自動発射`;
        },
        getAutoSkillDelta: (lv) => {
            const cur = 2.8 + (lv - 1) * 0.7;
            const next = 2.8 + lv * 0.7;
            return { label: '重魚雷 倍率', from: `×${cur.toFixed(2)}`, to: `×${next.toFixed(2)}`, delta: `+${(next - cur).toFixed(2)}` };
        }
    },
    {
        id: 'yesod',
        name: 'イェソド (基礎)',
        specialty: 'CANNON',
        specialtyName: '重砲',
        cost: 360,
        upgradeBaseCost: 380,
        desc: '車両の反動制御を完璧にこなし、重砲の連射を支える。',
        victoryQuotes: [
            '「ふぅ、車軸もフレームも異常なし！俺たちの整備と重砲の威力、思い知ったか！」',
            '「よし、大型目標撃破！今のうちに損傷箇所の応急点検を済ませておくぜ！」'
        ],
        autoSkillName: '基礎の緊急ナノ修復',
        autoInterval: 240,
        getAutoSkillDesc: (lv) => {
            const healPct = Math.min(25, 4 + (lv - 1) * 1.2).toFixed(1);
            return `戦闘中 4.0秒毎に装甲列車の最大HPの ${healPct}% を自動修復`;
        },
        getAutoSkillDelta: (lv) => {
            const cur = Math.min(25, 4 + (lv - 1) * 1.2);
            const next = Math.min(25, 4 + lv * 1.2);
            return { label: '自動修復 最大HP比', from: `${cur.toFixed(1)}%`, to: `${next.toFixed(1)}%`, delta: cur >= 25 ? '' : `+${(next - cur).toFixed(1)}%` };
        }
    },
    {
        id: 'chesed',
        name: 'ケセド (慈悲)',
        specialty: 'CANNON',
        specialtyName: '重砲',
        cost: 400,
        upgradeBaseCost: 420,
        desc: '慈悲なき砲撃管制により、重砲の装填と破壊力を強化。',
        victoryQuotes: [
            '「安らかに眠りなさい。残された物資と資金は、共和国の未来のために役立てます。」',
            '「戦利品の回収も完了しましたよ。これでまた列車を強くできますね。」'
        ],
        autoSkillName: '慈悲の戦利徴収＆砲撃',
        autoInterval: 260,
        getAutoSkillDesc: (lv) => {
            const goldPct = 18 + (lv - 1) * 7;
            const mult = (2.1 + (lv - 1) * 0.5).toFixed(2);
            return `獲得資金 +${goldPct}%（常時）＋ 4.3秒毎に搭乗車両威力 ×${mult} 倍の援護砲撃`;
        },
        getAutoSkillDelta: (lv) => {
            const curGold = 18 + (lv - 1) * 7;
            const curMult = 2.1 + (lv - 1) * 0.5;
            const nextMult = 2.1 + lv * 0.5;
            return { label: '獲得資金 / 援護砲撃', from: `+${curGold}% / ×${curMult.toFixed(2)}`, to: `+${curGold + 7}% / ×${nextMult.toFixed(2)}`, delta: `+7% / +${(nextMult - curMult).toFixed(2)}` };
        }
    },
    {
        id: 'malkuth',
        name: 'マルクト (王国)',
        specialty: 'SUPER',
        specialtyName: '超兵器',
        cost: 750,
        upgradeBaseCost: 600,
        desc: '物質界の統率者。超兵器のエネルギー循環を最適化する。',
        victoryQuotes: [
            '「これが大鉄道共和国の力よ！旧秩序の象徴など、我らの車輪の下にひれ伏すがいいわ！」',
            '「超兵器の出力安定、目標完全消滅！さあ、新たな領土へ線路を延ばすわよ！」'
        ],
        autoSkillName: '王国の重力制圧波',
        autoInterval: 240,
        getAutoSkillDesc: (lv) => {
            const slowPct = Math.min(45, 12 + (lv - 1) * 3);
            const mult = (1.7 + (lv - 1) * 0.45).toFixed(2);
            return `全敵の移動速度 -${slowPct}%（常時）＋ 4.0秒毎に全敵へ ×${mult} 倍の重力衝撃波`;
        },
        getAutoSkillDelta: (lv) => {
            const curSlow = Math.min(45, 12 + (lv - 1) * 3);
            const nextSlow = Math.min(45, 12 + lv * 3);
            const curMult = 1.7 + (lv - 1) * 0.45;
            const nextMult = 1.7 + lv * 0.45;
            return { label: '減速 / 重力波倍率', from: `${curSlow}% / ×${curMult.toFixed(2)}`, to: `${nextSlow}% / ×${nextMult.toFixed(2)}`, delta: `${curSlow >= 45 ? '' : `+${nextSlow - curSlow}% `}/ +${(nextMult - curMult).toFixed(2)}` };
        }
    },
    {
        id: 'kether',
        name: 'ケテル (王冠)',
        specialty: 'SUPER',
        specialtyName: '超兵器',
        cost: 900,
        upgradeBaseCost: 700,
        desc: '最高位のセフィラ。超兵器の出力を極限まで引き出す。',
        victoryQuotes: [
            '「至高の光の前に跪くがいい。我らが歩む鉄路こそが、この星の新たな理だ。」',
            '「障壁は砕かれた。王冠の輝きと共に、さらなる高みへと進もう。」'
        ],
        autoSkillName: '至高の王冠天罰光',
        autoInterval: 270,
        getAutoSkillDesc: (lv) => {
            const atkPct = 15 + (lv - 1) * 5;
            const mult = (2.5 + (lv - 1) * 0.65).toFixed(2);
            return `全車両の攻撃力 +${atkPct}%（常時）＋ 4.5秒毎に戦場の全敵へ ×${mult} 倍の天罰光線`;
        },
        getAutoSkillDelta: (lv) => {
            const curAtk = 15 + (lv - 1) * 5;
            const curMult = 2.5 + (lv - 1) * 0.65;
            const nextMult = 2.5 + lv * 0.65;
            return { label: '攻撃力 / 天罰光線', from: `+${curAtk}% / ×${curMult.toFixed(2)}`, to: `+${curAtk + 5}% / ×${nextMult.toFixed(2)}`, delta: `+5% / +${(nextMult - curMult).toFixed(2)}` };
        }
    }
];

let sephirahAutoTimers = {};
let sephirahCalloutTimer = null;

function triggerSephirahBossKillCallout(enemy) {
    const unlockedPool = SEPHIROTH.filter(s => state.hiredSephiroth.includes(s.id));
    if (unlockedPool.length === 0) return;

    const chosen = unlockedPool[Math.floor(Math.random() * unlockedPool.length)];
    const quotes = chosen.victoryQuotes || ['「目標撃破を確認した。前進を続けるぞ！」'];
    const line = quotes[Math.floor(Math.random() * quotes.length)];

    const box = document.getElementById('sephirah-victory-callout');
    const portraitEl = document.getElementById('sephirah-callout-portrait');
    const nameEl = document.getElementById('sephirah-callout-name');
    const lineEl = document.getElementById('sephirah-callout-line');
    if (!box || !portraitEl || !nameEl || !lineEl) return;

    portraitEl.innerHTML = getSephirahPortraitSVG(chosen.id, 'w-12 h-14');
    nameEl.textContent = `${chosen.name} Lv.${state.sephirahLevels[chosen.id] || 1}`;
    lineEl.textContent = line;

    box.classList.remove('hidden');
    clearTimeout(sephirahCalloutTimer);
    sephirahCalloutTimer = setTimeout(() => {
        box.classList.add('hidden');
    }, 4200);
}

function getSephirahPassiveEffects() {
    let atkBonus = 0;
    let goldBonus = 0;
    let slowBonus = 0;
    let critRate = 0;
    let critMult = 1.8;

    state.cars.forEach(car => {
        if (!car.sephirahId) return;
        const lv = state.sephirahLevels[car.sephirahId] || 1;
        switch (car.sephirahId) {
            case 'netzach': atkBonus += 0.10 + (lv - 1) * 0.04; break;
            case 'kether': atkBonus += 0.15 + (lv - 1) * 0.05; break;
            case 'chesed': goldBonus += 0.18 + (lv - 1) * 0.07; break;
            case 'malkuth': slowBonus += Math.min(0.45, 0.12 + (lv - 1) * 0.03); break;
            case 'chokmah':
                critRate += Math.min(0.65, 0.14 + (lv - 1) * 0.03);
                critMult = Math.max(critMult, 1.8 + (lv - 1) * 0.15);
                break;
        }
    });

    return {
        atkMult: 1 + atkBonus,
        goldMult: 1 + goldBonus,
        enemySlowMult: Math.max(0.45, 1 - Math.min(0.55, slowBonus)),
        critRate: Math.min(0.80, critRate),
        critMult
    };
}

function updateSephirahAutoSkills() {
    if (!state.inWave) return;
    const h = canvas.height || 260;

    state.cars.forEach(car => {
        if (!car.sephirahId) return;
        const s = SEPHIROTH.find(item => item.id === car.sephirahId);
        if (!s) return;

        sephirahAutoTimers[s.id] = (sephirahAutoTimers[s.id] || s.autoInterval) - 1;
        if (sephirahAutoTimers[s.id] > 0) return;
        sephirahAutoTimers[s.id] = s.autoInterval;

        const lv = state.sephirahLevels[s.id] || 1;
        // 自動スキルの威力は上部・側面のうち高いほうを基準にする。
        const upperStats = getCarEffectiveStats(car, CAR_SLOT_UPPER);
        const sideStats = getCarEffectiveStats(car, CAR_SLOT_SIDE);
        const carStats = [upperStats, sideStats].filter(Boolean)
            .sort((a, b) => b.damage - a.damage)[0] || null;
        const basePower = carStats ? carStats.damage : Math.max(30, getWeaponDamage('railgun_tiphareth') * 0.5);
        const cx = getCarX(car.index);
        const cy = h * 0.62;

        if (s.id === 'yesod') {
            if (state.hp < state.maxHp) {
                const healRatio = Math.min(0.25, 0.04 + (lv - 1) * 0.012);
                const healAmt = Math.max(10, Math.round(state.maxHp * healRatio));
                state.hp = Math.min(state.maxHp, state.hp + healAmt);
                floatingTexts.push({ x: cx, y: cy - 18, text: `🔧+${healAmt}`, color: '#34d399', life: 36 });
            }
            return;
        }

        const aliveEnemiesAll = enemies.filter(e => e.hp > 0);
        if (aliveEnemiesAll.length === 0) return;

        // 自動スキルも射程の制約を受ける。射程外の敵をここで処理してしまうと、
        // 画面外に滞留した敵が自動スキルだけでゆっくり溶け、
        // 「攻撃が届いていないのに勝手にステージが進む」状態になるため。
        const autoRange = carStats ? carStats.range : 480;
        const carXForRange = getCarX(car.index);
        const aliveEnemies = aliveEnemiesAll.filter(e => (e.x - carXForRange) <= autoRange);
        if (aliveEnemies.length === 0) return;

        switch (s.id) {
            case 'tiphareth': {
                const target = aliveEnemies.reduce((a, b) => (b.hp > a.hp ? b : a), aliveEnemies[0]);
                const dmg = Math.round(basePower * (3.2 + (lv - 1) * 0.85));
                projectiles.push({
                    weaponId: 'railgun_tiphareth', type: 'RAILGUN', color: '#fbbf24',
                    multipliers: { LAND: 1.5, SEA: 1.5, AIR: 1.5 }, damage: dmg,
                    x: cx, y: cy, targetX: target.x, targetY: target.y, targetRef: target,
                    speed: 28, isBeam: true, life: 12
                });
                floatingTexts.push({ x: cx, y: cy - 22, text: '★裁定砲', color: '#fde047', life: 30 });
                break;
            }
            case 'geburah': {
                const targets = [...aliveEnemies].sort((a, b) => a.x - b.x).slice(0, 4);
                const dmg = Math.round(basePower * (1.6 + (lv - 1) * 0.45));
                targets.forEach(t => damageEnemy(t, dmg, '#f87171'));
                floatingTexts.push({ x: cx, y: cy - 22, text: '★峻厳掃射', color: '#f87171', life: 30 });
                break;
            }
            case 'netzach': {
                const target = [...aliveEnemies].sort((a, b) => a.x - b.x)[0];
                const dmg = Math.round(basePower * (2.2 + (lv - 1) * 0.55));
                damageEnemy(target, dmg, '#34d399');
                floatingTexts.push({ x: cx, y: cy - 22, text: '★凱歌連撃', color: '#34d399', life: 30 });
                break;
            }
            case 'chokmah': {
                const airTarget = aliveEnemies.find(e => e.attr === 'AIR') || aliveEnemies[0];
                const dmg = Math.round(basePower * (2.0 + (lv - 1) * 0.5));
                damageEnemy(airTarget, dmg, '#38bdf8');
                floatingTexts.push({ x: cx, y: cy - 22, text: '★叡智迎撃', color: '#38bdf8', life: 30 });
                break;
            }
            case 'hod': {
                const target = aliveEnemies.find(e => e.attr === 'AIR') || [...aliveEnemies].sort((a, b) => a.x - b.x)[0];
                const dmg = Math.round(basePower * (2.4 + (lv - 1) * 0.6));
                projectiles.push({
                    weaponId: 'aa_flak', type: 'AA', color: '#fde047',
                    multipliers: { LAND: 1.2, SEA: 1.2, AIR: 2.0 }, damage: dmg,
                    x: cx, y: cy, targetX: target.x, targetY: target.y, targetRef: target,
                    speed: 18, isBeam: false, life: 50
                });
                floatingTexts.push({ x: cx, y: cy - 22, text: '★栄光誘導弾', color: '#fde047', life: 30 });
                break;
            }
            case 'binah': {
                const seaTarget = aliveEnemies.find(e => e.attr === 'SEA') || aliveEnemies[0];
                const dmg = Math.round(basePower * (2.8 + (lv - 1) * 0.7));
                projectiles.push({
                    weaponId: 'torpedo_launcher', type: 'TORPEDO', color: '#2dd4bf',
                    multipliers: { LAND: 1.2, SEA: 2.2, AIR: 1.0 }, damage: dmg,
                    x: cx, y: cy + 8, targetX: seaTarget.x, targetY: seaTarget.y, targetRef: seaTarget,
                    speed: 15, isBeam: false, life: 60
                });
                floatingTexts.push({ x: cx, y: cy - 22, text: '★深淵魚雷', color: '#2dd4bf', life: 30 });
                break;
            }
            case 'chesed': {
                const target = [...aliveEnemies].sort((a, b) => a.x - b.x)[0];
                const dmg = Math.round(basePower * (2.1 + (lv - 1) * 0.5));
                damageEnemy(target, dmg, '#f472b6');
                floatingTexts.push({ x: cx, y: cy - 22, text: '★慈悲砲撃', color: '#f472b6', life: 30 });
                break;
            }
            case 'malkuth': {
                const dmg = Math.round(basePower * (1.7 + (lv - 1) * 0.45));
                aliveEnemies.forEach(e => damageEnemy(e, dmg, '#c084fc'));
                floatingTexts.push({ x: cx, y: cy - 22, text: '★王国重力波', color: '#c084fc', life: 30 });
                break;
            }
            case 'kether': {
                const dmg = Math.round(basePower * (2.5 + (lv - 1) * 0.65));
                aliveEnemies.forEach(e => {
                    projectiles.push({
                        weaponId: 'laser_kether', type: 'SUPER', color: '#fef08a',
                        multipliers: { LAND: 1.5, SEA: 1.5, AIR: 1.5 }, damage: dmg,
                        x: cx, y: cy, targetX: e.x, targetY: e.y, targetRef: e,
                        speed: 28, isBeam: true, life: 10
                    });
                });
                floatingTexts.push({ x: cx, y: cy - 22, text: '★王冠天罰光', color: '#fef08a', life: 32 });
                break;
            }
        }
    });
}

// セフィラ専用キャラクターポートレート生成
function getSephirahPortraitSVG(id, sizeClass = 'w-16 h-20') {
    const configs = {
        tiphareth: { hair: '#568c32', hairDark: '#2f5219', eye: '#e11d48', wink: true, smile: 'smirk', item: 'pipe', bgTop: '#1e293b', bgBot: '#3f3f26', accent: '#f59e0b' },
        geburah:   { hair: '#dc2626', hairDark: '#7f1d1d', eye: '#fbbf24', wink: false, smile: 'fierce', item: 'sword', bgTop: '#2a0e0e', bgBot: '#451a1a', accent: '#ef4444' },
        netzach:   { hair: '#10b981', hairDark: '#065f46', eye: '#38bdf8', wink: false, smile: 'grin', item: 'headset', bgTop: '#062c24', bgBot: '#134e4a', accent: '#34d399' },
        chokmah:   { hair: '#60a5fa', hairDark: '#1e3a8a', eye: '#c084fc', wink: false, smile: 'calm', item: 'monocle', bgTop: '#0f172a', bgBot: '#1e3a8a', accent: '#38bdf8' },
        hod:       { hair: '#facc15', hairDark: '#a16207', eye: '#2563eb', wink: true, smile: 'grin', item: 'watch', bgTop: '#272009', bgBot: '#423310', accent: '#fde047' },
        binah:     { hair: '#3730a3', hairDark: '#1e1b4b', eye: '#2dd4bf', wink: false, smile: 'calm', item: 'radar', bgTop: '#091526', bgBot: '#115e59', accent: '#2dd4bf' },
        yesod:     { hair: '#d97706', hairDark: '#78350f', eye: '#22c55e', wink: false, smile: 'grin', item: 'goggles', bgTop: '#241509', bgBot: '#452710', accent: '#fb923c' },
        chesed:    { hair: '#f472b6', hairDark: '#9d174d', eye: '#0284c7', wink: false, smile: 'gentle', item: 'emblem', bgTop: '#261020', bgBot: '#4c1d3d', accent: '#f9a8d4' },
        malkuth:   { hair: '#9333ea', hairDark: '#4c1d95', eye: '#f43f5e', wink: false, smile: 'smirk', item: 'baton', bgTop: '#1e0b36', bgBot: '#3b0764', accent: '#c084fc' },
        kether:    { hair: '#fef08a', hairDark: '#ca8a04', eye: '#f59e0b', wink: false, smile: 'calm', item: 'crown', bgTop: '#29210a', bgBot: '#524010', accent: '#fef08a' }
    };
    const c = configs[id] || configs.tiphareth;
    const uid = `sep_${id}_${Math.random().toString(36).slice(2, 6)}`;

    const eyesHtml = c.wink
        ? `<path d="M 42 52 Q 46 49 50 52" stroke="#271a12" stroke-width="1.8" fill="none" stroke-linecap="round"/>
           <ellipse cx="62" cy="52" rx="4.2" ry="3.2" fill="#fff"/>
           <circle cx="62.5" cy="52" r="2.6" fill="${c.eye}"/>
           <circle cx="63.3" cy="51" r="0.9" fill="#fff"/>
           <path d="M 57 49 Q 62 47 67 50" stroke="#1e1b18" stroke-width="1.6" fill="none"/>`
        : `<ellipse cx="45" cy="52" rx="4" ry="3" fill="#fff"/>
           <circle cx="45.5" cy="52" r="2.4" fill="${c.eye}"/>
           <circle cx="46.2" cy="51" r="0.8" fill="#fff"/>
           <ellipse cx="61" cy="52" rx="4" ry="3" fill="#fff"/>
           <circle cx="61.5" cy="52" r="2.4" fill="${c.eye}"/>
           <circle cx="62.2" cy="51" r="0.8" fill="#fff"/>`;

    const mouthHtml = c.smile === 'smirk'
        ? `<path d="M 49 62 Q 52 64 54 62 Q 56 64 59 61" stroke="#5c2b1e" stroke-width="1.5" fill="none" stroke-linecap="round"/>`
        : c.smile === 'fierce'
        ? `<path d="M 49 63 L 58 61" stroke="#5c2b1e" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
        : `<path d="M 49 61 Q 54 65 59 61" stroke="#5c2b1e" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;

    let extraHtml = '';
    if (c.item === 'pipe') {
        extraHtml = `
            <path d="M 54 63 L 43 74 C 40 77 35 76 35 72 L 35 68 L 41 68 L 41 72 L 52 62 Z" fill="#5c3317" stroke="#291509" stroke-width="1"/>
            <ellipse cx="38" cy="68" rx="3" ry="1.2" fill="#f97316" opacity="0.85"/>
            <path d="M 36 66 C 24 58 14 48 22 36 C 28 28 16 20 8 24" stroke="rgba(241,245,249,0.45)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
            <ellipse cx="42" cy="80" rx="5.5" ry="4.5" fill="#e2e8f0" stroke="#94a3b8" stroke-width="0.8"/>
        `;
    } else if (c.item === 'monocle') {
        extraHtml = `<circle cx="61" cy="52" r="6" fill="none" stroke="#fbbf24" stroke-width="1.2"/><path d="M 67 52 Q 70 62 66 72" stroke="#fbbf24" stroke-width="0.8" fill="none"/>`;
    } else if (c.item === 'goggles') {
        extraHtml = `<rect x="37" y="34" width="14" height="7" rx="2" fill="#38bdf8" stroke="#d97706" stroke-width="1.5"/><rect x="55" y="34" width="14" height="7" rx="2" fill="#38bdf8" stroke="#d97706" stroke-width="1.5"/>`;
    } else if (c.item === 'sword') {
        extraHtml = `<path d="M 28 98 L 36 74" stroke="#fbbf24" stroke-width="3" stroke-linecap="round"/><path d="M 31 76 L 41 79" stroke="#fbbf24" stroke-width="2.5"/>`;
    } else if (c.item === 'watch') {
        extraHtml = `<circle cx="36" cy="79" r="5" fill="#fde047" stroke="#b45309" stroke-width="1.2"/><path d="M 36 74 Q 44 68 48 76" stroke="#fde047" stroke-width="0.9" fill="none"/>`;
    } else if (c.item === 'crown') {
        extraHtml = `<path d="M 45 22 L 49 16 L 54 21 L 59 16 L 63 22 Z" fill="#fef08a" stroke="#ca8a04" stroke-width="1"/>`;
    }

    return `
    <div class="${sizeClass} rounded-lg overflow-hidden border border-amber-500/60 shadow-inner flex-shrink-0 bg-slate-950 relative">
        <svg viewBox="0 0 100 115" class="w-full h-full block">
            <defs>
                <linearGradient id="bg_${uid}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${c.bgTop}"/>
                    <stop offset="100%" stop-color="${c.bgBot}"/>
                </linearGradient>
                <linearGradient id="uni_${uid}" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#1e293b"/>
                    <stop offset="100%" stop-color="#0f172a"/>
                </linearGradient>
            </defs>
            <rect width="100" height="115" fill="url(#bg_${uid})"/>
            <line x1="0" y1="25" x2="45" y2="48" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
            <line x1="100" y1="20" x2="60" y2="48" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
            <circle cx="78" cy="14" r="5" fill="#fef08a" opacity="0.65"/>
            <rect x="0" y="95" width="100" height="20" fill="rgba(15,23,42,0.55)"/>
            <path d="M 31 44 C 26 62 32 76 38 78 L 68 78 C 74 74 78 60 73 44 Z" fill="${c.hairDark}"/>
            <path d="M 22 115 L 28 76 C 32 72 42 70 53 70 C 64 70 74 72 78 76 L 84 115 Z" fill="url(#uni_${uid})" stroke="#334155" stroke-width="1"/>
            <rect x="27" y="72" width="13" height="4" rx="1.5" fill="#fbbf24" transform="rotate(-12 27 72)"/>
            <rect x="66" y="70" width="13" height="4" rx="1.5" fill="#fbbf24" transform="rotate(12 66 70)"/>
            <rect x="46" y="66" width="14" height="8" rx="2" fill="#0f172a" stroke="#fbbf24" stroke-width="0.9"/>
            <circle cx="44" cy="83" r="2.2" fill="#fbbf24"/>
            <circle cx="60" cy="83" r="2.2" fill="#fbbf24"/>
            <circle cx="43" cy="94" r="2.2" fill="#fbbf24"/>
            <circle cx="61" cy="94" r="2.2" fill="#fbbf24"/>
            <circle cx="42" cy="105" r="2.2" fill="#fbbf24"/>
            <circle cx="62" cy="105" r="2.2" fill="#fbbf24"/>
            <rect x="48" y="60" width="10" height="9" fill="#f3c69f"/>
            <path d="M 36 44 C 36 58 43 66 53 66 C 63 66 70 58 70 44 C 70 32 36 32 36 44 Z" fill="#fde0c3"/>
            ${eyesHtml}
            ${mouthHtml}
            <path d="M 33 44 C 33 28 73 28 73 44 C 73 52 69 62 65 68 C 67 56 66 46 61 42 C 56 48 48 50 42 44 C 39 50 39 58 43 64 C 36 58 33 50 33 44 Z" fill="${c.hair}" stroke="${c.hairDark}" stroke-width="0.8"/>
            <ellipse cx="53" cy="24" rx="25" ry="11" fill="#1e293b" stroke="#0f172a" stroke-width="1.2"/>
            <path d="M 31 27 Q 53 33 75 27 L 73 33 Q 53 39 33 33 Z" fill="#0f172a" stroke="#fbbf24" stroke-width="0.8"/>
            <path d="M 34 33 Q 53 40 72 33 Q 53 36 34 33 Z" fill="#020617"/>
            <polygon points="53,20 57,24 53,28 49,24" fill="#fbbf24" stroke="#78350f" stroke-width="0.6"/>
            <ellipse cx="74" cy="95" rx="6" ry="5" fill="#e2e8f0" stroke="#94a3b8" stroke-width="0.8"/>
            <circle cx="77" cy="104" r="7" fill="#b45309" stroke="#fbbf24" stroke-width="1.2"/>
            <circle cx="77" cy="104" r="4.5" fill="#fef9c3"/>
            ${extraHtml}
        </svg>
    </div>`;
}

// 敵ユニットテンプレート（通常敵＋勢力ボス46種＋天候特殊ボス4種）
const ENEMY_TYPES = {
    infantry: { id: 'infantry', name: '機械化歩兵部隊', attr: 'LAND', hp: 210, speed: 1.05, reward: 16, damage: 18, color: '#a3e635', radius: 11 },
    tank: { id: 'tank', name: '主力重戦車', attr: 'LAND', hp: 720, speed: 0.62, reward: 32, damage: 40, color: '#65a30d', radius: 16 },
    jet: { id: 'jet', name: '制空戦闘攻撃機', attr: 'AIR', hp: 290, speed: 1.75, reward: 22, damage: 24, color: '#38bdf8', radius: 13 },
    gunship: { id: 'gunship', name: '重武装攻撃ヘリ', attr: 'AIR', hp: 540, speed: 1.15, reward: 28, damage: 32, color: '#0284c7', radius: 15 },
    destroyer: { id: 'destroyer', name: '沿海域駆逐艦', attr: 'SEA', hp: 880, speed: 0.72, reward: 36, damage: 45, color: '#2dd4bf', radius: 18 },

    // 天候特殊ボス（4種）
    wboss_clear: { id: 'wboss_clear', name: '【天候ボス】灼熱の太陽機神・ヘリオス', attr: 'AIR', hp: 3780, speed: 0.34, reward: 320, damage: 117, color: '#fbbf24', radius: 38, isBoss: true, isWeatherBoss: true, weatherKey: 'clear' },
    wboss_rain:  { id: 'wboss_rain',  name: '【天候ボス】豪雨の深海巨獣・レヴィアタン', attr: 'SEA', hp: 4140, speed: 0.32, reward: 340, damage: 126, color: '#38bdf8', radius: 40, isBoss: true, isWeatherBoss: true, weatherKey: 'rain' },
    wboss_snow:  { id: 'wboss_snow',  name: '【天候ボス】氷結の白銀機竜・フェンリル', attr: 'LAND', hp: 4050, speed: 0.36, reward: 340, damage: 122, color: '#67e8f9', radius: 38, isBoss: true, isWeatherBoss: true, weatherKey: 'snow' },
    wboss_storm: { id: 'wboss_storm', name: '【天候ボス】雷嵐の天空裁定者・インドラ', attr: 'AIR', hp: 4500, speed: 0.35, reward: 380, damage: 140, color: '#c084fc', radius: 42, isBoss: true, isWeatherBoss: true, weatherKey: 'storm' },

    pol_mid: { id: 'pol_mid', name: '【中ボス】機動隊重装放水戦車ライオット', attr: 'LAND', hp: 1215, speed: 0.44, reward: 95, damage: 43, color: '#38bdf8', radius: 28, isBoss: true },
    pol_final: { id: 'pol_final', name: '【大ボス】国連治安維持司令・ケルベロス', attr: 'LAND', hp: 2880, speed: 0.36, reward: 260, damage: 86, color: '#60a5fa', radius: 36, isBoss: true, isGrandBoss: true },

    un_mid: { id: 'un_mid', name: '【中ボス】陸上巡洋戦艦ベヒーモス', attr: 'LAND', hp: 3960, speed: 0.38, reward: 180, damage: 126, color: '#f97316', radius: 32, isBoss: true },
    un_n10: { id: 'un_n10', name: '【ネームド】空母機動艦隊司令・提督ネルソン', attr: 'SEA', hp: 9450, speed: 0.34, reward: 400, damage: 207, color: '#14b8a6', radius: 38, isBoss: true },
    un_n20: { id: 'un_n20', name: '【ネームド】天空の覇者・ヴァルキュリア隊長', attr: 'AIR', hp: 16650, speed: 0.48, reward: 720, damage: 306, color: '#60a5fa', radius: 34, isBoss: true },
    un_final: { id: 'un_final', name: '【大ボス】国連軌道防衛総司令・メタトロン', attr: 'AIR', hp: 27600, speed: 0.28, reward: 1800, damage: 522, color: '#f43f5e', radius: 44, isBoss: true, isGrandBoss: true },

    usa_mid: { id: 'usa_mid', name: '【中ボス】M1X2 エイブラムス・タイタン', attr: 'LAND', hp: 5040, speed: 0.42, reward: 220, damage: 144, color: '#3b82f6', radius: 32, isBoss: true },
    usa_n10: { id: 'usa_n10', name: '【ネームド】超原子力空母ルーズベルト', attr: 'SEA', hp: 11250, speed: 0.34, reward: 480, damage: 225, color: '#2563eb', radius: 40, isBoss: true },
    usa_n20: { id: 'usa_n20', name: '【ネームド】ステルス戦略爆撃機 B-21X', attr: 'AIR', hp: 19800, speed: 0.52, reward: 850, damage: 324, color: '#60a5fa', radius: 36, isBoss: true },
    usa_final: { id: 'usa_final', name: '【大ボス】自由の軌道決戦要塞・リバティプライム', attr: 'LAND', hp: 48600, speed: 0.26, reward: 2200, damage: 558, color: '#ef4444', radius: 46, isBoss: true, isGrandBoss: true },

    chn_mid: { id: 'chn_mid', name: '【中ボス】99式改・炎龍重戦車', attr: 'LAND', hp: 5850, speed: 0.4, reward: 270, damage: 158, color: '#dc2626', radius: 32, isBoss: true },
    chn_n10: { id: 'chn_n10', name: '【ネームド】電磁カタパルト巨艦・遼寧改', attr: 'SEA', hp: 12780, speed: 0.34, reward: 580, damage: 252, color: '#ef4444', radius: 40, isBoss: true },
    chn_n20: { id: 'chn_n20', name: '【ネームド】極超音速戦略機・神龍（シェンロン）', attr: 'AIR', hp: 22950, speed: 0.56, reward: 980, damage: 360, color: '#f59e0b', radius: 36, isBoss: true },
    chn_final: { id: 'chn_final', name: '【大ボス】大陸横断軌道レールガン・天帝', attr: 'LAND', hp: 57600, speed: 0.24, reward: 2600, damage: 612, color: '#fbbf24', radius: 46, isBoss: true, isGrandBoss: true },

    isl_mid: { id: 'isl_mid', name: '【中ボス】砂漠の重機動要塞・イフリート', attr: 'LAND', hp: 6660, speed: 0.45, reward: 310, damage: 171, color: '#10b981', radius: 32, isBoss: true },
    isl_n10: { id: 'isl_n10', name: '【ネームド】紅海艦隊総旗艦・サラディン', attr: 'SEA', hp: 14400, speed: 0.36, reward: 660, damage: 270, color: '#059669', radius: 40, isBoss: true },
    isl_n20: { id: 'isl_n20', name: '【ネームド】砂塵の巨鳥・ロック鳥重爆撃機', attr: 'AIR', hp: 25650, speed: 0.5, reward: 1100, damage: 387, color: '#fbbf24', radius: 38, isBoss: true },
    isl_final: { id: 'isl_final', name: '【大ボス】黄金の空中宮殿・バビロン・コア', attr: 'AIR', hp: 67500, speed: 0.26, reward: 3200, damage: 666, color: '#f59e0b', radius: 48, isBoss: true, isGrandBoss: true },

    rus_mid: { id: 'rus_mid', name: '【中ボス】超重自走列車砲・ドーラ改', attr: 'LAND', hp: 7920, speed: 0.36, reward: 380, damage: 189, color: '#94a3b8', radius: 34, isBoss: true },
    rus_n10: { id: 'rus_n10', name: '【ネームド】重原子力巡洋戦艦・ピョートル大帝', attr: 'SEA', hp: 16650, speed: 0.32, reward: 780, damage: 297, color: '#38bdf8', radius: 40, isBoss: true },
    rus_n20: { id: 'rus_n20', name: '【ネームド】超重戦略爆撃機・ツァーリ', attr: 'AIR', hp: 28800, speed: 0.46, reward: 1300, damage: 432, color: '#e2e8f0', radius: 38, isBoss: true },
    rus_final: { id: 'rus_final', name: '【大ボス】冬将軍・氷結軌道要塞モローズ', attr: 'AIR', hp: 77400, speed: 0.24, reward: 3800, damage: 738, color: '#7dd3fc', radius: 48, isBoss: true, isGrandBoss: true },

    eu_mid: { id: 'eu_mid', name: '【中ボス】レオパルト3X・パラディン', attr: 'LAND', hp: 9180, speed: 0.44, reward: 450, damage: 216, color: '#6366f1', radius: 34, isBoss: true },
    eu_n10: { id: 'eu_n10', name: '【ネームド】超大型強襲揚陸艦・シャルルマーニュ', attr: 'SEA', hp: 19350, speed: 0.34, reward: 920, damage: 333, color: '#818cf8', radius: 42, isBoss: true },
    eu_n20: { id: 'eu_n20', name: '【ネームド】成層圏迎撃機・エクスカリバー', attr: 'AIR', hp: 33300, speed: 0.58, reward: 1500, damage: 468, color: '#c084fc', radius: 38, isBoss: true },
    eu_final: { id: 'eu_final', name: '【大ボス】円卓軌道防衛システム・アーサー王', attr: 'AIR', hp: 94500, speed: 0.28, reward: 4500, damage: 855, color: '#fbbf24', radius: 50, isBoss: true, isGrandBoss: true },

    ter_mid: { id: 'ter_mid', name: '【中ボス】軌道降下重機甲・ガイア・タイタン', attr: 'LAND', hp: 12150, speed: 0.45, reward: 580, damage: 261, color: '#22d3ee', radius: 36, isBoss: true },
    ter_n10: { id: 'ter_n10', name: '【ネームド】成層圏浮遊戦艦・テラ・インヴィクタ', attr: 'SEA', hp: 25200, speed: 0.35, reward: 1200, damage: 396, color: '#06b6d4', radius: 44, isBoss: true },
    ter_n20: { id: 'ter_n20', name: '【ネームド】恒星間迎撃機・アストラル・セイバー', attr: 'AIR', hp: 43200, speed: 0.62, reward: 1950, damage: 549, color: '#67e8f9', radius: 40, isBoss: true },
    ter_final: { id: 'ter_final', name: '【大ボス】地球惑星連邦最高防衛中枢・ユグドラシル', attr: 'AIR', hp: 130500, speed: 0.28, reward: 6000, damage: 1035, color: '#34d399', radius: 52, isBoss: true, isGrandBoss: true },

    // 世界企業連合
    corp_mid: { id: 'corp_mid', name: '【中ボス】民間警備自律重機・タイタンPM-9', attr: 'LAND', hp: 16650, speed: 0.48, reward: 780, damage: 324, color: '#eab308', radius: 36, isBoss: true },
    corp_n10: { id: 'corp_n10', name: '【ネームド】海上データセンター巨艦・ネオ・アトランティス', attr: 'SEA', hp: 34200, speed: 0.36, reward: 1650, damage: 495, color: '#f59e0b', radius: 44, isBoss: true },
    corp_n20: { id: 'corp_n20', name: '【ネームド】成層圏アルゴリズム衛星・オラクルX', attr: 'AIR', hp: 58500, speed: 0.64, reward: 2600, damage: 684, color: '#fde047', radius: 42, isBoss: true },
    corp_final: { id: 'corp_final', name: '【大ボス】世界企業連合最高取締役AI・クロノスCEO', attr: 'AIR', hp: 175500, speed: 0.30, reward: 8200, damage: 1305, color: '#fbbf24', radius: 54, isBoss: true, isGrandBoss: true },

    // Gewinner（企業連合と同時に出現する過激テロリスト組織）
    gew_mid: { id: 'gew_mid', name: '【中ボス】ゲヴィナー爆装自走列車・ファントム', attr: 'LAND', hp: 18450, speed: 0.52, reward: 860, damage: 369, color: '#f43f5e', radius: 36, isBoss: true },
    gew_n10: { id: 'gew_n10', name: '【ネームド】深海隠密強襲潜航艦・リヴァイアサン黒', attr: 'SEA', hp: 37800, speed: 0.40, reward: 1850, damage: 558, color: '#e11d48', radius: 44, isBoss: true },
    gew_n20: { id: 'gew_n20', name: '【ネームド】成層圏ジャミング母艦・イクリプス', attr: 'AIR', hp: 64800, speed: 0.66, reward: 2900, damage: 765, color: '#fb7185', radius: 42, isBoss: true },
    gew_final: { id: 'gew_final', name: '【大ボス】Gewinner最高指導者・黒衣のヴィクター', attr: 'LAND', hp: 198000, speed: 0.34, reward: 9500, damage: 1485, color: '#ef4444', radius: 54, isBoss: true, isGrandBoss: true },

    // Gewinner南極基地（全ビーコンキー所持で解放）
    ant_mid: { id: 'ant_mid', name: '【中ボス】南極氷床掘削重機・ヨルムンガンド', attr: 'LAND', hp: 25200, speed: 0.50, reward: 1200, damage: 468, color: '#38bdf8', radius: 38, isBoss: true },
    ant_n10: { id: 'ant_n10', name: '【ネームド】氷海砕氷核ミサイル艦・ニヴルヘイム', attr: 'SEA', hp: 52200, speed: 0.38, reward: 2500, damage: 711, color: '#0284c7', radius: 46, isBoss: true },
    ant_n20: { id: 'ant_n20', name: '【ネームド】極光次元干渉機・ラグナロク・ゼロ', attr: 'AIR', hp: 86400, speed: 0.68, reward: 3900, damage: 972, color: '#818cf8', radius: 44, isBoss: true },
    ant_final: { id: 'ant_final', name: '【大ボス】南極次元ゲート守護神・アポフィスΩ', attr: 'AIR', hp: 261000, speed: 0.32, reward: 13000, damage: 1890, color: '#c084fc', radius: 58, isBoss: true, isGrandBoss: true },

    // 新勢力：暗黒世界最初の勢力「Gewinnerビーコン基地」
    gwb_mid: { id: 'gwb_mid', name: '【暗黒中ボス】反転次元哨戒戦車・タナトス', attr: 'LAND', hp: 31500, speed: 0.52, reward: 1550, damage: 576, color: '#f43f5e', radius: 38, isBoss: true },
    gwb_n10: { id: 'gwb_n10', name: '【暗黒ネームド】黒海次元潜航母艦・エレボス', attr: 'SEA', hp: 64800, speed: 0.40, reward: 3100, damage: 864, color: '#a855f7', radius: 46, isBoss: true },
    gwb_n20: { id: 'gwb_n20', name: '【暗黒ネームド】異次元ビーコン防衛衛星・アザトース', attr: 'AIR', hp: 106200, speed: 0.68, reward: 4800, damage: 1188, color: '#e879f9', radius: 44, isBoss: true },
    gwb_final: { id: 'gwb_final', name: '【暗黒大ボス】Gewinnerビーコン基地総司令・暗黒卿ヴィクターΩ', attr: 'AIR', hp: 324000, speed: 0.34, reward: 16500, damage: 2250, color: '#f43f5e', radius: 58, isBoss: true, isGrandBoss: true },

    // 暗黒世界・クリフォト中枢
    drk_mid: { id: 'drk_mid', name: '【暗黒中ボス】深淵の黒鉄装甲獣・ベヒモス・オルタ', attr: 'LAND', hp: 43200, speed: 0.54, reward: 2200, damage: 792, color: '#a855f7', radius: 40, isBoss: true },
    drk_n10: { id: 'drk_n10', name: '【暗黒ネームド】虚無海溝の魔艦・カオス・アビス', attr: 'SEA', hp: 88200, speed: 0.42, reward: 4300, damage: 1170, color: '#9333ea', radius: 48, isBoss: true },
    drk_n20: { id: 'drk_n20', name: '【暗黒ネームド】堕天の黒翼熾天使・ルシファー・ノワール', attr: 'AIR', hp: 148500, speed: 0.72, reward: 6600, damage: 1602, color: '#e879f9', radius: 46, isBoss: true },
    drk_final: { id: 'drk_final', name: '【暗黒大ボス】暗黒世界統治神・クリフォトの王', attr: 'AIR', hp: 468000, speed: 0.35, reward: 24000, damage: 3060, color: '#f43f5e', radius: 60, isBoss: true, isGrandBoss: true }
};

// 各大ボスの固有特性。属性相性とは別に、攻略のリズムを変える修飾効果を持たせる。
// 無効化・必須装備のような「これが無いと倒せない」設計は避け、数値と挙動の差で個性を出す。
const BOSS_TRAITS = {
    pol_final: {
        name: '鎮圧装甲', desc: '被ダメージ -20%。硬いが攻撃間隔は標準。',
        damageTakenMult: 0.80
    },
    un_final: {
        name: '軌道修復', desc: '5秒ごとに最大HPの1.5%を自己修復。継続火力が有効。',
        regenPct: 0.015, regenInterval: 300
    },
    usa_final: {
        name: '絨毯爆撃', desc: '攻撃力 +40%。ただし攻撃間隔は25%長い。',
        contactDmgMult: 1.40, attackIntervalMult: 1.25
    },
    chn_final: {
        name: '龍脈暴走', desc: 'HP50%以下で攻撃力 +60% / 移動速度 +30%。',
        enrageHp: 0.50, enrageAtkMult: 1.60, enrageSpeedMult: 1.30
    },
    isl_final: {
        name: '太陽炉', desc: '受けたダメージの8%を反射する。大技の連発は危険。',
        reflectPct: 0.08
    },
    rus_final: {
        name: '絶対零度', desc: '被ダメージ -15% / 移動速度 -15%。',
        damageTakenMult: 0.85, speedMult: 0.85
    },
    eu_final: {
        name: '円卓の加護', desc: '8秒ごとに最大HPの2%を自己修復。',
        regenPct: 0.02, regenInterval: 480
    },
    ter_final: {
        name: '惑星中枢', desc: '被ダメージ -25% / 移動速度 -20%。',
        damageTakenMult: 0.75, speedMult: 0.80
    },
    corp_final: {
        name: '市場支配', desc: '攻撃力 +25% / 撃破時に得られる資金 -20%。',
        contactDmgMult: 1.25, rewardMult: 0.80
    },
    gew_final: {
        name: 'ゲリラ戦術', desc: '攻撃間隔 -25%（攻撃回数が増える）。',
        attackIntervalMult: 0.75
    },
    ant_final: {
        name: '次元召喚', desc: '12秒ごとに通常敵を1体召喚する（最大3体）。',
        summonInterval: 720, summonType: 'infantry', summonMax: 3
    },
    gwb_final: {
        name: '反転装甲', desc: '被ダメージ -15% / HP50%以下で攻撃力 +50%。',
        damageTakenMult: 0.85, enrageHp: 0.50, enrageAtkMult: 1.50
    },
    drk_final: {
        name: '虚無の帳', desc: '被ダメージ -20% / 8秒ごとに2%回復 / HP40%以下で攻撃力 +80%。',
        damageTakenMult: 0.80, regenPct: 0.02, regenInterval: 480,
        enrageHp: 0.40, enrageAtkMult: 1.80
    }
};


// 全13大ボスの固有特別必殺技マスターデータ（出現時＆一定時間経過で定期発動）
const GRAND_BOSS_ULTIMATES = {
    pol_final: {
        name: '三連装高圧鎮圧斉射',
        style: 'missiles',
        color: '#60a5fa',
        secondaryColor: '#93c5fd',
        interval: 340,
        dmgMult: 1.55,
        healRatio: 0,
        entranceQuote: '「警備コードΩ発動！暴走列車アイン・ソフ・オウルを強制停止させる！」',
        castQuote: '「三連装鎮圧砲、一斉掃射！」'
    },
    un_final: {
        name: '軌道衛星・審判光線（メタトロン・レイ）',
        style: 'beam',
        color: '#fbbf24',
        secondaryColor: '#f43f5e',
        interval: 360,
        dmgMult: 1.75,
        healRatio: 0,
        entranceQuote: '「軌道防衛リング展開完了――旧秩序の裁きをその鋼鉄の車体に刻め！」',
        castQuote: '「全光翼収束……軌道衛星・審判光線照射！」'
    },
    usa_final: {
        name: '星条戦術核ミサイル絨毯爆撃',
        style: 'missiles',
        color: '#ef4444',
        secondaryColor: '#3b82f6',
        interval: 350,
        dmgMult: 1.80,
        healRatio: 0,
        entranceQuote: '「自由の要塞リバティプライム起動！反逆の鉄道共和国を灰燼に帰す！」',
        castQuote: '「肩部サイロ全門開放――戦術ミサイル絨毯爆撃！」'
    },
    chn_final: {
        name: '大陸横断超電磁レールガン・龍咆',
        style: 'beam',
        color: '#fbbf24',
        secondaryColor: '#dc2626',
        interval: 360,
        dmgMult: 1.90,
        healRatio: 0,
        entranceQuote: '「天帝の軌道砲台、照準完了！大陸の鉄路を支配するのは我らなり！」',
        castQuote: '「龍脈リアクター臨界――超電磁レールガン発射！」'
    },
    isl_final: {
        name: '黄金太陽炉コロナ・フレア',
        style: 'nova',
        color: '#f59e0b',
        secondaryColor: '#fef08a',
        interval: 370,
        dmgMult: 1.70,
        healRatio: 0.08,
        entranceQuote: '「バビロンの空中宮殿が天を覆う――太陽炉の劫火に焼かれよ！」',
        castQuote: '「太陽炉出力最大――コロナ・フレア＆自己修復！」'
    },
    rus_final: {
        name: '絶対零度ブリザード・ノヴァ',
        style: 'nova',
        color: '#38bdf8',
        secondaryColor: '#e0f2fe',
        interval: 360,
        dmgMult: 1.85,
        healRatio: 0,
        entranceQuote: '「極寒の冬将軍が降臨した――貴様らの蒸気も機関も凍りつかせてやろう！」',
        castQuote: '「六角氷晶展開――絶対零度ブリザード・ノヴァ！」'
    },
    eu_final: {
        name: '聖剣エクスカリバー・円卓天断',
        style: 'beam',
        color: '#fde047',
        secondaryColor: '#818cf8',
        interval: 350,
        dmgMult: 1.95,
        healRatio: 0,
        entranceQuote: '「円卓の12星よ、集え！聖剣の光をもって鉄の簒奪者を両断せん！」',
        castQuote: '「聖剣エクスカリバー抜刀――天断一閃！」'
    },
    ter_final: {
        name: '世界樹終末ジャッジメント・レイ',
        style: 'beam',
        color: '#34d399',
        secondaryColor: '#22d3ee',
        interval: 360,
        dmgMult: 2.00,
        healRatio: 0.08,
        entranceQuote: '「地球惑星連邦最高防衛中枢ユグドラシル覚醒――全人類の名において排除する！」',
        castQuote: '「恒星炉同期完了――終末ジャッジメント照射！」'
    },
    corp_final: {
        name: '黄金アルゴリズム軌道飽和爆撃',
        style: 'missiles',
        color: '#eab308',
        secondaryColor: '#fef08a',
        interval: 340,
        dmgMult: 1.95,
        healRatio: 0,
        entranceQuote: '「損益演算完了。アイン・ソフ・オウルは企業連合の資産価値を毀損する不良債権――即時償却する！」',
        castQuote: '「市場清算プロトコル――黄金軌道飽和爆撃！」'
    },
    gew_final: {
        name: '異次元振動クラスター殲滅爆撃',
        style: 'missiles',
        color: '#f43f5e',
        secondaryColor: '#fda4af',
        interval: 330,
        dmgMult: 2.05,
        healRatio: 0,
        entranceQuote: '「私がGewinner最高指導者ヴィクターだ！旧世界の瓦礫の上で踊り狂え、アイン・ソフ・オウル！」',
        castQuote: '「黒曜起爆装置連動――振動クラスター連続投下！」'
    },
    ant_final: {
        name: '南極次元ゲート崩壊・重力波',
        style: 'nova',
        color: '#c084fc',
        secondaryColor: '#38bdf8',
        interval: 350,
        dmgMult: 2.10,
        healRatio: 0.08,
        entranceQuote: '「南極次元ゲートの守護神アポフィスΩ起動――異次元への扉は貴様らの墓標となる！」',
        castQuote: '「次元境界臨界――ゲート崩壊・重力衝撃波！」'
    },
    gwb_final: {
        name: '反転ビーコン・オメガ次元光線',
        style: 'beam',
        color: '#f43f5e',
        secondaryColor: '#e879f9',
        interval: 340,
        dmgMult: 2.15,
        healRatio: 0.06,
        entranceQuote: '「暗黒世界へようこそ、アイン・ソフ・オウル！反転次元ビーコンの無限エネルギーで消滅させてやろう！」',
        castQuote: '「反転ビーコン全開――オメガ次元収束光線！」'
    },
    drk_final: {
        name: 'クリフォト深淵・終焉の黙示録',
        style: 'nova',
        color: '#e879f9',
        secondaryColor: '#f43f5e',
        interval: 330,
        dmgMult: 2.30,
        healRatio: 0.10,
        entranceQuote: '「セフィロトの樹の逆位にして暗黒世界の王――クリフォトの深淵が貴様らの鉄路を飲み込む！」',
        castQuote: '「生命の樹の反転――終焉の黙示録発動！」'
    }
};

// ボス図鑑用 機体解説データ
const BOSS_LORE = {
    wboss_clear: { rank: '☀️ 晴天特殊ボス (3%出現)', lore: '雲一つない晴天時に高高度太陽光を集束して降臨する灼熱の自律太陽機神。撃破すると「晴天の太陽集光鏡」をドロップする。' },
    wboss_rain:  { rank: '🌧️ 雨天特殊ボス (3%出現)', lore: '豪雨とともに海面から浮上する超巨大水陸両用機械海獣。撃破すると「雨天の海神羅針盤」をドロップする。' },
    wboss_snow:  { rank: '❄️ 雪天特殊ボス (3%出現)', lore: '吹雪の戦場に現れる絶対零度装甲の白銀機竜。撃破すると「雪天の白銀氷晶核」をドロップする。' },
    wboss_storm: { rank: '⛈️ 嵐天特殊ボス (3%出現)', lore: '雷鳴と暴風を纏い成層圏から降下する天空の雷神兵器。撃破すると「嵐天の雷鳴避雷針」をドロップする。' },

    pol_mid: { rank: '中ボス (STAGE 5)', lore: '暴動鎮圧用に配備された国連警察の重装甲車。高圧放水砲と催涙弾ランチャーを備え、列車の進行阻止を試みる。' },
    pol_final: { rank: '大ボス (STAGE 10)', lore: '国連警察特務部隊の指揮戦車。出現時と一定時間ごとに必殺技【三連装高圧鎮圧斉射】を発動する。' },
    un_mid: { rank: '中ボス (STAGE 5/15/25)', lore: '旧国連軍が誇る多輪駆動式の超重装移動要塞。二段構えの連装巨砲塔を備え、線路上の障害物を強行突破する。' },
    un_n10: { rank: 'ネームド (STAGE 10)', lore: '国連第七艦隊を率いる名将ネルソンが座乗する超大型空母。広大な飛行甲板から絶え間なく艦載機を発艦させる。' },
    un_n20: { rank: 'ネームド (STAGE 20)', lore: '青白いプラズマ推進器と前進翼を備えたカスタム超音速機。音速を超える機動で対空砲火を掻い潜る空の覇者。' },
    un_final: { rank: '大ボス (STAGE 30)', lore: '国連軌道防衛軍の最終決戦兵器。出現時と時間経過で必殺技【軌道衛星・審判光線】を放ち広域を焼灼する。' },
    usa_mid: { rank: '中ボス (STAGE 5/15/25)', lore: '第4世代主力戦車を発展させた超重戦車。複合ERA装甲と大型レールガン砲塔を搭載し、正面突破を主任務とする。' },
    usa_n10: { rank: 'ネームド (STAGE 10)', lore: '原子力機関を4基搭載した超大国海軍の象徴。アングルドデッキを備えた洋上の移動航空基地。' },
    usa_n20: { rank: 'ネームド (STAGE 20)', lore: 'レーダー反射率を極限まで低減した全翼ステルス戦略爆撃機。成層圏から精密誘導爆弾の雨を降らせる。' },
    usa_final: { rank: '大ボス (STAGE 30)', lore: '自由の守護神を模した超巨大二足歩行要塞。必殺技【星条戦術核ミサイル絨毯爆撃】で戦場全体を爆撃する。' },
    chn_mid: { rank: '中ボス (STAGE 5/15/25)', lore: '真紅と黄金の龍紋装甲を纏う大陸の重戦車。高初速滑腔砲による圧倒的な貫通力で装甲車両を粉砕する。' },
    chn_n10: { rank: 'ネームド (STAGE 10)', lore: '3基の電磁カタパルトを備えた次世代巨艦。艦首から発せられる電磁パルスと艦載機波状攻撃を得意とする。' },
    chn_n20: { rank: 'ネームド (STAGE 20)', lore: '極超音速滑空飛翔体を母機化した戦略機。黄金のプラズマ尾翼を曳きながらマッハ10で戦場を駆け抜ける。' },
    chn_final: { rank: '大ボス (STAGE 30)', lore: '龍の顎を模した上下二連装の超大型軌道レールガン。必殺技【大陸横断超電磁レールガン・龍咆】で一撃必殺の砲撃を行う。' },
    isl_mid: { rank: '中ボス (STAGE 5/15/25)', lore: '砂塵の戦場を制するエメラルドと黄金の移動要塞。ドーム型重装甲と尖塔型長距離砲塔を併せ持つ。' },
    isl_n10: { rank: 'ネームド (STAGE 10)', lore: '三日月型の鋭い衝角艦首を持つ紅海艦隊総旗艦。黄金の装甲板はあらゆる熱線兵器を反射する。' },
    isl_n20: { rank: 'ネームド (STAGE 20)', lore: '伝説の巨鳥の名を冠した全翼重爆撃機。広大な翼面積による高高度滞空能力と絨毯爆撃能力を持つ。' },
    isl_final: { rank: '大ボス (STAGE 30)', lore: '黄金の空中宮殿。必殺技【黄金太陽炉コロナ・フレア】で熱線波動を放ち同時に自身の装甲を修復する。' },
    rus_mid: { rank: '中ボス (STAGE 5/15/25)', lore: '極寒の鉄路を支配する超重自走列車砲。無骨な多重鋼鉄ブロックと口径800mmの極太巨砲で全てを吹き飛ばす。' },
    rus_n10: { rank: 'ネームド (STAGE 10)', lore: '多段ピラミッド型艦橋を持つ重原子力巡洋戦艦。飽和攻撃用の対艦ミサイルサイロを無数に内蔵する。' },
    rus_n20: { rank: 'ネームド (STAGE 20)', lore: '「白い白鳥」の異名を持つ可変翼超重戦略爆撃機。圧倒的な積載量と航続距離を誇る空中戦艦。' },
    rus_final: { rank: '大ボス (STAGE 30)', lore: '絶対零度の六角氷晶シールドを展開する軌道要塞。必殺技【絶対零度ブリザード・ノヴァ】で戦場全体を凍結させる。' },
    eu_mid: { rank: '中ボス (STAGE 5/15/25)', lore: '中世騎士の盾を模した複合傾斜装甲を持つ最新鋭戦車。精密な火器管制システムと高出力砲を搭載する。' },
    eu_n10: { rank: 'ネームド (STAGE 10)', lore: '欧州連合艦隊の中核を担う超大型強襲揚陸艦。黄金の指揮艦橋から全戦域の統合戦術指揮を執る。' },
    eu_n20: { rank: 'ネームド (STAGE 20)', lore: '聖剣を模した十字クロスシルエットの成層圏迎撃機。機首の光学ブレードで敵防空網を一直線に切り裂く。' },
    eu_final: { rank: '大ボス (STAGE 30)', lore: '12の黄金星が巡る円卓防衛システム。必殺技【聖剣エクスカリバー・円卓天断】で黄金の聖剣光線を叩き込む。' },
    ter_mid: { rank: '中ボス (STAGE 5/15/25)', lore: '地球惑星連邦軍が軌道エレベーターから直接投下する重力制御式超重機甲。二連装プラズマ砲と反重力装甲を備える。' },
    ter_n10: { rank: 'ネームド (STAGE 10)', lore: '低軌道から海面スレスレまで自在に航行する成層圏浮遊戦艦。連装荷電粒子砲と波動防壁を誇る連邦艦隊の象徴。' },
    ter_n20: { rank: 'ネームド (STAGE 20)', lore: '縮退炉推進器と光の翼を備えた次世代軌道迎撃機。大気圏内外を問わず極超音速で目標を両断する。' },
    ter_final: { rank: '大ボス (STAGE 30)', lore: '地球惑星連邦最高防衛中枢。必殺技【世界樹終末ジャッジメント・レイ】で審判の光線を照射し自己再生する。' },

    corp_mid: { rank: '中ボス (STAGE 5/15/25)', lore: '国家警察解体後にメガテック企業が量産した自律型重警備ロボット戦車。株主利益の最大化のみを目的として無慈悲に砲火を浴びせる。' },
    corp_n10: { rank: 'ネームド (STAGE 10)', lore: '公海上に建造された巨大浮遊サーバー＆重武装旗艦。世界中の金融・軍事ネットワークを演算しながら艦隊を遠隔指揮する。' },
    corp_n20: { rank: 'ネームド (STAGE 20)', lore: 'テック右派オリガルヒが私財を投じて打ち上げた低軌道予測アルゴリズム攻撃機。敵の回避行動を0.01秒単位で先読みする。' },
    corp_final: { rank: '大ボス (STAGE 30)', lore: '世界企業連合最高取締役AI。必殺技【黄金アルゴリズム軌道飽和爆撃】で精密誘導弾幕を浴びせる。' },

    gew_mid: { rank: '中ボス (STAGE 5/15/25)', lore: '企業連合の正規軍から奪取した列車砲を魔改造したゲヴィナーの爆装突撃車両。自爆特攻ドローンと高威力榴弾をばら撒く。' },
    gew_n10: { rank: 'ネームド (STAGE 10)', lore: 'ソナー探知を無効化する特殊黒色装甲を纏ったゲヴィナーの隠密強襲艦。海中から突然浮上し魚雷の雨を浴びせる。' },
    gew_n20: { rank: 'ネームド (STAGE 20)', lore: '世界企業連合の衛星網をハッキングして奪い取った大型電子戦母艦。戦場全体に強力な妨害電磁波を放射する。' },
    gew_final: { rank: '大ボス (STAGE 30)', lore: 'テロ組織Gewinner最高指導者ヴィクター。必殺技【異次元振動クラスター殲滅爆撃】で前線全体を粉砕する。' },

    ant_mid: { rank: '中ボス (STAGE 5/15/25)', lore: '南極永久凍土の深層遺跡を発掘するために建造された超巨大ドリル重戦車。氷塊ごと敵陣を粉砕する。' },
    ant_n10: { rank: 'ネームド (STAGE 10)', lore: '厚さ10メートルの氷盤を砕きながら進軍する原子力砕氷ミサイル巡洋艦。極低温弾頭による広域凍結攻撃を行う。' },
    ant_n20: { rank: 'ネームド (STAGE 20)', lore: '南極基地の地下遺跡から発掘された異次元エネルギー機関を搭載した試作機。空間を歪めながら高速飛翔する。' },
    ant_final: { rank: '大ボス (STAGE 30)', lore: '南極次元ゲート守護神。必殺技【南極次元ゲート崩壊・重力波】で空間そのものを歪曲させる。' },

    gwb_mid: { rank: '暗黒中ボス (STAGE 5/15/25)', lore: '暗黒世界側のビーコン基地を防衛する黒紅の重装哨戒戦車。反転次元の負エネルギーを砲弾へ変換して発射する。' },
    gwb_n10: { rank: '暗黒ネームド (STAGE 10)', lore: '暗黒世界の黒い海域に潜む巨大次元潜航母艦。ビーコン基地の周辺海域を完全に封鎖する。' },
    gwb_n20: { rank: '暗黒ネームド (STAGE 20)', lore: '次元ゲートの安定化と防衛を担う異次元ビーコン衛星。空間歪曲ビームで侵入者を殲滅する。' },
    gwb_final: { rank: '暗黒大ボス (STAGE 30)', lore: 'Gewinnerビーコン基地総司令。必殺技【反転ビーコン・オメガ次元光線】を放つ次元反転体のヴィクター。' },

    drk_mid: { rank: '暗黒中ボス (STAGE 5/15/25)', lore: '暗黒世界の負のエーテルを纏った黒鉄の重装獣。現実世界の兵器常識を覆す圧倒的な質量と再生能力を持つ。' },
    drk_n10: { rank: '暗黒ネームド (STAGE 10)', lore: '暗黒世界の黒い海を航行する呪われた超弩級戦艦。無数の砲門から深淵のエネルギー弾を斉射する。' },
    drk_n20: { rank: '暗黒ネームド (STAGE 20)', lore: '12枚の漆黒の翼を持つ暗黒世界の空の支配者。光の速度に匹敵する軌跡を描きながら空襲を仕掛ける。' },
    drk_final: { rank: '暗黒大ボス (STAGE 30)', lore: '暗黒世界統治神。必殺技【クリフォト深淵・終焉の黙示録】で終末の深淵波動と自己再生を発動する。' }
};

// 1. レリック（勢力制圧報酬：すべて「○○のビーコンキー」・バフ効果なし）
const BEACON_KEYS = [
    { id: 'key_un', factionId: 'un', name: '国連防衛軍のビーコンキー', icon: '🔑', color: '#38bdf8', lore: '国連防衛軍の軌道防衛網を掌握し、戦線を突破した証となる暗号認証キー。' },
    { id: 'key_usa', factionId: 'usa', name: '合衆国のビーコンキー', icon: '🗝️', color: '#3b82f6', lore: '北米大陸の重工業防衛グリッドを突破した証となる戦略アクセスキー。' },
    { id: 'key_chn', factionId: 'chn', name: '大陸龍脈のビーコンキー', icon: '🔑', color: '#ef4444', lore: '大陸横断鉄道網の制圧を証明する戦略物資管理キー。' },
    { id: 'key_isl', factionId: 'isl', name: '紅海黄金のビーコンキー', icon: '🗝️', color: '#10b981', lore: '資源連合の古代エネルギー炉防衛線を突破した証となる制御キー。' },
    { id: 'key_rus', factionId: 'rus', name: '極寒鉄路のビーコンキー', icon: '🔑', color: '#e2e8f0', lore: 'シベリア極寒防衛線の制覇を証明する軌道干渉キー。' },
    { id: 'key_eu', factionId: 'eu', name: '円卓聖域のビーコンキー', icon: '🗝️', color: '#818cf8', lore: '欧州連合の統合指揮中枢を攻略した証となる認証キー。' },
    { id: 'key_ter', factionId: 'ter', name: '地球連邦のビーコンキー', icon: '🔑', color: '#22d3ee', lore: '地球惑星連邦の最終防衛中枢を制圧した証となる軌道認証キー。' },
    { id: 'key_corp', factionId: 'corp', name: '企業連合のビーコンキー', icon: '🗝️', color: '#eab308', lore: '国家崩壊後に台頭した世界企業連合の黄金アルゴリズム中枢を制圧した証となるマスターキー。' },
    { id: 'key_gew', factionId: 'gew', name: 'ゲヴィナーのビーコンキー', icon: '🔑', color: '#f43f5e', lore: '過激テロリスト組織Gewinnerの中枢司令部を制圧して奪取した漆黒の暗号ビーコンキー。' }
];

// 2. 収集アイテム（大ボス3%レアドロップ9種＋天候ボス4種）
const COLLECTIBLES = [
    { id: 'relic_un', sourceType: 'boss', bossId: 'un_final', name: 'メタトロンの光翼炉', icon: '🪽', color: '#f43f5e', dropRate: 0.03, effectType: 'atk', perLv: 0.35, effectText: (lv) => `全兵装の基礎攻撃力 +${Math.round(lv * 35)}%`, lore: '国連軌道防衛総司令メタトロンの中枢に内蔵されていた小型縮退炉。全車両の兵器出力を永続的に底上げする。' },
    { id: 'relic_usa', sourceType: 'boss', bossId: 'usa_final', name: '自由の星条装甲核', icon: '🛡️', color: '#3b82f6', dropRate: 0.03, effectType: 'hp', perLv: 0.45, effectText: (lv) => `装甲列車の最大耐久力 +${Math.round(lv * 45)}%`, lore: '決戦要塞リバティプライムの胸部リアクター。列車全体の分子結合装甲を強化し、最大HPを大幅に引き上げる。' },
    { id: 'relic_chn', sourceType: 'boss', bossId: 'chn_final', name: '天帝の龍脈玉璽', icon: '🐉', color: '#fbbf24', dropRate: 0.03, effectType: 'gold', perLv: 0.40, effectText: (lv) => `敵撃破・ステージ報酬資金 +${Math.round(lv * 40)}%`, lore: '大陸横断軌道レールガン「天帝」の管制認証印。旧世界の軍事資金網へのアクセス権を掌握し、獲得資金を増加させる。' },
    { id: 'relic_isl', sourceType: 'boss', bossId: 'isl_final', name: 'バビロンの黄金太陽盤', icon: '☀️', color: '#f59e0b', dropRate: 0.03, effectType: 'reload', perLv: 0.18, effectText: (lv) => `全兵装の装填・連射速度 +${Math.round(lv * 18)}%`, lore: '空中宮殿バビロン・コアを浮遊させていた古代太陽エネルギー盤。全砲塔の装填サイクルを高速化する。' },
    { id: 'relic_rus', sourceType: 'boss', bossId: 'rus_final', name: '冬将軍の絶対零度結晶', icon: '❄️', color: '#38bdf8', dropRate: 0.03, effectType: 'slow', perLv: 0.12, effectText: (lv) => `敵軍全体の進軍速度 -${Math.min(60, Math.round(lv * 12))}%`, lore: '氷結軌道要塞モローズの冷気発生結晶。戦場一帯に極寒領域を展開し、進軍する敵部隊の脚を永久に鈍らせる。' },
    { id: 'relic_eu', sourceType: 'boss', bossId: 'eu_final', name: '円卓の聖剣聖杯', icon: '🏆', color: '#c084fc', dropRate: 0.03, effectType: 'synergy', perLv: 0.35, effectText: (lv) => `セフィロト・シナジー効果 +${Math.round(lv * 35)}%`, lore: '円卓防衛システム「アーサー王」の中枢聖杯。セフィラ達と列車兵装の精神同調率を飛躍的に高める。' },
    { id: 'relic_ter', sourceType: 'boss', bossId: 'ter_final', name: 'ユグドラシルの世界樹種子', icon: '🌱', color: '#34d399', dropRate: 0.03, effectType: 'regen', perLv: 0.15, effectText: (lv) => `ウェーブ開始時に装甲HPを ${Math.min(100, Math.round(lv * 15))}% 自動修復`, lore: '地球惑星連邦最高中枢ユグドラシルが守護していた生命ナノマシン結晶。出撃のたびに装甲列車の損傷を自己再生する。' },
    { id: 'relic_corp', sourceType: 'boss', bossId: 'corp_final', name: 'クロノスの黄金演算台帳', icon: '💳', color: '#eab308', dropRate: 0.03, effectType: 'gold', perLv: 0.55, effectText: (lv) => `敵撃破・ステージ報酬資金 +${Math.round(lv * 55)}%`, lore: '世界企業連合の最高取締役AIクロノスCEOが運用していた超量子資産台帳。世界中の資本の流れを鉄道共和国へ還流させる。' },
    { id: 'relic_gew', sourceType: 'boss', bossId: 'gew_final', name: 'ヴィクターの黒曜起爆装置', icon: '💣', color: '#f43f5e', dropRate: 0.03, effectType: 'atk', perLv: 0.50, effectText: (lv) => `全兵装の基礎攻撃力 +${Math.round(lv * 50)}%`, lore: 'Gewinner最高指導者ヴィクターが携帯していた異次元振動起爆装置。砲弾の破壊エネルギーを極限まで増幅する。' },

    { id: 'witem_clear', sourceType: 'weather', weatherKey: 'clear', bossId: 'wboss_clear', name: '晴天の太陽集光鏡', icon: '🔆', color: '#fbbf24', effectText: (lv) => `【☀️晴れ時限定】全兵装攻撃力 +${Math.round(lv * 45)}% ＆ 獲得資金 +${Math.round(lv * 30)}%`, lore: '太陽機神ヘリオスの集光レンズ。晴天時の強烈な太陽光をエネルギーへ変換し、列車砲の威力を劇的に高める。' },
    { id: 'witem_rain', sourceType: 'weather', weatherKey: 'rain', bossId: 'wboss_rain', name: '雨天の海神羅針盤', icon: '🧭', color: '#38bdf8', effectText: (lv) => `【🌧️雨時限定】雨の火力低下無効化 ＋ 全兵装攻撃力 +${Math.round(lv * 35)}% ＆ 装填速度 +${Math.round(lv * 20)}%`, lore: '深海巨獣レヴィアタンの制御中枢。雨天時の視界・弾道低下を完全に打ち消し、逆に水上戦力を増幅する。' },
    { id: 'witem_snow', sourceType: 'weather', weatherKey: 'snow', bossId: 'wboss_snow', name: '雪天の白銀氷晶核', icon: '💠', color: '#67e8f9', effectText: (lv) => `【❄️雪時限定】全兵装攻撃力 +${Math.round(lv * 40)}% ＆ 敵移動速度さらに -${Math.min(40, Math.round(lv * 10))}%`, lore: '白銀機竜フェンリルの永久凍土コア。降雪時に超伝導冷却を発生させ、レールガンや光学兵器の出力を向上させる。' },
    { id: 'witem_storm', sourceType: 'weather', weatherKey: 'storm', bossId: 'wboss_storm', name: '嵐天の雷鳴避雷針', icon: '⚡', color: '#c084fc', effectText: (lv) => `【⛈️嵐時限定】嵐スリップダメージ90%軽減 ＋ 全兵装攻撃力 +${Math.round(lv * 50)}%`, lore: '天空裁定者インドラの雷撃吸収ロッド。暴風落雷の電力を装甲列車の動力炉へ還元し、圧倒的火力を生み出す。' }
];

// 勢力マスターデータ（暗黒世界最初の勢力として「Gewinnerビーコン基地」を追加）
const FACTIONS = [
    {
        id: 'pol',
        world: 'real',
        name: '国連警察',
        subtitle: 'UN PEACEKEEPING POLICE // TUTORIAL',
        isTutorial: true,
        stageCount: 10,
        powerMult: 0.65,
        rewardMult: 1.25,
        themeColor: '#7dd3fc',
        skyTop: '#0b1324',
        skyBottom: '#1e3a5f',
        bosses: { mid: 'pol_mid', final: 'pol_final' },
        cutinQuote: '「暴走列車アイン・ソフ・オウルへ通告する！直ちに減速し、治安維持部隊の臨検に応じよ！」',
        desc: '【チュートリアル戦線・全10ステージ】独立直後の装甲列車を足止めすべく急行した治安維持部隊。まずはここで陸・海・空の属性相性と駅員シナジーの感覚を掴もう！'
    },
    {
        id: 'un',
        world: 'real',
        name: '国連防衛軍',
        subtitle: 'UNITED NATIONS DEFENSE FORCE',
        stageCount: 30,
        powerMult: 2.2,
        rewardMult: 2.0,
        themeColor: '#38bdf8',
        skyTop: '#090d16',
        skyBottom: '#1e293b',
        bosses: { mid: 'un_mid', n10: 'un_n10', n20: 'un_n20', final: 'un_final' },
        cutinQuote: '「ティファレト及びアイン・ソフ・オウルへ告ぐ。国際秩序への反逆は断じて許さぬ――全軍、奪還作戦開始！」',
        desc: 'アイン・ソフ・オウルの奪還を目論む旧世界の国際治安維持機構。本格的な陸海空統合部隊を展開する。'
    },
    {
        id: 'usa',
        world: 'real',
        name: 'アメリカ合衆国',
        subtitle: 'UNITED STATES OF AMERICA',
        stageCount: 30,
        powerMult: 7.5,
        rewardMult: 4.5,
        themeColor: '#3b82f6',
        skyTop: '#0c192c',
        skyBottom: '#1e3a5f',
        bosses: { mid: 'usa_mid', n10: 'usa_n10', n20: 'usa_n20', final: 'usa_final' },
        cutinQuote: '「聞こえているかアイン・ソフ・オウル！自由と星条旗の名の下に、貴様らの鉄の王国をスクラップへ変えてやる！」',
        desc: '世界最大の軍事力を誇る超大国。重装甲戦車師団と超大型空母打撃群、ステルス爆撃機による圧倒的物量で迫る。'
    },
    {
        id: 'chn',
        world: 'real',
        name: '中華人民共和国',
        subtitle: "PEOPLE'S REPUBLIC OF CHINA",
        stageCount: 30,
        powerMult: 22.0,
        rewardMult: 10.5,
        themeColor: '#ef4444',
        skyTop: '#240b0b',
        skyBottom: '#451a1a',
        bosses: { mid: 'chn_mid', n10: 'chn_n10', n20: 'chn_n20', final: 'chn_final' },
        cutinQuote: '「アイン・ソフ・オウルよ、大陸の大動脈たる鉄道を語るなら、真の鉄路の覇者が誰か教えてやろう！」',
        desc: '大陸の巨龍。物量戦術に加え、極超音速滑空兵器や電磁カタパルト巨艦など最新鋭の対列車兵器を投入する。'
    },
    {
        id: 'isl',
        world: 'real',
        name: 'イスラム諸国連合',
        subtitle: 'UNITED ISLAMIC COALITION',
        stageCount: 30,
        powerMult: 64.0,
        rewardMult: 24.0,
        themeColor: '#10b981',
        skyTop: '#271a0c',
        skyBottom: '#5c3a18',
        bosses: { mid: 'isl_mid', n10: 'isl_n10', n20: 'isl_n20', final: 'isl_final' },
        cutinQuote: '「鋼の巨獣アイン・ソフ・オウルよ、黄金の砂塵と古代の叡智の前に、その傲慢なる車輪を止めよ！」',
        desc: '資源と古の叡智を結集した砂漠の連合帝国。黄金の装甲を施した重機動要塞と巨大飛行戦艦が空を覆う。'
    },
    {
        id: 'rus',
        world: 'real',
        name: 'ロシア連邦',
        subtitle: 'RUSSIAN FEDERATION',
        stageCount: 30,
        powerMult: 185.0,
        rewardMult: 55.0,
        themeColor: '#e2e8f0',
        skyTop: '#0f172a',
        skyBottom: '#334155',
        bosses: { mid: 'rus_mid', n10: 'rus_n10', n20: 'rus_n20', final: 'rus_final' },
        cutinQuote: '「ようこそ極寒の鉄路へ、アイン・ソフ・オウル。我らの超重列車砲と冬将軍の吹雪が貴様らを凍てつかせる！」',
        desc: '極寒の鉄路を支配する重厚長大主義の軍事大国。超重列車砲と核動力巨艦による重火力砲撃戦を仕掛ける。'
    },
    {
        id: 'eu',
        world: 'real',
        name: '欧州連合 (EU)',
        subtitle: 'EUROPEAN UNION // OLD WORLD BASTION',
        stageCount: 30,
        powerMult: 540.0,
        rewardMult: 125.0,
        themeColor: '#818cf8',
        skyTop: '#130f26',
        skyBottom: '#2e2654',
        bosses: { mid: 'eu_mid', n10: 'eu_n10', n20: 'eu_n20', final: 'eu_final' },
        cutinQuote: '「アイン・ソフ・オウルへ告ぐ。旧世界の誇りと円卓の剣に懸けて、これ以上の侵攻は一歩たりとも許さぬ！」',
        desc: '旧世界の砦。騎士道の名を冠した次世代光学兵器と軌道防衛システム「アーサー王」が立ち塞がる！'
    },
    {
        id: 'ter',
        world: 'real',
        name: '地球惑星連邦',
        subtitle: 'TERRAN PLANETARY FEDERATION',
        stageCount: 30,
        powerMult: 1600.0,
        rewardMult: 300.0,
        themeColor: '#22d3ee',
        skyTop: '#030712',
        skyBottom: '#083344',
        bosses: { mid: 'ter_mid', n10: 'ter_n10', n20: 'ter_n20', final: 'ter_final' },
        cutinQuote: '「全人類統合防衛網よりアイン・ソフ・オウルへ――我らは最後の国家連合。軌道防衛中枢の名において貴艦を消去する！」',
        desc: '旧世界の全国家が統合し誕生した人類圏統合防衛機構。軌道エレベーターから降下する超重力兵器群と最高中枢「ユグドラシル」が立ちはだかる！'
    },
    {
        id: 'corp',
        world: 'real',
        name: '世界企業連合',
        subtitle: 'GLOBAL CORPORATE UNION // TECH-OLIGARCHY',
        stageCount: 30,
        powerMult: 4800.0,
        rewardMult: 750.0,
        themeColor: '#eab308',
        skyTop: '#1c1404',
        skyBottom: '#422d08',
        bosses: { mid: 'corp_mid', n10: 'corp_n10', n20: 'corp_n20', final: 'corp_final' },
        cutinQuote: '「【緊急宣言】地球連邦の敗北により国家による統治は完全に崩壊した――いまや世界はテック右派資本家たちが統べる『世界企業連合』の所有物だ。アイン・ソフ・オウルよ、我らの資産として接収させてもらう！」',
        desc: '【全30ステージ】地球惑星連邦の崩壊によって旧来の国家統治が消滅した世界で、巨大資本とアルゴリズムを握るテック右派が樹立した超巨大企業連合。'
    },
    {
        id: 'gew',
        world: 'real',
        name: 'Gewinner（ゲヴィナー）',
        subtitle: 'TERRORIST SYNDICATE // SHADOW INSURGENCY',
        stageCount: 30,
        powerMult: 5600.0,
        rewardMult: 880.0,
        themeColor: '#f43f5e',
        skyTop: '#1f050a',
        skyBottom: '#450a18',
        bosses: { mid: 'gew_mid', n10: 'gew_n10', n20: 'gew_n20', final: 'gew_final' },
        cutinQuote: '「ククク……世界企業連合と同時に我ら『Gewinner』が表舞台へ躍り出たぞ！企業連合の支配が内側から瓦解するその瞬間まで、アイン・ソフ・オウル――貴様らも我らの壮大なテロルの礎となれ！」',
        desc: '【同時出現・全30ステージ】世界企業連合の樹立と同時に暗躍を開始し、連合が瓦解し始めるのを虎視眈々と待っていた過激テロリスト組織。'
    },
    {
        id: 'ant',
        world: 'real',
        secretUntilUnlocked: true,
        name: 'Gewinner南極基地',
        subtitle: 'GEWINNER ANTARCTIC FORTRESS // DIMENSIONAL BEACON',
        stageCount: 30,
        powerMult: 16500.0,
        rewardMult: 2400.0,
        themeColor: '#38bdf8',
        skyTop: '#041326',
        skyBottom: '#0f294a',
        bosses: { mid: 'ant_mid', n10: 'ant_n10', n20: 'ant_n20', final: 'ant_final' },
        cutinQuote: '「全9種のビーコンキーの共鳴反応を確認……よくぞこの極寒の南極基地まで辿り着いたな、アイン・ソフ・オウル！ここで眠る異次元ビーコンは決して渡さぬ！」',
        desc: '【極秘最終拠点・全30ステージ】Gewinnerを含む現実世界の全ビーコンキーを揃えたことで位置が特定された南極の超巨大秘密基地。最奥には未知のビーコン装置が眠る。'
    },
    {
        id: 'endless',
        world: 'real',
        name: '∞ 現実・無限戦区',
        subtitle: 'REAL WORLD INFINITE SECTOR // ENDGAME',
        powerMult: 28000.0,
        rewardMult: 3800.0,
        themeColor: '#f43f5e',
        skyTop: '#09030f',
        skyBottom: '#3b0726',
        isEndless: true,
        bosses: { mid: 'corp_mid', n10: 'gew_final', n20: 'ant_n20', final: 'ant_final' },
        cutinQuote: '「現実世界の因果を越えしアイン・ソフ・オウルよ――ここより先は現実世界の歴代強敵が交錯する無限の戦場なり！」',
        desc: '【エンドコンテンツ】現実世界の歴代中ボス・ネームド・大ボスがランダムに数体ずつ次々と襲来する無限の戦場！'
    },
    {
        id: 'gew_beacon',
        world: 'dark',
        secretUntilUnlocked: true,
        name: 'Gewinnerビーコン基地',
        subtitle: 'DARK WORLD GATEWAY // GEWINNER BEACON BASE',
        stageCount: 30,
        powerMult: 38000.0,
        rewardMult: 5400.0,
        themeColor: '#f43f5e',
        skyTop: '#120318',
        skyBottom: '#3b0734',
        bosses: { mid: 'gwb_mid', n10: 'gwb_n10', n20: 'gwb_n20', final: 'gwb_final' },
        cutinQuote: '「ビーコン作動による次元接続を検知……ここが暗黒世界側の橋頭堡『Gewinnerビーコン基地』だ！アイン・ソフ・オウル、この次元で貴様らの鉄路は完全に断ち切られる！」',
        desc: '【暗黒世界・最初の戦線・全30ステージ】南極のビーコン作動によって接続された暗黒世界側の最前線要塞基地。ここを突破しなければ暗黒世界の中枢へは進めない！'
    },
    {
        id: 'dark_abyss',
        world: 'dark',
        secretUntilUnlocked: true,
        name: '暗黒世界・クリフォト中枢',
        subtitle: 'DARK WORLD // QLIPHOTH ABYSSAL FRONT',
        stageCount: 30,
        powerMult: 78000.0,
        rewardMult: 11000.0,
        themeColor: '#c084fc',
        skyTop: '#090212',
        skyBottom: '#290845',
        bosses: { mid: 'drk_mid', n10: 'drk_n10', n20: 'drk_n20', final: 'drk_final' },
        cutinQuote: '「……ビーコン基地すら突破して『クリフォト中枢』へ踏み入ったか、アイン・ソフ・オウル。ここより先は反転せる深淵の理――貴様らの列車がどこまで通用するか見届けよう！」',
        desc: '【暗黒世界・深層戦線・全30ステージ】Gewinnerビーコン基地の奥に広がる反転次元「暗黒世界」の支配中枢。深淵のエーテルを纏う強大な暗黒兵器群が襲来する！'
    },
    {
        id: 'dark_endless',
        world: 'dark',
        secretUntilUnlocked: true,
        name: '∞ 暗黒・深淵無限領域',
        subtitle: 'DARK WORLD INFINITE ABYSS // OMEGA',
        powerMult: 180000.0,
        rewardMult: 24000.0,
        themeColor: '#e879f9',
        skyTop: '#05010a',
        skyBottom: '#3b0764',
        isEndless: true,
        bosses: { mid: 'gwb_mid', n10: 'gwb_final', n20: 'drk_n20', final: 'drk_final' },
        cutinQuote: '「暗黒の深淵そのものが貴様らを試している――終わりなき暗黒の戦場へようこそ、アイン・ソフ・オウル！」',
        desc: '【暗黒世界エンドコンテンツ】暗黒世界のボスたちが幾重にも重なって襲来する極限の無限戦場！'
    }
];

// プレステージ「セフィロトの樹」10ノード定義
const SEPHIROTH_TREE_NODES = [
    {
        id: 'kether',
        sephirahName: 'ケテル（王冠）',
        title: '至高王冠の全能光',
        x: 50, y: 10,
        color: '#fef08a',
        borderHex: '#eab308',
        baseCost: 24,
        maxLevel: 5,
        desc: 'セフィロトの頂点に位置する王冠の加護。全兵装基礎攻撃力と獲得資金を同時に永続増幅します。',
        bonusText: (lv) => `全兵装攻撃力 +${lv * 27}% ＆ 獲得資金 +${lv * 18}%`,
        bonusParts: [
            { label: '攻撃力', get: (lv) => `+${lv * 27}%` },
            { label: '獲得資金', get: (lv) => `+${lv * 18}%` }
        ],
    },
    {
        id: 'chokmah',
        sephirahName: 'コクマー（知恵）',
        title: '叡智の精密弾道核',
        x: 78, y: 24,
        color: '#60a5fa',
        borderHex: '#3b82f6',
        baseCost: 12,
        maxLevel: 5,
        desc: '知恵の柱を司る加護。全兵装の装填・連射速度と会心ダメージ倍率を永続的に引き上げます。',
        bonusText: (lv) => `全兵装装填速度 +${lv * 8}% ＆ 会心倍率 +${(lv * 0.15).toFixed(2)}倍`,
        bonusParts: [
            { label: '装填速度', get: (lv) => `+${lv * 8}%` },
            { label: '会心倍率', get: (lv) => `+${(lv * 0.15).toFixed(2)}倍` }
        ],
    },
    {
        id: 'binah',
        sephirahName: 'ビナー（理解）',
        title: '深淵理解の構造貫通',
        x: 22, y: 24,
        color: '#2dd4bf',
        borderHex: '#14b8a6',
        baseCost: 12,
        maxLevel: 5,
        desc: '峻厳の柱の頂を司る加護。ボスおよび重装甲目標に対する全兵装の最終与ダメージを永続強化します。',
        bonusText: (lv) => `対ボス与ダメージ +${lv * 24}%`,
        bonusParts: [
            { label: '対ボス与ダメージ', get: (lv) => `+${lv * 24}%` }
        ],
    },
    {
        id: 'chesed',
        sephirahName: 'ケセド（慈悲）',
        title: '慈悲なる黄金の恩寵',
        x: 78, y: 44,
        color: '#f472b6',
        borderHex: '#ec4899',
        baseCost: 12,
        maxLevel: 5,
        desc: '慈悲の柱を司る加護。敵撃破およびステージ制圧時の獲得資金を大幅に増加させます。',
        bonusText: (lv) => `獲得資金 +${lv * 33}%`,
        bonusParts: [
            { label: '獲得資金', get: (lv) => `+${lv * 33}%` }
        ],
    },
    {
        id: 'geburah',
        sephirahName: 'ゲブラー（峻厳）',
        title: '峻厳なる破壊の鉄槌',
        x: 22, y: 44,
        color: '#f87171',
        borderHex: '#ef4444',
        baseCost: 9.6,
        maxLevel: 5,
        desc: '峻厳の柱を司る加護。全兵装の基礎攻撃力を永続的に大きく強化します。',
        bonusText: (lv) => `全兵装攻撃力 +${lv * 33}%`,
        bonusParts: [
            { label: '攻撃力', get: (lv) => `+${lv * 33}%` }
        ],
    },
    {
        id: 'tiphareth',
        sephirahName: 'ティファレト（美）',
        title: '調和と美の共鳴中枢',
        x: 50, y: 48,
        color: '#fbbf24',
        borderHex: '#f59e0b',
        baseCost: 15.6,
        maxLevel: 5,
        desc: '樹の中心・均衡の柱の要。セフィラ（駅員）のシナジー攻撃・装填速度ボーナスを増幅します。',
        bonusText: (lv) => `セフィロト・シナジー効果 +${lv * 21}%`,
        bonusParts: [
            { label: 'シナジー効果', get: (lv) => `+${lv * 21}%` }
        ],
    },
    {
        id: 'netzach',
        sephirahName: 'ネツァク（勝利）',
        title: '不屈勝利の凱旋旗',
        x: 78, y: 66,
        color: '#34d399',
        borderHex: '#10b981',
        baseCost: 15.6,
        maxLevel: 5,
        desc: '勝利を約束する加護。出撃した鹵獲超兵器（縮小ボス護衛機）の攻撃力と耐久力を永続強化します。',
        bonusText: (lv) => `鹵獲超兵器 攻撃＆HP +${lv * 30}%`,
        bonusParts: [
            { label: '鹵獲機 攻撃/HP', get: (lv) => `+${lv * 30}%` }
        ],
    },
    {
        id: 'hod',
        sephirahName: 'ホド（栄光）',
        title: '栄光なる戦術管制網',
        x: 22, y: 66,
        color: '#fde047',
        borderHex: '#ca8a04',
        baseCost: 15.6,
        maxLevel: 5,
        desc: '戦術指令の栄光を司る加護。装甲強化（体力強化）1レベルあたりの最大耐久力の上昇幅を永続的に拡張します。',
        bonusText: (lv) => `体力強化の上昇幅 +${lv * 12}%`,
        bonusParts: [
            { label: '体力強化の上昇幅', get: (lv) => `+${lv * 12}%` }
        ],
    },
    {
        id: 'yesod',
        sephirahName: 'イェソド（基礎）',
        title: '鉄路基盤の超重装甲',
        x: 50, y: 74,
        color: '#fb923c',
        borderHex: '#ea580c',
        baseCost: 9.6,
        maxLevel: 5,
        desc: 'すべてを支える基礎の加護。装甲列車の最大耐久力を永続的に引き上げます。',
        bonusText: (lv) => `最大耐久力 +${lv * 39}%`,
        bonusParts: [
            { label: '最大耐久力', get: (lv) => `+${lv * 39}%` }
        ],
    },
    {
        id: 'malkuth',
        sephirahName: 'マルクト（王国）',
        title: '物質王国の鹵獲ドック',
        x: 50, y: 91,
        color: '#c084fc',
        borderHex: '#9333ea',
        baseCost: 30,
        maxLevel: 5,
        desc: '物質界の王国を統べる加護。鹵獲超兵器の同時出撃枠を拡張し、Lv5では鹵獲機の攻撃力とHPも強化します（初期1枠→最大5枠）。',
        bonusText: (lv) => lv >= 5
            ? `鹵獲兵器 同時出撃枠: 5 体 ＆ 鹵獲機 攻撃/HP +25%`
            : `鹵獲兵器 同時出撃枠: ${1 + lv} 体`,
        bonusParts: [
            { label: '出撃枠', get: (lv) => `${1 + Math.min(4, lv)} 体` },
            { label: '鹵獲機 攻撃/HP', get: (lv) => lv >= 5 ? '+25%' : '+0%' }
        ],
    }
];

const SEPHIROTH_TREE_PATHS = [
    ['kether', 'chokmah'], ['kether', 'binah'], ['kether', 'tiphareth'],
    ['chokmah', 'binah'], ['chokmah', 'chesed'], ['chokmah', 'tiphareth'],
    ['binah', 'geburah'], ['binah', 'tiphareth'],
    ['chesed', 'geburah'], ['chesed', 'tiphareth'], ['chesed', 'netzach'],
    ['geburah', 'tiphareth'], ['geburah', 'hod'],
    ['tiphareth', 'netzach'], ['tiphareth', 'hod'], ['tiphareth', 'yesod'],
    ['netzach', 'hod'], ['netzach', 'yesod'], ['netzach', 'malkuth'],
    ['hod', 'yesod'], ['hod', 'malkuth'],
    ['yesod', 'malkuth']
];

// ゲーム状態管理
