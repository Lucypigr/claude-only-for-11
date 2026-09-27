// 電腦玩家的決策
const AI = {
  reserve() { return 2500 + Game.s.day * 60; },
  opps(p) { return Game.s.players.filter(x => !x.bankrupt && x.id !== p.id); },
  leader(p) { return this.opps(p).sort((a, b) => Game.netWorth(b) - Game.netWorth(a))[0]; },
  idx(p, k) { const n = Game.s.tiles.length; return ((p.pos + p.dir * k) % n + n) % n; },

  wantBuy(p, t, cost) {
    const left = p.cash - cost;
    return left >= this.reserve() * 0.6 || (left > 500 && p.deposit > this.reserve());
  },
  wantUpgrade(p, t, cost) { return p.cash - cost >= this.reserve() * 0.7; },

  bank(p) {
    if (p.cash > 20000) {
      const amt = U.round10((p.cash - 15000) * 0.6);
      p.cash -= amt; p.deposit += amt;
      UI.log(`🏦 ${p.name} 存入 ${U.money(amt)}`);
    } else if (p.cash < 6000 && p.deposit > 0) {
      const amt = Math.min(p.deposit, 9000 - p.cash);
      p.deposit -= amt; p.cash += amt;
      UI.log(`🏦 ${p.name} 提領 ${U.money(amt)}`);
    }
  },

  shop(p, stock) {
    for (let k = 0; k < 2; k++) {
      const can = stock.filter(key => CARDS[key].cost <= p.points && p.cards.length < 8);
      if (!can.length) break;
      const key = U.pick(can);
      p.points -= CARDS[key].cost;
      p.cards.push(key);
      UI.log(`🏪 ${p.name} 購買了「${CARDS[key].name}」`);
    }
    const next = VEHICLES[p.vehicle + 1];
    if (next && p.cash - next.price > this.reserve() * 1.5) {
      p.cash -= next.price;
      p.vehicle++;
      UI.log(`🏪 ${p.name} 購買了${next.name}`);
    }
  },

  tradeStocks(p, tip) {
    const s = Game.s;
    // 缺錢時先賣股
    if (p.cash < this.reserve()) {
      for (let i = 0; i < s.stocks.length; i++) {
        const q = Stocks.held(p, i);
        if (q > 0) { Stocks.sell(p, i, Math.ceil(q / 2)); if (p.cash >= this.reserve()) break; }
      }
      return;
    }
    // 偶爾獲利了結
    s.stocks.forEach((st, i) => {
      const q = Stocks.held(p, i);
      if (q > 0 && st.trendDays === 0 && st.factor > 1.3 && U.chance(0.4)) Stocks.sell(p, i, q);
    });
    if (tip && tip.dir < 0 && Stocks.held(p, tip.d) > 0) Stocks.sell(p, tip.d, Stocks.held(p, tip.d));
    const spare = p.cash - this.reserve() * 1.5;
    if (spare < 2000) return;
    let d;
    if (tip && tip.dir > 0) d = tip.d;
    else {
      // 選擇過路費收入最高（股利多）或自己土地多（會推升股價）的區域
      const score = DISTRICTS.map(dd => Game.districtLands(dd.id).reduce((a, t) =>
        a + (t.owner === null ? 0 : Game.toll(t) * (t.owner === p.id ? 1.5 : 1)), 0) * (s.stocks[dd.id].trendDays ? 1 + s.stocks[dd.id].trend * 0.5 : 1));
      d = score.indexOf(Math.max(...score));
      if (score[d] <= 0) d = U.rand(DISTRICTS.length);
    }
    const price = s.stocks[d].price;
    const qty = Math.floor(spare * 0.3 / price / 10) * 10;
    if (qty >= 10) Stocks.buy(p, d, qty);
  },

  tileScore(p, i) {
    const s = Game.s, t = s.tiles[i];
    switch (t.type) {
      case 'land':
        if (t.owner === null) return p.cash >= t.price && Gods.canBuild(p) ? 3 : 0.5;
        if (t.owner === p.id) return t.level < MAX_LEVEL && p.cash > Game.upgradeCost(t) + this.reserve() ? 2.5 : 1;
        return -Game.toll(t) / 800;
      case 'card': case 'minigame': return 1.5;
      case 'bank': return 1.5;
      case 'chance': case 'temple': return 1;
      case 'fate': return -0.5;
      default: return 0.3;
    }
  },

  pathSafe(p, steps) {
    for (let k = 1; k <= steps; k++) if (Game.s.obstacles[this.idx(p, k)] === 'mine') return false;
    return true;
  },

  // 評估每張手牌，回傳 {idx, key, tg, score}
  evalCards(p) {
    const s = Game.s, opps = this.opps(p), leader = this.leader(p), cands = [];
    const n = s.tiles.length;
    const add = (idx, key, tg, score) => cands.push({ idx, key, tg, score });
    const oppLands = s.tiles.map((t, i) => ({ t, i })).filter(o => o.t.type === 'land' && o.t.owner !== null && o.t.owner !== p.id);
    const myLands = s.tiles.map((t, i) => ({ t, i })).filter(o => o.t.type === 'land' && o.t.owner === p.id);
    const inRange = (i, r) => { const d = Math.abs(i - p.pos); return Math.min(d, n - d) <= r && i !== p.pos; };

    p.cards.forEach((key, idx) => {
      if (Cards.invalidReason(p, key)) return;
      switch (key) {
        case 'remoteDice': {
          if (p.status.turtle) break;
          let best = null;
          for (let k = 1; k <= 6 * VEHICLES[p.vehicle].dice; k++) {
            if (!this.pathSafe(p, k)) continue;
            const sc = this.tileScore(p, this.idx(p, k));
            if (!best || sc > best.sc) best = { k, sc };
          }
          if (best && best.sc >= 2.5) add(idx, key, { steps: best.k }, best.sc);
          break;
        }
        case 'stay': {
          const t = s.tiles[p.pos];
          if (t.type === 'land' && t.owner === p.id && t.level < MAX_LEVEL && p.cash > Game.upgradeCost(t) + this.reserve()) add(idx, key, {}, 3);
          break;
        }
        case 'roadblock': {
          for (const o of opps) {
            for (let k = 1; k <= 6; k++) {
              const i = ((o.pos + o.dir * k) % n + n) % n;
              const t = s.tiles[i];
              if (t.type === 'land' && t.owner === p.id && !s.obstacles[i] && i !== 0 && inRange(i, 8) && Game.toll(t) >= 500) {
                add(idx, key, { tile: i }, 3 + Game.toll(t) / 3000);
              }
            }
          }
          break;
        }
        case 'mine': {
          if (!leader) break;
          for (let k = 2; k <= 7; k++) {
            const i = ((leader.pos + leader.dir * k) % n + n) % n;
            if (!s.obstacles[i] && i !== 0 && inRange(i, 8) && s.players.every(x => x.pos !== i)) { add(idx, key, { tile: i }, 2.5); break; }
          }
          break;
        }
        case 'robot': {
          let c = 0;
          for (let k = 1; k <= 10; k++) if (s.obstacles[this.idx(p, k)]) c++;
          if (c) add(idx, key, {}, 2 + c);
          break;
        }
        case 'turtle': if (leader) add(idx, key, { player: leader.id }, 2); break;
        case 'hibernate': add(idx, key, {}, opps.length >= 2 ? 3 : 2); break;
        case 'equalRich': {
          const all = opps.concat([p]);
          const avg = all.reduce((a, x) => a + x.cash, 0) / all.length;
          if (p.cash < avg * 0.6) add(idx, key, {}, 4);
          break;
        }
        case 'equalPoor': {
          const r = opps.slice().sort((a, b) => b.cash - a.cash)[0];
          if (r && r.cash > p.cash * 1.8 && r.cash - p.cash > 4000) add(idx, key, { player: r.id }, 4);
          break;
        }
        case 'tax': {
          const r = opps.slice().sort((a, b) => b.deposit - a.deposit)[0];
          if (r && r.deposit > 8000) add(idx, key, { player: r.id }, 3);
          break;
        }
        case 'steal': {
          const r = opps.slice().sort((a, b) => b.cards.length - a.cards.length)[0];
          if (r && r.cards.length >= 2) add(idx, key, { player: r.id }, 2);
          break;
        }
        case 'buyLand': {
          const t = s.tiles[p.pos];
          if (p.cash - Game.landValue(t) > this.reserve() * 0.5) add(idx, key, {}, 5);
          break;
        }
        case 'swapLand': {
          const mine = myLands.slice().sort((a, b) => Game.landValue(a.t) - Game.landValue(b.t))[0];
          const theirs = oppLands.slice().sort((a, b) => Game.landValue(b.t) - Game.landValue(a.t))[0];
          if (mine && theirs && Game.landValue(theirs.t) - Game.landValue(mine.t) > 2500) add(idx, key, { tile: mine.i, tile2: theirs.i }, 3.5);
          break;
        }
        case 'monster': {
          const best = oppLands.filter(o => o.t.level >= 3).sort((a, b) => b.t.level - a.t.level)[0];
          if (best) add(idx, key, { tile: best.i }, 3);
          break;
        }
        case 'angel': case 'devil': {
          DISTRICTS.forEach(d => {
            const ls = Game.districtLands(d.id);
            const mine = ls.reduce((a, t) => a + (t.owner === p.id ? t.level + 1 : 0), 0);
            const theirs = ls.reduce((a, t) => a + (t.owner !== null && t.owner !== p.id ? t.level + 1 : 0), 0);
            const i = s.tiles.findIndex(t => t.type === 'land' && t.district === d.id && t.owner !== null && (key === 'angel' || t.level > 0));
            if (i < 0) return;
            if (key === 'angel' && mine - theirs >= 2) add(idx, key, { tile: i }, 3);
            if (key === 'devil' && theirs - mine >= 5) add(idx, key, { tile: i }, 3.5);
          });
          break;
        }
        case 'priceUp': {
          const best = DISTRICTS.map(d => ({ d, v: myLands.filter(o => o.t.district === d.id).reduce((a, o) => a + Game.toll(o.t), 0) }))
            .sort((a, b) => b.v - a.v)[0];
          if (best && best.v >= 1500 && !s.priceUp[best.d.id]) add(idx, key, { tile: myLands.find(o => o.t.district === best.d.id).i }, 2.5);
          break;
        }
        case 'seal': {
          const best = oppLands.filter(o => o.t.sealed <= 0).sort((a, b) => Game.toll(b.t) - Game.toll(a.t))[0];
          if (best && Game.toll(best.t) >= 1500) add(idx, key, { tile: best.i }, 2.5);
          break;
        }
        case 'red': {
          const d = s.stocks.map((_, i) => i).sort((a, b) => Stocks.held(p, b) - Stocks.held(p, a))[0];
          if (Stocks.held(p, d) >= 20 && !s.stocks[d].trendDays) add(idx, key, { district: d }, 2.5);
          break;
        }
        case 'black': {
          const d = s.stocks.map((_, i) => i).find(i => Stocks.held(p, i) === 0 && opps.some(o => Stocks.held(o, i) >= 30));
          if (d !== undefined) add(idx, key, { district: d }, 1.5);
          break;
        }
        case 'summonGod': {
          const g = Gods.nearest(p);
          if (g && GODS[g.key].good && (!p.god || !GODS[p.god].good)) add(idx, key, {}, 3);
          break;
        }
        case 'sendGod': if (p.god && !GODS[p.god].good && leader) add(idx, key, { player: leader.id }, 4); break;
        case 'frame': if (leader) add(idx, key, { player: leader.id }, 2.2); break;
        case 'missile': {
          if (!leader) break;
          const t = s.tiles[leader.pos];
          add(idx, key, { player: leader.id }, t.type === 'land' && t.owner !== p.id && t.level >= 2 ? 3.5 : 1.8);
          break;
        }
        default: break;
      }
    });
    return cands;
  },

  async preRoll(p) {
    await U.wait(350);
    if (Stocks.isOpen() && U.chance(0.3)) this.tradeStocks(p);
    const cands = this.evalCards(p).sort((a, b) => b.score - a.score);
    const c = cands[0];
    if (c && c.score >= 2 && U.chance(0.7)) {
      p.cards.splice(c.idx, 1);
      await Cards.apply(p, c.key, c.tg);
      Game.turn.cardsUsed++;
    }
    UI.renderAll();
  },
};
