// 共用工具函式
const U = {
  speed: 1, // 動畫速度倍率，0 = 無延遲（測試用）

  rand(n) { return Math.floor(Math.random() * n); },
  randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); },
  chance(p) { return Math.random() < p; },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
  weightedPick(items, weightFn) {
    const total = items.reduce((s, it) => s + weightFn(it), 0);
    let r = Math.random() * total;
    for (const it of items) {
      r -= weightFn(it);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  },
  clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },
  round10(n) { return Math.round(n / 10) * 10; },
  money(n) {
    const v = Math.round(n);
    return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US');
  },
  pct(n) { return (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%'; },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  wait(ms) { return U.speed > 0 ? U.sleep(ms * U.speed) : Promise.resolve(); },
  // 常態分布亂數（Box-Muller）
  randn() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  },
  esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  // 簡易 DOM 建構：U.el('div', {class:'x', onclick: fn}, child1, 'text')
  el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') {
          for (const [sk, sv] of Object.entries(v)) {
            if (sk.startsWith('--')) e.style.setProperty(sk, sv); else e.style[sk] = sv;
          }
        }
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      e.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return e;
  },
};
