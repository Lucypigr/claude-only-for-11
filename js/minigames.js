// 小遊戲：每個遊戲 play(p, 容器, done) 以 done(獎金) 結束；sim(p) 為電腦玩家的模擬結果
const MG = {
  hud(...items) { return U.el('div', { class: 'mg-hud' }, ...items); },
  // 顯示結果並等待玩家領取
  finish(mb, done, reward, text) {
    const color = reward > 0 ? 'var(--bad)' : reward < 0 ? 'var(--good)' : 'var(--muted)';
    mb.appendChild(U.el('div', { style: { textAlign: 'center', marginTop: '10px' } },
      U.el('div', { html: `${text}<br><b style="font-size:22px;color:${color}">${reward >= 0 ? '獲得' : '損失'} ${U.money(Math.abs(reward))}</b>` }),
      U.el('button', { class: 'primary', style: { marginTop: '8px' }, onclick: () => done(reward) }, '確定')));
  },
  betButtons(p, amounts, onPick) {
    const row = U.el('div', { class: 'optrow' });
    const btns = amounts.map(a => U.el('button', {
      disabled: p.cash < a,
      onclick: () => { btns.forEach(b => b.classList.remove('sel')); btn(a).classList.add('sel'); onPick(a); },
    }, U.money(a)));
    const btn = (a) => btns[amounts.indexOf(a)];
    row.append(...btns);
    return row;
  },
};

