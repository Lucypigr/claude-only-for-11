// 股票系統（參考 Fortune Street）：
// - 每個區域發行一檔股票，股價 = 區域開發價值 x 市場係數
// - 在該區蓋房升級會推升股價；大量買進(每10股)推升股價、大量賣出壓低股價
// - 有人在該區付過路費時，所有股東依持股數領取股利
// - 股價每天隨機波動；紅卡／黑卡／新聞會造成連續漲跌
const Stocks = {
  init(s) {
    s.stocks = DISTRICTS.map(() => ({ factor: 1, price: 0, prev: 0, trend: 0, trendDays: 0, history: [] }));
    this.recompute();
    s.stocks.forEach(st => { st.prev = st.price; st.history = [st.price]; });
  },

  intrinsic(d) {
    let v = 0;
    for (const t of Game.s.tiles) {
      if (t.type !== 'land' || t.district !== d) continue;
      v += t.price * (t.owner === null ? 0.6 : 1 + 0.55 * t.level);
    }
    return v / 40;
  },

  recompute() {
    const s = Game.s;
    if (!s || !s.stocks) return;
    s.stocks.forEach((st, i) => { st.price = Math.max(5, Math.round(this.intrinsic(i) * st.factor)); });
  },

  daily() {
    const s = Game.s;
    s.stocks.forEach((st, i) => {
      st.prev = st.price;
      let drift = U.randn() * 0.03 + (1 - st.factor) * 0.04;
      if (st.trendDays > 0) {
        drift += st.trend * U.randInt(6, 10) / 100;
        st.trendDays--;
      }
      st.factor = U.clamp(st.factor * (1 + drift), 0.35, 3.5);
      st.price = Math.max(5, Math.round(this.intrinsic(i) * st.factor));
      st.history.push(st.price);
      if (st.history.length > 30) st.history.shift();
    });
  },

  setTrend(d, dir, days) {
    const st = Game.s.stocks[d];
    st.trend = dir;
    st.trendDays = days;
  },

  shock(d, pctChange) {
    const st = Game.s.stocks[d];
    st.factor = U.clamp(st.factor * (1 + pctChange), 0.35, 3.5);
    this.recompute();
  },

  isOpen() {
    const wd = Game.s.date.getDay();
    return wd !== 0 && wd !== 6;
  },

  held(p, d) { return p.stocks[d] || 0; },

  value(p) {
    return Game.s.stocks.reduce((sum, st, i) => sum + this.held(p, i) * st.price, 0);
  },

  impact(qty) { return Math.min(0.15, Math.floor(qty / 10) * ECON.stockImpactPer10); },

  buy(p, d, qty) {
    const st = Game.s.stocks[d];
    qty = Math.floor(qty);
    if (qty <= 0 || st.price * qty > p.cash) return false;
    p.cash -= st.price * qty;
    p.stocks[d] = this.held(p, d) + qty;
    UI.log(`${p.icon} ${p.name} 以 ${st.price} 買進 ${DISTRICTS[d].stock} ${qty} 股`);
    st.factor = U.clamp(st.factor * (1 + this.impact(qty)), 0.35, 3.5);
    this.recompute();
    return true;
  },

  sell(p, d, qty) {
    const st = Game.s.stocks[d];
    qty = Math.min(Math.floor(qty), this.held(p, d));
    if (qty <= 0) return false;
    p.cash += st.price * qty;
    p.stocks[d] -= qty;
    UI.log(`${p.icon} ${p.name} 以 ${st.price} 賣出 ${DISTRICTS[d].stock} ${qty} 股`);
    st.factor = U.clamp(st.factor * (1 - this.impact(qty)), 0.35, 3.5);
    this.recompute();
    return true;
  },

  sellAll(p) {
    let got = 0;
    Game.s.stocks.forEach((st, i) => {
      const q = this.held(p, i);
      if (q > 0) { got += q * st.price; this.sell(p, i, q); }
    });
    return got;
  },

  // 過路費產生股利（由銀行支付，不從地主扣除）
  dividends(d, toll) {
    for (const p of Game.s.players) {
      const q = this.held(p, d);
      if (p.bankrupt || q <= 0) continue;
      const amt = U.round10(Math.min(toll * ECON.dividendCap, toll * ECON.dividendPerShare * q));
      if (amt > 0) {
        p.cash += amt;
        UI.log(`📈 ${p.name} 持有 ${DISTRICTS[d].stock} ${q} 股，獲得股利 ${U.money(amt)}`, 'good');
      }
    }
  },

  sparkline(hist, color) {
    if (hist.length < 2) return '';
    const w = 70, h = 20, mn = Math.min(...hist), mx = Math.max(...hist), span = mx - mn || 1;
    const pts = hist.map((v, i) => `${(i / (hist.length - 1) * w).toFixed(1)},${(h - (v - mn) / span * (h - 2) - 1).toFixed(1)}`).join(' ');
    return `<svg class="spark" width="${w}" height="${h}"><polyline fill="none" stroke="${color}" stroke-width="1.8" points="${pts}"/></svg>`;
  },

  // 真人玩家的股市介面
  openMarket(p, note) {
    const s = Game.s;
    const wrap = U.el('div');
    const render = () => {
      wrap.innerHTML = '';
      wrap.appendChild(U.el('div', { html: `${note ? `<div style="margin-bottom:6px">${note}</div>` : ''}💵 現金 <b>${U.money(p.cash)}</b>　📈 股票市值 <b>${U.money(this.value(p))}</b>
        <div class="muted" style="font-size:13px">每次買賣滿 10 股會使股價 ±${(ECON.stockImpactPer10 * 100).toFixed(1)}%。有人在該區付過路費時，股東每股可分得過路費的 ${(ECON.dividendPerShare * 100).toFixed(1)}%（上限 ${ECON.dividendCap * 100}%）。在該區蓋房會推升股價。</div>` }));
      const tbl = U.el('table', { class: 'tbl' });
      tbl.innerHTML = '<tr><th>股票</th><th>股價</th><th>漲跌</th><th class="col-spark">走勢</th><th>持股</th><th>數量</th><th></th></tr>';
      s.stocks.forEach((st, i) => {
        const ch = st.prev ? (st.price - st.prev) / st.prev : 0;
        const cls = ch > 0 ? 'up' : ch < 0 ? 'down' : '';
        const input = U.el('input', { type: 'number', min: 0, step: 10, value: 10 });
        const maxBtn = U.el('button', { class: 'small maxbtn', title: '最大可買', onclick: () => { input.value = Math.floor(p.cash / st.price); } }, 'MAX');
        const tr = U.el('tr', null,
          U.el('td', { html: `<span class="swatch" style="background:${DISTRICTS[i].color}"></span>${DISTRICTS[i].stock}` }),
          U.el('td', { class: cls }, String(st.price)),
          U.el('td', { class: cls }, U.pct(ch)),
          U.el('td', { class: 'col-spark', html: this.sparkline(st.history.concat(st.price), DISTRICTS[i].color) }),
          U.el('td', null, String(this.held(p, i))),
          U.el('td', null, U.el('span', { class: 'qty' }, input, maxBtn)),
          U.el('td', null,
            U.el('button', { class: 'small bad', onclick: () => { if (this.buy(p, i, +input.value)) { render(); UI.renderAll(); } else UI.toast('現金不足或數量錯誤'); } }, '買'),
            ' ',
            U.el('button', { class: 'small good', disabled: !this.held(p, i), onclick: () => { if (this.sell(p, i, +input.value)) { render(); UI.renderAll(); } } }, '賣')),
        );
        tbl.appendChild(tr);
      });
      wrap.appendChild(U.el('div', { style: { overflowX: 'auto' } }, tbl));
    };
    render();
    return UI.modal({ title: '股票市場', icon: '📈', wide: true, body: wrap, buttons: [{ label: '離開股市', value: true, cls: 'primary' }] });
  },

  // 停在證券所：內線消息 + 週末也可交易
  async exchangeTile(p) {
    const d = U.rand(DISTRICTS.length);
    const dir = U.chance(0.5) ? 1 : -1;
    const reliable = U.chance(0.75);
    if (reliable) this.setTrend(d, dir, 2);
    const msg = `內線消息：「${DISTRICTS[d].stock}」接下來兩天可能會${dir > 0 ? '大漲 🔺' : '下跌 🔻'}！`;
    if (p.isAI) {
      UI.log(`📈 ${p.name} 在證券所打聽到內線消息`);
      AI.tradeStocks(p, { d, dir });
      await U.wait(500);
    } else {
      await this.openMarket(p, `🤫 ${msg}<br><span class="muted">（證券所週末照常營業）</span>`);
    }
  },
};
