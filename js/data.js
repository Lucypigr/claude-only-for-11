// 遊戲靜態資料：角色、地圖、卡片、神明
const CHARACTERS = [
  { id: 'atubo', name: '阿土伯', icon: '👨‍🌾', color: '#e53935', quote: '做人要腳踏實地，買地更要腳踏實地！' },
  { id: 'xiaomei', name: '孫小美', icon: '👧', color: '#ec407a', quote: '人家只是來逛街的啦～' },
  { id: 'qian', name: '錢夫人', icon: '👩‍💼', color: '#8e24aa', quote: '錢不是問題，問題是沒錢。' },
  { id: 'beibei', name: '金貝貝', icon: '👦', color: '#f9a825', quote: '我爸爸是董事長！' },
  { id: 'salong', name: '沙隆巴斯', icon: '🧔', color: '#43a047', quote: '阿拉真主保佑我買到好地。' },
  { id: 'ninja', name: '忍太郎', icon: '🥷', color: '#1e88e5', quote: '忍者的道路，是用鈔票鋪成的。' },
  { id: 'laoqian', name: '大老千', icon: '🕵️', color: '#6d4c41', quote: '這把穩贏，相信我。' },
  { id: 'wumi', name: '烏咪', icon: '🐱', color: '#00897b', quote: '喵～這塊地是我的了喵！' },
];

// 目前地圖的區域（同時也是股票），由 maps.js 的 applyMap() 填入
const DISTRICTS = [];

// 特殊格子說明
const TILE_TYPES = {
  bank: { name: '銀行', icon: '🏦', desc: '經過領薪水與點券，停留可存提款' },
  chance: { name: '機會', icon: '❓', desc: '抽一張機會卡' },
  fate: { name: '命運', icon: '🔮', desc: '抽一張命運卡' },
  card: { name: '卡片', icon: '🃏', desc: '免費獲得道具卡' },
  minigame: { name: '小遊戲', icon: '🎮', desc: '挑戰小遊戲贏獎金' },
  news: { name: '新聞', icon: '📰', desc: '發生影響全體的大事件' },
  temple: { name: '神明廟', icon: '⛩️', desc: '擲筊請神明附身' },
  hospital: { name: '醫院', icon: '🏥', desc: '住院的玩家在此休養' },
  shop: { name: '道具店', icon: '🏪', desc: '用點券購買卡片與交通工具' },
  stock: { name: '證券所', icon: '📈', desc: '週末也能交易股票，並獲得內線消息' },
  jail: { name: '監獄', icon: '🚔', desc: '入獄的玩家在此反省' },
  land: { name: '土地', icon: '', desc: '' },
};

// 目前地圖的 44 格，由 maps.js 的 applyMap() 填入
const MAP_TILES = [];
const BOARD_COLS = 14, BOARD_ROWS = 10;

// 建築等級
const LEVELS = [
  { name: '空地', icon: '', toll: 0.25 },
  { name: '平房', icon: '🏠', toll: 0.7 },
  { name: '洋房', icon: '🏡', toll: 1.2 },
  { name: '公寓', icon: '🏢', toll: 1.8 },
  { name: '大樓', icon: '🏬', toll: 2.6 },
  { name: '摩天樓', icon: '🏙️', toll: 3.6 },
];
const MAX_LEVEL = LEVELS.length - 1;

// 交通工具：決定可擲骰子數
const VEHICLES = [
  { name: '步行', icon: '🚶', dice: 1, price: 0 },
  { name: '機車', icon: '🛵', dice: 2, price: 3000 },
  { name: '汽車', icon: '🚗', dice: 3, price: 8000 },
];

