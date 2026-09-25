'use strict';
/* ═══════════════════════════════════════════════════════════════
   main.js — 시작 화면과 단일 렌더 루프
   · requestAnimationFrame 하나만 돈다. dt 상한 0.05초 (원본과 같음)
   · 자기 씬을 쓰는 게임 중에는 도시 애니메이션을 멈추고 그 게임 씬만 그린다
   ═══════════════════════════════════════════════════════════════ */
(function (G) {
  const $ = G.$, E = G.explore, P = G.play, renderer = G.renderer;

  // 정적 장식 상자를 한 번에 합쳐 그리기 횟수를 줄인다 (places.js까지 다 모은 뒤)
  G.cityBatch.build(G.scene);
  E.buildMarkers();
  G.hub.refresh();

  const cams = [G.camera];
  G.addCamera = c => { cams.push(c); resize(); };
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    for (const c of cams) { c.aspect = w / h; c.updateProjectionMatrix(); }
  }
  addEventListener('resize', resize);
  resize();

  /* ── 시작 화면 ── */
  G.main = {
    begin() {
      if (E.mode !== 'title') return;
      G.sfx.unlock(); G.sfx.play('click');
      $('title').hidden = true;
      ['topbar', 'mapDock'].forEach(id => { $(id).hidden = false; });
      E.begin();
      const found = Object.keys(G.store.data.found).length;
      G.toast(found ? (G.touch ? '다시 오신 걸 환영해요! 🎮 미니게임 버튼으로 수첩을 열어요' : '다시 오신 걸 환영해요! Tab으로 미니게임 수첩을 열 수 있어요') : (G.touch ? '빛기둥이 미니게임이에요. 가까이 가서 「시작」!' : '빛기둥이 서 있는 곳이 미니게임이에요. 가까이 가서 E!'), 4200);
    },
  };
  $('startBtn').addEventListener('click', () => G.main.begin());
  if (G.touch) document.body.classList.add('touch');
  document.body.classList.add('dev-' + G.DEVICE);

  /* ── 렌더 루프 ── */
  let last = performance.now(), swingT = 0, offset = 0;   // offset: 점검용 step()이 앞당긴 시간
  function tick(real) {
    requestAnimationFrame(tick);
    const now = real + offset;
    const dt = G.clamp((now - last) / 1000, 0, 0.05);
    last = now;
    const def = P.current;
    const ownScene = def && def.world === 'own' && P.state !== 'idle';
    if (!ownScene) {
      G.world.update(dt, now);
      swingT += dt;
      if (G.swings) G.swings.forEach((s, i) => { s.rotation.x = Math.sin(swingT * 1.6 + i * 1.3) * 0.35; });
      G.updateSignal?.(dt);
      for (const f of G.ambient) f(dt, now);
    }
    if (def) P.update(dt, now);
    E.update(dt, now);
    if (ownScene) renderer.render(def.scene, def.camera);
    else renderer.render(G.scene, G.camera);
  }
  E.applyOrbit();
  requestAnimationFrame(tick);

  /** 자동 점검용: 그리지 않고 게임 시간만 frames번 진행한다 (콘솔: PlayCity.step(60)) */
  G.step = (frames = 1, dt = 1 / 60) => {
    for (let i = 0; i < frames; i++) {
      offset += dt * 1000; last += dt * 1000;
      const now = last, def = P.current;
      if (!(def && def.world === 'own' && P.state !== 'idle')) { G.world.update(dt, now); G.updateSignal?.(dt); for (const f of G.ambient) f(dt, now); }
      if (def) P.update(dt, now);
      E.update(dt, now);
    }
  };
  // 디버그·자동 점검용 (콘솔에서 G로 모든 상태를 볼 수 있다)
  window.PlayCity = G;
})(window.G);
