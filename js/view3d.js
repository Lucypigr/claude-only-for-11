// 3D 視角：Three.js 場景、鏡頭跟隨、棋子動畫、點選格子
const View3D = {
  ready: false,
  active: false,
  tileKeys: [],
  pickables: [],
  godSprites: {},
  obSprites: {},
  rings: {},
  flashes: {},
  tokens: [],
  cam: { yaw: 0, pitch: 0.86, dist: 23, distCur: 40, target: null, mode: 'follow' },
  BLD_H: [1.25, 1.2, 1.6, 2.0, 3.3, 6.0],

  // 固定亂數種子，讓每次地圖的樹和山都一樣
  rng(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  },

  supported() {
    try {
      const c = document.createElement('canvas');
      return !!(window.THREE && window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  },

  init(container) {
    if (this.ready) return true;
    if (!this.supported()) return false;
    this.container = container;
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) { return false; }
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    r.outputEncoding = THREE.sRGBEncoding;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#9ed8ff');
    this.scene.fog = new THREE.Fog('#9ed8ff', 110, 260);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
    this.cam.target = new THREE.Vector3(0, 0, 0);

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#6d8f4e', 0.72));
    const sun = new THREE.DirectionalLight('#fff3dc', 0.95);
    sun.position.set(28, 55, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 5, far: 150 });
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);

    this.buildWorld();
    this.bindControls();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
    this.ready = true;
    return true;
  },

  resize() {
    if (!this.renderer) return;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  },

  ribbon(points, offset, half, y, color) {
    const pos = [], idx = [];
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const a = points[(i - 1 + n) % n], b = points[(i + 1) % n];
      const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
      const nx = -tz / l, nz = tx / l;
      pos.push(points[i].x + nx * (offset + half), y, points[i].z + nz * (offset + half));
      pos.push(points[i].x + nx * (offset - half), y, points[i].z + nz * (offset - half));
      const j = (i + 1) % n;
      idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    m.receiveShadow = true;
    return m;
  },

  buildWorld() {
    const s = Game.s, scene = this.scene, TOP = Map3D.TOP;
    Map3D.build(s.tiles.length);
    const rnd = this.rng(20260101);

    // 海
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshPhongMaterial({ color: '#2a8ad4', shininess: 90, specular: '#bfe6ff' }));
    sea.rotation.x = -Math.PI / 2;
    sea.receiveShadow = true;
    scene.add(sea);
    // 淺海
    const cx = Map3D.coast.reduce((a, v) => a + v.x, 0) / Map3D.coast.length;
    const cz = Map3D.coast.reduce((a, v) => a + v.y, 0) / Map3D.coast.length;
    const shallow = new THREE.Shape(Map3D.coast.map(v => new THREE.Vector2(cx + (v.x - cx) * 1.13, -(cz + (v.y - cz) * 1.08))));
    const sh = new THREE.Mesh(new THREE.ShapeGeometry(shallow), new THREE.MeshLambertMaterial({ color: '#63c6ec', transparent: true, opacity: 0.85 }));
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.03;
    scene.add(sh);
    // 島
    const shape = new THREE.Shape(Map3D.coast.map(v => new THREE.Vector2(v.x, -v.y)));
    const island = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.4, bevelSegments: 2, curveSegments: 6 }),
      [new THREE.MeshLambertMaterial({ color: '#8cc751' }), new THREE.MeshLambertMaterial({ color: '#f1dca0' })]);
    island.rotation.x = -Math.PI / 2;
    island.receiveShadow = true;
    scene.add(island);

    // 道路
    const rp = Map3D.curve.getSpacedPoints(700).slice(0, 700);
    scene.add(this.ribbon(rp, 0, 1.02, TOP + 0.015, '#5b6270'));
    scene.add(this.ribbon(rp, 0.93, 0.05, TOP + 0.022, '#f5f5f5'));
    scene.add(this.ribbon(rp, -0.93, 0.05, TOP + 0.022, '#f5f5f5'));

    // 格子、土地、地標、名牌
    const slabGeo = new THREE.BoxGeometry(1.72, 0.12, 1.72);
    const plotGeo = new THREE.BoxGeometry(1.5, 0.1, 1.5);
    this.slabs = [];
    this.plots = [];
    this.buildings = [];
    this.labels = [];
    this.floaters = [];
    this.spinners = [];
    s.tiles.forEach((t, i) => {
      const g = Map3D.tiles[i];
      const isLand = t.type === 'land';
      const base = isLand ? new THREE.Color(DISTRICTS[t.district].color).lerp(new THREE.Color('#ffffff'), 0.25)
        : new THREE.Color(['bank', 'hospital', 'stock', 'jail'].includes(t.type) ? '#ffb74d' : '#ffe082');
      const slab = new THREE.Mesh(slabGeo, new THREE.MeshLambertMaterial({ color: base }));
      slab.position.set(g.p.x, TOP + 0.06, g.p.z);
      slab.rotation.y = g.rot;
      slab.receiveShadow = true;
      slab.userData = { tile: i, base };
      scene.add(slab);
      this.slabs.push(slab);
      this.pickables.push(slab);
      if (!isLand) {
        const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: Map3D.emojiTex(TILE_TYPES[t.type].icon), transparent: true }));
        decal.rotation.x = -Math.PI / 2;
        decal.position.set(g.p.x, TOP + 0.125, g.p.z);
        scene.add(decal);
      }
      const face = Math.atan2(g.p.x - g.plot.x, g.p.z - g.plot.z);
      const plot = new THREE.Mesh(plotGeo, new THREE.MeshLambertMaterial({ color: isLand ? '#d9ebb4' : '#eeeeee' }));
      plot.position.set(g.plot.x, TOP + 0.05, g.plot.z);
      plot.rotation.y = face;
      plot.receiveShadow = true;
      plot.userData = { tile: i, face };
      scene.add(plot);
      this.plots.push(plot);
      this.pickables.push(plot);
      this.buildings.push(null);
      // 名牌
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = isLand ? 124 : 96;
      const tex = new THREE.CanvasTexture(canvas);
      tex.encoding = THREE.sRGBEncoding;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      label.scale.set(1.6, 1.6 * canvas.height / 256, 1);
      label.userData = { tile: i, canvas, tex };
      this.labels.push(label);
      this.pickables.push(label);
      scene.add(label);
      if (!isLand) {
        const lm = Map3D.landmark(t.type);
        lm.position.set(g.plot.x, TOP, g.plot.z);
        lm.rotation.y = face;
        lm.traverse(o => { o.userData.tile = i; });
        lm.userData.tile = i;
        scene.add(lm);
        this.pickables.push(lm);
        lm.traverse(o => { if (o.userData.spin) this.spinners.push(o); });
        const h = { bank: 1.9, hospital: 1.6, temple: 1.9, jail: 1.3, shop: 1.2, stock: 3.1, news: 2.7, minigame: 2.2 }[t.type] || 0.5;
        const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: Map3D.emojiTex(TILE_TYPES[t.type].icon), transparent: true }));
        icon.scale.set(1.25, 1.25, 1);
        icon.userData = { baseY: TOP + h + 1.0, phase: i };
        icon.position.set(g.plot.x, icon.userData.baseY, g.plot.z);
        scene.add(icon);
        this.floaters.push(icon);
        label.position.set(g.plot.x, TOP + h + 0.25, g.plot.z);
        Map3D.drawLabel(canvas, t.name, null, null, 'rgba(255,248,225,0.92)');
        tex.needsUpdate = true;
      }
    });

    this.buildTerrain(rnd);
    this.buildClouds(rnd);

    // 挑選格子用的光圈
    this.ringGeo = new THREE.RingGeometry(0.95, 1.18, 36);
    // 棋子
    this.tokens = s.players.map(p => {
      const g = new THREE.Group();
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22 }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.02;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.16, 20), new THREE.MeshLambertMaterial({ color: p.color }));
      base.position.y = 0.08;
      base.castShadow = true;
      const av = new THREE.Sprite(new THREE.SpriteMaterial({ map: Map3D.avatarTex(p), transparent: true }));
      av.scale.set(1.05, 1.05, 1);
      av.position.y = 0.85;
      g.add(shadow, base, av);
      g.userData = { av };
      this.scene.add(g);
      const pos = this.anchor(p);
      g.position.copy(pos);
      return { g, from: pos.clone(), to: pos.clone(), t0: 0, dur: 1 };
    });
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 16), new THREE.MeshLambertMaterial({ color: '#ffd600', emissive: '#6d5b00' }));
    this.arrow.rotation.x = Math.PI;
    this.scene.add(this.arrow);
    const first = this.anchor(s.players[s.current] || s.players[0]);
    this.cam.target.copy(first);
  },

  buildTerrain(rnd) {
    const TOP = Map3D.TOP;
    const roadClear = (x, z) => Math.min(Map3D.roadDist(x, z) - 1.2, ...Map3D.tiles.map(t => Math.hypot(t.plot.x - x, t.plot.z - z) - 1.15));
    // 中央山脈
    this.mountains = [];
    const peakZ = Map3D.toXZ(121, 23.47).y;
    Map3D.spine.forEach((sp, k) => {
      for (const off of [0, -0.22, 0.22]) {
        if (off && rnd() < 0.45) continue;
        const x = sp.x + off * sp.w + (rnd() - 0.5) * 1.2, z = sp.z + (rnd() - 0.5) * 1.2;
        const r = Math.min(3.2, roadClear(x, z) - 0.2);
        if (r < 1.1 || !Map3D.insidePoly(Map3D.coast, x, z)) continue;
        const near = Math.exp(-Math.pow((z - peakZ) / 9, 2));
        const h = r * (1.1 + rnd() * 0.5) * (1 + near * 0.9) * (off ? 0.75 : 1);
        const m = Map3D.mountain(r, h, rnd);
        m.position.set(x, TOP - 0.05, z);
        m.rotation.y = rnd() * Math.PI;
        this.scene.add(m);
        this.mountains.push({ x, z, r });
      }
    });
    // 樹林（InstancedMesh）
    const spots = [];
    for (let k = 0; k < 4000 && spots.length < 260; k++) {
      const x = -17 + rnd() * 36, z = -30 + rnd() * 60;
      if (!Map3D.insidePoly(Map3D.coast, x, z)) continue;
      if ([[-0.9, 0], [0.9, 0], [0, 0.9], [0, -0.9]].some(([dx, dz]) => !Map3D.insidePoly(Map3D.coast, x + dx, z + dz))) continue;
      if (roadClear(x, z) < 0.35) continue;
      if (this.mountains.some(m => Math.hypot(m.x - x, m.z - z) < m.r * 0.85)) continue;
      spots.push({ x, z, s: 0.7 + rnd() * 0.6 });
    }
    const leaf = new THREE.InstancedMesh(new THREE.ConeGeometry(0.42, 1.1, 6), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), spots.length);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 0.4, 5), new THREE.MeshLambertMaterial({ color: '#6d4c41' }), spots.length);
    const mtx = new THREE.Matrix4(), col = new THREE.Color();
    const greens = ['#2e7d32', '#388e3c', '#43a047', '#558b2f', '#1b5e20'];
    spots.forEach((sp, i) => {
      mtx.makeScale(sp.s, sp.s, sp.s).setPosition(sp.x, TOP + 0.4 * sp.s + 0.55 * sp.s, sp.z);
      leaf.setMatrixAt(i, mtx);
      leaf.setColorAt(i, col.set(greens[i % greens.length]));
      mtx.makeScale(sp.s, sp.s, sp.s).setPosition(sp.x, TOP + 0.2 * sp.s, sp.z);
      trunk.setMatrixAt(i, mtx);
    });
    leaf.castShadow = trunk.castShadow = true;
    this.scene.add(leaf, trunk);
    // 燈塔（鵝鑾鼻）
    const tip = Map3D.toXZ(120.8, 21.97);
    const lh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.8, 12), Map3D.mat('#ffffff'));
    body.position.y = 0.9;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.3, 12), Map3D.mat('#e53935'));
    top.position.y = 1.95;
    body.castShadow = true;
    lh.add(body, top);
    lh.position.set(tip.x, TOP, tip.y);
    this.scene.add(lh);
    // 船
    this.boats = [0, 1, 2].map(k => {
      const b = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 1.3), Map3D.mat(['#ffffff', '#ffca28', '#ef5350'][k]));
      hull.position.y = 0.15;
      const sail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.0, 3), Map3D.mat('#fafafa'));
      sail.position.y = 0.8;
      b.add(hull, sail);
      b.userData = { r: 36 + k * 5, a: k * 2.1, sp: 0.03 + k * 0.01 };
      this.scene.add(b);
      return b;
    });
  },

  buildClouds(rnd) {
    this.clouds = [];
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#9aa7b8', transparent: true, opacity: 0.8, depthWrite: false });
    const geo = new THREE.SphereGeometry(1, 12, 8);
    for (let k = 0; k < 6; k++) {
      const c = new THREE.Group();
      const n = 4 + Math.floor(rnd() * 3);
      for (let j = 0; j < n; j++) {
        const s = new THREE.Mesh(geo, mat);
        const r = 0.9 + rnd() * 0.8 - Math.abs(j - n / 2) * 0.15;
        s.scale.set(r * 1.3, r * 0.8, r);
        s.position.set(j * 1.1 - n * 0.55, rnd() * 0.3, (rnd() - 0.5) * 0.9);
        c.add(s);
      }
      c.position.set(-60 + rnd() * 120, 24 + rnd() * 4, -45 + rnd() * 90);
      this.scene.add(c);
      this.clouds.push(c);
    }
  },

  // 玩家在格子上的站位（同格多人時錯開）
  anchor(p) {
    const s = Game.s, g = Map3D.tiles[p.pos];
    const same = s.players.filter(x => !x.bankrupt && x.pos === p.pos);
    const k = same.indexOf(p), n = same.length;
    const offs = n <= 1 ? [[0, 0]] : n === 2 ? [[-0.4, 0], [0.4, 0]] : n === 3 ? [[-0.42, -0.25], [0.42, -0.25], [0, 0.4]] : [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]];
    const [a, b] = offs[Math.max(0, k)] || [0, 0];
    return new THREE.Vector3(g.p.x + g.tan.x * a + g.nrm.x * b, Map3D.TOP + 0.12, g.p.z + g.tan.z * a + g.nrm.z * b);
  },

  lighten(hex, t) { return new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), t); },

  // 依遊戲狀態更新單一格子（土地顏色、建築、名牌）
  syncTile(i) {
    if (!this.ready) return;
    const s = Game.s, t = s.tiles[i];
    if (t.type !== 'land') return;
    const owner = t.owner !== null ? s.players[t.owner] : null;
    const toll = owner ? Game.toll(t) : 0;
    const flags = (t.sealed > 0 ? '🔒' : '') + (s.priceUp[t.district] > 0 ? '💹' : '');
    const key = [t.owner, t.level, toll, t.price, flags].join('|');
    if (this.tileKeys[i] === key) return;
    const levelChanged = !this.tileKeys[i] || this.tileKeys[i].split('|').slice(0, 2).join('|') !== [t.owner, t.level].join('|');
    this.tileKeys[i] = key;
    const plot = this.plots[i], g = Map3D.tiles[i];
    plot.material.color.copy(owner ? this.lighten(owner.color, 0.45) : new THREE.Color('#d9ebb4'));
    if (levelChanged) {
      if (this.buildings[i]) {
        this.scene.remove(this.buildings[i]);
        this.pickables = this.pickables.filter(o => o !== this.buildings[i]);
        this.buildings[i] = null;
      }
      if (owner) {
        const b = Map3D.building(t.level, owner.color);
        b.position.set(g.plot.x, Map3D.TOP, g.plot.z);
        b.rotation.y = plot.userData.face;
        b.traverse(o => { o.userData.tile = i; });
        b.userData.grow = 0;
        b.scale.setScalar(0.01);
        this.scene.add(b);
        this.pickables.push(b);
        this.buildings[i] = b;
      }
    }
    const lb = this.labels[i];
    const h = owner ? this.BLD_H[t.level] : 0.9;
    lb.position.set(g.plot.x, Map3D.TOP + h + 0.45, g.plot.z);
    Map3D.drawLabel(lb.userData.canvas, `${flags}${t.name}`, owner ? `過路費 ${U.money(toll)}` : `售 ${U.money(t.price)}`,
      DISTRICTS[t.district].color, owner ? `rgba(${this.lighten(owner.color, 0.7).toArray().map(v => Math.round(v * 255)).join(',')},0.94)` : null);
    lb.userData.tex.needsUpdate = true;
  },

  sync() {
    if (!this.ready || !Game.s) return;
    const s = Game.s;
    s.tiles.forEach((_, i) => this.syncTile(i));
    // 地圖上的神明
    for (const k of Object.keys(this.godSprites)) {
      if (s.mapGods[k] !== this.godSprites[k].userData.key) { this.scene.remove(this.godSprites[k]); delete this.godSprites[k]; }
    }
    for (const [k, key] of Object.entries(s.mapGods)) {
      if (this.godSprites[k]) continue;
      const g = Map3D.tiles[+k];
      const grp = new THREE.Group();
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.haloTex(GODS[key].good), transparent: true, depthWrite: false }));
      halo.scale.set(2.1, 2.1, 1);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: Map3D.emojiTex(GODS[key].icon), transparent: true }));
      sp.scale.set(1.3, 1.3, 1);
      grp.add(halo, sp);
      grp.position.set(g.p.x, Map3D.TOP + 1.9, g.p.z);
      grp.userData = { key, baseY: Map3D.TOP + 1.9, phase: +k };
      this.scene.add(grp);
      this.godSprites[k] = grp;
    }
    // 路障與地雷
    for (const k of Object.keys(this.obSprites)) {
      if (s.obstacles[k] !== this.obSprites[k].userData.kind) { this.scene.remove(this.obSprites[k]); delete this.obSprites[k]; }
    }
    for (const [k, kind] of Object.entries(s.obstacles)) {
      if (this.obSprites[k]) continue;
      const g = Map3D.tiles[+k];
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: Map3D.emojiTex(kind === 'mine' ? '💣' : '🚧'), transparent: true }));
      sp.scale.set(1, 1, 1);
      sp.position.set(g.p.x, Map3D.TOP + 0.6, g.p.z);
      sp.userData = { kind };
      this.scene.add(sp);
      this.obSprites[k] = sp;
    }
    // 可選取格子的光圈
    const want = UI.picking ? UI.picking.set : new Set();
    for (const k of Object.keys(this.rings)) {
      if (!want.has(+k)) { this.scene.remove(this.rings[k]); delete this.rings[k]; }
    }
    for (const i of want) {
      if (this.rings[i]) continue;
      const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: '#ffea00', transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      const g = Map3D.tiles[i];
      ring.position.set(g.p.x, Map3D.TOP + 0.16, g.p.z);
      this.scene.add(ring);
      this.rings[i] = ring;
    }
    this.tokens.forEach((tk, idx) => { tk.g.visible = !s.players[idx].bankrupt; });
  },

  haloTex(good) {
    const key = good ? '__haloG' : '__haloB';
    if (Map3D.texCache[key]) return Map3D.texCache[key];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 8, 64, 64, 62);
    gr.addColorStop(0, good ? 'rgba(255,241,118,0.95)' : 'rgba(149,117,205,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return (Map3D.texCache[key] = new THREE.CanvasTexture(c));
  },

  flash(i) {
    if (!this.ready) return;
    this.flashes[i] = performance.now();
  },

  setActive(on) {
    this.active = on;
    if (on && !this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(t => this.frame(t));
    }
  },

  frame(now) {
    if (!this.active) { this.raf = null; return; }
    this.raf = requestAnimationFrame(t => this.frame(t));
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
    this.last = now;
    const s = Game.s;
    if (!s) return;
    // 棋子：跳格動畫
    s.players.forEach((p, idx) => {
      const tk = this.tokens[idx];
      if (!tk) return;
      const target = this.anchor(p);
      if (target.distanceToSquared(tk.to) > 1e-4) {
        tk.from.copy(tk.g.position);
        tk.to.copy(target);
        const far = tk.from.distanceTo(tk.to) > 4;
        tk.t0 = now;
        tk.dur = far ? 700 : Math.max(60, 160 * (U.speed || 0.3));
        tk.hop = far ? 3 : 0.55;
      }
      const k = U.clamp((now - tk.t0) / tk.dur, 0, 1);
      tk.g.position.lerpVectors(tk.from, tk.to, k);
      tk.g.position.y += Math.sin(Math.PI * k) * (tk.hop || 0);
      tk.g.userData.av.position.y = 0.85 + (idx === s.current ? Math.sin(now / 250) * 0.06 : 0);
    });
    const cur = this.tokens[s.current];
    if (cur) {
      this.arrow.visible = !s.players[s.current].bankrupt;
      this.arrow.position.set(cur.g.position.x, cur.g.position.y + 1.75 + Math.sin(now / 220) * 0.12, cur.g.position.z);
      this.arrow.rotation.y += dt * 3;
    }
    // 漂浮物、神明、光圈、摩天輪、雲、船
    this.floaters.forEach(f => { f.position.y = f.userData.baseY + Math.sin(now / 600 + f.userData.phase) * 0.15; });
    for (const g of Object.values(this.godSprites)) g.position.y = g.userData.baseY + Math.sin(now / 400 + g.userData.phase) * 0.2;
    for (const r of Object.values(this.rings)) {
      const k = 1 + Math.sin(now / 180) * 0.08;
      r.scale.set(k, k, k);
      r.material.opacity = 0.6 + Math.sin(now / 180) * 0.35;
    }
    this.spinners.forEach(w => { w.rotation.z += dt * 0.6; });
    this.clouds.forEach(c => { c.position.x += dt * 0.8; if (c.position.x > 70) c.position.x = -70; });
    this.boats.forEach(b => {
      b.userData.a += dt * b.userData.sp;
      b.position.set(Math.cos(b.userData.a) * b.userData.r * 0.7, 0.05, Math.sin(b.userData.a) * b.userData.r);
      b.rotation.y = -b.userData.a;
    });
    // 新蓋的房子長出來
    this.buildings.forEach(b => {
      if (b && b.userData.grow < 1) {
        b.userData.grow = Math.min(1, b.userData.grow + dt * 2.5);
        const e = 1 - Math.pow(1 - b.userData.grow, 3);
        b.scale.set(e, e, e);
      }
    });
    // 閃爍格子
    for (const [i, t0] of Object.entries(this.flashes)) {
      const k = (now - t0) / 900;
      const slab = this.slabs[i];
      if (k >= 1) { slab.material.color.copy(slab.userData.base); delete this.flashes[i]; continue; }
      slab.material.color.copy(slab.userData.base).lerp(new THREE.Color('#fff176'), Math.sin(k * Math.PI * 3) * 0.5 + 0.5);
    }
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  },

  updateCamera(dt) {
    const c = this.cam, s = Game.s;
    let want;
    if (c.mode === 'follow' && this.tokens[s.current]) want = this.tokens[s.current].g.position.clone().setY(Map3D.TOP);
    else want = new THREE.Vector3(1.2, 0, 0.5);
    const k = 1 - Math.exp(-dt * 4);
    c.target.lerp(want, k);
    const wantDist = c.mode === 'follow' ? c.dist : c.overDist || 72;
    c.distCur += (wantDist - c.distCur) * k;
    const d = c.distCur;
    this.camera.position.set(
      c.target.x + Math.sin(c.yaw) * Math.cos(c.pitch) * d,
      c.target.y + Math.sin(c.pitch) * d,
      c.target.z + Math.cos(c.yaw) * Math.cos(c.pitch) * d);
    this.camera.lookAt(c.target);
  },

  zoom(f) {
    const c = this.cam;
    if (c.mode === 'follow') c.dist = U.clamp(c.dist * f, 7, 60);
    else c.overDist = U.clamp((c.overDist || 72) * f, 30, 130);
  },

  toggleMode() {
    this.cam.mode = this.cam.mode === 'follow' ? 'overview' : 'follow';
    return this.cam.mode;
  },

  resetView() { Object.assign(this.cam, { yaw: 0, pitch: 0.86, dist: 23, overDist: 72 }); },

  bindControls() {
    const el = this.renderer.domElement;
    const ptrs = new Map();
    let moved = 0, pinch = null;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    el.addEventListener('pointermove', e => {
      const pr = ptrs.get(e.pointerId);
      if (!pr) return;
      const dx = e.clientX - pr.x, dy = e.clientY - pr.y;
      pr.x = e.clientX; pr.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (ptrs.size === 2 && pinch) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoom(pinch / d);
        pinch = d;
      } else if (ptrs.size === 1) {
        this.cam.yaw -= dx * 0.006;
        this.cam.pitch = U.clamp(this.cam.pitch + dy * 0.004, 0.35, 1.45);
      }
    });
    const up = e => {
      if (ptrs.size === 1 && moved < 8) this.click(e);
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); pinch = null; });
    el.addEventListener('wheel', e => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  },

  click(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObjects(this.pickables, true);
    for (const h of hits) {
      let o = h.object;
      while (o && o.userData.tile === undefined) o = o.parent;
      if (o) { UI.onTileClick(o.userData.tile); return; }
    }
  },
};
