// ==========================================================
// 武装のレアリティ別 固有名称テーブル
// ----------------------------------------------------------
// 同じ種類の武装でも、レアリティごとに名称（＝設計思想・製造元・
// 技術格）が変わる。名称はコードに埋め込まず、このデータだけで
// 完結させる（将来の武装追加はここに追記する）。
//
// 解決規則:
//   1. rarity が渡され、そのレアリティの名称が定義されていればそれを使う
//   2. 定義がなければレアリティ順で直近の下位名称へフォールバック
//   3. それも無ければ武装の基本名称（WEAPONS[id].name）
//
// ＋値（マージ）では名称を変えない。名称は「種類 × レアリティ」で決まる。
// レールガンはレアリティ育成の対象外なので、全レアリティで同一名称。
// ==========================================================

const WEAPON_RARITY_NAMES = {
    mg_vulcan: {
        Common: '重機関銃バルカン',
        Uncommon: '国連標準重機関銃',
        Rare: 'アクセルワーク社製エレクトロ機関銃',
        Epic: 'CSS社製AAE弾対応エレクトロ機関銃',
        Legendary: 'CSS社製AAE弾対応404mm機関砲',
        Mythic: 'ペンタゴン特注劣化ウラン弾対応機関砲「コードゼロ」'
    },
    aa_flak: {
        Common: '88mm対空機関砲',
        Uncommon: '国連標準対空機関砲',
        Rare: 'NATO高度運用兵器 122対空槍',
        Epic: 'エリック・インダストリーズ社製機関砲「エンゲルス」',
        Legendary: 'レージェスト社製対空槍「ホルスの槍」',
        Mythic: '超広範囲対空機関砲「ワイルドハント」'
    },
    torpedo_launcher: {
        Common: '対艦魚雷発射管',
        Uncommon: '対艦魚雷「風雲月露」',
        Rare: '対艦魚雷「月風」',
        Epic: '対艦魚雷「風林火山」',
        Legendary: '対艦魚雷「黒点」',
        Mythic: '対艦衛星兵器・対海高機能レーダー「の槍・オーディンの目」'
    },
    howitzer_heavy: {
        Common: '155mm重榴弾砲',
        Uncommon: '国連高度運用兵器160mm重榴弾砲',
        Rare: 'NATO特注劣化オリンポスクリスタル弾対応榴弾砲',
        Epic: '1点突破重榴弾砲「ゲイ・ボルグ」',
        Legendary: '核榴弾砲M65 280mmカノン砲',
        Mythic: '改造2A3 コンデンサートル400mm核榴弾砲試作品「ワシントン」'
    },
    missile_malkuth: {
        Common: '多連装誘導ミサイル「エレガント」',
        Uncommon: 'PHL-16',
        Rare: 'CSS社製多連装誘導ミサイル「ホーネット」',
        Epic: 'AMA社製多連装誘導ミサイル「グングニル」',
        Legendary: 'オーガスト武装要塞国家製多連装誘導ミサイル「ガーディアン」',
        Mythic: 'コードSC2 多連装誘導ミサイル「クエーサー」'
    },
    laser_kether: {
        Common: '超兵器・焦熱光線',
        Uncommon: '国連高度運用指向性エネルギー兵器「トライデント」',
        Rare: 'CSS社製AAE抽出兵器「ブラフマーストラ」',
        Epic: 'オリンポスクリスタル抽出ターボレーザー',
        Legendary: '高出力オリンポスクリスタル抽出兵器「スーパーレーザー砲」',
        Mythic: 'ビーコンクリスタルエネルギー兵器「ケラウノス」'
    },
    // レールガンは全レアリティで同一名称（育成対象外のため）。
    railgun_tiphareth: {
        Common: '国連決戦兵器「炎の剣－レプリカ」',
        Uncommon: '国連決戦兵器「炎の剣－レプリカ」',
        Rare: '国連決戦兵器「炎の剣－レプリカ」',
        Epic: '国連決戦兵器「炎の剣－レプリカ」',
        Legendary: '国連決戦兵器「炎の剣－レプリカ」',
        Mythic: '国連決戦兵器「炎の剣－レプリカ」'
    }
};

// 製造元ピックアップで排出される Mythic 武装の対応表。
// 名称テーブル側の Mythic 行と一致していることをテストで担保する。
const MYTHIC_WEAPONS = {
    mg_vulcan: 'usa',
    aa_flak: 'gew',
    torpedo_launcher: 'un',
    howitzer_heavy: 'usa',
    missile_malkuth: 'un',
    laser_kether: 'gew'
};

const RARITY_FALLBACK_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];

function getWeaponRarityName(weaponId, rarity) {
    if (!weaponId) return null;
    const table = WEAPON_RARITY_NAMES[weaponId];
    if (!table) return null;
    if (rarity && table[rarity]) return table[rarity];
    if (!rarity) return table.Common || null;
    // 定義の無いレアリティは、下位方向の直近定義へフォールバックする。
    const idx = RARITY_FALLBACK_ORDER.indexOf(rarity);
    for (let i = idx - 1; i >= 0; i--) {
        const name = table[RARITY_FALLBACK_ORDER[i]];
        if (name) return name;
    }
    return table.Common || null;
}

// その武装に Mythic 名称が定義されているか（ピックアップ対象の判定と一致させる）。
function hasMythicName(weaponId) {
    const table = WEAPON_RARITY_NAMES[weaponId];
    return !!(table && table.Mythic);
}
