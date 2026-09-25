'use strict';
/* ═══════════════════════════════════════════════════════════════
   ⛰️ 하늘언덕 점프 챌린지 — 옛 남산 언덕 둘레의 발판을 밟고 꼭대기 정자까지 (시간 기록)
   · 탐험과 똑같은 걷기·질주·2단 점프 조작 (explore.js의 WALK_CFG 그대로)
   · 게임 중에는 바닥이 용암! 떨어지면 마지막 체크포인트에서 다시
   · 발판은 탐험 중에도 있어서 언제든 올라가 볼 수 있다
   발판 위치는 COURSE, 시간 기준은 CFG에서 고친다.
   ═══════════════════════════════════════════════════════════════ */
(function (G) {
  const T = THREE, $ = G.$;
  const CFG = { limit: 120, stars: [45, 70] };      // 제한 시간, ★★★·★★ 기준(초)
  const H = G.HILL;                                  // 언덕 중심 (0, -52)
  // [x, z, 폭, 깊이, 윗면 높이, 색]  — 옛 언덕 단(윗면 5 · 8 · 11 · 13.5) 사이를 잇는다
  const COURSE = [
    [10.6, -42.2, 1.6, 1.6, 1.5, 0xff7a70],
    [12.3, -45.6, 1.4, 1.4, 2.6, 0xffc83d],
    // (11.8, -49.5) 자리는 움직이는 발판
    [10.8, -53.4, 1.6, 1.6, 4.5, 0x3ec48a],
    [3.0, -59.0, 1.2, 1.2, 6.3, 0x5ac8fa],
    [-1.0, -59.0, 1.2, 1.2, 7.3, 0xa66bd6],
    [-2.0, -47.0, 1.1, 1.1, 9.2, 0xff7eb6],
    [2.0, -47.0, 1.1, 1.1, 10.3, 0xff7a70],
    [-3.25, -51.0, 0.9, 0.9, 12.2, 0xffc83d],
  ];
  const START = { x: 7.5, z: -39.5, top: 0.3 };
  const CHECKS = [   // 체크포인트 (그 단의 윗면 위)
    { x: 6.9, z: -54.5, y: 5, name: '1단' },
    { x: -5, z: -52, y: 8, name: '2단' },
    { x: 0, z: -55.25, y: 11, name: '3단' },
  ];
  const GOAL = { x: 0, z: -52, y: 13.5 };
  const PAD = { x: -4.6, z: -45, y: 5, v: 11 };      // 트램펄린 (1단 → 2단 지름길)

  /* ── 발판: 도시 정적 묶음에 넣고, 충돌은 G.platforms ── */
  const city = G.cityBatch;
  city.add(2.6, START.top, 2.6, START.x, START.top / 2, START.z, 0x3ec48a);
  G.platforms.push({ x: START.x, z: START.z, w: 2.6, d: 2.6, top: START.top, bottom: 0 });
  COURSE.forEach(([x, z, w, d, top, color]) => {
    const bottom = Math.max(0, top - 0.6);
    city.add(w, 0.6, d, x, top - 0.3, z, color);
    if (bottom > 0.01) {
      // 받침 기둥 (어느 단 위에 서 있거나 땅까지)
      const base = G.platforms.filter(p => p.name && Math.abs(x - p.x) <= p.w / 2 && Math.abs(z - p.z) <= p.d / 2).reduce((m, p) => Math.max(m, p.top), 0);
      if (bottom - base > 0.05) city.add(0.18, bottom - base, 0.18, x, base + (bottom - base) / 2, z, 0xe9e1d3);
    }
    G.platforms.push({ x, z, w, d, top, bottom: top - 0.6 });
  });
  CHECKS.forEach(c => { city.add(1.3, 0.06, 1.3, c.x, c.y + 0.03, c.z, 0xffd23f).add(0.08, 1.6, 0.08, c.x + 0.55, c.y + 0.8, c.z + 0.55, 0xdddddd); });
  city.add(1.4, 0.2, 1.4, PAD.x, PAD.y + 0.1, PAD.z, 0x3f8fbf).add(1.1, 0.06, 1.1, PAD.x, PAD.y + 0.22, PAD.z, 0xff7eb6);
  // 움직이는 발판
  const mover = G.box(1.6, 0.6, 1.6, 0x3f8fbf);
  mover.position.set(11.8, 3.6 - 0.3, -49.5);
  G.scene.add(mover);
  const moverP = { x: 11.8, z: -49.5, w: 1.6, d: 1.6, top: 3.6, bottom: 3.0 };
  G.platforms.push(moverP);
  // 체크포인트 깃발
  const flags = CHECKS.map(c => {
    const f = new T.Mesh(G.boxGeo(0.7, 0.45, 0.04), G.mat(0xe8533f));
    f.position.set(c.x + 0.9, c.y + 1.35, c.z + 0.55); G.scene.add(f);
    return f;
  });
  // 꼭대기 트로피
  const trophy = new T.Group();
  const cup = new T.Mesh(new T.CylinderGeometry(0.42, 0.2, 0.6, 10), new T.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x6a5000 }));
  cup.position.y = 0.9; trophy.add(cup);
  trophy.add(new T.Mesh(G.boxGeo(0.14, 0.5, 0.14), G.mat(0xd9b24a))).children[1].position.y = 0.4;
  trophy.add(new T.Mesh(G.boxGeo(0.5, 0.15, 0.5), G.mat(0x8b6b4a)));
  trophy.position.set(GOAL.x, GOAL.y + 0.08, GOAL.z);
  G.scene.add(trophy);
  G.blockArea(GOAL.x, GOAL.z, 0.5, 0.5);
  // 용암 (게임 중에만)
  const lavaMat = new T.MeshBasicMaterial({ color: 0xff3d00, transparent: true, opacity: 0.78, depthWrite: false });
  const lava = new T.Mesh(new T.RingGeometry(1, 19, 40).rotateX(-Math.PI / 2), lavaMat);
  lava.position.set(H.x + 2, 0.07, H.z + 2); lava.visible = false; lava.renderOrder = 2;
  G.scene.add(lava);

  let st = null;
  const W = () => G.explore.walk;
  const EYE = () => G.WALK_CFG.eye;

  function place(x, y, z, yaw) {
    const w = W();
    w.pos.set(x, y + EYE(), z); w.vy = 0; w.jumps = 0;
    if (yaw !== undefined) { w.yaw = yaw; w.pitch = -0.12; }
  }
  function respawn() {
    const c = st.check >= 0 ? CHECKS[st.check] : { x: START.x, y: START.top, z: START.z };
    place(c.x, c.y, c.z);
    st.falls++;
    G.sfx.play('whoosh');
  }
  function stats() {
    G.ctx.setStats([
      { label: '시간', value: st.t.toFixed(1), warn: st.t > CFG.limit - 15 },
      { label: '체크', value: `${st.check + 1}/${CHECKS.length}` },
      { label: '떨어짐', value: st.falls },
    ]);
  }
  function starsFor(t) { return t <= CFG.stars[0] ? 3 : t <= CFG.stars[1] ? 2 : 1; }

  G.registerGame({
    id: 'obby', name: '하늘언덕 점프 챌린지', icon: '⛰️', color: '#3ec48a',
    place: '하늘언덕 공원 (옛 남산 언덕) 광장',
    tagline: '알록달록 발판을 2단 점프로 밟고 꼭대기 정자의 트로피까지! 바닥은 용암이에요.',
    rules: [
      `꼭대기 <b>🏆 트로피</b>에 닿으면 성공 — 제한 <b>${CFG.limit}초</b>`,
      '게임 중엔 <b>바닥이 용암</b>! 떨어지면 마지막 <b>🚩 체크포인트</b>에서 다시',
      '높은 발판은 <b>Space 두 번</b>(2단 점프). 발판 끝에서 떨어지며 눌러도 한 번 더 뛰어요',
      '파란 발판은 움직여요. 분홍 <b>트램펄린</b>은 높이 튕겨 줘요 (지름길!)',
      `★★★ ${CFG.stars[0]}초 이내 · ★★ ${CFG.stars[1]}초 이내 · 기록은 빠를수록 좋아요`,
    ],
    controlsKey: 'WASD·방향키 이동 · Shift 질주 · Space 점프(두 번=2단) · 마우스로 둘러보기 · Esc 멈춤',
    controlsTouch: '왼쪽 화면 누르고 끌기 = 이동(끝까지 = 질주) · 오른쪽 밀기 = 둘러보기 · 점프 두 번 = 2단 점프',
    format: v => `${v.toFixed(1)}초`,
    better: (a, b) => a < b,
    recordOnFail: false,
    world: 'city', walkGame: true,
    debug: () => st,
    init() {},
    enter(ctx) {
      G.explore.setMarkersVisible(false);
      lava.visible = true;
      st = null;
      place(START.x, START.top, START.z, Math.atan2(-(10.6 - START.x), -(-42.2 - START.z)));
      G.explore.startBlend(0.6);
    },
    start(ctx) {
      st = { t: 0, check: -1, falls: 0, won: false, wonT: 0, lavaT: 0, moverT: 0 };
      place(START.x, START.top, START.z, Math.atan2(-(10.6 - START.x), -(-42.2 - START.z)));
      flags.forEach(f => f.material = G.mat(0xe8533f));
      stats();
      ctx.hint(G.touch ? '점프 버튼 두 번 = 2단 점프 · 바닥은 용암!' : 'Space 두 번 = 2단 점프 · Shift 질주 · 바닥은 용암!');
      setTimeout(() => { if (G.play.current?.id === 'obby') ctx.hint(''); }, 4500);
    },
    idleUpdate: false,
    update(dt, now, ctx) {
      if (!st) return;
      const w = W(), feet = w.pos.y - EYE();
      st.t += dt;
      // 움직이는 발판: 위에 서 있으면 같이 움직인다
      st.moverT += dt;
      const oldZ = moverP.z;
      moverP.z = -49.5 + Math.sin(st.moverT * 1.3) * 1.5;
      mover.position.z = moverP.z;
      if (Math.abs(w.pos.x - moverP.x) < 1.1 && Math.abs(w.pos.z - oldZ) < 1.1 && Math.abs(feet - moverP.top) < 0.12) w.pos.z += moverP.z - oldZ;
      // 트램펄린
      if (Math.abs(w.pos.x - PAD.x) < 0.8 && Math.abs(w.pos.z - PAD.z) < 0.8 && Math.abs(feet - PAD.y) < 0.15 && w.vy <= 0) {
        w.vy = PAD.v; w.jumps = 1; G.sfx.play('boing');
      }
      // 체크포인트
      CHECKS.forEach((c, i) => {
        if (i > st.check && Math.abs(w.pos.x - c.x) < 1.1 && Math.abs(w.pos.z - c.z) < 1.1 && Math.abs(feet - c.y) < 0.3) {
          st.check = i; flags[i].material = G.mat(0x3ec48a);
          G.sfx.play('checkpoint'); ctx.flash(`🚩 체크포인트 ${c.name}!`, 'good', 900);
        }
      });
      // 용암
      lavaMat.opacity = 0.72 + Math.sin(now * 0.006) * 0.1;
      lavaMat.color.setHSL(0.03 + Math.sin(now * 0.004) * 0.015, 1, 0.5);
      const onStart = Math.abs(w.pos.x - START.x) < 1.6 && Math.abs(w.pos.z - START.z) < 1.6;
      if (feet < 0.06 && !onStart && !st.won) {
        st.lavaT += dt;
        if (st.lavaT > 0.05) { st.lavaT = 0; ctx.flash('앗 뜨거! 🔥', 'bad', 700); G.sfx.play('lose'); respawn(); }
      } else st.lavaT = 0;
      // 도착
      trophy.rotation.y += dt * 1.5;
      if (!st.won && Math.abs(w.pos.x - GOAL.x) < 2.6 && Math.abs(w.pos.z - GOAL.z) < 2.6 && feet > GOAL.y - 0.2) {
        st.won = true; G.sfx.play('win');
        ctx.flash(`🏆 정상 도착! ${st.t.toFixed(1)}초`, 'gold', 1600);
      }
      if (st.won) {
        st.wonT += dt;
        if (st.wonT > 1.1) {
          const s = starsFor(st.t);
          return ctx.finish({
            success: true, record: Math.round(st.t * 10) / 10, big: `${st.t.toFixed(1)}초`,
            title: `정상 정복! ${'★'.repeat(s)}${'☆'.repeat(3 - s)}`,
            lines: [`떨어진 횟수 ${st.falls}번`, s < 3 ? `★★★까지: ${CFG.stars[0]}초 이내 (트램펄린 지름길을 써 봐요)` : '최고 등급! 더 빨리 올라갈 수 있을까요?', '꼭대기에서 보는 도시 풍경도 즐겨 보세요'],
          });
        }
      } else if (st.t >= CFG.limit) {
        return ctx.finish({
          success: false, record: null, big: '시간 초과',
          title: '아쉬워요! ⏰',
          lines: [`${CHECKS.length}개 중 체크포인트 ${st.check + 1}개까지 갔어요.`, '팁: 높은 발판은 첫 점프의 꼭대기에서 한 번 더!'],
        });
      }
      if (ctx.hudDue(dt)) stats();
    },
    onKey() {},
    exit() {
      lava.visible = false; st = null;
      moverP.z = -49.5; mover.position.z = -49.5;
      G.explore.setMarkersVisible(true);
    },
  });
})(window.G);
