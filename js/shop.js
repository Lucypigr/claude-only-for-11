// 道具店：點券買卡片、現金買交通工具
const Shop = {
  async open(p) {
    const stock = U.shuffle(CARD_KEYS).slice(0, 8);
    if (p.isAI) {
      AI.shop(p, stock);
      await U.wait(500);
      return;
    }
    const wrap = U.el('div');
    const render = () => {
      wrap.innerHTML = '';
      wrap.appendChild(U.el('div', { html: `🎟️ 點券 <b>${p.points}</b>　💵 現金 <b>${U.money(p.cash)}</b>　🃏 手牌 ${p.cards.length}/${HAND_LIMIT}` }));
      wrap.appendChild(U.el('h3', null, '卡片（點券購買）'));
      const grid = U.el('div', { class: 'cardgrid' });
      stock.forEach(k => {
        const c = CARDS[k];
        grid.appendChild(U.el('div', { class: 'gcard' },
          U.el('div', { class: 'gi' }, c.icon), U.el('div', { class: 'gn' }, c.name), U.el('div', { class: 'gd' }, c.desc),
          U.el('button', {
            class: 'primary small', disabled: p.points < c.cost || p.cards.length >= HAND_LIMIT,
            onclick: () => { p.points -= c.cost; p.cards.push(k); UI.log(`🏪 ${p.name} 購買了「${c.name}」`); UI.renderPlayers(); render(); },
          }, `🎟️ ${c.cost}`)));
      });
      wrap.appendChild(grid);
      wrap.appendChild(U.el('h3', null, '交通工具（現金購買）'));
      const vg = U.el('div', { class: 'cardgrid' });
      VEHICLES.forEach((v, i) => {
        if (i === 0) return;
        vg.appendChild(U.el('div', { class: 'gcard' },
          U.el('div', { class: 'gi' }, v.icon), U.el('div', { class: 'gn' }, v.name),
          U.el('div', { class: 'gd' }, `可擲 ${v.dice} 顆骰子（擲骰前可自選顆數）`),
          U.el('button', {
            class: 'primary small', disabled: p.vehicle >= i || p.cash < v.price,
            onclick: () => { p.cash -= v.price; p.vehicle = i; UI.log(`🏪 ${p.name} 購買了${v.name}`); UI.renderAll(); render(); },
          }, p.vehicle >= i ? '已擁有' : U.money(v.price))));
      });
      wrap.appendChild(vg);
    };
    render();
    await UI.modal({ title: '道具店', icon: '🏪', wide: true, body: wrap, buttons: [{ label: '離開', value: true, cls: 'primary' }] });
  },
};
