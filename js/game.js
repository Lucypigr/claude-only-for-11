// 遊戲主流程：回合、移動、格子事件、每日結算
const SAVE_KEY = 'richman-formosa-save';
const HOSPITAL = MAP_TILES.findIndex(t => t.type === 'hospital');
const JAIL = MAP_TILES.findIndex(t => t.type === 'jail');

const Game = {
  s: null,
  turn: null,

  newState(settings) {
    const s = {
      settings,
      players: settings.players.map((ps, i) => {
        const ch = CHARACTERS.find(c => c.id === ps.charId);
        return {
          id: i, name: ch.name, icon: ch.icon, color: ch.color, charId: ch.id, isAI: ps.isAI,
          cash: settings.cash, deposit: settings.cash, points: 100,
          pos: 0, dir: 1, cards: [], god: null, godTurns: 0, vehicle: 0, bankrupt: false,
          status: { hospital: 0, jail: 0, sleep: 0, turtle: 0 }, stocks: {},
        };
      }),
      tiles: MAP_TILES.map(t => ({ ...t, owner: null, level: 0, sealed: 0 })),
      obstacles: {}, mapGods: {}, priceUp: {},
      stocks: [], day: 1, date: new Date(2026, 0, 1), current: 0, over: false,
    };
    return s;
  },

  async start(settings) {
    applyMap(settings.mapId);
    this.s = this.newState(settings);
    Stocks.init(this.s);
    for (const p of this.s.players) {
      for (let k = 0; k < 3; k++) p.cards.push(this.randomCardKey());
    }
    Gods.spawn(true);
    Gods.spawn(true);
    this.enterGame();
    UI.log(`🎉 遊戲開始！地圖：${CURRENT_MAP.name}。目標：成為第一大富翁！`, 'sys');
    UI.log(`📅 ${UI.dateText()}`, 'sys');
    this.save();
    await this.loop();
  },

  async resume() {
    const s = this.load();
    if (!s) return false;
    applyMap(s.settings.mapId);
    this.s = s;
    this.enterGame();
    UI.log('💾 已讀取存檔，繼續遊戲', 'sys');
    await this.loop();
    return true;
  },

  enterGame() {
    U.speed = this.s.settings.speed;
    $('#setup').classList.add('hidden');
    $('#game').classList.remove('hidden');
    UI.init();
  },

  humanTurn() {
    const p = this.s && this.s.players[this.s.current];
    return !!p && !p.isAI;
  },

  async loop() {
    const s = this.s;
    while (!s.over) {
      const p = s.players[s.current];
      if (!p.bankrupt) {
        await this.takeTurn(p);
        UI.renderAll();
        await U.wait(250);
      }
      if (this.checkEnd()) break;
      s.current = (s.current + 1) % s.players.length;
      if (s.current === 0) await this.newDay();
      if (this.checkEnd()) break;
    }
    const ranking = s.players.slice().sort((a, b) => (a.bankrupt - b.bankrupt) || (this.netWorth(b) - this.netWorth(a)));
    await UI.gameOver(ranking, s.endReason);
  },

  checkEnd() {
    const s = this.s;
    if (s.over) return true;
    const alive = s.players.filter(p => !p.bankrupt);
    const humans = s.players.filter(p => !p.isAI);
    if (alive.length <= 1) s.endReason = '其他玩家全部破產';
    else if (humans.length && humans.every(p => p.bankrupt)) s.endReason = '所有真人玩家都破產了';
    else if (s.settings.maxDays && s.day > s.settings.maxDays) s.endReason = `已經過 ${s.settings.maxDays} 天，依總資產排名`;
    else if (s.settings.target && alive.some(p => this.netWorth(p) >= s.settings.target)) s.endReason = `有玩家總資產達到 ${U.money(s.settings.target)}`;
    else return false;
    s.over = true;
    return true;
  },

  async takeTurn(p) {
    const s = this.s;
    this.turn = { cardsUsed: 0, remote: null, stay: false, diceCount: VEHICLES[p.vehicle].dice };
    UI.renderAll();
    UI.clearActions(p.isAI ? `${p.icon} ${p.name} 思考中…` : '');
    UI.log(`<b style="color:${p.color}">${p.icon} ${U.esc(p.name)}</b> 的回合`, 'sys');

    for (const [k, label, icon] of [['hospital', '住院中', '🏥'], ['jail', '坐牢中', '🚔'], ['sleep', '冬眠中', '💤']]) {
      if (p.status[k] > 0) {
        p.status[k]--;
        UI.log(`${icon} ${p.name} ${label}，還剩 ${p.status[k]} 天`);
        UI.showDiceText(icon);
        Gods.tick(p);
        await U.wait(700);
        return;
      }
    }

    await Gods.onTurnStart(p);
    if (p.isAI) await AI.preRoll(p);
    else await this.humanPreRoll(p);
    if (p.bankrupt || s.over) return;
    UI.clearActions();

    if (this.turn.stay) {
      UI.showDiceText('⏸️');
      UI.log(`⏸️ ${p.name} 原地停留`);
      await this.resolveTile(p);
    } else {
      let steps;
      if (p.status.turtle > 0) {
        p.status.turtle--;
        steps = 1;
        UI.showDiceText('🐢 1');
        UI.log(`🐢 ${p.name} 變成烏龜，只能走 1 步`);
      } else if (this.turn.remote) {
        steps = this.turn.remote;
        UI.showDiceText(`🎲 ${steps}`);
        UI.log(`🎲 ${p.name} 用遙控骰子前進 ${steps} 步`);
      } else {
        const values = Array.from({ length: this.turn.diceCount }, () => U.randInt(1, 6));
        await UI.rollDice(values);
        steps = values.reduce((a, b) => a + b, 0);
        UI.log(`🎲 ${p.name} 擲出 ${values.join('+')} = ${steps} 點`);
      }
      const res = await this.move(p, steps);
      if (res !== 'hospital' && !p.bankrupt) await this.resolveTile(p);
    }
    if (!p.bankrupt) Gods.tick(p);
    UI.renderAll();
  },

  async humanPreRoll(p) {
    const maxDice = VEHICLES[p.vehicle].dice;
    for (;;) {
      const open = Stocks.isOpen();
      const t = this.turn;
      const rollLabel = t.stay ? '⏸️ 原地停留' : t.remote ? `🎲 前進 ${t.remote} 步` : p.status.turtle ? '🐢 前進 1 步' : `🎲 擲骰子（${t.diceCount} 顆）`;
      const v = await UI.actions([
        { label: rollLabel, value: 'roll', cls: 'primary' },
        maxDice > 1 && !t.remote && !t.stay ? { label: `🔢 骰子數 ${t.diceCount}/${maxDice}`, value: 'dice' } : null,
        { label: `🃏 卡片（${p.cards.length}）`, value: 'cards' },
        { label: open ? '📈 股市' : '📈 休市中', value: 'stock', disabled: !open },
        { label: '💼 資產', value: 'assets' },
      ].filter(Boolean), `輪到你了！可以先使用卡片（每回合 1 張）或交易股票，再擲骰子。`);
      if (v === 'roll') return;
      if (v === 'dice') t.diceCount = t.diceCount % maxDice + 1;
      if (v === 'stock') await Stocks.openMarket(p);
      if (v === 'assets') UI.showAssets(p);
      if (v === 'cards') {
        const idx = await UI.showHand(p, t.cardsUsed < 1);
        if (idx !== null && idx !== undefined) {
          const ok = await Cards.use(p, idx);
          if (ok) t.cardsUsed++;
          UI.renderAll();
          if (p.bankrupt) return;
        }
      }
    }
  },

  // 逐格移動
  async move(p, steps) {
    const n = this.s.tiles.length;
    for (let k = 0; k < steps; k++) {
      const prev = p.pos;
      p.pos = (p.pos + p.dir + n) % n;
      UI.renderTile(prev);
      UI.renderTile(p.pos);
      await U.wait(170);
      const res = await this.stepOnto(p, k === steps - 1);
      if (res === 'stop') break;
      if (res === 'hospital') return 'hospital';
    }
    UI.renderAll();
    return 'ok';
  },

  async stepOnto(p, isFinal) {
    const s = this.s, i = p.pos;
    if (i === 0) this.passBank(p);
    if (s.mapGods[i]) {
      const key = s.mapGods[i];
      delete s.mapGods[i];
      Gods.attach(p, key);
      UI.renderTile(i);
    }
    const ob = s.obstacles[i];
    if (ob === 'mine') {
      delete s.obstacles[i];
      UI.log(`💥 ${p.name} 在「${s.tiles[i].name}」踩到地雷！`, 'bad');
      await UI.notify('轟！踩到地雷', `${p.name} 被炸傷，送醫住院 3 天`, '💥');
      this.sendHospital(p, 3);
      return 'hospital';
    }
    if (ob === 'roadblock') {
      delete s.obstacles[i];
      UI.renderTile(i);
      if (!isFinal) {
        UI.log(`🚧 ${p.name} 被路障擋住了`, 'bad');
        UI.toast(`🚧 ${U.esc(p.name)} 被路障擋下！`);
        return 'stop';
      }
    }
    return 'ok';
  },

  passBank(p) {
    p.cash += ECON.salary;
    p.points += ECON.salaryPoints;
    UI.log(`🏦 ${p.name} 經過銀行，領取薪水 ${U.money(ECON.salary)} 與 ${ECON.salaryPoints} 點券`, 'good');
    UI.renderPlayers();
  },

  sendHospital(p, days) {
    const prev = p.pos;
    p.pos = HOSPITAL;
    p.status.hospital = Math.max(p.status.hospital, days);
    UI.renderTile(prev);
    UI.renderAll();
  },

  sendJail(p, days) {
    const prev = p.pos;
    p.pos = JAIL;
    p.status.jail = Math.max(p.status.jail, days);
    UI.renderTile(prev);
    UI.renderAll();
  },

  async resolveTile(p, depth = 0) {
    const t = this.s.tiles[p.pos];
    UI.flashTile(p.pos);
    switch (t.type) {
      case 'land': await this.onLand(p, t); break;
      case 'bank': await this.onBank(p); break;
      case 'chance': await Events.draw(p, 'chance', depth); break;
      case 'fate': await Events.draw(p, 'fate', depth); break;
      case 'news': await Events.news(p); break;
      case 'card': await this.onCardTile(p); break;
      case 'shop': await Shop.open(p); break;
      case 'minigame': await MiniGames.play(p); break;
      case 'temple': await Gods.temple(p); break;
      case 'stock': await Stocks.exchangeTile(p); break;
      case 'hospital': UI.log(`🏥 ${p.name} 到醫院探病`); break;
      case 'jail': UI.log(`🚔 ${p.name} 參觀監獄`); break;
    }
    UI.renderAll();
  },

  // 事件造成的額外移動（例如機會卡「前進 3 步」）
  async moveBy(p, steps, depth) {
    const dir = p.dir;
    if (steps < 0) p.dir = -p.dir;
    const res = await this.move(p, Math.abs(steps));
    p.dir = dir;
    if (res !== 'hospital' && !p.bankrupt && depth < 2) await this.resolveTile(p, depth + 1);
  },

  async moveTo(p, index, depth) {
    const prev = p.pos;
    p.pos = index;
    UI.renderTile(prev);
    UI.renderAll();
    await U.wait(300);
    if (index === 0) this.passBank(p);
    if (depth < 2) await this.resolveTile(p, depth + 1);
  },

  async newDay() {
    const s = this.s;
    s.day++;
    s.date = new Date(s.date.getTime() + 86400000);
    Stocks.daily();
    for (const d of Object.keys(s.priceUp)) {
      if (--s.priceUp[d] <= 0) delete s.priceUp[d];
    }
    for (const t of s.tiles) if (t.sealed > 0) t.sealed--;
    Gods.spawn();
    UI.log(`📅 ${UI.dateText()}`, 'sys');
    if (s.date.getDate() === 1) {
      for (const p of s.players) {
        if (p.bankrupt || p.deposit <= 0) continue;
        const it = U.round10(p.deposit * ECON.interest);
        p.deposit += it;
        UI.log(`🏦 月初結算利息：${p.name} 獲得 ${U.money(it)}`, 'good');
      }
    }
    UI.renderAll();
    this.save();
  },

  randomCardKey() {
    return U.weightedPick(CARD_KEYS, k => 1 / CARDS[k].cost);
  },

  giveCard(p, key) {
    if (p.cards.length >= HAND_LIMIT) {
      UI.log(`🃏 ${p.name} 的手牌已滿，無法獲得「${CARDS[key].name}」`);
      return false;
    }
    p.cards.push(key);
    UI.log(`🃏 ${p.name} 獲得卡片「${CARDS[key].icon}${CARDS[key].name}」`, 'good');
    return true;
  },

  async onCardTile(p) {
    const n = U.chance(0.3) ? 2 : 1;
    const got = [];
    for (let k = 0; k < n; k++) {
      const key = this.randomCardKey();
      if (this.giveCard(p, key)) got.push(key);
    }
    UI.renderPlayers();
    if (got.length) await UI.notify('獲得卡片', got.map(k => `${CARDS[k].icon} <b>${CARDS[k].name}</b>：${CARDS[k].desc}`).join('<br>'), '🃏');
    else await UI.notify('手牌已滿', '無法再拿卡片了', '🃏');
  },

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.s, date: this.s.date.getTime() }));
    } catch (e) { /* 無法存檔時忽略 */ }
  },

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      s.date = new Date(s.date);
      return s;
    } catch (e) { return null; }
  },

  clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 忽略 */ }
  },
};
