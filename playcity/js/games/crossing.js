'use strict';
/* ═══════════════════════════════════════════════════════════════
   🚸 등굣길 건너기 — 한 칸씩 뛰어 도로·기찻길·강을 건너 학교 정문까지 (자기 씬)
   · 주인공: 노란 모자에 빨간 가방을 멘 「새싹이」 (원작 캐릭터·이름·그림을 쓰지 않음)
   · 차도, 모노레일 선로, 통나무가 떠내려가는 강, 신호등 있는 횡단보도
   · 머뭇거리거나 화면 뒤로 처지면 까치가 가방을 물고 간다
   규칙 숫자는 CFG에서 고친다.
   ═══════════════════════════════════════════════════════════════ */
(function (G) {
  const T = THREE, $ = G.$;
  const CFG = {
    rows: 44,                  // 정문까지 칸 수
    half: 5,                   // 좌우로 움직일 수 있는 칸 (-5 ~ 5)
    hop: 0.13,                 // 한 칸 뛰는 시간(초)
    scroll: [0.28, 0.62],      // 화면이 저절로 앞으로 가는 속도 (처음, 끝) 칸/초
    idleCrow: 8,               // 이만큼 앞으로 안 가면 까치
    behindCrow: 4.2,           // 화면 아래로 이만큼 처지면 까치
    signal: { car: 4.2, walk: 3.4 },   // 횡단보도 신호 길이(초)
  };
  const W = 34;                // 줄 하나의 폭 (화면 밖까지)
  const LOOP = 30;             // 차·통나무가 도는 길이
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(40, 1, 0.5, 120);
  scene.background = G.skyColor.clone();
  scene.fog = new T.Fog(G.skyColor.clone(), 34, 60);
  const hemi = new T.HemisphereLight(0xe6f2ff, 0x4a5a3a, 0.78);
  const sun = new T.DirectionalLight(0xffffff, 0.72);
  sun.castShadow = !G.LOW;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
  scene.add(hemi, sun, sun.target);

  /* ── 공유 모양 ── */
  const geo = (w, h, d) => G.boxGeo(w, h, d);
  const mesh = (g, color, cast = true) => { const m = new T.Mesh(g, G.mat(color)); m.castShadow = cast; m.receiveShadow = true; return m; };
  const CAR_COLORS = [0xd4574e, 0x4e7ad4, 0xd4b34e, 0xcccccc, 0x3ec48a, 0xa66bd6];
  function makeCar(kind, color) {
    const g = new T.Group();
    if (kind === 'bus') {
      g.add(mesh(geo(3.2, 1.05, 0.86), 0xffc83d)).children[0].position.y = 0.72;
      const win = mesh(geo(2.9, 0.34, 0.88), 0x2a3a4a); win.position.y = 0.95; g.add(win);
      const stripe = mesh(geo(3.22, 0.1, 0.88), 0x333333); stripe.position.y = 0.55; g.add(stripe);
      g.userData.len = 3.2;
    } else if (kind === 'truck') {
      const box = mesh(geo(2.2, 1.1, 0.86), 0xe9e4d8); box.position.set(-0.45, 0.78, 0); g.add(box);
      const cab = mesh(geo(0.9, 0.85, 0.84), color); cab.position.set(1.1, 0.65, 0); g.add(cab);
      const win = mesh(geo(0.3, 0.3, 0.86), 0x2a3a4a); win.position.set(1.35, 0.85, 0); g.add(win);
      g.userData.len = 3.1;
    } else {
      const body = mesh(geo(1.6, 0.5, 0.82), color); body.position.y = 0.5; g.add(body);
      const cab = mesh(geo(0.95, 0.36, 0.76), 0x252525); cab.position.set(-0.1, 0.92, 0); g.add(cab);
      g.userData.len = 1.6;
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wh = mesh(geo(0.34, 0.34, 0.12), 0x1b1b1b, false);
      wh.position.set(sx * (g.userData.len / 2 - 0.4), 0.2, sz * 0.42); g.add(wh);
    }
    return g;
  }
  function makeTrain() {
    const g = new T.Group();
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 3.9;
      const c = mesh(geo(3.7, 1.35, 0.95), 0xeeeeee); c.position.set(x, 0.95, 0); g.add(c);
      const w = mesh(geo(3.4, 0.38, 0.97), 0x222222); w.position.set(x, 1.15, 0); g.add(w);
      const s = mesh(geo(3.72, 0.16, 0.97), 0x2FA7DA); s.position.set(x, 0.55, 0); g.add(s);
    }
    g.userData.len = 15.4;
    return g;
  }
  const logGeo = {}, lilyGeo = new T.CylinderGeometry(0.42, 0.42, 0.08, 10);
  const coinGeo = new T.CylinderGeometry(0.24, 0.24, 0.07, 14).rotateX(Math.PI / 2);
  const coinMat = new T.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x5a4300 });

  /* ── 주인공 새싹이 ── */
  const hero = G.makePerson({ shirt: 0x5ab0e0, pants: 0x34405a, hat: 0xffd23f, bag: 0xe8533f, hair: 0x3a2a1c });
  const HS = 0.5;
  hero.scale.setScalar(HS);
  const heroWrap = new T.Group(); heroWrap.add(hero); scene.add(heroWrap);
  // 까치
  const crow = new T.Group();
  crow.add(mesh(geo(0.5, 0.35, 0.9), 0x1b1f2a));
  const belly = mesh(geo(0.44, 0.2, 0.5), 0xf2f2f2); belly.position.set(0, -0.12, 0.05); crow.add(belly);
  const cw1 = mesh(geo(1.1, 0.06, 0.5), 0x1b1f2a); cw1.position.x = -0.7; crow.add(cw1);
  const cw2 = cw1.clone(); cw2.position.x = 0.7; crow.add(cw2);
  const beak = mesh(geo(0.12, 0.1, 0.25), 0x333333); beak.position.set(0, 0.02, -0.55); crow.add(beak);
  crow.visible = false; scene.add(crow);
  // 움직일 수 없는 바깥 칸은 살짝 어둡게
  const shadeMat = new T.MeshBasicMaterial({ color: 0x0a1523, transparent: true, opacity: 0.28, depthWrite: false });
  const shadeGeo = new T.PlaneGeometry(12, 46).rotateX(-Math.PI / 2);
  const shadeL = new T.Mesh(shadeGeo, shadeMat), shadeR = new T.Mesh(shadeGeo, shadeMat);
  shadeL.position.set(-CFG.half - 6.5, 0.03, 0); shadeR.position.set(CFG.half + 6.5, 0.03, 0);
  shadeL.renderOrder = shadeR.renderOrder = 5;
  scene.add(shadeL, shadeR);
  // 결승: 학교 정문
  const gate = new T.Group(); scene.add(gate);

  let lanes = [], st = null, ui = {};
  const wrapX = x => { const span = LOOP + 4; x = ((x + span / 2) % span + span) % span - span / 2; return x; };
  const _v = new T.Vector3();

  /* ═══════════ 줄 만들기 ═══════════ */
  function laneBase(row, type) {
    const group = new T.Group(); group.position.z = -row; scene.add(group);
    return { row, type, group, cars: [], logs: [], lilies: new Set(), block: new Set(), coin: null, dir: 1, speed: 0 };
  }
  function addStatic(lane, batch) { lane.static = batch.build(lane.group); if (lane.static) lane.static.castShadow = false; }

  function makeGrass(row, opts = {}) {
    const L = laneBase(row, 'grass'), b = new G.Batch();
    b.add(W, 0.3, 1, 0, -0.15, 0, row % 2 ? 0x93b572 : 0x8aad69);
    if (!opts.clear) {
      for (let c = -CFG.half - 6; c <= CFG.half + 6; c++) {
        const edge = Math.abs(c) > CFG.half;
        if (!edge && (Math.random() > 0.2 || (opts.keep && opts.keep.has(c)))) continue;
        if (edge && Math.random() > 0.55) continue;
        if (!edge) L.block.add(c);
        if (Math.random() < 0.72) {    // 네모 나무
          const s = G.rnd(0.85, 1.15);
          b.add(0.28, 0.5, 0.28, c, 0.25, 0, 0x7a5230);
          b.add(0.78 * s, 0.6 * s, 0.78 * s, c, 0.5 + 0.3 * s, 0, 0x3F9E4D);
          if (Math.random() < 0.6) b.add(0.52 * s, 0.4 * s, 0.52 * s, c, 0.8 + 0.6 * s, 0, 0x4AA858);
        } else b.add(0.7, 0.45, 0.6, c, 0.22, 0, 0x9aa3ab);   // 바위
      }
    }
    addStatic(L, b);
    return L;
  }
  function makeRoad(row, diff, opts = {}) {
    const L = laneBase(row, 'road'), b = new G.Batch();
    b.add(W, 0.3, 1, 0, -0.16, 0, 0x545C68);
    if (opts.edgeTop) for (let x = -16; x <= 16; x += 2) b.add(0.9, 0.02, 0.08, x, 0.0, -0.5, 0xE8EDF2);
    L.dir = opts.dir ?? (Math.random() < 0.5 ? 1 : -1);
    L.speed = opts.speed ?? G.lerp(2.2, 5.4, diff) * G.rnd(0.85, 1.2);
    L.crosswalk = opts.crosswalk || null;
    if (L.crosswalk) for (let x = -2.2; x <= 2.21; x += 0.55) b.add(0.3, 0.02, 0.86, x, 0.005, 0, 0xf4f1e6);
    // 차 배치 — 사이 간격을 넉넉히 둬서 늘 지나갈 틈이 있다
    const n = opts.count ?? (diff < 0.3 ? G.pick([1, 2, 2]) : G.pick([2, 2, 3]));
    const slot = (LOOP + 4) / n, start = G.rnd(-LOOP / 2, LOOP / 2);
    for (let i = 0; i < n; i++) {
      const kind = Math.random() < 0.18 ? 'bus' : Math.random() < 0.2 ? 'truck' : 'car';
      const car = makeCar(kind, G.pick(CAR_COLORS));
      if (L.dir < 0) car.rotation.y = Math.PI;
      car.position.x = wrapX(start + i * slot + G.rnd(0, Math.max(0, slot - car.userData.len - 3.4)));
      car.userData.v = L.speed;
      L.group.add(car); L.cars.push(car);
    }
    addStatic(L, b);
    return L;
  }
  function makeRiver(row, diff, dir) {
    const L = laneBase(row, 'river'), b = new G.Batch();
    b.add(W, 0.2, 1, 0, -0.35, 0, 0x3A9ECA);
    L.dir = dir;
    if (Math.random() < 0.22 && diff > 0.15) {
      // 연잎 줄: 움직이지 않는 발판
      L.type = 'lily';
      const cols = new Set();
      while (cols.size < 4) cols.add(Math.floor(G.rnd(-CFG.half, CFG.half + 1)));
      cols.forEach(c => { L.lilies.add(c); const m = mesh(lilyGeo, 0x4caf50, false); m.position.set(c, -0.18, 0); L.group.add(m); });
    } else {
      L.speed = G.lerp(1.5, 2.9, diff) * G.rnd(0.85, 1.15);
      const n = diff < 0.5 ? 4 : 3;
      const slot = (LOOP + 4) / n, start = G.rnd(-LOOP / 2, LOOP / 2);
      for (let i = 0; i < n; i++) {
        const len = Math.round(G.rnd(diff < 0.5 ? 2.6 : 2, diff < 0.5 ? 4.4 : 3.4));
        logGeo[len] = logGeo[len] || new T.BoxGeometry(len, 0.34, 0.78);
        const log = mesh(logGeo[len], 0x8b5a2b);
        log.position.set(wrapX(start + i * slot + G.rnd(0, Math.max(0, slot - len - 2))), -0.12, 0); log.userData.len = len;
        L.group.add(log); L.logs.push(log);
      }
    }
    addStatic(L, b);
    return L;
  }
  function makeRail(row, diff) {
    const L = laneBase(row, 'rail'), b = new G.Batch();
    b.add(W, 0.3, 1, 0, -0.15, 0, 0x8a7f72);
    for (let x = -16; x <= 16; x += 0.9) b.add(0.22, 0.06, 0.9, x, 0.03, 0, 0x6b4a2e);
    b.add(W, 0.08, 0.08, 0, 0.1, -0.28, 0xb8c0c8).add(W, 0.08, 0.08, 0, 0.1, 0.28, 0xb8c0c8);
    b.add(0.14, 1.6, 0.14, CFG.half + 1.6, 0.8, -0.45, 0x5d6670);
    addStatic(L, b);
    L.dir = Math.random() < 0.5 ? 1 : -1;
    L.train = makeTrain(); L.train.visible = false; L.group.add(L.train);
    L.lamp = new T.Mesh(geo(0.34, 0.34, 0.12), new T.MeshBasicMaterial({ color: 0x552222 }));
    L.lamp.position.set(CFG.half + 1.6, 1.7, -0.4); L.group.add(L.lamp);
    L.next = G.rnd(1.5, 4.5); L.warn = 1.35; L.state = 'idle'; L.tx = 0;
    L.speed = G.lerp(22, 30, diff);
    return L;
  }
  function makeFinish(row) {
    const L = laneBase(row, 'finish'), b = new G.Batch();
    for (let i = 0; i < 6; i++) b.add(W, 0.3, 1, 0, -0.15, -i, 0xd2b48c);
    addStatic(L, b);
    gate.position.z = -row;
    return L;
  }
  function buildGate() {
    const b = new G.Batch();
    b.add(0.8, 2.2, 0.8, -CFG.half - 0.9, 1.1, 0.2, 0xc8553d).add(0.8, 2.2, 0.8, CFG.half + 0.9, 1.1, 0.2, 0xc8553d);
    b.add(0.5, 0.5, 0.5, -CFG.half - 0.9, 2.45, 0.2, 0xffd23f).add(0.5, 0.5, 0.5, CFG.half + 0.9, 2.45, 0.2, 0xffd23f);
    for (let x = -16; x <= 16; x += 1.2) if (Math.abs(x) > CFG.half + 1.4) b.add(0.1, 1, 0.1, x, 0.5, 0.2, 0x5f7f6a);
    b.add(32, 0.08, 0.08, 0, 0.9, 0.2, 0x5f7f6a);
    b.add(9, 4, 5, -3, 2, -4.5, 0xf3e7cf).add(9.4, 0.4, 5.4, -3, 4.2, -4.5, 0x9a6b57).add(9.2, 0.3, 0.1, -3, 2.2, -1.95, 0xc8553d);
    b.build(gate);
    const sign = G.labelSprite('🏫 놀이초등학교 정문', { scale: 0.62, bg: '#7a2f22', border: '#ffd23f' });
    sign.position.set(0, 1.6, -2.2); gate.add(sign);
  }
  buildGate();

  /** 줄 전체 설계: 난이도가 점점 올라간다 */
  function buildLevel() {
    lanes.forEach(L => { scene.remove(L.group); L.static?.geometry.dispose(); });
    lanes = [];
    const N = CFG.rows;
    const add = L => { lanes[L.row] = L; };
    for (let r = -6; r <= 2; r++) add(makeGrass(r, { clear: r >= 0 }));
    let r = 3, lastType = 'grass', crosswalks = 0;
    while (r < N) {
      const diff = r / N;
      const roll = Math.random();
      let kind;
      if (r > 8 && crosswalks < 2 && r > N * (crosswalks ? 0.62 : 0.25) && lastType !== 'cross') kind = 'cross';
      else if (roll < 0.42) kind = 'road';
      else if (roll < 0.62 && r > 6) kind = 'river';
      else if (roll < 0.74 && r > 10 && lastType !== 'rail') kind = 'rail';
      else kind = 'grass';
      if (kind === 'road') {
        const n = Math.min(N - r, Math.floor(G.rnd(1, 2 + diff * 3)));
        for (let i = 0; i < n; i++) add(makeRoad(r++, diff, { edgeTop: i < n - 1 }));
      } else if (kind === 'cross') {
        // 횡단보도: 2차선, 신호등 공유. 빨간불(보행자)이면 차가 달리고, 초록불이면 정지선 앞에 선다
        crosswalks++;
        const sig = { phase: 'car', t: G.rnd(0, 2), rows: [r, r + 1], pole: null };
        st.signals.push(sig);
        const sp = G.lerp(3.8, 5.8, diff);
        add(makeRoad(r++, diff, { crosswalk: sig, dir: 1, speed: sp, count: 3, edgeTop: true }));
        add(makeRoad(r++, diff, { crosswalk: sig, dir: -1, speed: sp, count: 3 }));
        sig.pole = makePole(lanes[r - 1]);
      } else if (kind === 'river') {
        const n = Math.min(N - r, Math.floor(G.rnd(1, 2.4 + diff * 1.6)));
        let dir = Math.random() < 0.5 ? 1 : -1;
        for (let i = 0; i < n; i++) { add(makeRiver(r++, diff, dir)); dir = -dir; }
      } else if (kind === 'rail') add(makeRail(r++, diff));
      else {
        const n = Math.floor(G.rnd(1, 3));
        for (let i = 0; i < n && r < N; i++) add(makeGrass(r++));
      }
      lastType = kind;
      if (r < N && kind !== 'grass' && Math.random() < 0.55) add(makeGrass(r++));
    }
    add(makeFinish(N));
    // 연속된 풀밭 줄끼리 지나갈 길(같은 칸이 비어 있는 곳)이 꼭 있게 한다
    for (let i = 1; i < N; i++) {
      const a = lanes[i - 1], b = lanes[i];
      if (a.type === 'grass' && b.type === 'grass') {
        let open = 0;
        for (let c = -CFG.half; c <= CFG.half; c++) if (!a.block.has(c) && !b.block.has(c)) open++;
        if (open < 2) { b.block.clear(); rebuildGrass(b); }
      }
    }
    // 스티커(동전)
    for (let i = 4; i < N; i++) {
      const L = lanes[i];
      if ((L.type === 'grass' || L.type === 'road') && Math.random() < 0.3) {
        let c; let tries = 0;
        do { c = Math.floor(G.rnd(-CFG.half, CFG.half + 1)); } while (L.block.has(c) && ++tries < 10);
        if (L.block.has(c)) continue;
        const m = new T.Mesh(coinGeo, coinMat); m.position.set(c, 0.45, 0); m.castShadow = true;
        L.group.add(m); L.coin = { c, m };
      }
    }
  }
  function rebuildGrass(L) {
    L.group.remove(L.static); L.static.geometry.dispose();
    const b = new G.Batch();
    b.add(W, 0.3, 1, 0, -0.15, 0, L.row % 2 ? 0x93b572 : 0x8aad69);
    addStatic(L, b);
  }
  function makePole(L) {
    const pole = new T.Group();
    pole.add(mesh(geo(0.14, 2.3, 0.14), 0x5d6670)).children[0].position.y = 1.15;
    const head = mesh(geo(0.5, 0.9, 0.3), 0x2b3138); head.position.y = 2.3; pole.add(head);
    const red = new T.Mesh(geo(0.34, 0.3, 0.05), new T.MeshBasicMaterial({ color: 0xff4a3d }));
    red.position.set(0, 2.5, 0.16); pole.add(red);
    const green = new T.Mesh(geo(0.34, 0.3, 0.05), new T.MeshBasicMaterial({ color: 0x1a4a2a }));
    green.position.set(0, 2.1, 0.16); pole.add(green);
    pole.position.set(-CFG.half - 1.4, 0, -0.5);
    L.group.add(pole);
    return { pole, red: red.material, green: green.material };
  }

  /* ═══════════ 조작 ═══════════ */
  function tryMove(dx, dz) {
    if (!st || st.dead || st.won || G.play.state !== 'play') return;
    if (st.hopT < CFG.hop) { st.queue = [dx, dz]; return; }
    const fromLane = lanes[st.row];
    let tx = st.x + dx, tr = st.row + dz;
    if (tr < -3 || tr > CFG.rows) return;
    const toLane = lanes[tr];
    const onWater = toLane.type === 'river';
    if (!onWater) tx = Math.round(tx);
    if (tx < -CFG.half - 0.001 || tx > CFG.half + 0.001) { if (fromLane.type !== 'river') return; tx = G.clamp(tx, -CFG.half, CFG.half); }
    if (toLane.type === 'grass' && toLane.block.has(Math.round(tx))) { st.bump = 0.12; G.sfx.play('step'); face(dx, dz); return; }
    face(dx, dz);
    st.ride = null;
    st.fx = st.x; st.fz = st.row; st.x = tx; st.row = tr; st.hopT = 0;
    st.lastMove = st.t; st.idle = 0;
    if (dz > 0 && tr > st.best) st.best = tr;
    G.sfx.play('hop');
  }
  function face(dx, dz) { hero.rotation.y = dx > 0 ? Math.PI / 2 : dx < 0 ? -Math.PI / 2 : dz > 0 ? Math.PI : 0; }

  function land() {
    const L = lanes[st.row];
    if (L.type === 'river') {
      const log = L.logs.find(g => Math.abs(g.position.x - st.x) < g.userData.len / 2 + 0.15);
      if (log) { st.ride = log; st.rideOff = G.clamp(st.x - log.position.x, -log.userData.len / 2 + 0.3, log.userData.len / 2 - 0.3); return; }
      return die('water');
    }
    if (L.type === 'lily') {
      const c = Math.round(st.x);
      if (L.lilies.has(c)) { st.x = c; return; }
      return die('water');
    }
    if (L.coin && Math.round(st.x) === L.coin.c && L.coin.m.visible) {
      L.coin.m.visible = false; st.coins++; G.sfx.play('coin');
    }
    // 횡단보도 착한 건너기: 보행자 초록불에 줄무늬 위로 두 차선을 다 건넜으면 보너스
    if (L.crosswalk) {
      const sig = L.crosswalk, inZebra = Math.abs(st.x) <= 2.2, green = sig.phase === 'walk';
      if (st.row === sig.rows[0]) sig.good = inZebra && green;
      else if (st.row === sig.rows[1] && sig.good && inZebra && green && !sig.paid) { sig.paid = true; st.bonus += 5; G.ctx.flash('🚸 신호 지켜 건넜어요 +5', 'good', 1100); G.sfx.play('perfect'); }
    }
    if (L.type === 'finish') win();
  }

  function die(kind) {
    if (st.dead || st.won) return;
    st.dead = kind; st.deadT = 0;
    const msg = { car: '쾅! 차에 부딪혔어요', train: '열차는 정말 빨라요!', water: '풍덩! 강에 빠졌어요', drift: '통나무와 함께 떠내려갔어요', crow: '까치가 가방을 물고 갔어요!' }[kind];
    G.sfx.play(kind === 'water' || kind === 'drift' ? 'splash' : kind === 'crow' ? 'alarm' : 'crash');
    G.ctx.flash(msg, 'bad', 1500);
    if (kind === 'crow') { crow.visible = true; crow.position.set(st.x + 8, 7, -st.row + 4); }
    st.deadMsg = msg;
  }
  function win() {
    st.won = true; st.wonT = 0;
    G.sfx.play('win');
    G.ctx.flash('🏫 등교 성공!', 'gold', 1600);
  }
  function score() { return st.best + st.coins * 2 + st.bonus + (st.won ? 50 : 0); }
  function endRun(ok, why) {
    if (!st || G.play.state !== 'play') return;
    const sc = score();
    G.ctx.finish({
      success: ok, record: sc, big: `${sc}점`,
      title: ok ? '등교 성공! 🏫' : '다시 도전!',
      lines: [
        ok ? `${CFG.rows}칸을 건너 정문에 도착했어요 (${st.t.toFixed(1)}초).` : `${why} — ${st.best}/${CFG.rows}칸까지 갔어요.`,
        `⭐ 스티커 ${st.coins}개 ×2 · 🚸 신호 보너스 ${st.bonus}${ok ? ' · 도착 +50' : ''}`,
        '팁: 차 사이 틈을 보고 한 박자 쉬었다 가요. 기찻길 빨간불은 곧 열차!',
      ],
    });
  }

  /* ═══════════ 화면 버튼·밀기 ═══════════ */
  function buildUi(ctx) {
    const wrap = document.createElement('div');
    wrap.id = 'crossUi'; wrap.hidden = true;
    wrap.innerHTML = `<div class="czone"></div>
      <div class="cpad"><button class="tbtn" data-m="0,1" aria-label="앞으로">▲</button><button class="tbtn" data-m="-1,0" aria-label="왼쪽">◀</button><button class="tbtn" data-m="0,-1" aria-label="뒤로">▼</button><button class="tbtn" data-m="1,0" aria-label="오른쪽">▶</button></div>
      <div class="cprog"><i></i><b>🏫</b></div>`;
    const css = document.createElement('style');
    css.textContent = `
      #crossUi .czone{position:fixed; inset:0; z-index:30; touch-action:none;}
      #crossUi .cpad{position:fixed; right:22px; bottom:calc(22px + env(safe-area-inset-bottom,0px)); z-index:31; display:grid; grid-template-columns:repeat(3,62px); grid-template-rows:repeat(2,62px); gap:7px;}
      #crossUi .cpad .tbtn{position:static; font-size:22px;}
      #crossUi .cpad [data-m="0,1"]{grid-column:2; grid-row:1;} #crossUi .cpad [data-m="-1,0"]{grid-column:1; grid-row:2;}
      #crossUi .cpad [data-m="0,-1"]{grid-column:2; grid-row:2;} #crossUi .cpad [data-m="1,0"]{grid-column:3; grid-row:2;}
      #crossUi .cprog{position:fixed; left:16px; top:50%; transform:translateY(-50%); z-index:31; width:12px; height:46vh; border-radius:8px; background:rgba(10,20,36,.7); border:2px solid #2d4561; pointer-events:none;}
      #crossUi .cprog i{position:absolute; left:0; right:0; bottom:0; height:0; border-radius:6px; background:linear-gradient(#ffd23f,#3ed47e);}
      #crossUi .cprog b{position:absolute; top:-30px; left:50%; transform:translateX(-50%); font-size:20px; font-weight:400;}
      body:not(.touch) #crossUi .cpad{opacity:.55; transform:scale(.8); transform-origin:bottom right;}`;
    wrap.appendChild(css);
    ctx.layer.appendChild(wrap);
    ui = { wrap, prog: wrap.querySelector('.cprog i') };
    wrap.querySelectorAll('[data-m]').forEach(bt => bt.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      const [dx, dz] = bt.dataset.m.split(',').map(Number); tryMove(dx, dz);
    }));
    // 화면 밀기: 톡 = 앞으로, 좌우·아래로 밀면 그쪽으로
    const zone = wrap.querySelector('.czone');
    let sx = 0, sy = 0, down = false;
    zone.addEventListener('pointerdown', e => { e.preventDefault(); down = true; sx = e.clientX; sy = e.clientY; });
    zone.addEventListener('pointerup', e => {
      if (!down) return; down = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.hypot(dx, dy) < 24) tryMove(0, 1);
      else if (Math.abs(dx) > Math.abs(dy)) tryMove(dx > 0 ? 1 : -1, 0);
      else tryMove(0, dy > 0 ? -1 : 1);
    });
    zone.addEventListener('pointercancel', () => { down = false; });
  }

  /* ═══════════ 게임 등록 ═══════════ */
  G.registerGame({
    id: 'crossing', name: '등굣길 건너기', icon: '🚸', color: '#f2a93b',
    place: '학교 앞 횡단보도 광장 (다리 건너 동쪽)',
    tagline: '차·열차·강물을 피해 한 칸씩! 학교 정문까지 무사히 등교해요.',
    rules: [
      `<b>${CFG.rows}칸</b> 앞의 <b>학교 정문</b>에 닿으면 성공`,
      '차·버스·열차에 닿거나 강물에 빠지면 실패 — 강은 <b>통나무·연잎</b>만 밟아요',
      '기찻길 <b>빨간불</b>이 깜빡이면 곧 열차! 🚸 횡단보도는 <b>초록불</b>에 줄무늬 위로 건너면 +5',
      `너무 오래 머뭇거리거나 화면 뒤로 처지면 <b>까치</b>가 가방을 물어가요`,
      '⭐ 스티커 = 2점, 한 칸 전진 = 1점, 도착 = 50점',
    ],
    controlsKey: '방향키·WASD 한 번 = 한 칸 · Esc 잠깐 멈춤',
    controlsTouch: '화면 톡 = 앞으로 · 좌우·아래로 밀기 · 오른쪽 아래 버튼',
    format: v => `${v}점`,
    world: 'own', scene, camera,
    debug: () => ({ st, lanes }),
    init(ctx) { buildUi(ctx); G.addCamera(camera); },
    enter(ctx) { ui.wrap.hidden = false; st = null; newRun(); ctx.hint(''); },
    start(ctx) {
      newRun();
      ctx.hint(G.touch ? '화면을 톡 치면 앞으로! 밀면 옆·뒤로' : '↑ 앞으로 · ← → 옆으로 · ↓ 뒤로');
      setTimeout(() => { if (G.play.current?.id === 'crossing') ctx.hint(''); }, 3500);
    },
    update(dt, now, ctx) { step(dt, now, ctx); },
    onKey(e, down) {
      if (!down || e.repeat) return;
      const m = { ArrowUp: [0, 1], KeyW: [0, 1], ArrowDown: [0, -1], KeyS: [0, -1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], Space: [0, 1] }[e.code];
      if (m) tryMove(m[0], m[1]);
    },
    exit() { ui.wrap.hidden = true; st = null; },
  });

  function newRun() {
    st = { x: 0, row: 0, fx: 0, fz: 0, hopT: 1, queue: null, best: 0, coins: 0, bonus: 0, t: 0, idle: 0, lastMove: 0,
      dead: null, won: false, deadT: 0, ride: null, rideOff: 0, bump: 0, camRow: -1, camX: 0, signals: [] };
    buildLevel();
    crow.visible = false;
    G.resetPose(hero); hero.rotation.y = Math.PI; hero.scale.setScalar(HS); heroWrap.position.set(0, 0, 0); heroWrap.rotation.set(0, 0, 0);
    placeCamera(1, true);
    stats();
  }

  function stats() {
    G.ctx.setStats([
      { label: '전진', value: `${st.best}/${CFG.rows}` },
      { label: '⭐ 스티커', value: st.coins },
      { label: '점수', value: score() },
    ]);
    ui.prog.style.height = (st.best / CFG.rows * 100).toFixed(1) + '%';
  }

  function placeCamera(dt, snap) {
    const targetX = G.clamp(heroWrap.position.x * 0.45, -2, 2);
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
    st.camX += (targetX - st.camX) * k;
    const z = -st.camRow;
    const tall = camera.aspect < 1;
    const fov = tall ? 50 : 38;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.position.set(st.camX + 2.6, tall ? 12.5 : 9.6, z + (tall ? 7.4 : 7.2));
    _v.set(st.camX + 0.2, 0, z - (tall ? 4 : 2.6));
    shadeL.position.z = shadeR.position.z = z - 6;
    camera.lookAt(_v);
    sun.position.set(camera.position.x + 6, 16, z + 6);
    sun.target.position.set(camera.position.x, 0, z - 3);
  }

  const heroBox = 0.3;
  function step(dt, now, ctx) {
    if (!st) return;
    st.t += dt;
    const diff = G.clamp(st.best / CFG.rows, 0, 1);
    // ── 신호등 ──
    for (const sig of st.signals) {
      sig.t += dt;
      const len = sig.phase === 'car' ? CFG.signal.car : CFG.signal.walk;
      if (sig.t >= len) { sig.t = 0; sig.phase = sig.phase === 'car' ? 'walk' : 'car'; sig.paid = false; }
      const walk = sig.phase === 'walk', blink = walk && sig.t > len - 0.9 && Math.floor(sig.t * 6) % 2;
      sig.pole.red.color.setHex(walk ? 0x5a1a1a : 0xff4a3d);
      sig.pole.green.color.setHex(walk && !blink ? 0x3dfa86 : 0x1a4a2a);
    }
    // ── 보이는 줄만 움직인다 ──
    const lo = Math.floor(st.camRow) - 7, hi = Math.floor(st.camRow) + 24;
    for (let r = -6; r <= CFG.rows; r++) {
      const L = lanes[r]; if (!L) continue;
      const vis = r >= lo && r <= hi;
      L.group.visible = vis;
      if (!vis) continue;
      if (L.type === 'road') {
        const sig = L.crosswalk;
        for (const car of L.cars) {
          let v = L.speed;
          if (sig) {
            // 보행 신호면 정지선(줄무늬 앞) 앞에서 멈추고, 앞차와도 간격을 둔다
            const front = car.position.x * L.dir + car.userData.len / 2;
            const stopAt = -2.6;
            let limit = Infinity;
            if (sig.phase === 'walk' && front <= stopAt + 0.05) limit = stopAt - front;
            for (const o of L.cars) {
              if (o === car) continue;
              const gap = (o.position.x - car.position.x) * L.dir - (o.userData.len + car.userData.len) / 2;
              if (gap > -0.1 && gap < limit + 0.8) limit = Math.min(limit, gap - 0.7);
            }
            const want = limit === Infinity ? L.speed : G.clamp(limit * 3, 0, L.speed);
            car.userData.v += (want - car.userData.v) * Math.min(1, dt * 6);
            v = car.userData.v;
          }
          car.position.x += v * L.dir * dt;
          if (car.position.x > LOOP / 2 + 2) car.position.x -= LOOP + 4;
          if (car.position.x < -LOOP / 2 - 2) car.position.x += LOOP + 4;
        }
      } else if (L.type === 'river') {
        for (const log of L.logs) {
          log.position.x += L.speed * L.dir * dt;
          if (log.position.x > LOOP / 2 + 2) log.position.x -= LOOP + 4;
          if (log.position.x < -LOOP / 2 - 2) log.position.x += LOOP + 4;
          log.position.y = -0.12 + Math.sin(now * 0.004 + log.position.x) * 0.03;
        }
      } else if (L.type === 'rail') {
        L.next -= dt;
        if (L.state === 'idle' && L.next <= L.warn) { L.state = 'warn'; if (Math.abs(L.row - st.row) < 8) G.sfx.play('alarm'); }
        if (L.state === 'warn') {
          L.lamp.material.color.setHex(Math.floor(now / 160) % 2 ? 0xff3322 : 0x552222);
          if (L.next <= 0) { L.state = 'pass'; L.tx = -L.dir * 26; L.train.visible = true; L.train.rotation.y = L.dir > 0 ? 0 : Math.PI; }
        }
        if (L.state === 'pass') {
          L.tx += L.speed * L.dir * dt;
          L.train.position.x = L.tx;
          L.lamp.material.color.setHex(0xff3322);
          if (L.tx * L.dir > 30) { L.state = 'idle'; L.train.visible = false; L.next = G.rnd(3, 7.5) * (1.1 - diff * 0.4); L.lamp.material.color.setHex(0x552222); }
        }
      }
      if (L.coin && L.coin.m.visible) L.coin.m.rotation.y += dt * 3;
    }
    // ── 주인공 ──
    if (!st.dead) {
      if (st.hopT < CFG.hop) {
        st.hopT += dt;
        const k = Math.min(1, st.hopT / CFG.hop);
        const L = lanes[st.row];
        const baseY = L.type === 'river' || L.type === 'lily' ? 0.05 : 0;
        heroWrap.position.x = G.lerp(st.fx, st.x, k);
        heroWrap.position.z = -G.lerp(st.fz, st.row, k);
        heroWrap.position.y = baseY + Math.sin(k * Math.PI) * 0.45;
        hero.scale.set(HS, HS * (1 + Math.sin(k * Math.PI) * 0.15), HS);
        if (k >= 1) { hero.scale.setScalar(HS); land(); if (st.queue && !st.dead) { const q = st.queue; st.queue = null; tryMove(q[0], q[1]); } }
      } else if (st.ride) {
        st.x = st.ride.position.x + st.rideOff;
        heroWrap.position.x = st.x;
        heroWrap.position.y = st.ride.position.y + 0.17;
        if (Math.abs(st.x) > CFG.half + 1.2) die('drift');
      }
      if (st.bump > 0) { st.bump -= dt; hero.position.z = Math.sin(st.bump * 40) * 0.08; } else hero.position.z = 0;
      // 충돌 — 지금 서 있는(뛰는 중이면 도착할) 줄의 차·열차
      const rowNow = st.hopT < CFG.hop * 0.5 ? st.fz : st.row;
      const L = lanes[rowNow];
      if (L && L.type === 'road') {
        for (const car of L.cars) if (Math.abs(car.position.x - heroWrap.position.x) < car.userData.len / 2 * 0.92 + heroBox) { die('car'); break; }
      } else if (L && L.type === 'rail' && L.state === 'pass') {
        if (Math.abs(heroWrap.position.x - L.tx) < L.train.userData.len / 2 + heroBox) die('train');
      }
      // 까치
      st.idle += dt;
      if (st.hopT >= CFG.hop && (st.idle > CFG.idleCrow || st.row < st.camRow - CFG.behindCrow) && !st.won) die('crow');
    } else {
      st.deadT += dt;
      if (st.deadT > (st.dead === 'crow' ? 1.5 : 1.2)) return endRun(false, st.deadMsg);
      if (st.dead === 'car' || st.dead === 'train') { hero.scale.set(HS * 1.2, HS * Math.max(0.12, 1 - st.deadT * 8), HS * 1.2); }
      else if (st.dead === 'water' || st.dead === 'drift') heroWrap.position.y -= dt * 1.5;
      else if (st.dead === 'crow') {
        _v.set(heroWrap.position.x, 0.9, heroWrap.position.z);
        crow.position.lerp(_v, Math.min(1, dt * 6));
        if (st.deadT > 0.55) { heroWrap.position.y += dt * 6; heroWrap.position.x -= dt * 4; crow.position.set(heroWrap.position.x, heroWrap.position.y + 0.9, heroWrap.position.z); }
        cw1.rotation.z = Math.sin(now * 0.03) * 0.6; cw2.rotation.z = -cw1.rotation.z;
      }
    }
    if (st.won) { st.wonT += dt; hero.rotation.y = Math.PI + st.wonT * 8; if (st.wonT > 1.3) return endRun(true); }
    // ── 화면은 천천히 앞으로 (머물러 있으면 뒤처진다) ──
    const scroll = G.lerp(CFG.scroll[0], CFG.scroll[1], diff);
    if (!st.won && !st.dead && st.best > 0) st.camRow += scroll * dt;
    st.camRow += (Math.max(st.camRow, heroWrap.position.z * -1 - 1.2) - st.camRow) * Math.min(1, dt * 4);
    placeCamera(dt, false);
    if (ctx.hudDue(dt)) stats();
  }
})(window.G);
