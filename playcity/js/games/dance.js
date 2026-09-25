'use strict';
/* ═══════════════════════════════════════════════════════════════
   💃 선생님 몰래 춤추기 — 놀이초등학교 교실 맨 뒷자리 (도시 씬 안의 진짜 교실)
   · 누르고 있는 동안 춤 → 점수. 오래 출수록 배수(×1~×4)가 오른다
   · 선생님은 칠판에 쓰다가 「🤨 멈칫」 신호 뒤에 뒤돌아본다. 보는 동안 춤추면 발각!
   · 춤추는 중 머리 위에 뜨는 화살표를 원이 닫힐 때 맞춰 누르면 스텝 보너스
   규칙 숫자는 CFG에서 고친다. 교실 배치는 places.js (G.classroom)
   ═══════════════════════════════════════════════════════════════ */
(function (G) {
  const T = THREE, $ = G.$;
  const CFG = {
    time: 60, goal: 700, lives: 3,
    rate: 14,                         // 춤 점수 (/초, 배수 곱하기 전)
    multAt: [0, 1.5, 3.2, 5.5],        // 연속으로 춘 시간 → ×1, ×2, ×3, ×4
    bpm: 120,
    write: [2.2, 4.6], warn: [0.55, 1.05], watch: [1.3, 2.6],   // 선생님 행동 시간(초) — 시간이 지날수록 짧아진다
    grace: 0.14,                      // 돌아본 뒤 멈출 수 있는 여유
    fakeChance: 0.28,
  };
  const CR = () => G.classroom;
  const TEACH = { x: 25.5, z: 74.5 };
  const ME = { x: 42.55, z: 73.45 };

  /* ── 교실 사람들: 탐험 중에도 교실에 앉아 있다 ── */
  const npcRoot = new T.Group(); G.scene.add(npcRoot);
  const teacher = G.makePerson({ shirt: 0x8e6bbf, pants: 0x3a3450, skirt: true, long: true, glasses: true, hair: 0x3b2618, skin: 0xf0c49a });
  teacher.position.set(TEACH.x, 0, TEACH.z); teacher.rotation.y = -Math.PI / 2;
  teacher.scale.setScalar(1.18);
  npcRoot.add(teacher);
  const tRig = teacher.userData.rig;
  const chalkLine = new T.Mesh(G.boxGeo(0.04, 0.05, 1), G.mat(0xf6f6f6));
  chalkLine.position.set(24.33, 2.1, 72.2); npcRoot.add(chalkLine);
  const kids = [];
  const KID_LOOK = [[0xe8533f, 0x2b2118, 0], [0x3f8fbf, 0x5a3a22, 1], [0x3ec48a, 0x1b1b1b, 0], [0xffc83d, 0x2b2118, 1], [0xa66bd6, 0x3b2618, 1],
    [0x4e7ad4, 0x1b1b1b, 0], [0xf29fb8, 0x2b2118, 1], [0x6bbfae, 0x3b2618, 0], [0xd4b34e, 0x1b1b1b, 1], [0x9aa3ab, 0x2b2118, 0], [0xe0784a, 0x5a3a22, 1]];
  (function seatKids() {
    let i = 0;
    for (const d of CR().desks) {
      if (d.x === CR().playerDesk.x && d.z === CR().playerDesk.z) continue;
      const [shirt, hair, long] = KID_LOOK[i++ % KID_LOOK.length];
      const k = G.makeKid({ shirt, hair, long });
      k.position.set(d.x + 0.85, 0, d.z); k.rotation.y = -Math.PI / 2;
      k.userData.phase = Math.random() * 10;
      npcRoot.add(k); kids.push(k);
    }
  })();
  // 선생님 시선 (보는 동안 바닥에 빨간 부채꼴)
  const coneGeo = new T.BufferGeometry();
  coneGeo.setAttribute('position', new T.BufferAttribute(new Float32Array([26.2, 0.13, 74.5, 46.5, 0.13, 70.9, 46.5, 0.13, 78.1]), 3));
  const coneMat = new T.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide });
  const cone = new T.Mesh(coneGeo, coneMat); cone.renderOrder = 3; npcRoot.add(cone);

  // 탐험 중 선생님: 칠판에 글씨 쓰는 시늉 (학교 근처에 있을 때만)
  let ambT = 0;
  // 교실은 지붕 아래라 밖에서는 안 보인다 → 카메라가 학교 안에 있을 때만 그린다 (그리기 횟수 절약)
  const S = G.SCHOOL;
  G.ambient.push((dt, now) => {
    if (G.play.current && G.play.current.id === 'dance') { npcRoot.visible = true; return; }
    const c = G.camera.position;
    const inside = c.x > S.minX - 1 && c.x < S.maxX + 1 && c.z > S.minZ - 3 && c.z < S.maxZ + 1 && c.y < S.wallH;
    npcRoot.visible = inside;
    if (!inside) return;
    ambT += dt;
    tRig.armR.rotation.x = -2.2 + Math.sin(ambT * 5) * 0.25;
    tRig.armR.rotation.z = Math.sin(ambT * 3) * 0.2;
    for (const k of kids) k.userData.rig.head.rotation.x = Math.sin(ambT * 0.8 + k.userData.phase) * 0.12 + 0.15;
  });

  /* ── 나 (게임 중에만 보인다) ── */
  const me = G.makePerson({ shirt: 0xff7eb6, pants: 0x34405a, hair: 0x3a2a1c });
  me.position.set(ME.x, 0, ME.z); me.rotation.y = -Math.PI / 2; me.visible = false;
  npcRoot.add(me);
  const mRig = me.userData.rig;
  const meTag = G.labelSprite('나', { scale: 0.24, w: 96, h: 64, bg: '#ff7eb6', border: '#ffffff', fg: '#3a0a22', font: 34 });
  meTag.position.set(0, 2.75, 0); me.add(meTag);

  let st = null, ui = {};
  const camPos = new T.Vector3(46.6, 3.3, 72.0), camLook = new T.Vector3(29, 1.9, 74.9);
  const FOV = 38;
  // 세로 화면(폰)은 가로 시야가 좁아 내 캐릭터가 화면 밖으로 나간다 → 가로 시야를 PC와 비슷하게 맞춘다
  function danceFov() {
    const a = G.camera.aspect, hWant = 2 * Math.atan(Math.tan(FOV * Math.PI / 360) * 1.6);
    if (a >= 1.6) return FOV;
    return Math.min(78, 2 * Math.atan(Math.tan(hWant / 2) / a) * 180 / Math.PI);
  }
  const _v = new T.Vector3();
  const ARROWS = { left: '◀', right: '▶', up: '▲', down: '▼' };
  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };

  function buildUi(ctx) {
    const wrap = document.createElement('div');
    wrap.id = 'danceUi'; wrap.hidden = true;
    wrap.innerHTML = `
      <div class="dzone"></div>
      <div class="dstatus" id="dStatus"></div>
      <div class="dmult" id="dMult"><b>×1</b><span>연속 춤</span><i><em></em></i></div>
      <div class="dstep" id="dStep" hidden><span class="ring"></span><span class="arr"></span></div>
      <div class="dhearts" id="dHearts"></div>
      <button class="tbtn dance" id="dBtn" type="button">💃<br>꾹 누르면 춤</button>
      <div class="dpad" id="dPad"><button class="tbtn" data-a="up">▲</button><button class="tbtn" data-a="left">◀</button><button class="tbtn" data-a="down">▼</button><button class="tbtn" data-a="right">▶</button></div>`;
    const css = document.createElement('style');
    css.textContent = `
      #danceUi .dzone{position:fixed; inset:0; z-index:30; touch-action:none;}
      #danceUi .dstatus{position:fixed; top:72px; left:50%; transform:translateX(-50%); z-index:32; padding:9px 20px; border-radius:99px; font:19px 'Jua',sans-serif; white-space:nowrap; pointer-events:none; border:2px solid; box-shadow:0 6px 20px rgba(0,0,0,.3); transition:background .15s, color .15s;}
      #danceUi .dstatus.safe{background:#123a24; color:#aef7c9; border-color:#3ed47e;}
      #danceUi .dstatus.warn{background:#4a3a08; color:#ffe27a; border-color:#ffd23f; animation:dwarn .18s ease infinite alternate;}
      #danceUi .dstatus.watch{background:#5a1410; color:#ffd0cb; border-color:#ff5a4f; transform:translateX(-50%) scale(1.08);}
      @keyframes dwarn{to{transform:translateX(-50%) scale(1.06);}}
      #danceUi .dmult{position:fixed; left:50%; bottom:22px; transform:translateX(-50%); z-index:32; display:flex; align-items:center; gap:10px; background:rgba(13,24,41,.86); border:1px solid #263D5F; border-radius:16px; padding:8px 14px; pointer-events:none;}
      #danceUi .dmult b{font:28px 'Jua',sans-serif; color:#ffd23f; min-width:48px; text-align:center;}
      #danceUi .dmult span{font-size:12px; color:#8FA6C8;}
      #danceUi .dmult i{display:block; width:140px; height:10px; border-radius:99px; background:#0a1424; overflow:hidden;}
      #danceUi .dmult em{display:block; height:100%; width:0; background:linear-gradient(90deg,#ff7eb6,#ffd23f);}
      #danceUi .dmult.on{border-color:#ff7eb6; box-shadow:0 0 18px rgba(255,126,182,.45);}
      #danceUi .dstep{position:fixed; z-index:32; width:84px; height:84px; transform:translate(-50%,-50%); pointer-events:none;}
      #danceUi .dstep .ring{position:absolute; inset:0; border:4px solid #fff; border-radius:50%; transform:scale(2); opacity:.9;}
      #danceUi .dstep .arr{position:absolute; inset:14px; border-radius:50%; background:#ff7eb6; color:#fff; font:30px/56px 'Jua',sans-serif; text-align:center; box-shadow:0 4px 0 #a0336a;}
      #danceUi .dhearts{position:fixed; top:72px; right:18px; z-index:32; font-size:24px; letter-spacing:2px; pointer-events:none;}
      #danceUi .tbtn.dance{left:22px; bottom:calc(24px + env(safe-area-inset-bottom,0px)); width:128px; height:128px; border-radius:50%; font-size:17px; line-height:1.3; border-width:2px; border-color:#ff7eb6;}
      #danceUi .tbtn.dance.on{background:#6b2350;}
      #danceUi .dpad{position:fixed; right:20px; bottom:calc(20px + env(safe-area-inset-bottom,0px)); z-index:31; display:grid; grid-template-columns:repeat(3,58px); grid-template-rows:repeat(2,58px); gap:6px;}
      #danceUi .dpad .tbtn{position:static; font-size:22px;}
      #danceUi .dpad [data-a="up"]{grid-column:2; grid-row:1;} #danceUi .dpad [data-a="left"]{grid-column:1; grid-row:2;}
      #danceUi .dpad [data-a="down"]{grid-column:2; grid-row:2;} #danceUi .dpad [data-a="right"]{grid-column:3; grid-row:2;}
      body:not(.touch) #danceUi .tbtn.dance, body:not(.touch) #danceUi .dpad{display:none;}
      @media (max-width:820px){ #danceUi .dstatus{top:58px; font-size:15px; padding:7px 14px;} #danceUi .dhearts{top:auto; right:auto; left:26px; bottom:calc(160px + env(safe-area-inset-bottom,0px)); font-size:22px;} #danceUi .dstep{width:104px; height:104px;} #danceUi .dstep .arr{inset:16px; font-size:36px; line-height:68px;} #danceUi .dmult{bottom:auto; top:104px;} }`;
    wrap.appendChild(css);
    ctx.layer.appendChild(wrap);
    ui = { wrap, status: wrap.querySelector('#dStatus'), mult: wrap.querySelector('#dMult'), multB: wrap.querySelector('#dMult b'), multBar: wrap.querySelector('#dMult em'),
      step: wrap.querySelector('#dStep'), ring: wrap.querySelector('#dStep .ring'), arr: wrap.querySelector('#dStep .arr'), hearts: wrap.querySelector('#dHearts'), btn: wrap.querySelector('#dBtn') };
    const hold = v => e => { e.preventDefault(); setDance(v); };
    ui.btn.addEventListener('pointerdown', hold(true));
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) ui.btn.addEventListener(t, hold(false));
    // 마우스: 화면 아무 곳이나 누르고 있기 = 춤
    const zone = wrap.querySelector('.dzone');
    zone.addEventListener('pointerdown', hold(true));
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) zone.addEventListener(t, hold(false));
    wrap.querySelectorAll('[data-a]').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); stepKey(b.dataset.a); }));
  }

  function setDance(v) {
    if (!st || G.play.state !== 'play') { if (st) st.dancing = false; return; }
    if (st.frozen > 0 && v) return;
    st.dancing = v;
    ui.btn.classList.toggle('on', v);
  }

  /* ── 선생님 행동 기계: write → (warn → turn → watch → back) 또는 (warn → 헛기침/곁눈질 → write) ── */
  function teacherNext() {
    const k = G.clamp(st.t / CFG.time, 0, 1), shrink = 1 - k * 0.35;
    const tc = st.teach;
    switch (tc.s) {
      case 'write': {
        tc.s = 'warn'; tc.len = G.rnd(CFG.warn[0], CFG.warn[1]) * (1 - k * 0.3);
        tc.fake = Math.random() < CFG.fakeChance;
        G.sfx.play('hmm');
        break;
      }
      case 'warn':
        if (tc.fake) { tc.s = 'peek'; tc.len = 0.55; }
        else { tc.s = 'turn'; tc.len = 0.2; }
        break;
      case 'peek': tc.s = 'write'; tc.len = G.rnd(CFG.write[0], CFG.write[1]) * shrink; break;
      case 'turn': tc.s = 'watch'; tc.len = G.rnd(CFG.watch[0], CFG.watch[1]); tc.seen = 0; break;
      case 'watch': tc.s = 'back'; tc.len = 0.3; break;
      case 'back': tc.s = 'write'; tc.len = G.rnd(CFG.write[0], CFG.write[1]) * shrink; break;
      default: tc.s = 'write'; tc.len = 2;
    }
    tc.t = 0;
    paintStatus();
  }
  function paintStatus() {
    const s = st.teach.s;
    if (st.frozen > 0) { ui.status.className = 'dstatus watch'; ui.status.textContent = '😠 거기! 뭐 하니?'; return; }
    if (s === 'write') { ui.status.className = 'dstatus safe'; ui.status.textContent = '✍️ 칠판에 쓰는 중 — 지금이야!'; }
    else if (s === 'warn') { ui.status.className = 'dstatus warn'; ui.status.textContent = '🤨 어…? 멈칫!'; }
    else if (s === 'peek') { ui.status.className = 'dstatus warn'; ui.status.textContent = '😶 흠흠… (헛기침)'; }
    else { ui.status.className = 'dstatus watch'; ui.status.textContent = '👀 선생님이 본다! 얼음!'; }
  }
  function paintHearts() { ui.hearts.textContent = '❤️'.repeat(st.lives) + '🤍'.repeat(CFG.lives - st.lives); }

  function caught() {
    st.lives--; st.caughtN++;
    st.danceTime = 0; st.dancing = false; st.frozen = 1.5;
    ui.btn.classList.remove('on');
    G.sfx.play('caught');
    G.ctx.flash('딱 걸렸다! 😱', 'bad', 1200);
    st.shake = 0.4;
    paintHearts(); paintStatus();
    st.teach.s = 'watch'; st.teach.t = 0; st.teach.len = 1.6; st.teach.seen = 1;
    if (st.lives <= 0) st.endAt = st.t + 1.3;
  }

  /* ── 리듬 스텝: 춤추는 동안 박자마다 화살표 ── */
  function spawnStep() {
    const dirs = Object.keys(ARROWS);
    st.stepNote = { dir: G.pick(dirs), at: st.beatClock + 2 * st.beat, born: st.beatClock, hit: false };
    ui.arr.textContent = ARROWS[st.stepNote.dir];
    ui.step.hidden = false;
  }
  function stepKey(dir) {
    if (!st || G.play.state !== 'play' || !st.stepNote || !st.dancing) return;
    const n = st.stepNote, d = Math.abs(st.beatClock - n.at);
    if (dir !== n.dir || d > 0.3) { G.ctx.flash('삐끗!', 'bad', 450); st.stepNote = null; ui.step.hidden = true; st.stepStreak = 0; return; }
    const perfect = d < 0.12;
    const m = st.mult;
    const pts = (perfect ? 15 : 8) * m;
    st.score += pts; st.stepStreak++; if (perfect) st.perfects++;
    st.move = { dir, t: 0 };
    G.sfx.play(perfect ? 'perfect' : 'coin');
    G.ctx.flash(`${perfect ? 'PERFECT' : 'GOOD'} +${pts}`, perfect ? 'gold' : 'good', 500);
    st.stepNote = null; ui.step.hidden = true;
  }

  function stats() {
    const left = Math.max(0, Math.ceil(CFG.time - st.t));
    G.ctx.setStats([
      { label: '점수', value: Math.floor(st.score) },
      { label: '목표', value: CFG.goal },
      { label: '남은 시간', value: left, warn: left <= 10 },
    ]);
  }

  function end() {
    const ok = st.score >= CFG.goal;
    G.ctx.finish({
      success: ok, record: Math.floor(st.score), big: `${Math.floor(st.score)}점`,
      title: ok ? (st.caughtN === 0 ? '완벽한 비밀 댄서! 🕺' : '선생님 몰래 성공! 💃') : st.lives <= 0 ? '교무실로 가자… 😵' : '시간 종료!',
      lines: [
        ok ? `목표 ${CFG.goal}점 달성!` : `목표 ${CFG.goal}점까지 ${Math.ceil(CFG.goal - st.score)}점 모자랐어요.`,
        `발각 ${st.caughtN}번 · 최고 배수 ×${st.bestMult} · PERFECT 스텝 ${st.perfects}번`,
        '팁: 🤨 신호가 뜨면 바로 손을 떼요. 헛기침일 때도 있지만 조심해서 나쁠 건 없어요!',
      ],
    });
  }

  G.registerGame({
    id: 'dance', name: '선생님 몰래 춤추기', icon: '💃', color: '#ff7eb6',
    place: '놀이초등학교 교실 맨 뒷자리 (정문 → 복도 → 뒷문)',
    tagline: '선생님이 칠판에 쓸 때 춤! 돌아보면 얼음! 들키지 말고 점수를 모아요.',
    rules: [
      `<b>${CFG.time}초</b> 안에 <b>${CFG.goal}점</b> — 목숨 ❤️ ${CFG.lives}개`,
      '누르고 있는 동안 춤을 춰요. 오래 이어 출수록 <b>×2 → ×3 → ×4</b>',
      '<b>🤨 멈칫</b> 신호 = 곧 돌아봐요. 👀 보는 동안(바닥 빨간 부채꼴) 춤추면 <b>발각</b>!',
      '가끔은 헛기침만 하고 다시 칠판을 봐요 — 속지 마세요',
      '춤추는 중 머리 위 화살표: 원이 닫힐 때 같은 방향키 → <b>PERFECT</b> 보너스',
    ],
    controlsKey: 'Space(또는 마우스) 누르고 있기 = 춤 · 방향키/WASD = 스텝 · Esc 잠깐 멈춤',
    controlsTouch: '왼쪽 💃 버튼 꾹 = 춤 · 오른쪽 화살표 = 스텝',
    format: v => `${v}점`,
    world: 'city',
    spotRadius: 2.2,
    debug: () => st,
    init(ctx) { buildUi(ctx); },
    enter(ctx) {
      ui.wrap.hidden = false;
      me.visible = true;
      G.camera.fov = danceFov(); G.camera.updateProjectionMatrix();
      G.explore.setMarkersVisible(false);
      st = null;
      G.resetPose(teacher); teacher.rotation.y = -Math.PI / 2;
      coneMat.opacity = 0;
      ui.status.className = 'dstatus safe'; ui.status.textContent = '✍️ 선생님이 칠판에 쓰는 중';
      ui.step.hidden = true;
    },
    start(ctx) {
      st = {
        t: 0, score: 0, lives: CFG.lives, caughtN: 0, perfects: 0, bestMult: 1, stepStreak: 0,
        dancing: false, danceTime: 0, mult: 1, frozen: 0, shake: 0, endAt: null, goalShown: false,
        beat: 60 / CFG.bpm, beatClock: 0, beatN: 0, stepNote: null, move: null, pose: 0,
        teach: { s: 'write', t: 0, len: 2.4, fake: false, seen: 0 },
      };
      G.resetPose(me); G.resetPose(teacher); teacher.rotation.y = -Math.PI / 2;
      paintHearts(); paintStatus(); stats();
      ctx.hint(G.touch ? '💃 버튼을 꾹 = 춤, 떼면 얼음' : 'Space를 누르고 있으면 춤, 떼면 얼음!');
      setTimeout(() => { if (G.play.current?.id === 'dance') ctx.hint(''); }, 4000);
    },
    update(dt, now, ctx) {
      if (!st) return;
      st.t += dt;
      const tc = st.teach;
      // ── 카메라 (발각되면 살짝 흔들림) ──
      _v.copy(camPos);
      if (st.shake > 0) { st.shake -= dt; _v.x += G.rnd(-0.08, 0.08); _v.y += G.rnd(-0.06, 0.06); }
      ctx.easeCamera(_v, camLook, dt, 4);
      const fv = danceFov();
      if (Math.abs(G.camera.fov - fv) > 0.1) { G.camera.fov = fv; G.camera.updateProjectionMatrix(); }
      // ── 선생님 ──
      if (st.frozen > 0) { st.frozen -= dt; if (st.frozen <= 0) paintStatus(); }
      tc.t += dt;
      if (tc.t >= tc.len) teacherNext();
      let yaw = -Math.PI / 2, head = 0;
      const k = G.clamp(tc.t / tc.len, 0, 1);
      if (tc.s === 'write') { tRig.armR.rotation.x = -2.2 + Math.sin(st.t * 6) * 0.3; tRig.armR.rotation.z = Math.sin(st.t * 3.3) * 0.25; if (Math.random() < dt * 3) G.sfx.play('chalk'); chalkLine.scale.z = Math.min(4.6, chalkLine.scale.z + dt * 0.5); chalkLine.position.z = 72.2 + chalkLine.scale.z / 2; if (chalkLine.scale.z >= 4.6) chalkLine.scale.z = 0.01; }
      else if (tc.s === 'warn') { tRig.armR.rotation.x = -1.9; head = Math.sin(k * Math.PI) * 0.35; tRig.body.rotation.z = 0.06; }
      else if (tc.s === 'peek') { head = Math.sin(k * Math.PI) * 1.1; tRig.armR.rotation.x = -1.2; }
      else if (tc.s === 'turn') { yaw = G.lerp(-Math.PI / 2, Math.PI / 2, G.smooth(k)); tRig.armR.rotation.x = -0.4; }
      else if (tc.s === 'watch') { yaw = Math.PI / 2; tRig.armR.rotation.x = st.frozen > 0 ? -1.6 : -0.2; tRig.armR.rotation.z = st.frozen > 0 ? 0.5 : 0; tRig.armL.rotation.x = -0.2; }
      else if (tc.s === 'back') { yaw = G.lerp(Math.PI / 2, -Math.PI / 2 + Math.PI * 2, G.smooth(k)); }
      if (tc.s !== 'warn') tRig.body.rotation.z = 0;
      teacher.rotation.y = yaw; tRig.head.rotation.y = -head;
      const watching = tc.s === 'watch' || (tc.s === 'turn' && k > 0.85);
      coneMat.opacity += ((watching ? 0.26 : tc.s === 'turn' ? 0.12 : 0) - coneMat.opacity) * Math.min(1, dt * 12);
      // ── 발각 판정 ──
      if (tc.s === 'watch' && st.frozen <= 0 && st.lives > 0) {
        tc.seen += dt;
        if (st.dancing && tc.seen > CFG.grace) caught();
      }
      // ── 춤 · 점수 ──
      if (st.dancing && st.frozen <= 0 && st.lives > 0) {
        st.danceTime += dt;
        let m = 1; CFG.multAt.forEach((at, i) => { if (st.danceTime >= at) m = i + 1; });
        st.mult = m; st.bestMult = Math.max(st.bestMult, m);
        st.score += CFG.rate * m * dt;
        // 박자
        st.beatClock += dt;
        if (st.beatClock >= (st.beatN + 1) * st.beat) {
          st.beatN++;
          G.sfx.play(st.beatN % 2 ? 'beat' : 'hat');
          if (!st.stepNote && st.beatN % 3 === 0 && st.danceTime > 0.8) spawnStep();
        }
        for (const kd of kids) { kd.userData.rig.head.rotation.y = Math.sin(st.t * 2 + kd.userData.phase) * 0.4 + 0.5; kd.userData.rig.upper.position.y = 0.55 + Math.abs(Math.sin(st.t * 9 + kd.userData.phase)) * 0.04; }
      } else {
        st.danceTime = 0; st.mult = 1;
        for (const kd of kids) { kd.userData.rig.head.rotation.y *= 0.85; kd.userData.rig.upper.position.y = 0.55; }
      }
      // 스텝 화살표
      if (st.stepNote) {
        if (!st.dancing) { st.stepNote = null; ui.step.hidden = true; }
        else {
          const n = st.stepNote, life = (st.beatClock - n.born) / (n.at - n.born);
          ui.ring.style.transform = `scale(${(2 - Math.min(1, life)).toFixed(3)})`;
          ui.ring.style.borderColor = Math.abs(st.beatClock - n.at) < 0.12 ? '#ffd23f' : '#ffffff';
          me.updateMatrixWorld(); _v.set(0, 3.2, 0); me.localToWorld(_v); _v.project(G.camera);
          if (innerWidth < 820 || G.touch) { ui.step.style.left = '50%'; ui.step.style.top = '67%'; }   // 폰·태블릿: 화면 가운데 고정
          else { ui.step.style.left = ((_v.x + 1) / 2 * innerWidth) + 'px'; ui.step.style.top = ((1 - _v.y) / 2 * innerHeight) + 'px'; }
          if (st.beatClock - n.at > 0.3) { st.stepNote = null; ui.step.hidden = true; st.stepStreak = 0; }
        }
      }
      // ── 내 몸짓 ──
      const target = st.dancing && st.frozen <= 0 ? 1 : 0;
      st.pose += (target - st.pose) * Math.min(1, dt * (target ? 10 : 22));     // 떼면 아주 빨리 얼음
      const b = st.t * Math.PI * 2 * (CFG.bpm / 60) / 2, p = st.pose;
      G.resetPose(me);
      mRig.armL.rotation.z = -p * (1.2 + Math.sin(b) * 0.9); mRig.armR.rotation.z = p * (1.2 + Math.sin(b + Math.PI) * 0.9);
      mRig.armL.rotation.x = -p * 0.4; mRig.armR.rotation.x = -p * 0.4;
      mRig.body.rotation.z = p * Math.sin(b) * 0.18; mRig.body.position.y = 0.9 + p * Math.abs(Math.sin(b * 2)) * 0.12;
      mRig.head.rotation.z = p * Math.sin(b + 0.5) * 0.25;
      mRig.legL.rotation.x = p * Math.max(0, Math.sin(b)) * 0.5; mRig.legR.rotation.x = p * Math.max(0, -Math.sin(b)) * 0.5;
      if (st.move && p > 0.3) {
        st.move.t += dt;
        const q = Math.sin(Math.min(1, st.move.t / 0.35) * Math.PI);
        if (st.move.dir === 'up') { mRig.armL.rotation.z = -2.9 * q - 0.1; mRig.armR.rotation.z = 2.9 * q + 0.1; }
        else if (st.move.dir === 'down') { mRig.body.position.y = 0.9 - 0.3 * q; mRig.legL.rotation.x = mRig.legR.rotation.x = -0.8 * q; }
        else { const sgn = st.move.dir === 'left' ? 1 : -1; mRig.body.rotation.z = 0.35 * q * sgn; mRig.armL.rotation.z = -1.5 * q; mRig.armR.rotation.z = 1.5 * q; }
        if (st.move.t > 0.35) st.move = null;
      }
      if (st.frozen > 0) { mRig.head.rotation.x = 0.3; mRig.armL.rotation.z = mRig.armR.rotation.z = 0; }
      // ── HUD ──
      ui.mult.classList.toggle('on', st.dancing && st.frozen <= 0);
      ui.multB.textContent = '×' + st.mult;
      const nextAt = CFG.multAt[st.mult] ?? CFG.multAt[CFG.multAt.length - 1];
      const prevAt = CFG.multAt[st.mult - 1] || 0;
      ui.multBar.style.width = (st.mult >= CFG.multAt.length ? 100 : G.clamp((st.danceTime - prevAt) / (nextAt - prevAt), 0, 1) * 100).toFixed(0) + '%';
      if (!st.goalShown && st.score >= CFG.goal) { st.goalShown = true; ctx.flash('목표 달성! 🎉 더 모아 봐요', 'gold', 1400); }
      if (ctx.hudDue(dt)) stats();
      if ((st.endAt !== null && st.t >= st.endAt) || st.t >= CFG.time) end();
    },
    onKey(e, down) {
      if (e.code === 'Space' || e.code === 'Enter') { if (!down || !e.repeat) setDance(down); return; }
      if (down && !e.repeat && KEYMAP[e.code]) stepKey(KEYMAP[e.code]);
    },
    onBlur() { if (st) { st.dancing = false; ui.btn.classList.remove('on'); } },
    exit() {
      G.camera.fov = G.DEVICE_CFG.fov; G.camera.updateProjectionMatrix();
      ui.wrap.hidden = true; me.visible = false; st = null;
      G.resetPose(teacher); teacher.rotation.y = -Math.PI / 2; coneMat.opacity = 0;
      G.explore.setMarkersVisible(true);
    },
  });
})(window.G);
