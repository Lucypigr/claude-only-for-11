// 卡片系統：選擇目標與效果
const Cards = {
  // 真人玩家使用手牌，回傳是否成功使用
  async use(p, idx) {
    const key = p.cards[idx];
    const tg = await this.chooseTarget(p, key);
    if (tg === null) return false;
    p.cards.splice(idx, 1);
    await this.apply(p, key, tg);
    return true;
  },

  alive(exceptId) { return Game.s.players.filter(x => !x.bankrupt && x.id !== exceptId); },

  roadTiles(p, range) {
    const s = Game.s, n = s.tiles.length, out = [];
    for (let k = -range; k <= range; k++) {
      if (k === 0) continue;
      const i = (p.pos + k + n) % n;
      if (!s.obstacles[i] && i !== 0) out.push(i);
    }
    return out;
  },

  landTiles(filter) {
    return Game.s.tiles.map((t, i) => i).filter(i => Game.s.tiles[i].type === 'land' && filter(Game.s.tiles[i]));
  },

  landFilter(p, key) {
    return {
      monster: t => t.level > 0,
      angel: t => t.owner !== null,
      devil: t => t.owner !== null && t.level > 0,
      priceUp: t => t.owner !== null,
      seal: t => t.owner !== null && t.owner !== p.id && t.sealed <= 0,
    }[key];
  },

  // 檢查卡片目前能否使用，回傳錯誤訊息或 null
  invalidReason(p, key) {
    const s = Game.s, t = s.tiles[p.pos];
    if (key === 'buyLand') {
      if (t.type !== 'land' || t.owner === null || t.owner === p.id) return '必須站在他人的土地上才能使用';
      if (p.cash < Game.landValue(t)) return `現金不足（需要 ${U.money(Game.landValue(t))}）`;
    }
    if (key === 'summonGod' && !Object.keys(s.mapGods).length) return '地圖上目前沒有神明';
    if (key === 'sendGod' && !p.god) return '你身上沒有神明';
    if (key === 'swapLand') {
      if (!s.tiles.some(x => x.type === 'land' && x.owner === p.id)) return '你沒有土地可以交換';
      if (!s.tiles.some(x => x.type === 'land' && x.owner !== null && x.owner !== p.id)) return '沒有他人的土地可以交換';
    }
    const lf = this.landFilter(p, key);
    if (lf && !this.landTiles(lf).length) return '目前沒有可以指定的土地';
    return null;
  },

  async chooseTarget(p, key) {
    const c = CARDS[key];
    const err = this.invalidReason(p, key);
    if (err) { UI.toast(`${c.icon} ${c.name}：${err}`); return null; }
    switch (c.target) {
      case 'none': {
        if (key !== 'remoteDice') return {};
        const max = 6 * Game.turn.diceCount;
        const opts = [];
        for (let k = 1; k <= max; k++) {
          const t = Game.s.tiles[(p.pos + p.dir * k + 44) % 44];
          opts.push({ label: `${k}・${t.name}`, value: k });
        }
        opts.push({ label: '取消', value: null });
        const steps = await UI.choose('遙控骰子', '要前進幾步？', opts, '🎲');
        return steps ? { steps } : null;
      }
      case 'player': {
        const cands = c.allowSelf ? this.alive(-1) : this.alive(p.id);
        const opts = cands.map(x => ({ label: `${x.icon} ${x.name}${x.id === p.id ? '（自己）' : ''}`, value: x.id }));
        opts.push({ label: '取消', value: null });
        const id = await UI.choose(c.name, `選擇目標玩家：${c.desc}`, opts, c.icon);
        return id === null ? null : { player: id };
      }
      case 'road': {
        const i = await UI.pickTile(`${c.icon} 選擇放置${c.name}的位置（前後 ${c.range} 格）`, this.roadTiles(p, c.range));
        return i === null ? null : { tile: i };
      }
      case 'land': {
        const i = await UI.pickTile(`${c.icon} ${c.name}：選擇目標土地`, this.landTiles(this.landFilter(p, key)));
        return i === null ? null : { tile: i };
      }
      case 'stock': {
        const opts = DISTRICTS.map(d => ({ label: `${d.stock}（${Game.s.stocks[d.id].price}）`, value: d.id }));
        opts.push({ label: '取消', value: null });
        const d = await UI.choose(c.name, c.desc, opts, c.icon);
        return d === null ? null : { district: d };
      }
      case 'swap': {
        const mine = await UI.pickTile('🔁 先選擇你要換出的土地', this.landTiles(t => t.owner === p.id));
        if (mine === null) return null;
        const theirs = await UI.pickTile('🔁 再選擇你要換到的他人土地', this.landTiles(t => t.owner !== null && t.owner !== p.id));
        return theirs === null ? null : { tile: mine, tile2: theirs };
      }
      default:
        return null;
    }
  },

  async apply(p, key, tg) {
    const s = Game.s, c = CARDS[key];
    const target = tg.player !== undefined ? s.players[tg.player] : null;
    const tile = tg.tile !== undefined ? s.tiles[tg.tile] : null;
    UI.log(`${c.icon} ${p.name} 使用了「${c.name}」${target ? `，目標：${target.name}` : ''}${tile ? `，目標：${tile.name}` : ''}`, 'sys');
    let msg = '';
    switch (key) {
      case 'remoteDice': Game.turn.remote = tg.steps; msg = `本回合前進 ${tg.steps} 步`; break;
      case 'stay': Game.turn.stay = true; msg = '本回合原地停留'; break;
      case 'roadblock':
      case 'mine':
        s.obstacles[tg.tile] = key;
        msg = `在「${tile.name}」放置了${c.name}`;
        break;
      case 'robot': {
        let n = 0;
        for (let k = 1; k <= 10; k++) {
          const i = (p.pos + p.dir * k + 44) % 44;
          if (s.obstacles[i]) { delete s.obstacles[i]; n++; }
        }
        msg = `清除了 ${n} 個障礙物`;
        break;
      }
      case 'reverse': target.dir = -target.dir; msg = `${target.name} 的行進方向反轉了`; break;
      case 'turtle': target.status.turtle = 3; msg = `${target.name} 接下來 3 回合只能走 1 步`; break;
      case 'hibernate':
        for (const x of this.alive(p.id)) x.status.sleep = Math.max(x.status.sleep, 2);
        msg = '其他玩家全部進入冬眠 2 天';
        break;
      case 'equalRich': {
        const al = this.alive(-1);
        const avg = U.round10(al.reduce((a, x) => a + x.cash, 0) / al.length);
        al.forEach(x => { x.cash = avg; });
        msg = `所有玩家的現金平均為 ${U.money(avg)}`;
        break;
      }
      case 'equalPoor': {
        const avg = U.round10((p.cash + target.cash) / 2);
        p.cash = avg; target.cash = avg;
        msg = `與 ${target.name} 平分現金，各得 ${U.money(avg)}`;
        break;
      }
      case 'tax': {
        let amt = U.round10(target.deposit * 0.3);
        if (amt >= 300) target.deposit -= amt;
        else { amt = U.round10(target.cash * 0.15); target.cash -= amt; }
        msg = `${target.name} 被查稅，繳納 ${U.money(amt)}`;
        break;
      }
      case 'steal': {
        if (!target.cards.length) { msg = `${target.name} 沒有卡片，什麼也沒搶到`; break; }
        const [k] = target.cards.splice(U.rand(target.cards.length), 1);
        if (p.cards.length < HAND_LIMIT) p.cards.push(k);
        msg = `從 ${target.name} 手中搶走了「${CARDS[k].icon}${CARDS[k].name}」`;
        break;
      }
      case 'buyLand': {
        const t = s.tiles[p.pos], owner = s.players[t.owner], price = Game.landValue(t);
        p.cash -= price; owner.cash += price; t.owner = p.id;
        msg = `以 ${U.money(price)} 強制買下 ${owner.name} 的「${t.name}」`;
        break;
      }
      case 'swapLand': {
        const a = s.tiles[tg.tile], b = s.tiles[tg.tile2], other = s.players[b.owner];
        [a.owner, b.owner] = [b.owner, a.owner];
        msg = `用「${a.name}」換走了 ${other.name} 的「${b.name}」`;
        break;
      }
      case 'monster': tile.level = 0; msg = `「${tile.name}」的建築被怪獸夷為平地`; break;
      case 'angel': msg = `${DISTRICTS[tile.district].name}區 ${Game.districtLevel(tile.district, 1)} 塊土地的建築升一級`; break;
      case 'devil': msg = `${DISTRICTS[tile.district].name}區 ${Game.districtLevel(tile.district, -MAX_LEVEL)} 棟建築被摧毀`; break;
      case 'priceUp': s.priceUp[tile.district] = 5; msg = `${DISTRICTS[tile.district].name}區過路費加倍 5 天`; break;
      case 'seal': tile.sealed = 5; msg = `「${tile.name}」被查封 5 天`; break;
      case 'red': Stocks.setTrend(tg.district, 1, 3); msg = `${DISTRICTS[tg.district].stock} 將連續 3 天大漲`; break;
      case 'black': Stocks.setTrend(tg.district, -1, 3); msg = `${DISTRICTS[tg.district].stock} 將連續 3 天大跌`; break;
      case 'summonGod': {
        const g = Gods.nearest(p);
        delete s.mapGods[g.i];
        Gods.attach(p, g.key);
        msg = `請來了 ${GODS[g.key].icon}${GODS[g.key].name}`;
        break;
      }
      case 'sendGod': {
        const g = p.god, turns = p.godTurns;
        p.god = null; p.godTurns = 0;
        if (target.id !== p.id) { Gods.attach(target, g); target.godTurns = turns; }
        msg = `把 ${GODS[g].icon}${GODS[g].name} 送給了 ${target.name}`;
        break;
      }
      case 'frame': Game.sendJail(target, 2); msg = `${target.name} 被陷害入獄 2 天`; break;
      case 'missile': {
        const t = s.tiles[target.pos];
        if (t.type === 'land' && t.level > 0) t.level = 0;
        Game.sendHospital(target, 2);
        msg = `飛彈命中 ${target.name}！住院 2 天${t.type === 'land' ? `，「${t.name}」的建築被炸毀` : ''}`;
        break;
      }
    }
    UI.log(`➡️ ${msg}`);
    UI.renderAll();
    if (!p.isAI) await UI.notify(c.name, msg, c.icon);
    else {
      UI.toast(`${c.icon} ${U.esc(p.name)} 使用「${c.name}」：${U.esc(msg)}`, 2600);
      await U.wait(900);
    }
  },
};
