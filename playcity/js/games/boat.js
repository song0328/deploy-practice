'use strict';
/* ═══════════════════════════════════════════════════════════════
   🚤 강물 부표 레이스 — 작은 배로 강을 달리며 부표를 모으고 장애물을 피해 결승선까지 (자기 씬)
   · 좌우로 몰기, 가속·감속. 🟠 부표 +10, 🟡 황금 부표 +50, 🌀 부스터 고리 = 순간 가속
   · 바위·통나무·다리 기둥·오리 떼에 부딪히면 ❤️ 하나 잃고 느려진다 (❤️ 3개)
   코스 길이·속도·배치 비율은 CFG에서 고친다.
   ═══════════════════════════════════════════════════════════════ */
(function (G) {
  const T = THREE;
  const CFG = {
    length: 820,                   // 결승선까지 거리
    half: 6.6,                     // 강 가운데에서 좌우로 갈 수 있는 거리
    speed: [12, 22], boost: 32,    // 기본 속도(처음→끝), 부스터 속도
    steer: 11, hearts: 3,
    view: 120,                     // 앞쪽으로 미리 만들어 두는 거리
  };
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(62, 1, 0.3, 200);
  scene.background = G.skyColor.clone();
  scene.fog = new T.Fog(G.skyColor.clone(), 70, 150);
  const hemi = new T.HemisphereLight(0xe6f2ff, 0x4a5a3a, 0.78);
  const sun = new T.DirectionalLight(0xffffff, 0.75);
  sun.castShadow = !G.LOW; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 25, bottom: -25, near: 1, far: 80 });
  scene.add(hemi, sun, sun.target);

  /* ── 물: 배를 따라다니는 판 하나 (물결은 월드 좌표로 계산해 끊김 없이) ── */
  const waterGeo = new T.PlaneGeometry(30, 190, 20, 90).rotateX(-Math.PI / 2);
  const water = new T.Mesh(waterGeo, new T.MeshPhongMaterial({ color: 0x3A9ECA, shininess: 90, specular: 0xffffff, flatShading: true }));
  water.receiveShadow = true; scene.add(water);
  const wpos = waterGeo.attributes.position;
  const baseZ = new Float32Array(wpos.count);
  for (let i = 0; i < wpos.count; i++) baseZ[i] = wpos.getZ(i);
  // 양쪽 강둑 + 산책로 (배를 따라 움직이는 긴 띠)
  const banks = new G.Batch();
  for (const s of [-1, 1]) {
    banks.add(1.6, 0.5, 190, s * 8.4, 0.1, 0, 0xA8B394).add(2.4, 0.3, 190, s * 10.3, 0.2, 0, 0xd5c9ae).add(24, 0.4, 190, s * 23.5, 0.05, 0, 0x849577);
  }
  const bankMesh = banks.build(scene); bankMesh.castShadow = false;

  /* ── 둑 위 풍경(나무·건물): 조각을 돌려 쓴다 ── */
  const deco = new T.Group(); scene.add(deco);
  const SCENERY = [];
  const PAL = [0xe1d5bd, 0xb9cddd, 0xd7bca4, 0xc6d4c6, 0xd9ccc8, 0xacc3cf];
  for (let i = 0; i < 26; i++) {
    const g = new T.Group();
    const side = i % 2 ? 1 : -1;
    if (i % 3) {
      const h = G.rnd(4, 11), w = G.rnd(4, 6.5);
      const b = new T.Mesh(G.boxGeo(w, h, w), G.mat(G.pick(PAL))); b.position.y = h / 2; b.castShadow = true; g.add(b);
      const cap = new T.Mesh(G.boxGeo(w * 0.95, 0.35, w * 0.95), G.mat(0x55606A)); cap.position.y = h + 0.17; g.add(cap);
      g.position.x = side * G.rnd(17, 24);
    } else {
      const t = G.makeTree(G.rnd(1, 1.4)); g.add(t);
      g.position.x = side * G.rnd(11.5, 13.5);
    }
    g.userData.gap = G.rnd(12, 20);
    deco.add(g); SCENERY.push(g);
  }

  /* ── 배 ── */
  const boat = G.makeBoat(0xe8533f);
  const driver = G.makePerson({ shirt: 0x3f8fbf, hat: 0xffd23f }); driver.scale.setScalar(0.42); driver.position.set(0, 0.35, -0.3);
  G.sitPose(driver); boat.add(driver);
  const boatWrap = new T.Group(); boatWrap.add(boat); scene.add(boatWrap);
  boat.rotation.y = Math.PI;              // 배의 앞(+z)이 진행 방향(-z)을 보게
  // 물보라 (공유 조각 몇 개)
  const foamMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
  const foamGeo = new T.BoxGeometry(0.25, 0.25, 0.25);
  const foam = [];
  for (let i = 0; i < 18; i++) { const f = new T.Mesh(foamGeo, foamMat); f.visible = false; scene.add(f); foam.push({ m: f, life: 0, vx: 0, vy: 0, vz: 0 }); }
  let foamI = 0;

  /* ── 물 위 물건 (미리 만들어 두고 돌려 쓴다) ── */
  const buoyGeo = new T.CylinderGeometry(0.45, 0.55, 0.9, 10);
  const buoyMat = G.mat(0xff7a1f), buoyGold = new T.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x6a5000 });
  const stripeGeo = new T.CylinderGeometry(0.47, 0.47, 0.18, 10);
  const rockGeo = new T.DodecahedronGeometry(1.1);
  const ringGeo = new T.TorusGeometry(1.7, 0.22, 8, 22);
  const ringMat = new T.MeshLambertMaterial({ color: 0x3ed4c8, emissive: 0x0d4a45 });
  const logGeo2 = new T.BoxGeometry(4.2, 0.55, 0.7);
  const pool = { buoy: [], gold: [], rock: [], log: [], ring: [], duck: [], pillar: [] };
  function make(type) {
    let m;
    if (type === 'buoy' || type === 'gold') {
      m = new T.Group();
      const b = new T.Mesh(buoyGeo, type === 'gold' ? buoyGold : buoyMat); b.castShadow = true; m.add(b);
      const s = new T.Mesh(stripeGeo, G.mat(0xffffff)); s.position.y = 0.15; m.add(s);
      const f = new T.Mesh(G.boxGeo(0.05, 0.9, 0.05), G.mat(0x333333)); f.position.y = 0.85; m.add(f);
      const fl = new T.Mesh(G.boxGeo(0.4, 0.25, 0.03), G.mat(type === 'gold' ? 0xffd23f : 0xe8433f)); fl.position.set(0.2, 1.15, 0); m.add(fl);
    } else if (type === 'rock') {
      m = new T.Mesh(rockGeo, G.mat(0x8a939b)); m.castShadow = true; m.scale.set(1.2, 0.7, 1);
    } else if (type === 'log') {
      m = new T.Mesh(logGeo2, G.mat(0x8b5a2b)); m.castShadow = true;
    } else if (type === 'ring') {
      m = new T.Mesh(ringGeo, ringMat);
    } else if (type === 'duck') {
      m = new T.Group();
      for (let i = 0; i < 3; i++) {
        const d = new T.Group();
        const body = new T.Mesh(G.boxGeo(0.5, 0.35, 0.7), G.mat(0xf6f6f6)); body.position.y = 0.2; d.add(body);
        const head = new T.Mesh(G.boxGeo(0.3, 0.3, 0.3), G.mat(0x2e8b57)); head.position.set(0, 0.5, 0.3); d.add(head);
        const bk = new T.Mesh(G.boxGeo(0.14, 0.08, 0.2), G.mat(0xffa21f)); bk.position.set(0, 0.48, 0.52); d.add(bk);
        d.position.x = (i - 1) * 0.9; d.position.z = -Math.abs(i - 1) * 0.5;
        m.add(d);
      }
    } else if (type === 'pillar') {
      m = new T.Group();
      const p1 = new T.Mesh(G.boxGeo(1.4, 7, 1.4), G.mat(0xb9baa9)); p1.position.y = 3.5; p1.castShadow = true; m.add(p1);
    }
    m.visible = false; scene.add(m);
    return m;
  }
  function take(type) {
    const list = pool[type];
    let o = list.find(v => !v.active);
    if (!o) { o = { m: make(type), active: false, type }; list.push(o); }
    o.active = true; o.m.visible = true; o.hit = false;
    return o;
  }
  // 다리 (기둥 사이로 지나가야 한다)
  const bridgeDeck = new T.Group();
  const deck = new T.Mesh(G.boxGeo(24, 0.8, 3.4), G.mat(0xd5c9ae)); deck.position.y = 7.2; deck.castShadow = true; bridgeDeck.add(deck);
  const rail1 = new T.Mesh(G.boxGeo(24, 0.5, 0.2), G.mat(0x718a91)); rail1.position.set(0, 7.85, 1.6); bridgeDeck.add(rail1);
  const rail2 = rail1.clone(); rail2.position.z = -1.6; bridgeDeck.add(rail2);
  bridgeDeck.visible = false; scene.add(bridgeDeck);
  // 결승선
  const finish = new T.Group();
  const fTex = G.canvasTex(256, 64, g => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); } });
  const banner = new T.Mesh(G.boxGeo(17, 1.4, 0.2), [G.mat(0x333333), G.mat(0x333333), G.mat(0x333333), G.mat(0x333333), new T.MeshBasicMaterial({ map: fTex }), new T.MeshBasicMaterial({ map: fTex })]);
  banner.position.y = 6; finish.add(banner);
  for (const s of [-1, 1]) { const p = new T.Mesh(G.boxGeo(0.6, 6.5, 0.6), G.mat(0xe8533f)); p.position.set(s * 8.2, 3.25, 0); finish.add(p); }
  const fl = G.labelSprite('🏁 결승선', { scale: 1.3, bg: '#1b2b44', border: '#ffd23f' }); fl.position.y = 8; finish.add(fl);
  scene.add(finish);

  let st = null, ui = {};
  const _v = new T.Vector3();

  /* ── 코스 설계: 앞으로 가며 한 줄씩 만든다 ── */
  function spawnRow(z) {
    const k = G.clamp(-z / CFG.length, 0, 1);
    const r = Math.random();
    const lanes = [-5.2, -2.6, 0, 2.6, 5.2];
    if (st.nextBridge && -z >= st.nextBridge) {
      // 다리: 기둥 2개 → 가운데·양옆 세 틈 중 하나로
      st.nextBridge = -z + G.rnd(200, 280);
      st.bridges.push(z);
      for (const x of [-2.6, 2.6]) { const o = take('pillar'); o.m.position.set(x, 0, z); o.r = 0.9; o.d = 0.9; }
      const o = take('buoy'); o.m.position.set(G.pick([-4.8, 0, 4.8]), 0, z - 0.5);
      return;
    }
    if (r < 0.26) {
      // 부표 줄 (S자로 이어짐)
      const x0 = st.trail;
      for (let i = 0; i < 5; i++) {
        st.trail = G.clamp(st.trail + G.rnd(-1.2, 1.2), -CFG.half + 0.5, CFG.half - 0.5);
        const gold = Math.random() < 0.06;
        const o = take(gold ? 'gold' : 'buoy'); o.m.position.set(i ? st.trail : x0, 0, z - i * 3.2);
      }
      st.gapZ = 16;
      return;
    }
    if (r < 0.34 && k > 0.1) { const o = take('ring'); o.m.position.set(G.pick([-3.5, 0, 3.5]), 1.3, z); o.r = 1.6; st.gapZ = 9; return; }
    if (r < 0.46 && k > 0.2) {
      const o = take('duck'); o.m.position.set(G.rnd(-4, 4), 0, z); o.vx = G.pick([-1, 1]) * G.rnd(1.2, 2.0); o.r = 1.25; o.d = 0.7;
      o.m.rotation.y = o.vx > 0 ? Math.PI / 2 : -Math.PI / 2; st.gapZ = 12; return;
    }
    // 장애물 줄: 한두 칸은 꼭 비워 둔다
    const n = k < 0.3 ? 1 : G.pick([1, 2, 2]);
    const free = new Set([Math.floor(G.rnd(0, 5))]);
    const used = [];
    for (let i = 0; i < n; i++) {
      let li; let tries = 0;
      do { li = Math.floor(G.rnd(0, 5)); } while ((free.has(li) || used.includes(li)) && ++tries < 12);
      if (free.has(li) || used.includes(li)) continue;
      used.push(li);
      // 통나무는 가장자리 칸에만 (가운데 길을 막지 않게)
      if ((li === 0 || li === 4) && Math.random() < 0.6) { const o = take('log'); o.m.position.set(lanes[li] + (li ? 0.6 : -0.6), 0.05, z); o.m.rotation.y = G.rnd(-0.2, 0.2); o.r = 1.9; o.d = 0.5; }
      else { const o = take('rock'); o.m.position.set(lanes[li] + G.rnd(-0.3, 0.3), 0.05, z); o.m.rotation.y = G.rnd(0, 3); o.r = 0.95; o.d = 0.8; }
    }
    // 빈 칸에 부표 하나
    const fi = [...free][0];
    if (Math.random() < 0.7) { const o = take('buoy'); o.m.position.set(lanes[fi], 0, z); }
    st.gapZ = G.lerp(16, 13.5, k);
  }

  function buildUi(ctx) {
    const wrap = document.createElement('div');
    wrap.id = 'boatUi'; wrap.hidden = true;
    wrap.innerHTML = `<button class="tbtn bL" data-s="-1">◀</button><button class="tbtn bR" data-s="1">▶</button>
      <div class="bprog"><i></i><b>🏁</b></div><div class="bspeed"><b>0</b><span>km/h</span></div>`;
    const css = document.createElement('style');
    css.textContent = `
      #boatUi .tbtn.bL,#boatUi .tbtn.bR{bottom:calc(24px + env(safe-area-inset-bottom,0px)); width:34vw; max-width:190px; height:120px; font-size:32px;}
      #boatUi .bL{left:18px;} #boatUi .bR{right:18px;}
      body:not(.touch) #boatUi .bL, body:not(.touch) #boatUi .bR{display:none;}
      #boatUi .bprog{position:fixed; left:50%; top:74px; transform:translateX(-50%); width:min(440px,70vw); height:10px; border-radius:99px; background:rgba(10,20,36,.75); border:2px solid #2d4561; pointer-events:none;}
      #boatUi .bprog i{position:absolute; left:0; top:0; bottom:0; width:0; border-radius:99px; background:linear-gradient(90deg,#5ac8fa,#3ed47e);}
      #boatUi .bprog b{position:absolute; right:-28px; top:-9px; font-size:20px; font-weight:400;}
      #boatUi .bspeed{position:fixed; right:22px; top:74px; background:rgba(13,24,41,.85); border:1px solid #263D5F; border-radius:14px; padding:4px 12px; text-align:center; pointer-events:none;}
      #boatUi .bspeed b{display:block; font:26px 'Jua',sans-serif; color:#5ac8fa;} #boatUi .bspeed span{font-size:10px; color:#8FA6C8;}
      #boatUi .bspeed.boost b{color:#3ed4c8; text-shadow:0 0 12px #3ed4c8;}
      @media (max-width:820px){ #boatUi .bprog{top:60px;} #boatUi .bspeed{top:78px; right:10px;} }`;
    wrap.appendChild(css);
    ctx.layer.appendChild(wrap);
    ui = { wrap, prog: wrap.querySelector('.bprog i'), speed: wrap.querySelector('.bspeed'), speedB: wrap.querySelector('.bspeed b') };
    wrap.querySelectorAll('[data-s]').forEach(b => {
      const s = +b.dataset.s;
      b.addEventListener('pointerdown', e => { e.preventDefault(); if (st) st.touch = s; b.classList.add('on'); });
      for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, () => { if (st && st.touch === s) st.touch = 0; b.classList.remove('on'); });
    });
  }

  function resetWorld() {
    for (const k in pool) for (const o of pool[k]) { o.active = false; o.m.visible = false; }
    bridgeDeck.visible = false;
    SCENERY.forEach((g, i) => { g.position.z = -i * 9 + 30; });
    finish.position.set(0, 0, -CFG.length);
  }
  function stats() {
    G.ctx.setStats([
      { label: '부표', value: st.buoys },
      { label: '점수', value: score() },
      { label: '목숨', value: '❤️'.repeat(Math.max(0, st.hearts)) || '—' },
      { label: '시간', value: st.t.toFixed(1) },
    ]);
  }
  function score() { return st.buoys * 10 + st.golds * 40 + (st.done ? Math.max(0, st.hearts) * 50 + Math.max(0, Math.round((75 - st.t) * 3)) : 0); }
  function hit(o) {
    if (st.inv > 0 || o.hit) return;
    o.hit = true;
    st.hearts--; st.inv = 1.3; st.speed *= 0.45; st.boost = 0; st.combo = 0;
    G.sfx.play('crash'); G.ctx.flash(st.hearts > 0 ? '쿵! ❤️ -1' : '배가 멈췄어요…', 'bad', 800);
    st.shake = 0.35;
    if (st.hearts <= 0) { st.done = 'crash'; st.doneT = 0; }
  }
  function burst(x, z, n = 6) {
    for (let i = 0; i < n; i++) {
      const f = foam[foamI++ % foam.length];
      f.m.visible = true; f.life = 0.6; f.m.position.set(x + G.rnd(-0.4, 0.4), 0.3, z + G.rnd(-0.3, 0.3));
      f.vx = G.rnd(-2, 2); f.vy = G.rnd(2, 4); f.vz = G.rnd(-1, 2);
    }
  }

  G.registerGame({
    id: 'boat', name: '강물 부표 레이스', icon: '🚤', color: '#e8533f',
    place: '남쪽 강변 선착장 (다리 건너 서쪽)',
    tagline: '작은 배로 강을 달려요! 부표를 모으고 바위·통나무·다리 기둥을 피해 결승선까지.',
    rules: [
      `<b>결승선</b>까지 가면 성공 — ❤️ ${CFG.hearts}개가 다 떨어지면 실패`,
      '🟠 부표 +10 · 🟡 황금 부표 +50 · 🌀 초록 고리 = 부스터',
      '바위·통나무·다리 기둥·오리 떼에 부딪히면 ❤️ -1 (잠깐 느려져요)',
      '도착하면 남은 ❤️ ×50과 빨리 온 만큼 시간 보너스',
      '↑ 가속 · ↓ 감속 — 길이 좁을 땐 속도를 줄여도 좋아요',
    ],
    controlsKey: '← → 또는 A D로 몰기 · ↑ 가속 · ↓ 감속 · Esc 잠깐 멈춤',
    controlsTouch: '화면 아래 ◀ ▶ 버튼을 누르고 있기',
    format: v => `${v}점`,
    world: 'own', scene, camera,
    debug: () => ({ st, pool }),
    init(ctx) { buildUi(ctx); G.addCamera(camera); },
    enter(ctx) { ui.wrap.hidden = false; newRun(); },
    start(ctx) {
      newRun();
      ctx.hint(G.touch ? '◀ ▶ 버튼으로 배를 몰아요' : '← → 로 몰고 ↑ 가속 · ↓ 감속');
      setTimeout(() => { if (G.play.current?.id === 'boat') ctx.hint(''); }, 3500);
    },
    update(dt, now, ctx) { step(dt, now, ctx); },
    onKey(e, down) {
      if (!st) return;
      const k = e.code;
      if (k === 'ArrowLeft' || k === 'KeyA') st.keys.l = down;
      else if (k === 'ArrowRight' || k === 'KeyD') st.keys.r = down;
      else if (k === 'ArrowUp' || k === 'KeyW') st.keys.u = down;
      else if (k === 'ArrowDown' || k === 'KeyS') st.keys.d = down;
    },
    onBlur() { if (st) { st.keys = {}; st.touch = 0; } },
    exit() { ui.wrap.hidden = true; st = null; },
  });

  function newRun() {
    st = { t: 0, z: 0, x: 0, vx: 0, speed: 0, boost: 0, inv: 0, hearts: CFG.hearts, buoys: 0, golds: 0, combo: 0,
      keys: {}, touch: 0, nextRow: -30, trail: 0, gapZ: 14, nextBridge: 150, bridges: [], done: null, doneT: 0, shake: 0 };
    resetWorld();
    boatWrap.position.set(0, 0, 0); boatWrap.rotation.set(0, 0, 0);
    placeCam(1, 0, true);
    if (G.play.state !== 'idle') stats();
  }

  function placeCam(dt, now, snap) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    const fov = (camera.aspect < 1 ? 80 : 60) + G.clamp((st.speed - 12) / 22, 0, 1) * 12;   // 세로 화면은 강폭이 다 보이게 넓게
    if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * (snap ? 1 : k); camera.updateProjectionMatrix(); }
    _v.set(st.x * 0.55, 4.3, st.z + 8.6);
    if (st.shake > 0) { _v.x += G.rnd(-0.12, 0.12); _v.y += G.rnd(-0.1, 0.1); }
    camera.position.lerp(_v, snap ? 1 : Math.min(1, dt * 10));
    camera.lookAt(st.x * 0.75, 0.6, st.z - 11);
    sun.position.set(camera.position.x + 10, 25, st.z + 5);
    sun.target.position.set(camera.position.x, 0, st.z - 10);
  }

  function step(dt, now, ctx) {
    if (!st) return;
    const k = G.clamp(-st.z / CFG.length, 0, 1);
    if (!st.done) st.t += dt;
    // ── 속도 ──
    let target = G.lerp(CFG.speed[0], CFG.speed[1], k);
    if (st.keys.u) target *= 1.2;
    if (st.keys.d) target *= 0.55;
    if (st.boost > 0) { st.boost -= dt; target = CFG.boost; }
    if (st.done) target = st.done === 'crash' ? 0 : 6;
    st.speed += (target - st.speed) * Math.min(1, dt * (st.boost > 0 ? 4 : 1.6));
    st.z -= st.speed * dt;
    // ── 조향 ──
    const steer = (st.keys.r ? 1 : 0) - (st.keys.l ? 1 : 0) + st.touch;
    st.vx += (G.clamp(steer, -1, 1) * CFG.steer - st.vx) * Math.min(1, dt * 7);
    if (st.done) st.vx *= 0.9;
    st.x = G.clamp(st.x + st.vx * dt, -CFG.half, CFG.half);
    if (Math.abs(st.x) >= CFG.half) st.vx *= 0.5;
    boatWrap.position.set(st.x, Math.sin(now * 0.006) * 0.06, st.z);
    boatWrap.rotation.z = -st.vx * 0.03;
    boatWrap.rotation.y = -st.vx * 0.035;
    boat.rotation.x = -0.04 - G.clamp(st.speed / 40, 0, 0.1);
    if (st.inv > 0) { st.inv -= dt; boat.visible = Math.floor(st.inv * 12) % 2 === 0; } else boat.visible = true;
    if (st.shake > 0) st.shake -= dt;
    // ── 물·둑·풍경을 배 따라 옮긴다 ──
    water.position.z = st.z - 60;
    bankMesh.position.z = st.z - 60;
    const t = now * 0.002;
    for (let i = 0; i < wpos.count; i++) {
      const x = wpos.getX(i), wz = baseZ[i] + water.position.z;
      wpos.setY(i, Math.sin(x * 0.5 + t) * 0.12 + Math.cos(wz * 0.5 + t) * 0.12);
    }
    wpos.needsUpdate = true;
    for (const g of SCENERY) if (g.position.z > st.z + 25) g.position.z -= 26 * 9 + G.rnd(-3, 3);
    // ── 앞쪽 줄 만들기 ──
    while (st.nextRow > st.z - CFG.view && -st.nextRow < CFG.length - 20) { spawnRow(st.nextRow); st.nextRow -= st.gapZ; }
    // 다리 상판
    const nb = st.bridges.find(bz => bz < st.z + 12 && bz > st.z - CFG.view);
    bridgeDeck.visible = nb !== undefined; if (nb !== undefined) bridgeDeck.position.z = nb;
    // ── 물건: 움직임·충돌·수집 ──
    for (const type in pool) for (const o of pool[type]) {
      if (!o.active) continue;
      const m = o.m;
      if (m.position.z > st.z + 12) { o.active = false; m.visible = false; continue; }
      if (type === 'duck') { m.position.x += o.vx * dt; if (Math.abs(m.position.x) > CFG.half) o.vx = -o.vx, m.rotation.y = -m.rotation.y; }
      if (type === 'buoy' || type === 'gold') { m.position.y = Math.sin(now * 0.004 + m.position.z) * 0.12; m.rotation.y += dt; }
      if (type === 'ring') m.rotation.y = Math.sin(now * 0.002) * 0.3;
      const dz = Math.abs(m.position.z - st.z), dx = Math.abs(m.position.x - st.x);
      if (dz > 2.5 || st.done) continue;
      if (type === 'buoy' || type === 'gold') {
        if (dx < 1.2 && dz < 1.3) {
          o.active = false; m.visible = false;
          st.combo++;
          if (type === 'gold') { st.golds++; st.buoys++; G.sfx.play('perfect'); ctx.flash('🟡 황금 부표 +50', 'gold', 600); }
          else { st.buoys++; G.sfx.play('coin'); if (st.combo % 5 === 0) ctx.flash(`🟠 ${st.combo}연속!`, 'good', 500); }
          burst(m.position.x, m.position.z, 4);
        }
      } else if (type === 'ring') {
        if (dx < o.r && dz < 0.8 && !o.hit) { o.hit = true; st.boost = 1.6; G.sfx.play('whoosh'); ctx.flash('🌀 부스터!', 'good', 600); }
      } else if (dx < o.r + 0.6 && dz < (o.d || 0.8) + 0.9) hit(o);
    }
    // 물보라
    if (Math.random() < dt * (st.speed * 0.6)) { const f = foam[foamI++ % foam.length]; f.m.visible = true; f.life = 0.5; f.m.position.set(st.x + G.rnd(-0.6, 0.6), 0.2, st.z + 1.6); f.vx = G.rnd(-1.5, 1.5); f.vy = G.rnd(1, 2.4); f.vz = G.rnd(1, 3); }
    for (const f of foam) {
      if (!f.m.visible) continue;
      f.life -= dt; f.vy -= 9 * dt;
      f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.position.z += f.vz * dt;
      if (f.life <= 0 || f.m.position.y < 0) f.m.visible = false;
    }
    // ── 결승 ──
    if (!st.done && -st.z >= CFG.length) {
      st.done = 'finish'; st.doneT = 0;
      G.sfx.play('win'); ctx.flash('🏁 결승선 통과!', 'gold', 1400);
    }
    if (st.done) {
      st.doneT += dt;
      if (st.doneT > 1.4) {
        const ok = st.done === 'finish';
        const sc = score();
        return ctx.finish({
          success: ok, record: sc, big: `${sc}점`,
          progress: ok ? 1 : (-st.z) / CFG.length,   // 못 가도 간 거리만큼
          title: ok ? '결승선 통과! 🏁' : '배가 멈췄어요 💦',
          lines: [
            `부표 ${st.buoys}개 (황금 ${st.golds}개) · ${ok ? `${st.t.toFixed(1)}초 · 남은 ❤️ ${st.hearts}` : `${Math.round(-st.z)}/${CFG.length}m 지점`}`,
            ok ? `점수 = 부표 ×10 + 황금 ×40 + ❤️ ×50 + 시간 보너스` : '팁: 부딪히기 전에 ↓로 속도를 줄이면 피하기 쉬워요',
          ],
        });
      }
    }
    ui.prog.style.width = (k * 100).toFixed(1) + '%';
    const kmh = Math.round(st.speed * 3.2);
    if (ui._kmh !== kmh) { ui._kmh = kmh; ui.speedB.textContent = kmh; }
    ui.speed.classList.toggle('boost', st.boost > 0);
    placeCam(dt, now, false);
    if (ctx.hudDue(dt)) stats();
  }
})(window.G);