// 卡片。target: none | player | road | land | ownLand | stock | swap | passive
const CARDS = {
  remoteDice: { name: '遙控骰子', icon: '🎲', cost: 40, target: 'none', desc: '指定本回合要前進的步數' },
  stay: { name: '停留卡', icon: '⏸️', cost: 30, target: 'none', desc: '本回合原地停留，再次觸發所在格子' },
  roadblock: { name: '路障', icon: '🚧', cost: 30, target: 'road', range: 8, desc: '在前後 8 格內放置路障，經過者必須停下' },
  mine: { name: '地雷', icon: '💣', cost: 50, target: 'road', range: 8, desc: '在前後 8 格內埋地雷，踩到者住院 3 天' },
  robot: { name: '機器娃娃', icon: '🤖', cost: 30, target: 'none', desc: '清除前方 10 格內所有路障與地雷' },
  reverse: { name: '轉向卡', icon: '🔄', cost: 30, target: 'player', allowSelf: true, desc: '讓目標玩家行進方向反轉' },
  turtle: { name: '烏龜卡', icon: '🐢', cost: 50, target: 'player', allowSelf: true, desc: '目標玩家接下來 3 回合每次只能走 1 步' },
  hibernate: { name: '冬眠卡', icon: '💤', cost: 120, target: 'none', desc: '其他所有玩家冬眠 2 天' },
  equalRich: { name: '均富卡', icon: '⚖️', cost: 100, target: 'none', desc: '所有玩家平分現金' },
  equalPoor: { name: '均貧卡', icon: '🤝', cost: 80, target: 'player', desc: '與目標玩家平分現金' },
  tax: { name: '查稅卡', icon: '🧾', cost: 60, target: 'player', desc: '目標玩家繳交 30% 存款作為稅金' },
  steal: { name: '搶奪卡', icon: '🦹', cost: 60, target: 'player', desc: '隨機搶走目標玩家一張卡片' },
  buyLand: { name: '購地卡', icon: '📜', cost: 90, target: 'none', desc: '以土地總值強制購買你腳下的他人土地' },
  swapLand: { name: '換地卡', icon: '🔁', cost: 90, target: 'swap', desc: '用你的一塊土地交換他人的一塊土地（含建築）' },
  monster: { name: '怪獸卡', icon: '👾', cost: 70, target: 'land', desc: '摧毀一塊土地上的所有建築' },
  angel: { name: '天使卡', icon: '😇', cost: 80, target: 'land', desc: '目標土地所在區域的建築全部升一級' },
  devil: { name: '惡魔卡', icon: '👹', cost: 100, target: 'land', desc: '目標土地所在區域的建築全部摧毀' },
  priceUp: { name: '漲價卡', icon: '💹', cost: 60, target: 'land', desc: '目標土地所在區域過路費加倍，持續 5 天' },
  seal: { name: '查封卡', icon: '🔒', cost: 60, target: 'land', desc: '查封目標土地 5 天，期間無法收取過路費' },
  free: { name: '免費卡', icon: '🎫', cost: 40, target: 'passive', desc: '需付過路費時自動使用，免付一次' },
  red: { name: '紅卡', icon: '🟥', cost: 50, target: 'stock', desc: '指定股票連續 3 天大漲' },
  black: { name: '黑卡', icon: '⬛', cost: 50, target: 'stock', desc: '指定股票連續 3 天大跌' },
  summonGod: { name: '請神符', icon: '🧧', cost: 60, target: 'none', desc: '將地圖上距離最近的神明請到身上' },
  sendGod: { name: '送神符', icon: '🎐', cost: 60, target: 'player', desc: '把身上的神明送給目標玩家' },
  frame: { name: '陷害卡', icon: '👮', cost: 70, target: 'player', desc: '目標玩家入獄 2 天' },
  missile: { name: '飛彈卡', icon: '🚀', cost: 90, target: 'player', desc: '目標玩家住院 2 天，所在土地的建築被炸毀' },
};
const CARD_KEYS = Object.keys(CARDS);
const HAND_LIMIT = 12;

// 神明：附身後持續數回合
const GODS = {
  bigWealth: { name: '大財神', icon: '💰', good: true, turns: 5, desc: '收取過路費加倍，每回合獲得 $1,000' },
  smallWealth: { name: '小財神', icon: '🪙', good: true, turns: 4, desc: '收取過路費 1.5 倍' },
  bigLuck: { name: '大福神', icon: '🍀', good: true, turns: 5, desc: '免付過路費，購地與蓋房打 5 折' },
  smallLuck: { name: '小福神', icon: '☘️', good: true, turns: 4, desc: '過路費減半' },
  land: { name: '土地公', icon: '👴', good: true, turns: 4, desc: '停在無主空地時免費取得' },
  angel: { name: '天使', icon: '👼', good: true, turns: 3, desc: '停留處所在區域的建築全部升一級' },
  bigPoor: { name: '大窮神', icon: '💸', good: false, turns: 5, desc: '付過路費加倍，每回合損失 10% 現金' },
  smallPoor: { name: '小窮神', icon: '🥀', good: false, turns: 4, desc: '付過路費 1.5 倍' },
  bigBad: { name: '大衰神', icon: '⛈️', good: false, turns: 5, desc: '無法購地蓋房，每回合遺失一張卡片' },
  smallBad: { name: '小衰神', icon: '🌧️', good: false, turns: 4, desc: '無法購地蓋房' },
  devil: { name: '惡魔', icon: '😈', good: false, turns: 3, desc: '停留處所在區域的建築全部摧毀' },
};
const GOD_KEYS = Object.keys(GODS);
const GOOD_GODS = GOD_KEYS.filter(k => GODS[k].good);
const BAD_GODS = GOD_KEYS.filter(k => !GODS[k].good);

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// 經濟參數
const ECON = {
  salary: 1500,          // 經過銀行薪水
  salaryPoints: 20,      // 經過銀行點券
  upgradeRate: 0.5,      // 升級費用 = 地價 x 0.5
  sellRate: 0.6,         // 變賣土地回收比例
  interest: 0.05,        // 每月存款利息
  dividendPerShare: 0.004, // 每股分得過路費比例
  dividendCap: 0.3,      // 單人股利上限（過路費比例）
  stockImpactPer10: 0.012, // 每 10 股交易對股價的衝擊
};
