// 畫面繪製與互動元件
const $ = (sel) => document.querySelector(sel);

const UI = {
  tileEls: [],
  picking: null,

  cols: 14,
  rows: 10,

  // 環狀路線座標：橫向 14x10，直向（手機）8x16，兩者外圈都是 44 格
  tileCoord(i) {
    const C = this.cols, R = this.rows;
    if (i < C) return { r: 1, c: i + 1 };
    if (i < C + R - 2) return { r: i - C + 2, c: C };
    if (i < 2 * C + R - 2) return { r: R, c: C - (i - (C + R - 2)) };
    return { r: R - (i - (2 * C + R - 3)), c: 1 };
  },

  layout() {
    const portrait = window.innerWidth < 760 && window.innerHeight > window.innerWidth;
    [this.cols, this.rows] = portrait ? [8, 16] : [BOARD_COLS, BOARD_ROWS];
    const board = $('#board');
    board.classList.toggle('portrait', portrait);
    board.style.setProperty('--cols', this.cols);
    board.style.setProperty('--rows', this.rows);
    const center = board.querySelector('.center');
    if (center) Object.assign(center.style, { gridColumn: `2 / ${this.cols}`, gridRow: `2 / ${this.rows}` });
    this.tileEls.forEach((el, i) => {
      const { r, c } = this.tileCoord(i);
      el.style.gridRow = r;
      el.style.gridColumn = c;
    });
  },

  init() {
    const board = $('#board');
    board.innerHTML = '';
    // 日期、骰子、事件等資訊：平面模式放在棋盤中央，3D 模式浮在畫面上
    this.hud = U.el('div', { class: 'hud' },
      U.el('div', { class: 'ctitle' }, '大富翁'),
      U.el('div', { class: 'cdate', id: 'cdate' }),
      U.el('div', { class: 'cturn', id: 'cturn' }),
      U.el('div', { class: 'dice', id: 'dice' }),
      U.el('div', { class: 'cevent', id: 'cevent' }),
      U.el('div', { class: 'ticker', id: 'ticker' }),
    );
    board.appendChild(U.el('div', { class: 'center' }, this.hud));
    this.tileEls = Game.s.tiles.map((t, i) => {
      const el = U.el('div', { class: 'tile', onclick: () => this.onTileClick(i) });
      board.appendChild(el);
      return el;
    });
    this.layout();
    if (!this.resizeBound) {
      this.resizeBound = true;
      window.addEventListener('resize', () => this.layout());
    }
    $('#log').innerHTML = '';
    this.applyMode();
    this.renderAll();
  },

  // ---------- 3D / 平面切換 ----------
  getMode() {
    try { return localStorage.getItem('richman-view') || '3d'; } catch (e) { return '3d'; }
  },

  setMode(mode) {
    try { localStorage.setItem('richman-view', mode); } catch (e) { /* 忽略 */ }
    this.applyMode();
    this.renderAll();
  },

  applyMode() {
    let mode = this.getMode();
    const v = $('#view3d');
    if (mode === '3d' && !View3D.init(v.querySelector('.stage'))) {
      mode = '2d';
      this.toast('此裝置不支援 WebGL，改用平面棋盤');
    }
    const is3d = mode === '3d';
    document.body.classList.toggle('mode3d', is3d);
    v.classList.toggle('hidden', !is3d);
    $('#board').classList.toggle('hidden', is3d);
    (is3d ? v.querySelector('.hudwrap') : $('#board .center')).appendChild(this.hud);
    $('#btnView').textContent = is3d ? '🗺️ 平面棋盤' : '🏙️ 3D 地圖';
    View3D.setActive(is3d);
    if (is3d) View3D.resize();
  },

  bindViewControls() {
    $('#btnView').addEventListener('click', () => this.setMode(this.getMode() === '3d' ? '2d' : '3d'));
    $('#camMode').addEventListener('click', (e) => {
      e.currentTarget.textContent = View3D.toggleMode() === 'follow' ? '🗺️ 全景' : '🎯 跟隨';
    });
    $('#camIn').addEventListener('click', () => View3D.zoom(0.8));
    $('#camOut').addEventListener('click', () => View3D.zoom(1.25));
    $('#camReset').addEventListener('click', () => View3D.resetView());
  },

  renderAll() {
    if (!Game.s) return;
    Stocks.recompute();
    Game.s.tiles.forEach((_, i) => this.renderTile(i));
    this.renderPlayers();
    this.renderCenter();
    if (View3D.active) View3D.sync();
  },

  renderTile(i) {
    const s = Game.s, t = s.tiles[i], el = this.tileEls[i];
    if (!el) return;
    el.className = 'tile';
    el.style.removeProperty('--oc');
    let html = '', title = '';
    if (t.type === 'land') {
      const d = DISTRICTS[t.district];
      html += `<div class="bar" style="background:${d.color}"></div><div class="tname">${t.name}</div>`;
      if (t.level > 0) html += `<div class="tbld">${LEVELS[t.level].icon}</div>`;
      if (t.owner !== null) {
        const o = s.players[t.owner];
        el.classList.add('owned');
        el.style.setProperty('--oc', o.color);
        html += `<div class="tsub">過${U.money(Game.toll(t))}</div><div class="owner-dot">${o.icon}</div>`;
        title = `${d.name}・${t.name}｜${o.name}的${LEVELS[t.level].name}｜過路費 ${U.money(Game.toll(t))}`;
      } else {
        html += `<div class="tsub">${U.money(t.price)}</div>`;
        title = `${d.name}・${t.name}｜空地 ${U.money(t.price)}`;
      }
      const flags = (t.sealed > 0 ? '🔒' : '') + (s.priceUp[t.district] > 0 ? '💹' : '');
      if (flags) html += `<div class="tflag">${flags}</div>`;
    } else {
      const tt = TILE_TYPES[t.type];
      el.classList.add('special');
      if ([0, 13, 22, 35].includes(i)) el.classList.add('corner');
      html += `<div class="ticon">${tt.icon}</div><div class="tname">${tt.name}</div>`;
      title = `${tt.name}：${tt.desc}`;
    }
    if (s.mapGods[i]) {
      html += `<div class="tgod">${GODS[s.mapGods[i]].icon}</div>`;
      title += `｜神明：${GODS[s.mapGods[i]].name}`;
    }
    if (s.obstacles[i]) html += `<div class="tob">${s.obstacles[i] === 'mine' ? '💣' : '🚧'}</div>`;
    html += '<div class="tokens"></div>';
    el.innerHTML = html;
    el.title = title;
    const tokens = el.querySelector('.tokens');
    for (const p of s.players) {
      if (!p.bankrupt && p.pos === i) {
        tokens.appendChild(U.el('div', { class: 'token', style: { '--pc': p.color }, title: p.name }, p.icon));
      }
    }
    if (this.picking && this.picking.set.has(i)) el.classList.add('pickable');
    if (View3D.active) View3D.syncTile(i);
  },

  renderPlayers() {
    const s = Game.s, root = $('#players');
    root.innerHTML = '';
    s.players.forEach((p, idx) => {
      const status = [];
      if (p.status.hospital) status.push(`🏥${p.status.hospital}`);
      if (p.status.jail) status.push(`🚔${p.status.jail}`);
      if (p.status.sleep) status.push(`💤${p.status.sleep}`);
      if (p.status.turtle) status.push(`🐢${p.status.turtle}`);
      if (p.dir < 0) status.push('🔄');
      const card = U.el('div', {
        class: 'pcard' + (idx === s.current ? ' active' : '') + (p.bankrupt ? ' dead' : ''),
        style: { '--pc': p.color }, onclick: () => this.showAssets(p),
      },
        U.el('div', { class: 'pav' }, p.icon),
        U.el('div', { class: 'pname' }, `${p.name}${p.isAI ? ' 🤖' : ''}`),
        U.el('div', { class: 'pmoney' }, `💵${U.money(p.cash)} 🏦${U.money(p.deposit)}`),
        U.el('div', { class: 'pstat' }, p.bankrupt ? '已破產' :
          `🎟️${p.points} 🃏${p.cards.length} ${VEHICLES[p.vehicle].icon} ${status.join(' ')}`),
        U.el('div', { class: 'pstat' }, p.bankrupt ? '' : `總資產 ${U.money(Game.netWorth(p))}`),
        p.god ? U.el('div', { class: 'pgod', title: `${GODS[p.god].name}：${GODS[p.god].desc}（剩 ${p.godTurns} 回合）` }, GODS[p.god].icon) : null,
      );
      root.appendChild(card);
    });
  },

  dateText() {
    const d = Game.s.date;
    const wd = d.getDay();
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[wd]}）${wd === 0 || wd === 6 ? ' 股市休市' : ''}`;
  },

  renderCenter() {
    const s = Game.s;
    $('#cdate').textContent = `第 ${s.day} 天・${this.dateText()}`;
    const p = s.players[s.current];
    $('#cturn').innerHTML = p ? `<b style="color:${p.color}">${p.icon} ${U.esc(p.name)}</b> 的回合` : '';
    const ticker = $('#ticker');
    ticker.innerHTML = '';
    s.stocks.forEach((st, i) => {
      const ch = st.prev ? (st.price - st.prev) / st.prev : 0;
      ticker.appendChild(U.el('span', { class: ch > 0 ? 'up' : ch < 0 ? 'down' : '' },
        `${DISTRICTS[i].stock} ${st.price}${ch > 0 ? '▲' : ch < 0 ? '▼' : ''}`));
    });
    const info = $('#turnInfo');
    if (p) {
      info.innerHTML = `<div class="who" style="color:${p.color}">${p.icon} ${U.esc(p.name)}</div>
        <div>位置：${U.esc(s.tiles[p.pos].name)}　${VEHICLES[p.vehicle].icon}${VEHICLES[p.vehicle].name}（${VEHICLES[p.vehicle].dice} 顆骰子）</div>
        ${p.god ? `<div>附身：${GODS[p.god].icon}${GODS[p.god].name}（剩 ${p.godTurns} 回合）</div>` : ''}`;
    }
  },

  log(msg, cls) {
    const box = $('#log');
    if (!box) return;
    box.appendChild(U.el('div', { class: cls || '', html: msg }));
    while (box.children.length > 250) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
    const ev = $('#cevent');
    if (ev && cls && cls !== 'sys') {
      ev.className = `cevent ${cls}`;
      ev.innerHTML = msg;
    }
  },

  toast(msg, ms = 1800) {
    const t = U.el('div', { class: 'toast', html: msg });
    $('#toastRoot').appendChild(t);
    setTimeout(() => t.remove(), U.speed > 0 ? ms : 10);
  },

  flashTile(i) {
    View3D.flash(i);
    const el = this.tileEls[i];
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  },

  // 通用對話框。buttons: [{label, value, cls, disabled}]。onMount(box, done) 可自訂互動內容
  modal({ title, icon, body, buttons, wide, onMount }) {
    return new Promise(resolve => {
      const overlay = U.el('div', { class: 'overlay' });
      const box = U.el('div', { class: 'modal' + (wide ? ' wide' : '') });
      const done = (v) => { overlay.remove(); resolve(v); };
      box.appendChild(U.el('h2', null, icon ? U.el('span', null, icon) : null, title || ''));
      const mb = U.el('div', { class: 'mbody' });
      if (body instanceof Node) mb.appendChild(body); else if (body) mb.innerHTML = body;
      box.appendChild(mb);
      if (buttons && buttons.length) {
        const bb = U.el('div', { class: 'mbtns' });
        for (const b of buttons) {
          bb.appendChild(U.el('button', { class: b.cls || '', disabled: b.disabled, onclick: () => done(b.value) }, b.label));
        }
        box.appendChild(bb);
      }
      overlay.appendChild(box);
      $('#modalRoot').appendChild(overlay);
      if (onMount) onMount(mb, done, box);
    });
  },

  async confirm(title, body, yes = '確定', no = '取消', icon) {
    return this.modal({ title, icon, body, buttons: [{ label: no, value: false }, { label: yes, value: true, cls: 'primary' }] });
  },

  async choose(title, body, options, icon) {
    return this.modal({ title, icon, body, buttons: options.map(o => ({ label: o.label, value: o.value, cls: o.cls, disabled: o.disabled })) });
  },

  // 真人玩家需要按確定，電腦回合只顯示提示
  async notify(title, body, icon, forceModal = false) {
    if (forceModal || Game.humanTurn()) {
      await this.modal({ title, icon, body: `${icon ? `<div class="big-icon">${icon}</div>` : ''}<div style="text-align:center">${body}</div>`, buttons: [{ label: '確定', value: true, cls: 'primary' }] });
    } else {
      this.toast(`${icon || ''} <b>${title}</b>：${body}`, 2200);
      await U.wait(900);
    }
  },

  // 在棋盤上選擇格子
  pickTile(prompt, indexes) {
    return new Promise(resolve => {
      const bar = U.el('div', { class: 'pickbar' }, U.el('span', null, prompt),
        U.el('button', { class: 'small', onclick: () => finish(null) }, '取消'));
      const finish = (v) => {
        this.picking = null;
        bar.remove();
        this.renderAll();
        resolve(v);
      };
      this.picking = { set: new Set(indexes), finish };
      document.body.appendChild(bar);
      this.renderAll();
    });
  },

  onTileClick(i) {
    if (this.picking) {
      if (this.picking.set.has(i)) this.picking.finish(i);
      return;
    }
    this.showTileInfo(i);
  },

  showTileInfo(i) {
    const s = Game.s, t = s.tiles[i];
    if (t.type !== 'land') {
      const tt = TILE_TYPES[t.type];
      this.modal({ title: tt.name, icon: tt.icon, body: tt.desc, buttons: [{ label: '關閉' }] });
      return;
    }
    const d = DISTRICTS[t.district];
    const owner = t.owner !== null ? s.players[t.owner] : null;
    const body = `<table class="tbl">
      <tr><td>區域</td><td><span class="swatch" style="background:${d.color}"></span>${d.name}（股票：${d.stock} ${s.stocks[d.id].price}）</td></tr>
      <tr><td>地價</td><td>${U.money(t.price)}</td></tr>
      <tr><td>地主</td><td>${owner ? `${owner.icon} ${U.esc(owner.name)}` : '無'}</td></tr>
      <tr><td>建築</td><td>${LEVELS[t.level].icon} ${LEVELS[t.level].name}（${t.level}/${MAX_LEVEL}）</td></tr>
      <tr><td>過路費</td><td>${owner ? U.money(Game.toll(t)) : '-'}</td></tr>
      <tr><td>升級費用</td><td>${U.money(Game.upgradeCost(t))}</td></tr>
      <tr><td>土地總值</td><td>${U.money(Game.landValue(t))}</td></tr>
      ${t.sealed > 0 ? `<tr><td>狀態</td><td>🔒 查封中（${t.sealed} 天）</td></tr>` : ''}
      ${s.priceUp[t.district] > 0 ? `<tr><td>狀態</td><td>💹 漲價中（${s.priceUp[t.district]} 天）</td></tr>` : ''}
    </table>`;
    this.modal({ title: `${d.name}・${t.name}`, body, buttons: [{ label: '關閉' }] });
  },

  showAssets(p) {
    const s = Game.s;
    const lands = s.tiles.filter(t => t.type === 'land' && t.owner === p.id);
    const landRows = lands.map(t => `<tr><td><span class="swatch" style="background:${DISTRICTS[t.district].color}"></span>${t.name}</td><td>${LEVELS[t.level].icon}${LEVELS[t.level].name}</td><td>${U.money(Game.toll(t))}</td></tr>`).join('');
    const stockRows = s.stocks.map((st, i) => p.stocks[i] ? `<tr><td>${DISTRICTS[i].stock}</td><td>${p.stocks[i]} 股</td><td>${U.money(p.stocks[i] * st.price)}</td></tr>` : '').join('');
    const cards = p.cards.map(k => `${CARDS[k].icon}${CARDS[k].name}`).join('、') || '無';
    const body = `<div>💵 現金 ${U.money(p.cash)}　🏦 存款 ${U.money(p.deposit)}　🎟️ 點券 ${p.points}</div>
      <div>🏠 土地 ${U.money(Game.landsValue(p))}　📈 股票 ${U.money(Stocks.value(p))}　<b>總資產 ${U.money(Game.netWorth(p))}</b></div>
      ${p.god ? `<div>附身：${GODS[p.god].icon}${GODS[p.god].name} — ${GODS[p.god].desc}（剩 ${p.godTurns} 回合）</div>` : ''}
      <h3>土地（${lands.length}）</h3>${lands.length ? `<table class="tbl"><tr><th>名稱</th><th>建築</th><th>過路費</th></tr>${landRows}</table>` : '無'}
      <h3>股票</h3>${stockRows ? `<table class="tbl"><tr><th>股票</th><th>持股</th><th>市值</th></tr>${stockRows}</table>` : '無'}
      <h3>卡片（${p.cards.length}/${HAND_LIMIT}）</h3><div>${cards}</div>`;
    this.modal({ title: `${p.name} 的資產`, icon: p.icon, body, buttons: [{ label: '關閉' }] });
  },

  // 右側動作列，回傳按下的按鈕值
  actions(buttons, hint) {
    return new Promise(resolve => {
      const root = $('#actions');
      root.innerHTML = '';
      if (hint) root.appendChild(U.el('div', { class: 'hint', html: hint }));
      for (const b of buttons) {
        root.appendChild(U.el('button', {
          class: b.cls || '', disabled: b.disabled, title: b.title,
          onclick: () => { root.innerHTML = ''; resolve(b.value); },
        }, b.label));
      }
    });
  },

  clearActions(text) {
    $('#actions').innerHTML = text ? `<div class="hint">${text}</div>` : '';
  },

  async rollDice(values) {
    const box = $('#dice');
    box.innerHTML = '';
    const dice = values.map(() => box.appendChild(U.el('div', { class: 'die rolling' }, '?')));
    const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    for (let k = 0; k < 8; k++) {
      dice.forEach(d => { d.textContent = faces[U.rand(6)]; });
      await U.wait(60);
    }
    dice.forEach((d, i) => { d.classList.remove('rolling'); d.textContent = values[i]; });
    await U.wait(250);
  },

  showDiceText(text) {
    $('#dice').innerHTML = `<div class="die" style="width:auto;padding:0 10px">${text}</div>`;
  },

  // 顯示手牌，回傳要使用的卡片索引或 null
  showHand(p, canUse) {
    const grid = U.el('div', { class: 'cardgrid' });
    return this.modal({
      title: `${p.name} 的卡片（${p.cards.length}/${HAND_LIMIT}）`, icon: '🃏', wide: true, body: grid,
      buttons: [{ label: '關閉', value: null }],
      onMount: (mb, done) => {
        if (!p.cards.length) grid.appendChild(U.el('div', { class: 'muted' }, '目前沒有卡片，停在「卡片」格或到道具店購買吧！'));
        p.cards.forEach((k, idx) => {
          const c = CARDS[k];
          grid.appendChild(U.el('div', { class: 'gcard' },
            U.el('div', { class: 'gi' }, c.icon), U.el('div', { class: 'gn' }, c.name), U.el('div', { class: 'gd' }, c.desc),
            c.target === 'passive' ? U.el('div', { class: 'muted' }, '（被動卡，自動使用）') :
              U.el('button', { class: 'primary small', disabled: !canUse, onclick: () => done(idx) }, '使用')));
        });
      },
    });
  },

  async gameOver(ranking, reason) {
    const rows = ranking.map((p, i) => `<tr><td>${['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'][i]} ${p.icon} ${U.esc(p.name)}</td><td>${p.bankrupt ? '破產' : U.money(Game.netWorth(p))}</td></tr>`).join('');
    const w = ranking[0];
    await this.modal({
      title: '遊戲結束', icon: '🏆',
      body: `<div class="big-icon">${w.icon}</div><p style="text-align:center"><b>${U.esc(w.name)}</b> 成為大富翁！<br><span class="muted">${reason}</span></p>
        <table class="tbl"><tr><th>玩家</th><th>總資產</th></tr>${rows}</table>`,
      buttons: [{ label: '再玩一次', value: true, cls: 'primary' }],
    });
    Game.clearSave();
    location.reload();
  },
};
