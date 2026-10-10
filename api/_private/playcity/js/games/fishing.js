'use strict';
/* ═══════════════════════════════════════════════════════════════
   🎣 강변 낚시왕 — 스타듀밸리식 낚시 (도시 씬의 북쪽 강변 낚시터에서 진행)
   흐름: 누르고 있다 떼서 던지기 → 찌가 쑥 들어가면 바로 누르기(챔질)
        → 초록 막대를 물고기에 겹쳐 게이지를 채우면 낚음
   규칙 숫자는 CFG·FISH에서 고친다.
   ═══════════════════════════════════════════════════════════════ */
(function (G) {
  const T = THREE, $ = G.$;
  const CFG = {
    time: 75, goal: 250,             // 제한 시간(초), 성공 점수
    hookWindow: 0.8,                 // 입질 뒤 챔질 가능한 시간(초)
    bar: 0.27,                       // 초록 막대 길이 (게이지 전체 = 1)
    barAcc: 3.4, barMax: 1.7,        // 막대 가속·최대 속도
    fillIn: 0.4, drainOut: 0.3,      // 막대 안일 때 차는 속도·밖일 때 줄어드는 속도 (/초)
  };
  // 물고기: 점수, 난이도(0~1), 움직임, 멀리 던질수록 나오는 정도(far), 드문 정도(w)
  const FISH = [
    { id: 'minnow', name: '송사리', emoji: '🐟', pts: 10, diff: 0.15, move: 'smooth', w: 30, far: -1, color: 0x9fb7c9, size: 0.5 },
    { id: 'crucian', name: '붕어', emoji: '🐟', pts: 20, diff: 0.35, move: 'mixed', w: 26, far: 0, color: 0xb59a5a, size: 0.75 },
    { id: 'carp', name: '잉어', emoji: '🐟', pts: 35, diff: 0.5, move: 'smooth', w: 18, far: 0.5, color: 0xc9774a, size: 1.0 },
    { id: 'catfish', name: '메기', emoji: '🐡', pts: 50, diff: 0.62, move: 'sinker', w: 12, far: 0.8, color: 0x5d5a4e, size: 1.1 },
    { id: 'mandarin', name: '쏘가리', emoji: '🐠', pts: 70, diff: 0.78, move: 'dart', w: 8, far: 1.2, color: 0xd9b24a, size: 0.95 },
    { id: 'golden', name: '황금 잉어', emoji: '✨', pts: 150, diff: 0.92, move: 'dart', w: 2.2, far: 2.2, color: 0xffd23f, size: 1.2 },
    { id: 'boot', name: '헌 장화', emoji: '👢', pts: 2, diff: 0, move: 'junk', w: 7, far: -0.5, color: 0x4a3a2a, size: 0.8 },
  ];
  const PIER = { x: 35, z: 35.4, y: 0.35 };

  let root, player, rod, rodTip, line, linePos, bobber, fishMesh, fishMats = {};
  let ui = {};
  let st = null;                      // 한 판의 상태
  const _v = new T.Vector3(), _v2 = new T.Vector3(), camPos = new T.Vector3(), camLook = new T.Vector3();

  function waterY(x, z, now) {
    const t = now * 0.002;
    return 0.2 + Math.sin(x * 0.5 + t) * 0.12 + Math.cos((z - 38) * 0.5 + t) * 0.12;
  }

  function buildUi(ctx) {
    const wrap = document.createElement('div');
    wrap.id = 'fishUi'; wrap.hidden = true;
    wrap.innerHTML = `
      <div class="fzone" id="fZone" aria-label="누르고 있기"></div>
      <div class="fpower" id="fPower" hidden><i></i><span>멀리 던질수록 큰 물고기!</span></div>
      <div class="fbang" id="fBang" hidden>!</div>
      <div class="fmeter panel" id="fMeter" hidden>
        <div class="ftrack"><div class="fbar" id="fBar"></div><div class="ftreasure" id="fTreasure" hidden>🎁</div><div class="ffish" id="fFish">🐟</div></div>
        <div class="fprog"><i id="fProg"></i></div>
        <div class="fname" id="fName"></div>
      </div>
      <button class="tbtn big" id="fBtn" type="button" hidden>🎣<br>꾹</button>`;
    ctx.layer.appendChild(wrap);
    ui = { wrap, zone: wrap.querySelector('#fZone'), power: wrap.querySelector('#fPower'), powerI: wrap.querySelector('#fPower i'),
      bang: wrap.querySelector('#fBang'), meter: wrap.querySelector('#fMeter'), bar: wrap.querySelector('#fBar'), fish: wrap.querySelector('#fFish'),
      prog: wrap.querySelector('#fProg'), name: wrap.querySelector('#fName'), treasure: wrap.querySelector('#fTreasure'), btn: wrap.querySelector('#fBtn') };
    const css = document.createElement('style');
    css.textContent = `
      #fishUi .fzone{position:fixed; inset:0; z-index:31; touch-action:none;}
      #fishUi .fpower{position:fixed; left:50%; bottom:22%; transform:translateX(-50%); z-index:32; width:260px; height:22px; border-radius:99px; background:rgba(10,20,36,.85); border:2px solid #fff; overflow:hidden; pointer-events:none;}
      #fishUi .fpower i{display:block; height:100%; width:0; background:linear-gradient(90deg,#3ed47e,#ffd23f 60%,#ff7a70);}
      #fishUi .fpower span{position:absolute; inset:0; font:12px/18px 'Jua',sans-serif; text-align:center; color:#fff; text-shadow:0 1px 2px #000;}
      #fishUi .fbang{position:fixed; z-index:32; width:64px; height:64px; border-radius:50%; background:#fff; border:4px solid #1b2b44; font:900 44px/56px 'Jua',sans-serif; text-align:center; color:#e8433f; box-shadow:0 6px 18px rgba(0,0,0,.35); transform:translate(-50%,-120%); pointer-events:none; animation:fbang .22s ease infinite alternate;}
      @keyframes fbang{to{transform:translate(-50%,-125%) scale(1.15);}}
      #fishUi .fmeter{position:fixed; right:max(24px,6vw); top:50%; transform:translateY(-50%); z-index:32; padding:12px; display:grid; grid-template-columns:auto auto; gap:8px; border-radius:18px; pointer-events:none;}
      #fishUi .ftrack{position:relative; width:52px; height:min(52vh,340px); border-radius:12px; background:linear-gradient(#1f6f9a,#0e3550); border:3px solid #6b4a2e; overflow:hidden;}
      #fishUi .fbar{position:absolute; left:3px; right:3px; bottom:0; border-radius:8px; background:rgba(94,230,126,.55); border:2px solid #9df5b0; box-shadow:0 0 12px rgba(94,230,126,.5);}
      #fishUi .fbar.in{background:rgba(94,230,126,.8);}
      #fishUi .ffish{position:absolute; left:50%; bottom:0; font-size:28px; line-height:1; transform:translate(-50%,50%);}
      #fishUi .ftreasure{position:absolute; left:50%; bottom:0; font-size:24px; transform:translate(-50%,50%); opacity:.9;}
      #fishUi .fprog{position:relative; width:14px; height:min(52vh,340px); border-radius:8px; background:#0a1424; border:2px solid #2d4561; overflow:hidden;}
      #fishUi .fprog i{position:absolute; left:0; right:0; bottom:0; height:30%; background:linear-gradient(#ffd23f,#3ed47e); transition:background .2s;}
      #fishUi .fprog i.low{background:#ff7a70;}
      #fishUi .fname{grid-column:1 / 3; text-align:center; font:15px 'Jua',sans-serif;}
      @media (max-width:820px){ #fishUi .fmeter{right:14px; top:44%;} #fishUi .ftrack,#fishUi .fprog{height:min(42vh,260px);} }`;
    wrap.appendChild(css);
    const press = e => { if (e) e.preventDefault(); input(true); };
    const release = e => { if (e) e.preventDefault(); input(false); };
    ui.zone.addEventListener('pointerdown', press);
    ui.zone.addEventListener('pointerup', release);
    ui.zone.addEventListener('pointercancel', release);
    ui.zone.addEventListener('pointerleave', release);
    ui.btn.addEventListener('pointerdown', press);
    ui.btn.addEventListener('pointerup', release);
    ui.btn.addEventListener('pointercancel', release);
  }

  function buildWorld() {
    root = new T.Group(); root.visible = false; G.scene.add(root);
    player = G.makePerson({ shirt: 0x3f8fbf, pants: 0x3a3f4a, hat: 0xe8c547 });
    player.position.set(PIER.x - 0.2, PIER.y, PIER.z);
    root.add(player);
    // 낚싯대: 오른손 근처 회전축 + 긴 막대
    rod = new T.Group();
    rod.position.set(PIER.x + 0.35, PIER.y + 1.25, PIER.z + 0.25);
    const stick = new T.Mesh(G.boxGeo(0.06, 0.06, 2.8), G.mat(0x5a3a22)); stick.position.z = 1.4; rod.add(stick);
    const reelM = new T.Mesh(G.boxGeo(0.16, 0.16, 0.16), G.mat(0xcfcfcf)); reelM.position.set(0, -0.08, 0.35); rod.add(reelM);
    rodTip = new T.Object3D(); rodTip.position.z = 2.8; rod.add(rodTip);
    root.add(rod);
    linePos = new Float32Array(6);
    const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.BufferAttribute(linePos, 3));
    line = new T.Line(lg, new T.LineBasicMaterial({ color: 0xf6f6f6 }));
    line.frustumCulled = false; root.add(line);
    bobber = new T.Group();
    const top = new T.Mesh(new T.SphereGeometry(0.13, 10, 8), G.mat(0xe8433f)); top.position.y = 0.05; bobber.add(top);
    const bot = new T.Mesh(new T.SphereGeometry(0.11, 10, 8), G.mat(0xf6f6f6)); bot.position.y = -0.06; bobber.add(bot);
    root.add(bobber);
    // 잡힌 물고기 (종류마다 색만 바꿔 쓰는 한 마리)
    fishMesh = new T.Group();
    const body = new T.Mesh(G.boxGeo(0.34, 0.3, 0.8), G.mat(0xffffff));
    const tail = new T.Mesh(G.boxGeo(0.06, 0.34, 0.3), G.mat(0xffffff)); tail.position.z = -0.52;
    fishMesh.add(body, tail); fishMesh.userData.parts = [body, tail];
    fishMesh.visible = false; root.add(fishMesh);
    FISH.forEach(f => { fishMats[f.id] = G.mat(f.color); });
  }

  function pickFish(dist) {
    // dist 0(가까이)~1(멀리): 멀리 던질수록 far가 큰 물고기의 가중치가 커진다
    let total = 0;
    const ws = FISH.map(f => { const w = Math.max(0.2, f.w * (1 + f.far * (dist - 0.35) * 1.6)); total += w; return w; });
    let r = Math.random() * total;
    for (let i = 0; i < FISH.length; i++) { r -= ws[i]; if (r <= 0) return FISH[i]; }
    return FISH[0];
  }

  function setPhase(p) { st.phase = p; st.pt = 0; }

  function input(down) {
    if (!st || G.play.state !== 'play') return;
    st.hold = down;
    ui.btn.classList.toggle('on', down);
    if (down) {
      if (st.phase === 'ready') { setPhase('charge'); st.power = 0; st.dir = 1; ui.power.hidden = false; }
      else if (st.phase === 'wait') {
        // 입질 전에 당기면 물고기가 달아난다
        G.ctx.flash('너무 빨라요! 🫧', 'bad', 900); G.sfx.play('splash');
        st.misses++; reelIn(0.9);
      } else if (st.phase === 'bite') {
        ui.bang.hidden = true;
        if (st.fish.move === 'junk') { landCatch(true); return; }
        startReel();
      }
    } else if (st.phase === 'charge') {
      ui.power.hidden = true;
      cast(st.power);
    }
  }

  function cast(power) {
    const dist = 0.1 + power * 0.9;
    st.castDist = dist;
    st.treasure = null;
    st.from.set(PIER.x + 0.2, 2.6, PIER.z + 0.8);
    st.to.set(PIER.x + G.rnd(-1.4, 1.4), 0.2, PIER.z + 2 + dist * 7.4);
    setPhase('cast');
    G.sfx.play('whoosh');
  }
  function reelIn(delay = 0.5) { setPhase('reelin'); st.reelDelay = delay; ui.meter.hidden = true; ui.bang.hidden = true; }

  function startReel() {
    const f = st.fish;
    setPhase('reel');
    st.barY = 0; st.barV = 0; st.fy = 0.2; st.fv = 0; st.ftarget = 0.5; st.fnext = 0.4;
    st.progress = 0.3; st.perfect = true;
    st.treasure = Math.random() < 0.28 ? { y: G.rnd(0.15, 0.85), t: 0, appear: G.rnd(0.8, 2.2), got: false, on: false } : null;
    ui.treasure.hidden = true;
    ui.meter.hidden = false;
    ui.name.textContent = '??? 가 물었다!';
    ui.fish.textContent = f.emoji === '✨' ? '🐟' : f.emoji;
    ui.bar.style.height = CFG.bar * 100 + '%';
    G.sfx.play('bite');
    G.ctx.flash('챔질!', 'gold', 600);
  }

  function landCatch(ok) {
    const f = st.fish;
    ui.meter.hidden = true;
    if (!ok) {
      st.misses++; st.streak = 0;
      G.ctx.flash(`${f.name}이(가) 도망갔어요…`, 'bad', 1100); G.sfx.play('lose');
      reelIn(0.6);
      return;
    }
    let pts = f.pts;
    const bonus = [];
    if (f.move !== 'junk' && st.perfect) { pts = Math.round(pts * 1.5); bonus.push('PERFECT ×1.5'); }
    if (st.treasure && st.treasure.got) { pts += 30; bonus.push('🎁 +30'); }
    if (f.move !== 'junk') { st.streak++; if (st.streak >= 3) { pts += 5 * (st.streak - 2); bonus.push(`${st.streak}연속 +${5 * (st.streak - 2)}`); } }
    st.score += pts;
    st.caught.push(f);
    if (!st.best || f.pts > st.best.pts) st.best = f;
    G.ctx.flash(`${f.emoji} ${f.name} +${pts}${bonus.length ? '\n' + bonus.join(' · ') : ''}`, f.id === 'golden' ? 'gold' : 'good', 1400);
    G.sfx.play(f.move === 'junk' ? 'boing' : 'catch');
    if (!st.goalShown && st.score >= CFG.goal) { st.goalShown = true; setTimeout(() => G.ctx.flash('목표 달성! 🎉 더 낚아 봐요', 'gold', 1500), 1300); }
    // 물고기가 물 밖으로 튀어 올라 낚시꾼 쪽으로
    fishMesh.visible = true;
    fishMesh.userData.parts.forEach(p => { p.material = fishMats[f.id]; });
    fishMesh.scale.setScalar(f.size);
    st.flyT = 0;
    setPhase('landed');
  }

  function stats() {
    const left = Math.max(0, Math.ceil(st.time));
    G.ctx.setStats([
      { label: '점수', value: st.score },
      { label: '목표', value: CFG.goal },
      { label: '남은 시간', value: left, warn: left <= 10 },
      { label: '낚은 수', value: st.caught.length },
    ]);
  }

  function finish() {
    const ok = st.score >= CFG.goal;
    const counts = {};
    st.caught.forEach(f => { counts[f.name] = (counts[f.name] || 0) + 1; });
    const list = Object.entries(counts).map(([n, c]) => `${n} ×${c}`).join(', ');
    G.ctx.finish({
      success: ok, record: st.score, big: `${st.score}점`,
      progress: st.score / CFG.goal,   // 못 채워도 모은 만큼 마을 점수가 남는다
      title: ok ? '강변 낚시왕 탄생! 🎣' : '시간 종료!',
      lines: [
        ok ? `목표 ${CFG.goal}점을 넘었어요.` : `목표 ${CFG.goal}점까지 ${CFG.goal - st.score}점 모자랐어요.`,
        `낚은 물고기: ${list || '없음'}`,
        st.best ? `가장 큰 수확: ${st.best.emoji} ${st.best.name} (${st.best.pts}점)` : '팁: 막대가 물고기를 따라가게 짧게 여러 번 누르세요',
        `놓친 물고기 ${st.misses}마리`,
      ],
    });
  }

  G.registerGame({
    id: 'fishing', name: '강변 낚시왕', icon: '🎣', color: '#3aa0d8',
    place: '북쪽 강변 낚시터 (다리 동쪽)',
    tagline: '찌를 던지고, 입질에 챔질하고, 막대로 물고기를 붙잡아요!',
    rules: [
      `<b>${CFG.time}초</b> 안에 <b>${CFG.goal}점</b>을 넘기면 성공`,
      '누르고 있다가 떼면 찌를 던져요 — <b>멀리</b> 던질수록 큰 물고기',
      '찌가 쑥 들어가고 <b>!</b>가 뜨면 바로 누르기 (너무 빨리 누르면 도망가요)',
      '누르면 초록 막대가 올라가요. 물고기에 겹쳐 오른쪽 게이지를 채우면 낚음',
      '한 번도 안 놓치면 <b>PERFECT ×1.5</b>, 🎁 보물 상자 +30, 3연속부터 보너스',
    ],
    controlsKey: 'Space 또는 마우스 왼쪽 버튼을 누르고 있기 / 떼기 · Esc 잠깐 멈춤',
    controlsTouch: '화면 아무 곳이나 누르고 있기 / 떼기',
    format: v => `${v}점`,
    world: 'city',
    debug: () => st,
    init(ctx) { buildWorld(); buildUi(ctx); },
    enter(ctx) {
      root.visible = true;
      G.explore.setMarkersVisible(false);
      ui.wrap.hidden = false;
      ui.btn.hidden = !G.touch;
      st = null;
      bobber.visible = false; line.visible = false; fishMesh.visible = false;
      G.resetPose(player); rod.rotation.set(-0.5, 0, 0);
      camPos.set(PIER.x - 2.1, 4.1, PIER.z - 5.4); camLook.set(PIER.x + 0.7, 0.4, PIER.z + 7);
      ctx.hint('');
    },
    start(ctx) {
      st = {
        phase: 'ready', pt: 0, time: CFG.time, score: 0, caught: [], misses: 0, streak: 0, best: null, goalShown: false,
        hold: false, power: 0, dir: 1, from: new T.Vector3(), to: new T.Vector3(), castDist: 0,
        fish: null, biteAt: 0, nibbles: 0, nextNibble: 0,
      };
      ui.meter.hidden = true; ui.power.hidden = true; ui.bang.hidden = true;
      bobber.visible = false; line.visible = false; fishMesh.visible = false;
      stats();
      ctx.hint(G.touch ? '화면을 꾹 누르고 있다가 떼면 던져요' : 'Space(또는 마우스)를 누르고 있다가 떼면 던져요');
    },
    update(dt, now, ctx) {
      if (!st) return;
      ctx.easeCamera(camPos, camLook, dt, 3);
      st.pt += dt;
      if (st.time <= 0 && (st.phase === 'ready' || st.phase === 'charge')) { ui.power.hidden = true; return finish(); }
      if (st.phase !== 'reel' && st.phase !== 'landed') st.time -= dt;
      else st.time -= dt * 0.25;      // 물고기와 씨름하는 동안엔 시간이 천천히 흐른다
      const prevLeft = Math.ceil(st.time + dt);
      if (Math.ceil(st.time) !== prevLeft && st.time <= 5 && st.time > 0) G.sfx.play('tick');
      const r = player.userData.rig;
      rod.getWorldPosition(_v);
      // ── 단계별 ──
      switch (st.phase) {
        case 'ready':
          rod.rotation.x = -0.5 + Math.sin(now * 0.002) * 0.03;
          r.armR.rotation.x = -0.9;
          bobber.visible = false; line.visible = false;
          if (st.time <= 0) return finish();
          break;
        case 'charge':
          st.power += st.dir * dt / 0.85;
          if (st.power >= 1) { st.power = 1; st.dir = -1; } else if (st.power <= 0) { st.power = 0; st.dir = 1; }
          ui.powerI.style.width = (st.power * 100).toFixed(1) + '%';
          rod.rotation.x = -0.5 - st.power * 0.9;
          r.armR.rotation.x = -1.6 - st.power * 0.6;
          break;
        case 'cast': {
          const k = Math.min(1, st.pt / 0.55);
          rod.rotation.x = G.lerp(-1.4, -0.25, Math.min(1, k * 2.5));
          r.armR.rotation.x = -1.1;
          bobber.visible = line.visible = true;
          bobber.position.lerpVectors(st.from, st.to, k);
          bobber.position.y += Math.sin(k * Math.PI) * (2 + st.castDist * 3);
          if (k >= 1) {
            G.sfx.play('splash');
            st.fish = pickFish(st.castDist);
            st.biteAt = G.rnd(1.1, 3.4) - st.castDist * 0.3;
            st.nibbles = Math.floor(G.rnd(0, 3)); st.nextNibble = G.rnd(0.4, 0.9);
            setPhase('wait');
            ctx.hint('기다려요… 찌가 쑥 들어가면 바로 누르기!');
          }
          break;
        }
        case 'wait': {
          const y = waterY(bobber.position.x, bobber.position.z, now);
          bobber.position.y = y;
          if (st.nibbles > 0 && st.pt > st.nextNibble && st.pt < st.biteAt - 0.3) {
            st.nibbles--; st.nextNibble = st.pt + G.rnd(0.45, 0.9); st.nib = 0.22; G.sfx.play('tick');
          }
          if (st.nib > 0) { st.nib -= dt; bobber.position.y -= Math.sin((0.22 - st.nib) / 0.22 * Math.PI) * 0.12; }
          if (st.pt >= st.biteAt) {
            setPhase('bite');
            G.sfx.play('bite');
            ui.bang.hidden = false;
            ctx.hint('지금! 누르기!');
          }
          if (st.time <= 0) { reelIn(0.2); }
          break;
        }
        case 'bite': {
          bobber.position.y = waterY(bobber.position.x, bobber.position.z, now) - 0.28 - Math.sin(st.pt * 30) * 0.05;
          G.camera.updateMatrixWorld();
          _v2.copy(bobber.position).project(G.camera);
          ui.bang.style.left = ((_v2.x + 1) / 2 * innerWidth) + 'px';
          ui.bang.style.top = ((1 - _v2.y) / 2 * innerHeight) + 'px';
          if (st.pt > CFG.hookWindow) {
            ui.bang.hidden = true;
            G.ctx.flash('놓쳤어요! 입질엔 바로 누르기', 'bad', 1000); G.sfx.play('lose');
            st.misses++; st.streak = 0;
            reelIn(0.5);
          }
          break;
        }
        case 'reel': {
          const f = st.fish;
          // 막대: 누르면 위로 가속, 떼면 아래로 (바닥에서 살짝 튄다)
          st.barV += (st.hold ? CFG.barAcc : -CFG.barAcc) * dt;
          st.barV = G.clamp(st.barV, -CFG.barMax, CFG.barMax);
          st.barY += st.barV * dt;
          if (st.barY < 0) { st.barY = 0; st.barV = st.barV < -0.4 ? -st.barV * 0.35 : 0; }
          if (st.barY > 1 - CFG.bar) { st.barY = 1 - CFG.bar; st.barV = Math.min(0, st.barV); }
          // 물고기: 종류마다 다르게 움직인다
          st.fnext -= dt;
          const d = f.diff;
          if (st.fnext <= 0) {
            if (f.move === 'dart') { st.ftarget = G.rnd(0.05, 0.95); st.fnext = G.rnd(0.25, 0.9) * (1.2 - d * 0.5); }
            else if (f.move === 'sinker') { st.ftarget = Math.random() < 0.7 ? G.rnd(0.02, 0.4) : G.rnd(0.5, 0.95); st.fnext = G.rnd(0.5, 1.3); }
            else if (f.move === 'mixed') { st.ftarget = Math.random() < 0.35 ? G.rnd(0, 1) : G.clamp(st.fy + G.rnd(-0.3, 0.3), 0.03, 0.97); st.fnext = G.rnd(0.4, 1.2); }
            else { st.ftarget = G.clamp(st.fy + G.rnd(-0.35, 0.35), 0.05, 0.95); st.fnext = G.rnd(0.7, 1.6); }
          }
          const accel = f.move === 'dart' ? 26 : 9;
          st.fv += ((st.ftarget - st.fy) * accel * (0.4 + d) - st.fv * (f.move === 'dart' ? 7 : 5)) * dt;
          st.fy = G.clamp(st.fy + st.fv * dt, 0.02, 0.98);
          const inBar = st.fy >= st.barY && st.fy <= st.barY + CFG.bar;
          // 보물 상자
          const tr = st.treasure;
          if (tr && !tr.got) {
            tr.t += dt;
            if (tr.t > tr.appear) {
              if (!tr.on) { tr.on = true; ui.treasure.hidden = false; ui.treasure.style.bottom = tr.y * 100 + '%'; tr.fill = 0; }
              const over = tr.y >= st.barY && tr.y <= st.barY + CFG.bar;
              if (over) tr.fill += dt;
              ui.treasure.style.opacity = 0.5 + tr.fill / 1.2 * 0.5;
              if (tr.fill >= 1.2) { tr.got = true; ui.treasure.hidden = true; G.sfx.play('coin'); ctx.flash('🎁 보물 상자!', 'gold', 700); }
              if (tr.t > tr.appear + 5 && !tr.got) { tr.got = false; st.treasure = null; ui.treasure.hidden = true; }
            }
          }
          if (inBar) st.progress += CFG.fillIn * (1.15 - d * 0.35) * dt;
          else { st.progress -= CFG.drainOut * (0.8 + d * 0.5) * dt; st.perfect = false; }
          if (Math.random() < dt * 14) G.sfx.play('reel');
          ui.bar.style.bottom = (st.barY * 100).toFixed(2) + '%';
          ui.bar.classList.toggle('in', inBar);
          ui.fish.style.bottom = (st.fy * 100).toFixed(2) + '%';
          ui.prog.style.height = (G.clamp(st.progress, 0, 1) * 100).toFixed(1) + '%';
          ui.prog.classList.toggle('low', st.progress < 0.25);
          if (st.progress > 0.55) ui.name.textContent = `${f.emoji} ${f.name}!`;
          // 3D: 찌가 물고기 따라 흔들리고 낚싯대가 휜다
          bobber.position.x = st.to.x + (st.fy - 0.5) * 2.4;
          bobber.position.y = waterY(bobber.position.x, bobber.position.z, now) - 0.15 + Math.sin(now * 0.03) * 0.04;
          rod.rotation.x = -0.9 - (st.hold ? 0.25 : 0) + Math.sin(now * 0.04) * 0.04;
          r.armR.rotation.x = -1.3 + Math.sin(now * 0.05) * 0.1;
          if (st.progress >= 1) landCatch(true);
          else if (st.progress <= 0) landCatch(false);
          break;
        }
        case 'landed': {
          const k = Math.min(1, st.pt / 0.9);
          _v.set(PIER.x + 0.2, 1.8, PIER.z + 0.9);
          fishMesh.position.lerpVectors(bobber.position, _v, k);
          fishMesh.position.y += Math.sin(k * Math.PI) * 2.2;
          fishMesh.rotation.set(Math.sin(now * 0.03) * 0.6, now * 0.01, 0);
          bobber.visible = false;
          rod.rotation.x = -1.3;
          if (st.pt > 1.4) { fishMesh.visible = false; setPhase('ready'); ctx.hint(st.time > 0 ? '다시 던져요!' : ''); }
          break;
        }
        case 'reelin': {
          const k = Math.min(1, st.pt / 0.4);
          bobber.position.lerp(_v.set(PIER.x + 0.3, 1.2, PIER.z + 1), k * 0.5);
          if (st.pt > st.reelDelay) { setPhase('ready'); bobber.visible = false; ctx.hint(st.time > 0 ? '다시 던져요!' : ''); }
          break;
        }
      }
      // 낚싯줄: 대 끝 → 찌
      if (line.visible) {
        rod.updateMatrixWorld(); rodTip.getWorldPosition(_v2);
        linePos[0] = _v2.x; linePos[1] = _v2.y; linePos[2] = _v2.z;
        const target = bobber.visible ? bobber.position : _v2;
        linePos[3] = target.x; linePos[4] = target.y; linePos[5] = target.z;
        line.geometry.attributes.position.needsUpdate = true;
      }
      if (ctx.hudDue(dt)) stats();
    },
    onKey(e, down) {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { if (!e.repeat || !down) input(down); }
    },
    onBlur() { if (st) { st.hold = false; if (st.phase === 'charge') { ui.power.hidden = true; setPhase('ready'); } } },
    exit(ctx) {
      root.visible = false; ui.wrap.hidden = true; st = null;
      G.explore.setMarkersVisible(true);
    },
  });
})(window.G);