const MiniGames = {
  games: {
    whack: {
      name: '打地鼠', icon: '🐹', desc: '15 秒內敲打冒出來的地鼠，每隻 $200；打到炸彈扣一隻！',
      sim: () => U.randInt(5, 16) * 200,
      play(p, mb, done) {
        let hits = 0, time = 15, timers = [];
        const hitsEl = U.el('span', null, '🐹 0'), timeEl = U.el('span', null, '⏱️ 15');
        const holes = Array.from({ length: 9 }, () => U.el('div', { class: 'hole' }));
        const start = U.el('button', { class: 'primary' }, '開始！');
        mb.appendChild(U.el('div', { class: 'mg-area' }, U.el('div', null, this.desc), MG.hud(hitsEl, timeEl), U.el('div', { class: 'mole-grid' }, holes), start));
        holes.forEach(h => h.addEventListener('click', () => {
          if (h.dataset.m === 'mole') { hits++; h.textContent = '💥'; h.classList.add('hit'); }
          else if (h.dataset.m === 'bomb') { hits = Math.max(0, hits - 1); h.textContent = '💢'; }
          else return;
          h.dataset.m = '';
          hitsEl.textContent = `🐹 ${hits}`;
          setTimeout(() => { h.textContent = ''; h.classList.remove('hit'); }, 200);
        }));
        start.addEventListener('click', () => {
          start.remove();
          timers.push(setInterval(() => {
            const free = holes.filter(h => !h.dataset.m);
            if (!free.length) return;
            const h = U.pick(free);
            h.dataset.m = U.chance(0.15) ? 'bomb' : 'mole';
            h.textContent = h.dataset.m === 'bomb' ? '💣' : '🐹';
            setTimeout(() => { if (h.dataset.m) { h.dataset.m = ''; h.textContent = ''; } }, U.randInt(650, 1000));
          }, 480));
          timers.push(setInterval(() => {
            time--;
            timeEl.textContent = `⏱️ ${time}`;
            if (time <= 0) {
              timers.forEach(clearInterval);
              holes.forEach(h => { h.dataset.m = ''; });
              MG.finish(mb, done, hits * 200, `時間到！共打到 ${hits} 隻地鼠`);
            }
          }, 1000));
        });
      },
    },

    horse: {
      name: '賽馬', icon: '🏇', desc: '選一匹馬下注，猜中冠軍依賠率贏錢！',
      horses: [
        { name: '赤兔', odds: 2.5, p: 0.4 }, { name: '的盧', odds: 4, p: 0.25 }, { name: '絕影', odds: 6, p: 0.17 },
        { name: '爪黃飛電', odds: 8, p: 0.12 }, { name: '烏騅', odds: 16, p: 0.06 },
      ],
      pickWinner() { return this.horses.indexOf(U.weightedPick(this.horses, h => h.p)); },
      sim(p) {
        const bet = Math.min(1000, p.cash), h = U.rand(5), w = this.pickWinner();
        return h === w ? Math.round(bet * (this.horses[h].odds - 1)) : -bet;
      },
      play(p, mb, done) {
        let horse = null, bet = null;
        const go = U.el('button', { class: 'primary', disabled: true }, '開跑！');
        const check = () => { go.disabled = horse === null || bet === null; };
        const hrow = U.el('div', { class: 'optrow' });
        const hb = this.horses.map((h, i) => U.el('button', { onclick: () => { hb.forEach(b => b.classList.remove('sel')); hb[i].classList.add('sel'); horse = i; check(); } }, `${i + 1}號 ${h.name}（${h.odds}倍）`));
        hrow.append(...hb);
        const lanes = this.horses.map((h, i) => {
          const hr = U.el('div', { class: 'horse', style: { left: '0%' } }, '🏇');
          return { el: U.el('div', { class: 'lane finish' }, hr, U.el('span', { class: 'lbl' }, `${i + 1} ${h.name}`)), hr };
        });
        mb.appendChild(U.el('div', { class: 'mg-area' }, U.el('div', null, this.desc), hrow,
          MG.betButtons(p, [500, 1000, 2000, 5000], a => { bet = a; check(); }),
          U.el('div', { class: 'track' }, lanes.map(l => l.el)), go));
        go.addEventListener('click', () => {
          go.remove();
          hrow.querySelectorAll('button').forEach(b => { b.disabled = true; });
          const w = this.pickWinner();
          const fin = this.horses.map((_, i) => (i === w ? 1 : 1 + U.randInt(5, 30) / 100) * 4000);
          const t0 = performance.now();
          const tick = () => {
            const t = performance.now() - t0;
            lanes.forEach((l, i) => {
              const x = U.clamp(t / fin[i] + 0.03 * Math.sin(t / 180 + i * 2), 0, 1);
              l.hr.style.left = `calc(${x * 100}% - ${x * 34}px)`;
            });
            if (t < Math.max(...fin)) requestAnimationFrame(tick);
            else {
              const win = horse === w;
              MG.finish(mb, done, win ? Math.round(bet * (this.horses[horse].odds - 1)) : -bet,
                `冠軍是 ${w + 1} 號「${this.horses[w].name}」！${win ? '恭喜猜中！' : '可惜沒猜中…'}`);
            }
          };
          requestAnimationFrame(tick);
        });
      },
    },

    sicbo: {
      name: '猜大小', icon: '🎲', desc: '三顆骰子：大（11-17）小（4-10）一賠一，豹子（三顆相同）一賠三十。共三局。',
      sim: (p) => { const b = Math.min(1000, p.cash); let n = 0; for (let k = 0; k < 3; k++) n += U.chance(0.486) ? b : -b; return n; },
      play(p, mb, done) {
        let round = 0, net = 0, bet = null;
        const info = U.el('div', { class: 'mg-hud' }, '第 1/3 局　累計 $0');
        const diceEl = U.el('div', { class: 'dice' }, ['?', '?', '?'].map(v => U.el('div', { class: 'die', style: { '--t': '64px' } }, v)));
        const result = U.el('div', { style: { minHeight: '24px', fontWeight: 700 } });
        const choices = U.el('div', { class: 'optrow' });
        const bets = MG.betButtons(p, [500, 1000, 2000, 3000], a => { bet = a; });
        const roll = async (kind) => {
          if (!bet || bet > p.cash + net) { UI.toast('請先選擇下注金額'); return; }
          choices.querySelectorAll('button').forEach(b => { b.disabled = true; });
          const ds = diceEl.querySelectorAll('.die');
          for (let k = 0; k < 10; k++) { ds.forEach(d => { d.textContent = U.randInt(1, 6); }); await U.sleep(60); }
          const v = [U.randInt(1, 6), U.randInt(1, 6), U.randInt(1, 6)];
          ds.forEach((d, i) => { d.textContent = v[i]; });
          const sum = v[0] + v[1] + v[2], triple = v[0] === v[1] && v[1] === v[2];
          const win = kind === 'triple' ? triple : !triple && (kind === 'big' ? sum >= 11 : sum <= 10);
          const delta = win ? (kind === 'triple' ? bet * 30 : bet) : -bet;
          net += delta;
          round++;
          result.innerHTML = `${sum} 點${triple ? '（豹子！）' : sum >= 11 ? '（大）' : '（小）'}　${win ? `<span class="up">贏 ${U.money(delta)}</span>` : `<span class="down">輸 ${U.money(-delta)}</span>`}`;
          info.textContent = `第 ${Math.min(round + 1, 3)}/3 局　累計 ${U.money(net)}`;
          if (round >= 3) { choices.remove(); bets.remove(); MG.finish(mb, done, net, '三局結束'); } else choices.querySelectorAll('button').forEach(b => { b.disabled = false; });
        };
        choices.append(U.el('button', { class: 'bad', onclick: () => roll('big') }, '大'), U.el('button', { class: 'good', onclick: () => roll('small') }, '小'), U.el('button', { onclick: () => roll('triple') }, '豹子'));
        mb.appendChild(U.el('div', { class: 'mg-area' }, U.el('div', null, this.desc), info, bets, diceEl, result, choices));
      },
    },

    slots: {
      name: '拉霸機', icon: '🎰', desc: '免費轉 3 次！三個相同大獎，兩個相同小獎。',
      symbols: [['🍒', 30, 800], ['🍋', 25, 1200], ['🔔', 18, 2000], ['⭐', 12, 3000], ['7️⃣', 9, 6000], ['💎', 6, 10000]],
      spin() { return [0, 1, 2].map(() => U.weightedPick(this.symbols, s => s[1])); },
      score(r) {
        if (r[0] === r[1] && r[1] === r[2]) return r[0][2];
        if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) return 300;
        return r.some(s => s[0] === '🍒') ? 100 : 0;
      },
      sim() { let n = 0; for (let k = 0; k < 3; k++) n += this.score(this.spin()); return n; },
      play(p, mb, done) {
        let left = 3, total = 0;
        const reels = [0, 1, 2].map(() => U.el('div', { class: 'reel' }, '❔'));
        const info = MG.hud('剩餘 3 次　累計 $0');
        const msg = U.el('div', { style: { minHeight: '24px', fontWeight: 700 } });
        const btn = U.el('button', { class: 'primary' }, '拉！');
        mb.appendChild(U.el('div', { class: 'mg-area' }, U.el('div', null, this.desc), info, U.el('div', { class: 'reels' }, reels), msg, btn));
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          const r = this.spin();
          for (let i = 0; i < 3; i++) {
            for (let k = 0; k < 8 + i * 5; k++) { reels[i].textContent = U.pick(this.symbols)[0]; await U.sleep(55); }
            reels[i].textContent = r[i][0];
          }
          const got = this.score(r);
          total += got;
          left--;
          msg.textContent = got >= 800 ? `🎉 大獎！+${U.money(got)}` : got ? `+${U.money(got)}` : '沒中…';
          info.textContent = `剩餘 ${left} 次　累計 ${U.money(total)}`;
          if (left <= 0) { btn.remove(); MG.finish(mb, done, total, '拉霸結束'); } else btn.disabled = false;
        });
      },
    },

    memory: {
      name: '記憶翻牌', icon: '🧠', desc: '45 秒內翻出相同的圖案，每對 $300，全部完成再加 $1,000！',
      sim: () => { const n = U.randInt(3, 6); return n * 300 + (n === 6 ? 1000 : 0); },
      play(p, mb, done) {
        const icons = U.shuffle(['🍎', '🍌', '🍇', '🍉', '🍓', '🍍']);
        const deck = U.shuffle(icons.concat(icons));
        let open = [], pairs = 0, time = 45, over = false, timer = null;
        const info = MG.hud(`⏱️ ${time}　配對 0/6`);
        const end = (text) => { over = true; clearInterval(timer); MG.finish(mb, done, pairs * 300 + (pairs === 6 ? 1000 : 0), text); };
        const cards = deck.map(ic => {
          const c = U.el('div', { class: 'mem' }, ic);
          c.addEventListener('click', () => {
            if (over || c.classList.contains('open') || c.classList.contains('done') || open.length >= 2) return;
            if (!timer) timer = setInterval(() => { time--; info.textContent = `⏱️ ${time}　配對 ${pairs}/6`; if (time <= 0) end('時間到！'); }, 1000);
            c.classList.add('open');
            open.push(c);
            if (open.length === 2) {
              const [a, b] = open;
              setTimeout(() => {
                if (a.textContent === b.textContent) { a.classList.add('done'); b.classList.add('done'); pairs++; }
                a.classList.remove('open'); b.classList.remove('open');
                open = [];
                info.textContent = `⏱️ ${time}　配對 ${pairs}/6`;
                if (pairs === 6 && !over) end('全部完成！');
              }, 550);
            }
          });
          return c;
        });
        mb.appendChild(U.el('div', { class: 'mg-area' }, U.el('div', null, this.desc), info, U.el('div', { class: 'mem-grid' }, cards)));
      },
    },

    timing: {
      name: '神準一擊', icon: '🎯', desc: '指針會左右移動，按下停止，越接近正中央獎金越高！共三次。',
      rate(x) { const d = Math.abs(x - 0.5); return d < 0.03 ? [1500, '完美！'] : d < 0.08 ? [700, '很棒！'] : d < 0.15 ? [300, '不錯'] : [0, '太偏了']; },
      sim() { let n = 0; for (let k = 0; k < 3; k++) n += this.rate(Math.random() * 0.6 + 0.2)[0]; return n; },
      play(p, mb, done) {
        let x = 0, v = 0.012, tries = 3, total = 0, running = true;
        const needle = U.el('div', { class: 'needle' });
        const info = MG.hud('剩餘 3 次　累計 $0');
        const msg = U.el('div', { style: { minHeight: '24px', fontWeight: 700 } });
        const btn = U.el('button', { class: 'primary' }, '停！');
        mb.appendChild(U.el('div', { class: 'mg-area' }, U.el('div', null, this.desc), info, U.el('div', { class: 'meter' }, needle), msg, btn));
        const anim = () => {
          if (!running) return;
          x += v;
          if (x >= 1 || x <= 0) { v = -v; x = U.clamp(x, 0, 1); }
          needle.style.left = `calc(${x * 100}% - 2px)`;
          requestAnimationFrame(anim);
        };
        requestAnimationFrame(anim);
        btn.addEventListener('click', () => {
          const [got, word] = this.rate(x);
          total += got;
          tries--;
          msg.textContent = `${word} +${U.money(got)}`;
          info.textContent = `剩餘 ${tries} 次　累計 ${U.money(total)}`;
          v = (U.chance(0.5) ? 1 : -1) * (0.012 + (3 - tries) * 0.006);
          if (tries <= 0) { running = false; btn.remove(); MG.finish(mb, done, total, '挑戰結束'); }
        });
      },
    },

    rps: {
      name: '猜拳王', icon: '✊', desc: '和猜拳王比三局：贏一局 $800，輸一局 -$300。',
      sim() { let n = 0; for (let k = 0; k < 3; k++) { const r = U.rand(3); n += r === 0 ? 800 : r === 1 ? -300 : 0; } return n; },
      play(p, mb, done) {
        const hands = ['✊', '✌️', '🖐️'];
        let round = 0, net = 0;
        const info = MG.hud('第 1/3 局　累計 $0');
        const face = U.el('div', { class: 'big-icon' }, '🤖');
        const msg = U.el('div', { style: { minHeight: '24px', fontWeight: 700 } });
        const row = U.el('div', { class: 'optrow' });
        hands.forEach((h, i) => row.appendChild(U.el('button', {
          style: { fontSize: '30px' },
          onclick: () => {
            const c = U.rand(3);
            const r = (i - c + 3) % 3; // 0 平手, 2 我贏（✊勝✌️）, 1 我輸
            const d = r === 0 ? 0 : r === 2 ? 800 : -300;
            net += d;
            round++;
            face.textContent = `${h} 🆚 ${hands[c]}`;
            msg.textContent = r === 0 ? '平手' : r === 2 ? '你贏了！' : '你輸了…';
            info.textContent = `第 ${Math.min(round + 1, 3)}/3 局　累計 ${U.money(net)}`;
            if (round >= 3) { row.remove(); MG.finish(mb, done, net, '比賽結束'); }
          },
        }, h)));
        mb.appendChild(U.el('div', { class: 'mg-area' }, U.el('div', null, this.desc), info, face, msg, row));
      },
    },
  },

  async play(p) {
    const keys = U.shuffle(Object.keys(this.games)).slice(0, 3);
    let key, reward;
    if (p.isAI) {
      key = U.pick(keys);
      reward = this.games[key].sim(p);
    } else {
      key = await UI.choose('小遊戲時間', '選擇一個小遊戲挑戰：',
        keys.map(k => ({ label: `${this.games[k].icon} ${this.games[k].name}`, value: k, cls: 'primary' })).concat([{ label: '跳過', value: null }]), '🎮');
      if (!key) return;
      const g = this.games[key];
      reward = await UI.modal({ title: g.name, icon: g.icon, onMount: (mb, done) => g.play(p, mb, done) });
    }
    const g = this.games[key];
    UI.log(`🎮 ${p.name} 玩「${g.name}」，${reward >= 0 ? '贏得' : '輸了'} ${U.money(Math.abs(reward))}`, reward >= 0 ? 'good' : 'bad');
    if (reward > 0) p.cash += reward;
    else if (reward < 0) await Game.pay(p, -reward);
    if (p.isAI) {
      UI.toast(`${g.icon} ${U.esc(p.name)} 玩「${g.name}」${reward >= 0 ? '贏得' : '輸了'} ${U.money(Math.abs(reward))}`);
      await U.wait(900);
    }
    UI.renderAll();
  },
};
