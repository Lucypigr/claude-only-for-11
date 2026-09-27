// 土地、過路費、付款、破產、銀行
Object.assign(Game, {
  upgradeCost(t) { return U.round10(t.price * ECON.upgradeRate); },
  landValue(t) { return t.price + t.level * this.upgradeCost(t); },
  landsValue(p) {
    return this.s.tiles.reduce((sum, t) => sum + (t.type === 'land' && t.owner === p.id ? this.landValue(t) : 0), 0);
  },
  netWorth(p) {
    if (p.bankrupt) return 0;
    return p.cash + p.deposit + this.landsValue(p) + Stocks.value(p);
  },
  districtLands(d) { return this.s.tiles.filter(t => t.type === 'land' && t.district === d); },

  // 過路費：建築等級 x 同區連鎖加成 x 漲價卡
  toll(t) {
    if (t.owner === null) return 0;
    const lands = this.districtLands(t.district);
    const owned = lands.filter(x => x.owner === t.owner).length;
    let mult = 1 + 0.25 * (owned - 1) + (owned === lands.length ? 0.5 : 0);
    if (this.s.priceUp[t.district] > 0) mult *= 2;
    return U.round10(t.price * LEVELS[t.level].toll * mult);
  },

  // 整區已擁有土地的建築等級增減，回傳受影響數量
  districtLevel(d, delta) {
    let n = 0;
    for (const t of this.districtLands(d)) {
      if (t.owner === null) continue;
      const nl = U.clamp(t.level + delta, 0, MAX_LEVEL);
      if (nl !== t.level) { t.level = nl; n++; }
    }
    UI.renderAll();
    return n;
  },

  async onLand(p, t) {
    if (t.owner === null) await this.offerBuy(p, t);
    else if (t.owner === p.id) await this.offerUpgrade(p, t);
    else await this.payToll(p, t);
    UI.renderAll();
    if (!p.bankrupt) await Gods.onStop(p, t);
  },

  async offerBuy(p, t) {
    const d = DISTRICTS[t.district];
    if (p.god === 'land') {
      t.owner = p.id;
      UI.log(`👴 土地公顯靈，${p.name} 免費獲得「${t.name}」`, 'good');
      await UI.notify('土地公送地', `免費獲得 ${d.name}・${t.name}！`, '👴');
      return;
    }
    if (!Gods.canBuild(p)) {
      UI.log(`${GODS[p.god].icon} ${p.name} 被衰神纏身，無法購地`, 'bad');
      return;
    }
    const cost = U.round10(t.price * Gods.discount(p));
    if (p.cash < cost) {
      UI.log(`${p.name} 現金不足，買不起「${t.name}」`);
      if (!p.isAI) UI.toast(`現金不足（需要 ${U.money(cost)}），可以到銀行提款喔`);
      return;
    }
    const yes = p.isAI ? AI.wantBuy(p, t, cost) : await UI.confirm('購買土地',
      `<div class="big-icon">🏞️</div>要花 <b>${U.money(cost)}</b> 買下 <b>${d.name}・${t.name}</b> 嗎？
      <div class="muted">現金 ${U.money(p.cash)}｜同區持有越多，過路費越高；購地也會推升「${d.stock}」股價</div>`, '購買', '不買', '🏞️');
    if (yes) {
      p.cash -= cost;
      t.owner = p.id;
      UI.log(`🏞️ ${p.name} 以 ${U.money(cost)} 買下「${t.name}」`, 'good');
    }
  },

  async offerUpgrade(p, t) {
    if (t.level >= MAX_LEVEL) {
      UI.log(`${p.name} 視察自己的${LEVELS[t.level].name}「${t.name}」`);
      return;
    }
    if (!Gods.canBuild(p)) {
      UI.log(`${GODS[p.god].icon} ${p.name} 被衰神纏身，無法蓋房`, 'bad');
      return;
    }
    const cost = U.round10(this.upgradeCost(t) * Gods.discount(p));
    if (p.cash < cost) return;
    const next = LEVELS[t.level + 1];
    const yes = p.isAI ? AI.wantUpgrade(p, t, cost) : await UI.confirm('蓋房子',
      `<div class="big-icon">${next.icon}</div>要花 <b>${U.money(cost)}</b> 把「${t.name}」升級為<b>${next.name}</b>嗎？
      <div class="muted">過路費：${U.money(this.toll(t))} → ${U.money(this.toll({ ...t, level: t.level + 1 }))}</div>`, '升級', '不要', '🔨');
    if (yes) {
      p.cash -= cost;
      t.level++;
      UI.log(`🔨 ${p.name} 把「${t.name}」蓋成${next.name}`, 'good');
    }
  },

  async payToll(p, t) {
    const owner = this.s.players[t.owner];
    if (owner.status.hospital > 0 || owner.status.jail > 0) {
      UI.log(`${owner.name} ${owner.status.hospital ? '住院' : '坐牢'}中，${p.name} 免付過路費`);
      return;
    }
    if (t.sealed > 0) {
      UI.log(`🔒「${t.name}」查封中，免付過路費`);
      return;
    }
    const toll = U.round10(this.toll(t) * Gods.tollRecvMult(owner) * Gods.tollPayMult(p));
    if (toll <= 0) {
      UI.log(`${GODS[p.god].icon} ${GODS[p.god].name}保佑，${p.name} 免付過路費`, 'good');
      return;
    }
    const fi = p.cards.indexOf('free');
    if (fi >= 0) {
      const use = p.isAI ? toll >= 400 : await UI.confirm('使用免費卡？',
        `需支付過路費 <b>${U.money(toll)}</b> 給 ${owner.icon}${U.esc(owner.name)}`, '使用免費卡 🎫', '照付');
      if (use) {
        p.cards.splice(fi, 1);
        UI.log(`🎫 ${p.name} 使用免費卡，免付「${t.name}」過路費`, 'good');
        return;
      }
    }
    UI.log(`💸 ${p.name} 支付 ${owner.name} 過路費 ${U.money(toll)}`, 'bad');
    if (!p.isAI) await UI.notify('支付過路費', `付給 ${owner.icon}${U.esc(owner.name)} <b>${U.money(toll)}</b>`, '💸');
    else UI.toast(`💸 ${U.esc(p.name)} 付給 ${U.esc(owner.name)} ${U.money(toll)}`);
    const paid = await this.pay(p, toll, owner);
    if (paid > 0) Stocks.dividends(t.district, paid);
  },

  // 付款，不足時自動提款、賣股票、賣地；仍不足則破產。回傳實付金額
  async pay(p, amount, to) {
    amount = Math.round(amount);
    if (amount <= 0 || p.bankrupt) return 0;
    if (p.cash < amount) await this.raiseCash(p, amount);
    const paid = Math.min(p.cash, amount);
    p.cash -= paid;
    if (to) to.cash += paid;
    if (paid < amount) await this.bankrupt(p);
    UI.renderAll();
    return paid;
  },

  async raiseCash(p, amount) {
    if (p.deposit > 0) {
      const w = Math.min(p.deposit, amount - p.cash);
      p.deposit -= w;
      p.cash += w;
      UI.log(`🏦 ${p.name} 現金不足，自動提款 ${U.money(w)}`);
    }
    if (p.cash >= amount) return;
    const order = this.s.stocks.map((st, i) => i).filter(i => Stocks.held(p, i) > 0)
      .sort((a, b) => this.s.stocks[b].price - this.s.stocks[a].price);
    for (const i of order) {
      if (p.cash >= amount) return;
      const price = this.s.stocks[i].price;
      Stocks.sell(p, i, Math.min(Stocks.held(p, i), Math.ceil((amount - p.cash) / price)));
    }
    if (p.cash >= amount) return;
    const lands = this.s.tiles.filter(t => t.type === 'land' && t.owner === p.id).sort((a, b) => this.landValue(a) - this.landValue(b));
    for (const t of lands) {
      if (p.cash >= amount) return;
      const got = U.round10(this.landValue(t) * ECON.sellRate);
      p.cash += got;
      t.owner = null;
      t.level = 0;
      UI.log(`🏚️ ${p.name} 被迫變賣「${t.name}」得 ${U.money(got)}`, 'bad');
    }
  },

  async bankrupt(p) {
    p.bankrupt = true;
    p.cash = 0;
    p.deposit = 0;
    p.cards = [];
    p.god = null;
    p.stocks = {};
    for (const t of this.s.tiles) {
      if (t.owner === p.id) { t.owner = null; t.level = 0; t.sealed = 0; }
    }
    UI.log(`☠️ ${p.name} 破產了！`, 'bad');
    UI.renderAll();
    await UI.notify('破產', `${p.icon} ${U.esc(p.name)} 宣告破產，退出遊戲！`, '☠️', !p.isAI);
  },

  async onBank(p) {
    if (p.isAI) {
      AI.bank(p);
      return;
    }
    const wrap = U.el('div');
    const input = U.el('input', { type: 'number', min: 0, step: 1000, value: 5000, style: { width: '120px', padding: '6px', fontSize: '16px' } });
    const info = U.el('div');
    const refresh = () => { info.innerHTML = `💵 現金 <b>${U.money(p.cash)}</b>　🏦 存款 <b>${U.money(p.deposit)}</b><div class="muted">每月 1 日存款可獲得 ${ECON.interest * 100}% 利息；存款不會被均富卡、均貧卡分走（但會被查稅）。</div>`; UI.renderPlayers(); };
    const act = (kind, all) => {
      let amt = all ? (kind === 'in' ? p.cash : p.deposit) : Math.max(0, Math.floor(+input.value || 0));
      if (kind === 'in') amt = Math.min(amt, p.cash); else amt = Math.min(amt, p.deposit);
      if (kind === 'in') { p.cash -= amt; p.deposit += amt; } else { p.deposit -= amt; p.cash += amt; }
      refresh();
    };
    wrap.append(info, U.el('div', { style: { marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
      '金額', input,
      U.el('button', { class: 'small', onclick: () => act('in') }, '存入'),
      U.el('button', { class: 'small', onclick: () => act('out') }, '提領'),
      U.el('button', { class: 'small', onclick: () => act('in', true) }, '全部存入'),
      U.el('button', { class: 'small', onclick: () => act('out', true) }, '全部提領')));
    refresh();
    await UI.modal({ title: '銀行', icon: '🏦', body: wrap, buttons: [{ label: '離開銀行', value: true, cls: 'primary' }] });
  },
});
