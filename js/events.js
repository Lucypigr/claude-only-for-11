// 機會、命運、新聞事件
// run(p) 回傳顯示訊息；after(p, depth) 為顯示訊息後才執行的動作（例如移動）
const ownLands = (p) => Game.s.tiles.filter(t => t.type === 'land' && t.owner === p.id);
const others = (p) => Game.s.players.filter(x => !x.bankrupt && x.id !== p.id);

const Events = {
  chance: [
    { icon: '🧾', title: '統一發票中獎', run: p => { p.cash += 2000; return '對中發票二獎，獲得 $2,000'; } },
    { icon: '🎰', title: '樂透頭獎', run: p => { p.cash += 6000; return '簽中樂透頭獎，獲得 $6,000！'; } },
    { icon: '🃏', title: '抽獎活動', run: p => { Game.giveCard(p, Game.randomCardKey()); Game.giveCard(p, Game.randomCardKey()); return '參加抽獎，獲得 2 張卡片'; } },
    { icon: '🏃', title: '搭上順風車', run: () => '搭上順風車，前進 3 步', after: (p, d) => Game.moveBy(p, 3, d) },
    { icon: '🏦', title: '銀行貴賓', run: () => '受邀到銀行 VIP 室，立刻前往銀行', after: (p, d) => Game.moveTo(p, 0, d) },
    { icon: '🎂', title: '生日快樂', run: () => '今天是你的生日，每位玩家送你 $500', after: async p => { for (const x of others(p)) await Game.pay(x, 500, p); } },
    {
      icon: '🔨', title: '都市更新補助', run: p => {
        const ls = ownLands(p).filter(t => t.level < MAX_LEVEL);
        if (!ls.length) { p.cash += 1000; return '沒有可以改建的土地，改領補助 $1,000'; }
        const t = U.pick(ls); t.level++;
        return `政府補助「${t.name}」免費升級為${LEVELS[t.level].name}`;
      },
    },
    { icon: '✨', title: '好神降臨', run: p => { Gods.attach(p, U.pick(GOOD_GODS)); return `${GODS[p.god].icon}${GODS[p.god].name}附身：${GODS[p.god].desc}`; } },
    { icon: '💹', title: '定存加碼', run: p => { const it = U.round10(p.deposit * 0.1); p.deposit += it; return `銀行加碼利率，存款增加 ${U.money(it)}`; } },
    { icon: '🎫', title: '撿到免費券', run: p => { Game.giveCard(p, 'free'); return '撿到一張免費卡'; } },
    {
      icon: '📈', title: '股東紀念品', run: p => {
        const d = U.rand(DISTRICTS.length);
        p.stocks[d] = Stocks.held(p, d) + 10;
        p.points += 20;
        return `參加股東會，獲得「${DISTRICTS[d].stock}」10 股與 20 點券`;
      },
    },
    { icon: '🎟️', title: '集點活動', run: p => { p.points += 60; return '集點活動大豐收，獲得 60 點券'; } },
  ],

  fate: [
    { icon: '🚓', title: '超速罰款', run: () => '開車超速被開罰單，罰款 $1,000', after: p => Game.pay(p, 1000) },
    { icon: '🤢', title: '食物中毒', run: () => '吃壞肚子，住院 2 天', after: p => { Game.sendHospital(p, 2); } },
    { icon: '🚔', title: '逃漏稅', run: () => '被查到逃漏稅，入獄 2 天', after: p => { Game.sendJail(p, 2); } },
    { icon: '🍻', title: '請客', run: () => '中了頭彩請大家吃飯，付給每位玩家 $500', after: async p => { for (const x of others(p)) await Game.pay(p, 500, x); } },
    {
      icon: '🧰', title: '房屋修繕', run: p => {
        const lv = ownLands(p).reduce((a, t) => a + t.level, 0);
        p._fee = lv * 300;
        return `房屋需要修繕，每級建築 $300，共 ${U.money(p._fee)}`;
      },
      after: p => Game.pay(p, p._fee),
    },
    { icon: '👛', title: '遺失錢包', run: p => { p._fee = U.round10(p.cash * 0.1); return `錢包掉了，損失現金 ${U.money(p._fee)}`; }, after: p => Game.pay(p, p._fee) },
    { icon: '🌧️', title: '衰神上身', run: p => { Gods.attach(p, U.pick(BAD_GODS.filter(k => k !== 'devil'))); return `${GODS[p.god].icon}${GODS[p.god].name}上身：${GODS[p.god].desc}`; } },
    { icon: '↩️', title: '走錯路', run: () => '迷路了，後退 3 步', after: (p, d) => Game.moveBy(p, -3, d) },
    {
      icon: '🦹', title: '遭小偷', run: p => {
        if (!p.cards.length) return '小偷光顧，但你什麼卡片都沒有';
        const [k] = p.cards.splice(U.rand(p.cards.length), 1);
        return `卡片「${CARDS[k].name}」被偷走了`;
      },
    },
    {
      icon: '🌪️', title: '龍捲風', run: p => {
        const ls = ownLands(p).filter(t => t.level > 0);
        if (!ls.length) return '龍捲風經過，幸好你沒有房子';
        const t = U.pick(ls); t.level--;
        return `「${t.name}」被龍捲風吹壞，降為${LEVELS[t.level].name}`;
      },
    },
    { icon: '🙏', title: '捐款行善', run: p => { p.points += 40; return '捐款 $800 行善，獲得 40 點券'; }, after: p => Game.pay(p, 800) },
    { icon: '💵', title: '意外之財', run: p => { p.cash += 1500; return '路邊撿到紅包，獲得 $1,500'; } },
  ],

  newsList: [
    { icon: '🏗️', title: '地價上漲', run: () => { Game.s.tiles.forEach(t => { if (t.type === 'land') t.price = U.round10(t.price * 1.1); }); return `${CURRENT_MAP.name}地價全面上漲 10%！`; } },
    { icon: '🐂', title: '股市大多頭', run: () => { DISTRICTS.forEach(d => { Stocks.shock(d.id, 0.08); Stocks.setTrend(d.id, 1, 2); }); return '外資大舉買超，所有股票大漲！'; } },
    { icon: '🐻', title: '股市崩盤', run: () => { DISTRICTS.forEach(d => Stocks.shock(d.id, -0.15)); return '國際情勢緊張，股市重挫 15%！'; } },
    { icon: '💵', title: '發放紓困金', run: () => { Game.s.players.forEach(x => { if (!x.bankrupt) x.cash += 2000; }); return '政府發放紓困金，每人 $2,000'; } },
    {
      icon: '🌀', title: '颱風來襲', run: () => {
        const d = U.pick(DISTRICTS);
        const n = Game.districtLevel(d.id, -1);
        return `強颱登陸${d.name}，${n} 棟建築受損降一級`;
      },
    },
    {
      icon: '🫨', title: '地震', run: () => {
        const ls = U.shuffle(Game.s.tiles.filter(t => t.type === 'land' && t.level > 0)).slice(0, 3);
        ls.forEach(t => { t.level--; });
        return ls.length ? `地震造成 ${ls.map(t => t.name).join('、')} 的建築受損` : '發生地震，幸好沒有災情';
      },
    },
    {
      icon: '🧾', title: '富人稅', run: () => {
        const r = Game.s.players.filter(x => !x.bankrupt).sort((a, b) => Game.netWorth(b) - Game.netWorth(a))[0];
        const amt = U.round10(r.cash * 0.1);
        r.cash -= amt;
        return `首富 ${r.name} 被課徵富人稅 ${U.money(amt)}`;
      },
    },
    {
      icon: '🤲', title: '急難救助', run: () => {
        const r = Game.s.players.filter(x => !x.bankrupt).sort((a, b) => Game.netWorth(a) - Game.netWorth(b))[0];
        r.cash += 3000;
        return `${r.name} 獲得急難救助金 $3,000`;
      },
    },
    { icon: '🎟️', title: '點券大放送', run: () => { Game.s.players.forEach(x => { if (!x.bankrupt) x.points += 50; }); return '每位玩家獲得 50 點券'; } },
    { icon: '🏮', title: '神明出巡', run: () => { for (let k = 0; k < 3; k++) Gods.spawn(true); return '眾神出巡，地圖上出現了新的神明！'; } },
    {
      icon: '🚧', title: '道路施工', run: () => {
        const s = Game.s, occ = new Set(s.players.map(x => x.pos));
        const free = U.shuffle(s.tiles.map((_, i) => i).filter(i => i && !s.obstacles[i] && !occ.has(i))).slice(0, 3);
        free.forEach(i => { s.obstacles[i] = 'roadblock'; });
        return `${free.map(i => s.tiles[i].name).join('、')} 道路施工，設置路障`;
      },
    },
    { icon: '🎡', title: '觀光熱潮', run: () => { const d = U.pick(DISTRICTS); Game.s.priceUp[d.id] = 5; Stocks.shock(d.id, 0.1); return `${d.name}掀起觀光熱潮，過路費加倍 5 天，${d.stock} 上漲`; } },
    { icon: '🏛️', title: '央行升息', run: () => { Game.s.players.forEach(x => { x.deposit += U.round10(x.deposit * 0.05); }); return '央行升息，所有人存款增加 5%'; } },
  ],

  async draw(p, kind, depth = 0) {
    const ev = U.pick(this[kind]);
    const label = kind === 'chance' ? '機會' : '命運';
    const msg = ev.run(p);
    UI.log(`${ev.icon} 【${label}】${p.name}：${ev.title} — ${msg}`, kind === 'chance' ? 'good' : 'bad');
    UI.renderAll();
    await UI.notify(`${label}：${ev.title}`, msg, ev.icon);
    if (ev.after) await ev.after(p, depth);
    UI.renderAll();
  },

  async news() {
    const ev = U.pick(this.newsList);
    const msg = ev.run();
    UI.log(`📰 【新聞】${ev.title} — ${msg}`, 'sys');
    UI.renderAll();
    await UI.notify(`新聞快報：${ev.title}`, msg, ev.icon);
  },
};
