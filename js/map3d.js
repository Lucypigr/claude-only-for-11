// 3D 地圖：依目前地圖（maps.js）建立陸地、道路、格子位置與山脈
const Map3D = {
  TOP: 0.6,         // 陸地表面高度
  PLOT_OFFSET: 2.1, // 土地距離道路中心
  EMBANK: 3.4,      // route 模式道路兩側填出的陸地寬度

  toXZ(lon, lat) { return new THREE.Vector2((lon - this.C[0]) * this.K * this.XF, -(lat - this.C[1]) * this.K); },
  toLonLat(x, z) { return [this.C[0] + x / this.K / this.XF, this.C[1] - z / this.K]; },

  insidePoly(poly, x, z) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > z) !== (b.y > z) && x < (b.x - a.x) * (z - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  },

  // 沿海岸線內縮出道路控制點
  insetRoad(coast, inset, minLat) {
    const n = coast.length, road = [];
    for (let i = 0; i < n; i++) {
      const prev = coast[(i - 1 + n) % n], cur = coast[i], next = coast[(i + 1) % n];
      const e1 = new THREE.Vector2().subVectors(cur, prev).normalize();
      const e2 = new THREE.Vector2().subVectors(next, cur).normalize();
      const t = e1.add(e2).normalize();
      const nrm = new THREE.Vector2(-t.y, t.x);
      if (!this.insidePoly(coast, cur.x + nrm.x * 0.5, cur.y + nrm.y * 0.5)) nrm.multiplyScalar(-1);
      const rp = new THREE.Vector3(cur.x + nrm.x * inset, this.TOP, cur.y + nrm.y * inset);
      if (minLat === undefined || this.toLonLat(rp.x, rp.z)[1] >= minLat) road.push(rp);
    }
    // 平滑化，避免海岸線凹凸讓道路扭來扭去
    for (let it = 0; it < 3; it++) {
      const cp = road.map(v => v.clone());
      for (let i = 0; i < road.length; i++) {
        const a = cp[(i - 1 + road.length) % road.length], b = cp[(i + 1) % road.length];
        road[i].set(0.25 * a.x + 0.5 * cp[i].x + 0.25 * b.x, this.TOP, 0.25 * a.z + 0.5 * cp[i].z + 0.25 * b.z);
      }
    }
    return road;
  },

  // 建立所有幾何資料（不含 mesh）
  build(nTiles) {
    const geo = CURRENT_MAP.geo;
    this.geo = geo;
    this.C = geo.center;
    this.K = geo.K;
    this.XF = geo.XF;
    this.lands = geo.lands.map(poly => poly.map(([lo, la]) => this.toXZ(lo, la)));
    this.coast = this.lands[0];
    const road = geo.mode === 'coast'
      ? this.insetRoad(this.coast, geo.inset, geo.minLat)
      : geo.route.map(([lo, la]) => { const v = this.toXZ(lo, la); return new THREE.Vector3(v.x, this.TOP, v.y); });
    this.curve = new THREE.CatmullRomCurve3(road, true, 'centripetal');
    this.length = this.curve.getLength();
    const samples = this.curve.getSpacedPoints(600);
    this.roadSamples = samples;
    this.roadDist = (x, z) => samples.reduce((m, s) => Math.min(m, Math.hypot(s.x - x, s.z - z)), Infinity);
    const loop = samples.map(s => new THREE.Vector2(s.x, s.z));
    const route = geo.mode === 'route';
    this.onLand = (x, z) => this.lands.some(poly => this.insidePoly(poly, x, z)) || (route && this.roadDist(x, z) <= this.EMBANK - 0.2);
    // 每一格的位置、方向、內側法線；土地優先放內側，太擠就放外側
    this.tiles = [];
    const placed = [];
    // 分數 >= 0 代表放得下：離道路、其他土地、海岸都夠遠
    const score = (q) => {
      const coastOk = [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]].every(([dx, dz]) => this.onLand(q.x + dx, q.z + dz));
      const plotD = placed.reduce((m, o) => Math.min(m, Math.hypot(o.x - q.x, o.z - q.z)), Infinity);
      return Math.min(this.roadDist(q.x, q.z) - 1.9, plotD - 1.75) - (coastOk ? 0 : 5);
    };
    for (let i = 0; i < nTiles; i++) {
      const u = i / nTiles;
      const p = this.curve.getPointAt(u);
      const tan = this.curve.getTangentAt(u);
      const nrm = new THREE.Vector3(-tan.z, 0, tan.x);
      const inner = route ? this.insidePoly(loop, p.x + nrm.x * 0.5, p.z + nrm.z * 0.5) : this.insidePoly(this.coast, p.x + nrm.x * 3, p.z + nrm.z * 3);
      if (!inner) nrm.multiplyScalar(-1);
      const rot = Math.atan2(tan.x, tan.z);
      let best = null;
      for (const side of [1, -1, 1.3, -1.3]) {
        for (const shift of [0, 0.45, -0.45, 0.9, -0.9]) {
          const q = p.clone().addScaledVector(nrm, this.PLOT_OFFSET * side).addScaledVector(tan, shift);
          const sc = score(q);
          if (!best || sc > best.sc) best = { q, sc };
          if (sc >= 0) break;
        }
        if (best.sc >= 0) break;
      }
      placed.push(best.q);
      this.tiles.push({ p, tan, nrm, rot, plot: best.q });
    }
    // 山：沿脊線自動產生，或使用地圖指定的山峰
    this.peaks = [];
    if (geo.spine) {
      const sp = geo.spine, coast = this.coast, n = coast.length;
      for (let lat = sp.from; lat >= sp.to; lat -= 0.12) {
        const z = this.toXZ(this.C[0], lat).y;
        const xs = [];
        for (let i = 0; i < n; i++) {
          const a = coast[i], b = coast[(i + 1) % n];
          if ((a.y > z) !== (b.y > z)) xs.push(a.x + (b.x - a.x) * (z - a.y) / (b.y - a.y));
        }
        if (xs.length >= 2) {
          const mn = Math.min(...xs), mx = Math.max(...xs);
          this.peaks.push({ x: mn + (mx - mn) * sp.frac, z, spread: mx - mn, boost: 1 });
        }
      }
      const pk = this.toXZ(sp.peak[0], sp.peak[1]);
      this.peaks.forEach(q => { q.boost = 1 + 0.9 * Math.exp(-Math.pow((q.z - pk.y) / 9, 2)); });
    }
    for (const [lo, la, boost] of geo.mountains || []) {
      const v = this.toXZ(lo, la);
      this.peaks.push({ x: v.x, z: v.y, spread: 0, boost: boost || 1 });
    }
    // 範圍（鏡頭、樹林、雲用）
    const pts = this.lands.flat().concat(loop);
    const xs = pts.map(v => v.x), zs = pts.map(v => v.y);
    this.bounds = { minX: Math.min(...xs) - 2, maxX: Math.max(...xs) + 2, minZ: Math.min(...zs) - 2, maxZ: Math.max(...zs) + 2 };
    this.mid = new THREE.Vector3((this.bounds.minX + this.bounds.maxX) / 2, 0, (this.bounds.minZ + this.bounds.maxZ) / 2);
    this.span = Math.max(this.bounds.maxX - this.bounds.minX, this.bounds.maxZ - this.bounds.minZ);
  },

  // ---------- 貼圖 ----------
  texCache: {},
  EMOJI_FONT: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif',

  emojiTex(emoji) {
    if (this.texCache[emoji]) return this.texCache[emoji];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `96px ${this.EMOJI_FONT}`;
    g.fillText(emoji, 64, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return (this.texCache[emoji] = tex);
  },

  avatarTex(p) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2);
    g.fillStyle = p.color; g.fill();
    g.lineWidth = 8; g.strokeStyle = '#fff'; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `70px ${this.EMOJI_FONT}`;
    g.fillText(p.icon, 64, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  },

  drawLabel(canvas, title, sub, stripe, bg) {
    const g = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = bg || 'rgba(255,255,255,0.92)';
    g.beginPath();
    if (g.roundRect) g.roundRect(4, 4, W - 8, H - 8, 18); else g.rect(4, 4, W - 8, H - 8);
    g.fill();
    if (stripe) { g.fillStyle = stripe; g.fillRect(4, 4, 14, H - 8); }
    g.fillStyle = '#222';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${sub ? 40 : 46}px "Noto Sans TC","PingFang TC","Microsoft JhengHei",${this.EMOJI_FONT}`;
    g.fillText(title, W / 2 + 6, sub ? 40 : H / 2 + 2);
    if (sub) {
      g.font = `bold 30px "Noto Sans TC","PingFang TC",sans-serif`;
      g.fillStyle = '#444';
      g.fillText(sub, W / 2 + 6, 86);
    }
  },

  windowTex() {
    if (this.texCache.__win) return this.texCache.__win;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#8fc3ea';
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) g.fillRect(8 + x * 30, 8 + y * 30, 18, 20);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    return (this.texCache.__win = tex);
  },

  // ---------- 材質 ----------
  matCache: {},
  mat(color, opts) {
    const key = color + JSON.stringify(opts || {});
    if (!this.matCache[key]) this.matCache[key] = new THREE.MeshLambertMaterial({ color, ...(opts || {}) });
    return this.matCache[key];
  },
  box(w, h, d, color, y = 0, opts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color, opts));
    m.position.y = y + h / 2;
    m.castShadow = m.receiveShadow = true;
    return m;
  },
  roof(r, h, color, y, sx = 1) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), this.mat(color, { flatShading: true }));
    m.rotation.y = Math.PI / 4;
    m.scale.x = sx;
    m.position.y = y + h / 2;
    m.castShadow = true;
    return m;
  },
  windowed(w, h, d, tint, y) {
    const tex = this.windowTex().clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(w * 2)), Math.max(1, Math.round(h * 2.2)));
    const side = new THREE.MeshLambertMaterial({ color: tint, map: tex });
    const top = this.mat(tint);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, top, side, side]);
    m.position.y = y + h / 2;
    m.castShadow = m.receiveShadow = true;
    return m;
  },

  // 依等級建造房子；color 為地主顏色
  building(level, color) {
    const g = new THREE.Group();
    const y0 = 0.07;
    if (level === 0) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 6), this.mat('#8d6e63'));
      pole.position.set(-0.5, y0 + 0.55, -0.5);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.03), this.mat(color));
      flag.position.set(-0.24, y0 + 0.92, -0.5);
      pole.castShadow = flag.castShadow = true;
      g.add(pole, flag);
    } else if (level === 1) {
      g.add(this.box(0.9, 0.55, 0.8, '#fff6e6', y0), this.roof(0.72, 0.45, color, y0 + 0.55));
    } else if (level === 2) {
      g.add(this.box(1.25, 0.85, 0.95, '#fffaf0', y0), this.roof(0.92, 0.55, color, y0 + 0.85, 1.3));
      const ch = this.box(0.14, 0.35, 0.14, '#a1887f', y0 + 0.95); ch.position.x = 0.3;
      const door = this.box(0.22, 0.4, 0.02, '#8d6e63', y0); door.position.z = 0.49;
      g.add(ch, door);
    } else if (level === 3) {
      g.add(this.windowed(1.15, 1.6, 1.05, '#fff3e0', y0), this.box(1.25, 0.12, 1.15, color, y0 + 1.6));
    } else if (level === 4) {
      g.add(this.windowed(1.05, 2.6, 1.05, '#b3e5fc', y0), this.box(1.12, 0.25, 1.12, color, y0 + 2.6),
        this.box(0.5, 0.3, 0.5, '#eceff1', y0 + 2.85));
    } else {
      g.add(this.windowed(1.2, 2.2, 1.2, '#b2dfdb', y0), this.box(1.26, 0.14, 1.26, color, y0 + 2.2),
        this.windowed(0.9, 1.7, 0.9, '#b2dfdb', y0 + 2.34), this.box(0.96, 0.12, 0.96, color, y0 + 4.04),
        this.windowed(0.55, 1.0, 0.55, '#b2dfdb', y0 + 4.16));
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.06, 0.9, 6), this.mat('#eceff1'));
      spire.position.y = y0 + 5.6;
      g.add(spire);
    }
    return g;
  },

  // 特殊格的地標建築
  landmark(type) {
    const g = new THREE.Group();
    const y0 = 0.07;
    switch (type) {
      case 'bank': {
        g.add(this.box(1.9, 0.18, 1.5, '#eeeeee', y0), this.box(1.6, 1.0, 1.2, '#fff8e1', y0 + 0.18));
        for (let k = 0; k < 4; k++) {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 8), this.mat('#ffffff'));
          c.position.set(-0.6 + k * 0.4, y0 + 0.68, 0.68); c.castShadow = true; g.add(c);
        }
        g.add(this.roof(1.25, 0.5, '#ffb300', y0 + 1.18, 1.3));
        break;
      }
      case 'hospital': {
        g.add(this.windowed(1.7, 1.4, 1.2, '#ffffff', y0));
        const a = this.box(0.5, 0.14, 0.02, '#e53935', y0 + 1.0); a.position.z = 0.61;
        const b = this.box(0.14, 0.5, 0.02, '#e53935', y0 + 0.82); b.position.z = 0.61;
        g.add(a, b);
        break;
      }
      case 'temple': {
        g.add(this.box(1.5, 0.2, 1.3, '#bdbdbd', y0), this.box(1.1, 0.7, 0.9, '#c62828', y0 + 0.2),
          this.roof(1.25, 0.4, '#ff8f00', y0 + 0.9, 1.4), this.box(0.7, 0.35, 0.6, '#c62828', y0 + 1.15),
          this.roof(0.8, 0.35, '#ff8f00', y0 + 1.45, 1.4));
        break;
      }
      case 'jail': {
        g.add(this.box(1.6, 1.0, 1.3, '#78909c', y0));
        for (let k = 0; k < 5; k++) { const bar = this.box(0.05, 0.7, 0.05, '#263238', y0 + 0.12); bar.position.set(-0.4 + k * 0.2, bar.position.y, 0.67); g.add(bar); }
        g.add(this.box(1.7, 0.12, 1.4, '#546e7a', y0 + 1.0));
        break;
      }
      case 'shop': {
        g.add(this.box(1.4, 0.9, 1.1, '#fff59d', y0));
        const aw = this.box(1.5, 0.08, 0.45, '#ef5350', y0 + 0.8); aw.position.z = 0.7; aw.rotation.x = 0.3;
        g.add(aw, this.box(1.5, 0.12, 1.2, '#43a047', y0 + 0.9));
        break;
      }
      case 'stock': {
        g.add(this.windowed(1.1, 2.8, 1.1, '#90caf9', y0), this.box(1.2, 0.15, 1.2, '#1565c0', y0 + 2.8));
        break;
      }
      case 'news': {
        g.add(this.box(1.2, 0.8, 1.0, '#e1f5fe', y0));
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 2.2, 8), this.mat('#e53935'));
        t.position.y = y0 + 1.9; t.castShadow = true;
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), this.mat('#ffffff'));
        s.position.y = y0 + 2.4;
        g.add(t, s);
        break;
      }
      case 'minigame': {
        g.add(this.box(1.3, 0.25, 0.8, '#ab47bc', y0));
        const wheel = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 6, 24), this.mat('#ff4081'));
        wheel.add(ring);
        for (let k = 0; k < 8; k++) {
          const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.7, 0.03), this.mat('#ffffff'));
          sp.rotation.z = k * Math.PI / 8; wheel.add(sp);
          const cab = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), this.mat(['#ffeb3b', '#4fc3f7', '#81c784', '#ff8a65'][k % 4]));
          cab.position.set(Math.cos(k * Math.PI / 4) * 0.85, Math.sin(k * Math.PI / 4) * 0.85, 0); wheel.add(cab);
        }
        wheel.position.y = y0 + 1.25;
        wheel.userData.spin = true;
        g.add(wheel);
        break;
      }
      default: {
        const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.3, 12), this.mat('#fff3c4'));
        ped.position.y = y0 + 0.15; ped.castShadow = true;
        g.add(ped);
      }
    }
    return g;
  },

  // 低多邊形的山
  mountain(r, h, rnd) {
    const geo = new THREE.ConeGeometry(r, h, 7, 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < h / 2 - 0.01) {
        pos.setX(i, pos.getX(i) * (0.85 + rnd() * 0.3));
        pos.setZ(i, pos.getZ(i) * (0.85 + rnd() * 0.3));
        pos.setY(i, pos.getY(i) + (rnd() - 0.5) * h * 0.08);
      }
    }
    geo.computeVertexNormals();
    const g = new THREE.Group();
    const m = new THREE.Mesh(geo, this.mat('#5f8f45', { flatShading: true }));
    m.position.y = h / 2;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    if (h > 3.6) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.26, h * 0.26, 7), this.mat('#ffffff', { flatShading: true }));
      cap.position.y = h - h * 0.13;
      g.add(cap);
    }
    return g;
  },
};
