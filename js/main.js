// 開始畫面與遊戲設定
const Setup = {
  slots: [
    { type: 'human', charId: 'atubo' },
    { type: 'ai', charId: 'xiaomei' },
    { type: 'ai', charId: 'qian' },
    { type: 'ai', charId: 'beibei' },
  ],

  mapId: 'taiwan',

  renderMaps() {
    const root = $('#mapPick');
    root.innerHTML = '';
    for (const [id, m] of Object.entries(MAPS)) {
      root.appendChild(U.el('button', {
        class: 'mapcard' + (id === this.mapId ? ' sel' : ''), id: `map-${id}`,
        onclick: () => { this.mapId = id; this.renderMaps(); },
      }, U.el('span', { class: 'micon' }, m.icon), U.el('b', null, m.name), U.el('span', { class: 'mdesc' }, m.desc)));
    }
  },

  render() {
    this.renderMaps();
    const root = $('#slots');
    root.innerHTML = '';
    this.slots.forEach((sl, i) => {
      const ch = CHARACTERS.find(c => c.id === sl.charId);
      const charSel = U.el('select', { onchange: (e) => { sl.charId = e.target.value; this.render(); } },
        CHARACTERS.map(c => U.el('option', { value: c.id, selected: c.id === sl.charId }, `${c.icon} ${c.name}`)));
      const typeSel = U.el('select', { onchange: (e) => { sl.type = e.target.value; this.render(); } },
        [['human', '🙋 玩家'], ['ai', '🤖 電腦'], ['off', '— 無 —']].map(([v, l]) => U.el('option', { value: v, selected: v === sl.type }, l)));
      root.appendChild(U.el('div', { class: 'slot' + (sl.type === 'off' ? ' off' : ''), style: { borderColor: sl.type === 'off' ? 'transparent' : ch.color } },
        U.el('div', { class: 'avatar' }, ch.icon),
        U.el('div', { style: { fontWeight: 800, color: ch.color } }, `${i + 1}P ${ch.name}`),
        U.el('div', { class: 'muted', style: { fontSize: '12px', minHeight: '32px' } }, `「${ch.quote}」`),
        typeSel, charSel));
    });
    $('#btnContinue').classList.toggle('hidden', !Game.load());
  },

  collect() {
    const active = this.slots.filter(s => s.type !== 'off');
    if (active.length < 2) return '至少需要 2 位玩家';
    const ids = active.map(s => s.charId);
    if (new Set(ids).size !== ids.length) return '每位玩家的角色不能重複';
    return {
      mapId: this.mapId,
      players: active.map(s => ({ charId: s.charId, isAI: s.type === 'ai' })),
      cash: +$('#optCash').value,
      maxDays: +$('#optDays').value,
      target: +$('#optTarget').value,
      speed: +$('#optSpeed').value,
    };
  },

  init() {
    this.render();
    $('#optView').value = UI.getMode();
    $('#optView').addEventListener('change', (e) => { try { localStorage.setItem('richman-view', e.target.value); } catch (err) { /* 忽略 */ } });
    UI.bindViewControls();
    $('#btnStart').addEventListener('click', () => {
      const cfg = this.collect();
      if (typeof cfg === 'string') { UI.toast(cfg); return; }
      Game.clearSave();
      Game.start(cfg);
    });
    $('#btnContinue').addEventListener('click', () => Game.resume());
    $('#btnMenu').addEventListener('click', async () => {
      const v = await UI.choose('選單', '遊戲會在每天開始時自動存檔。', [
        { label: '回到標題（保留存檔）', value: 'title' },
        { label: '放棄這局', value: 'quit', cls: 'bad' },
        { label: '繼續遊戲', value: null, cls: 'primary' },
      ], '⚙️');
      if (v === 'quit') { Game.clearSave(); location.reload(); }
      if (v === 'title') location.reload();
    });
  },
};

// 空白鍵／Enter：按下目前的主要按鈕（擲骰子、確定）
document.addEventListener('keydown', (e) => {
  if (e.key !== ' ' && e.key !== 'Enter') return;
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement && document.activeElement.tagName)) return;
  const ovs = document.querySelectorAll('.overlay');
  const btn = ovs.length
    ? ovs[ovs.length - 1].querySelector('.mbtns button.primary:not(:disabled)')
    : document.querySelector('#actions button.primary:not(:disabled)');
  if (btn) {
    e.preventDefault();
    btn.click();
  }
});

window.addEventListener('DOMContentLoaded', () => Setup.init());
