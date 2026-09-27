// 神明系統：地圖上會出現神明，玩家經過即被附身，持續數回合
const Gods = {
  attach(p, key) {
    if (p.bankrupt) return;
    const g = GODS[key];
    const prev = p.god;
    p.god = key;
    p.godTurns = g.turns;
    UI.log(`${g.icon} ${g.name}附身在 ${p.name} 身上！（${g.desc}）${prev ? `，趕走了${GODS[prev].name}` : ''}`, 'god');
    UI.toast(`${g.icon} <b>${g.name}</b>附身 ${p.icon}${U.esc(p.name)}`, 2200);
    UI.renderPlayers();
  },

  remove(p) {
    if (!p.god) return;
    UI.log(`${GODS[p.god].icon} ${GODS[p.god].name}離開了 ${p.name}`, 'god');
    p.god = null;
    p.godTurns = 0;
  },

  // 回合開始時的持續效果
  async onTurnStart(p) {
    if (!p.god) return;
    if (p.god === 'bigWealth') {
      p.cash += 1000;
      UI.log(`💰 大財神保佑 ${p.name}，獲得 $1,000`, 'good');
    } else if (p.god === 'bigPoor') {
      const loss = U.round10(p.cash * 0.1);
      if (loss > 0) {
        p.cash -= loss;
        UI.log(`💸 大窮神作祟，${p.name} 損失 ${U.money(loss)}`, 'bad');
      }
    } else if (p.god === 'bigBad' && p.cards.length) {
      const [lost] = p.cards.splice(U.rand(p.cards.length), 1);
      UI.log(`⛈️ 大衰神作祟，${p.name} 遺失了「${CARDS[lost].name}」`, 'bad');
    }
    UI.renderPlayers();
  },

  // 回合結束倒數
  tick(p) {
    if (!p.god) return;
    p.godTurns--;
    if (p.godTurns <= 0) this.remove(p);
  },

  tollPayMult(p) {
    return { bigLuck: 0, smallLuck: 0.5, bigPoor: 2, smallPoor: 1.5 }[p.god] ?? 1;
  },
  tollRecvMult(p) {
    return { bigWealth: 2, smallWealth: 1.5 }[p.god] ?? 1;
  },
  canBuild(p) { return p.god !== 'bigBad' && p.god !== 'smallBad'; },
  discount(p) { return p.god === 'bigLuck' ? 0.5 : 1; },

  // 停在土地上之後觸發（天使／惡魔）
  async onStop(p, t) {
    if (t.type !== 'land') return;
    const d = DISTRICTS[t.district];
    if (p.god === 'angel') {
      const n = Game.districtLevel(t.district, 1);
      if (n) await UI.notify('天使降臨', `${d.name}區 ${n} 塊土地的建築全部升一級！`, '👼');
    } else if (p.god === 'devil') {
      const n = Game.districtLevel(t.district, -MAX_LEVEL);
      if (n) await UI.notify('惡魔肆虐', `${d.name}區 ${n} 棟建築被摧毀了！`, '😈');
    }
  },

  // 每天有機率在地圖上出現神明
  spawn(force) {
    const s = Game.s;
    if (!force && (Object.keys(s.mapGods).length >= 3 || !U.chance(0.3))) return;
    const occupied = new Set(s.players.map(p => p.pos));
    const free = s.tiles.map((_, i) => i).filter(i => i !== 0 && !s.mapGods[i] && !s.obstacles[i] && !occupied.has(i));
    if (!free.length) return;
    const i = U.pick(free);
    const key = U.chance(0.55) ? U.pick(GOOD_GODS) : U.pick(BAD_GODS);
    s.mapGods[i] = key;
    UI.log(`✨ ${GODS[key].icon} ${GODS[key].name}出現在「${s.tiles[i].name}」`, 'god');
  },

  // 距離最近的地圖神明（前後皆可）
  nearest(p) {
    const s = Game.s, n = s.tiles.length;
    let best = null;
    for (const k of Object.keys(s.mapGods)) {
      const i = +k;
      const dist = Math.min((i - p.pos + n) % n, (p.pos - i + n) % n);
      if (!best || dist < best.dist) best = { i, dist, key: s.mapGods[k] };
    }
    return best;
  },

  // 神明廟：擲筊
  async temple(p) {
    const cost = 500;
    let pray;
    if (p.isAI) {
      pray = p.cash > 3000 && (!p.god || !GODS[p.god].good);
    } else {
      pray = await UI.confirm('神明廟', `<div class="big-icon">⛩️</div>添香油錢 ${U.money(cost)} 擲筊請神？<br>
        <span class="muted">聖筊：好神附身｜笑筊：神明笑而不答，獲得點券｜陰筊：小窮神或小衰神上身</span>`, '擲筊 🙏', '離開', '⛩️');
    }
    if (!pray || p.cash < cost) {
      UI.log(`${p.name} 在神明廟前拜了拜`);
      return;
    }
    p.cash -= cost;
    const r = Math.random();
    const kind = r < 0.5 ? 'holy' : r < 0.75 ? 'laugh' : 'yin';
    const label = { holy: '聖筊 🌗', laugh: '笑筊 🌕', yin: '陰筊 🌑' }[kind];
    if (!p.isAI) {
      await UI.modal({
        title: '擲筊中…', icon: '🙏', body: U.el('div', { class: 'jiao' }, U.el('span', null, '🌙'), U.el('span', null, '🌙')),
        onMount: (mb, done) => {
          const spans = mb.querySelectorAll('span');
          let k = 0;
          const timer = setInterval(() => {
            spans.forEach(s => { s.style.transform = `rotate(${U.rand(360)}deg) translateY(${-U.rand(30)}px)`; });
            if (++k > 8) {
              clearInterval(timer);
              spans[0].style.transform = 'rotate(0deg)';
              spans[1].style.transform = kind === 'holy' ? 'rotate(180deg)' : kind === 'laugh' ? 'rotate(0deg)' : 'rotate(180deg) scaleX(-1)';
              setTimeout(() => done(), U.speed > 0 ? 700 : 0);
            }
          }, U.speed > 0 ? 120 : 0);
        },
      });
    }
    UI.log(`⛩️ ${p.name} 擲出${label}`, 'god');
    if (kind === 'holy') {
      this.attach(p, U.pick(GOOD_GODS));
      await UI.notify('聖筊！', `${GODS[p.god].icon} ${GODS[p.god].name}附身：${GODS[p.god].desc}`, '🌗');
    } else if (kind === 'laugh') {
      p.points += 30;
      await UI.notify('笑筊', '神明笑而不答……獲得 30 點券', '🌕');
    } else {
      this.attach(p, U.pick(['smallPoor', 'smallBad']));
      await UI.notify('陰筊…', `${GODS[p.god].icon} ${GODS[p.god].name}上身：${GODS[p.god].desc}`, '🌑');
    }
  },
};
