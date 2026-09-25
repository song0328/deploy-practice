'use strict';
/* ═══════════════════════════════════════════════════════════════
   hub.js — 미니게임 등록·진행·결과·기록 + 미니게임 수첩(허브) 화면
   · 새 게임은 js/games/ 에 파일 하나 만들고 G.registerGame({...})만 부르면
     마커·미니맵·허브·기록·일시정지·결과 화면이 자동으로 붙는다.
   · 게임 파일이 채우는 항목은 아래 registerGame 주석 참고.
   ═══════════════════════════════════════════════════════════════ */
(function (G) {
  const $ = G.$, E = () => G.explore;

  /* ═══════════ 게임 등록 ═══════════
     필수: id, name, icon, color, tagline, rules[], controlsKey, controlsTouch,
           format(v)  기록 표시, better(a,b)  a가 b보다 좋은 기록인가
           world: 'city'(도시 씬에서 진행) | 'own'(자기 씬: scene·camera 제공)
           init(ctx) 처음 한 번, enter(ctx) 장소 준비, start(ctx) 새 판, update(dt,now,ctx),
           exit(ctx) 정리, onKey(e,down,ctx)
     선택: walkGame(걷기 조작 사용), spotRadius, onBlur(ctx) */
  G.games = [];
  G.registerGame = def => {
    def.spot = def.spot || G.SPOTS[def.id];
    def.better = def.better || ((a, b) => a > b);
    def.format = def.format || (v => String(v));
    G.games.push(def);
  };
  const gameById = id => G.games.find(g => g.id === id);

  /* ═══════════ 게임 화면 공통 도구 (ctx) ═══════════ */
  const statBox = $('hudStats');
  let statCache = [];
  const ctx = {
    G,
    layer: $('gameLayer'),
    /** 상단 점수판. [{label, value, warn}] — 바뀐 칸만 다시 쓴다 */
    setStats(list) {
      if (statCache.length !== list.length) {
        statBox.innerHTML = '';
        statCache = list.map(() => {
          const el = document.createElement('div'); el.className = 'stat';
          el.innerHTML = '<span class="l"></span><b class="v"></b>';
          statBox.appendChild(el);
          return { el, l: el.firstChild, v: el.lastChild, label: null, value: null, warn: null };
        });
      }
      list.forEach((s, i) => {
        const c = statCache[i];
        if (c.label !== s.label) { c.l.textContent = s.label; c.label = s.label; }
        const v = String(s.value);
        if (c.value !== v) { c.v.textContent = v; c.value = v; }
        const w = !!s.warn;
        if (c.warn !== w) { c.el.classList.toggle('warn', w); c.warn = w; }
      });
    },
    /** 화면 가운데 큰 글자 */
    flash(text, cls = '', ms = 900) {
      const f = $('hudFlash');
      f.textContent = text;
      f.className = 'show ' + cls;
      clearTimeout(ctx._flashT);
      ctx._flashT = setTimeout(() => { f.className = ''; }, ms);
    },
    /** 아래쪽 한 줄 안내 */
    hint(text) { $('hudHint').textContent = text || ''; $('hudHint').hidden = !text; },
    finish(result) { G.play.finish(result); },
    /** 점수판은 1초에 10번만 새로 쓴다 (매 프레임 객체를 만들지 않도록) */
    hudDue(dt) { ctx._hudT = (ctx._hudT || 0) - dt; if (ctx._hudT > 0) return false; ctx._hudT = 0.1; return true; },
    /** 도시 씬 게임용: 카메라를 목표 위치로 부드럽게 옮긴다 */
    easeCamera(pos, look, dt, speed = 4) {
      const cam = G.camera, k = 1 - Math.exp(-speed * dt);
      cam.position.lerp(pos, k);
      ctx._look = ctx._look || new THREE.Vector3();
      if (!ctx._lookInit) { ctx._look.copy(look); ctx._lookInit = true; }
      ctx._look.lerp(look, k);
      cam.lookAt(ctx._look);
    },
    snapCamera(pos, look) {
      G.camera.position.copy(pos);
      ctx._look = ctx._look || new THREE.Vector3();
      ctx._look.copy(look); ctx._lookInit = true;
      G.camera.lookAt(look);
    },
    touch: G.touch,
  };
  G.ctx = ctx;

  /* ═══════════ 진행 상태 기계: idle → intro → play ⇄ paused → over ═══════════ */
  const P = G.play = {
    current: null, state: 'idle', snap: null, pausedAt: 0,
    start(id) {
      const def = gameById(id);
      if (!def || P.current) return;
      G.hub.close(true);
      G.sfx.unlock(); G.sfx.play('click');
      P.snap = E().suspend();
      $('toasts').innerHTML = '';
      P.current = def;
      G.store.data.found[id] = true;
      if (!def._inited) { def.init(ctx); def._inited = true; }
      ctx._lookInit = false;
      document.body.classList.add('game-' + def.id);
      $('gameHud').hidden = false;
      $('hudTitle').textContent = `${def.icon} ${def.name}`;
      ctx.setStats([]); ctx.hint('');
      const go = () => {
        if (def.walkGame) { const ex = E(); ex.walkGame = true; ex.walking = true; G.renderer.domElement.classList.add('walking'); ex.refreshUi(); }
        def.enter(ctx);
        P.showIntro();
      };
      if (def.world === 'own') fade(go); else go();
    },
    showIntro() {
      const def = P.current;
      P.state = 'intro';
      $('introIcon').textContent = def.icon;
      $('introIcon').style.background = def.color;
      $('introName').textContent = def.name;
      const rec = G.store.game(def.id);
      $('introRec').textContent = rec.best !== null ? `내 최고 기록: ${def.format(rec.best)}` : '첫 도전이에요!';
      $('introGo').textContent = G.touch ? '▶ 시작' : '▶ 시작 (Space)';
      $('intro').hidden = false;
      setTimeout(() => $('introGo').focus({ preventScroll: true }), 30);
    },
    go() {
      if (P.state !== 'intro' && P.state !== 'over' && P.state !== 'paused') return;
      $('intro').hidden = true; $('result').hidden = true; $('pause').hidden = true;
      document.activeElement?.blur?.();
      P.state = 'play';
      G.store.game(P.current.id).plays++;
      P.current.start(ctx);
    },
    update(dt, now) {
      if (P.current && (P.state === 'play' || (P.current.idleUpdate && P.state !== 'paused'))) P.current.update(dt, now, ctx, P.state);
    },
    pause() {
      if (P.state !== 'play') return;
      P.state = 'paused'; P.pausedAt = performance.now();
      P.current.onBlur?.(ctx);
      E().clearMovement();
      $('pause').hidden = false;
      setTimeout(() => $('pauseResume').focus({ preventScroll: true }), 30);
    },
    resume() {
      if (P.state !== 'paused') return;
      $('pause').hidden = true;
      document.activeElement?.blur?.();
      P.state = 'play';
    },
    finish(r) {
      if (P.state !== 'play') return;
      const def = P.current;
      P.state = 'over';
      def.onBlur?.(ctx);
      E().clearMovement();
      if (document.pointerLockElement) document.exitPointerLock();
      G.store.load();   // 다른 탭에서 남긴 기록을 먼저 읽고 그 위에 더한다 (서로 덮어쓰지 않게)
      G.store.data.found[def.id] = true;
      const rec = G.store.game(def.id);
      const score = r.record;
      let isNew = false;
      if (score !== undefined && score !== null && (r.success || def.recordOnFail !== false)) {
        if (rec.best === null || def.better(score, rec.best)) { rec.best = score; isNew = true; }
      }
      const allBefore = G.games.every(g => G.store.game(g.id).clears > 0);
      if (r.success) rec.clears++;
      G.store.save();
      if (r.success && !allBefore && G.games.every(g => G.store.game(g.id).clears > 0)) {
        r.lines = [...(r.lines || []), `🏆 <b>놀이도시 정복!</b> 미니게임 ${G.games.length}개를 모두 성공했어요!`];
      }
      if (r.success) E().refreshMarker(def.id);
      G.hub.refresh();
      G.sfx.play(r.success ? 'win' : 'lose');
      $('resIcon').textContent = def.icon;
      $('resIcon').style.background = def.color;
      $('resTitle').textContent = r.title || (r.success ? '성공!' : '아쉬워요!');
      $('resTitle').className = r.success ? 'good' : 'bad';
      $('resBig').textContent = r.big ?? '';
      $('resLines').innerHTML = (r.lines || []).map(l => `<li>${l}</li>`).join('');
      $('resBest').textContent = rec.best !== null ? `최고 기록 ${def.format(rec.best)}` : '';
      $('resNew').hidden = !isNew;
      setTimeout(() => {
        if (P.state !== 'over') return;
        $('result').hidden = false;
        $('resRetry').focus({ preventScroll: true });
      }, r.delay ?? 700);
    },
    retry() {
      if (!P.current || (P.state !== 'over' && P.state !== 'paused')) return;   // 키·클릭이 겹쳐 두 번 불려도 한 번만
      $('result').hidden = true; $('pause').hidden = true;
      P.state = 'over';
      P.go();
    },
    exit(then) {
      const def = P.current;
      if (!def) return;
      $('intro').hidden = $('result').hidden = $('pause').hidden = true;
      $('gameHud').hidden = true;
      $('hudFlash').className = '';
      ctx.hint('');
      const done = () => {
        def.exit(ctx);
        document.body.classList.remove('game-' + def.id);
        P.current = null; P.state = 'idle';
        E().resume(P.snap, { blend: def.world !== 'own' });
        P.snap = null;
        G.hub.refresh();
        if (then) then();
      };
      if (def.world === 'own') fade(done); else done();
    },
    onKey(e, down) {
      const def = P.current, code = e.code;
      if (!down) { if (P.state === 'play') (def.walkGame ? E().onKey(e, false) : def.onKey(e, false, ctx)); return; }
      if (P.state === 'intro') {
        if (code === 'Space' || code === 'Enter') { e.preventDefault(); P.go(); }
        else if (code === 'Escape') P.exit();
        return;
      }
      if (P.state === 'over') {
        if (!$('result').hidden) {
          if (code === 'KeyR' || code === 'Enter' || code === 'Space') { e.preventDefault(); P.retry(); }
          else if (code === 'Escape') P.exit();
          else if (code === 'Tab') { e.preventDefault(); P.exit(() => G.hub.open()); }
        }
        return;
      }
      if (P.state === 'paused') {
        if (code === 'Escape' && performance.now() - P.pausedAt > 350) P.resume();
        else if (code === 'Enter' || code === 'Space') { e.preventDefault(); P.resume(); }
        else if (code === 'KeyR') P.retry();
        else if (code === 'KeyQ') P.exit();
        return;
      }
      if (P.state === 'play') {
        if (code === 'Escape' || code === 'KeyP') { P.pause(); return; }
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) e.preventDefault();
        if (def.walkGame && E().onKey(e, true)) return;
        def.onKey(e, true, ctx);
      }
    },
  };

  /* 검은 화면 전환 (자기 씬을 쓰는 게임) */
  function fade(mid) {
    const f = $('fade');
    if (G.reduceMotion) { mid(); return; }
    f.classList.add('on');
    setTimeout(() => { mid(); requestAnimationFrame(() => f.classList.remove('on')); }, 230);
  }

  $('introGo').addEventListener('click', () => P.go());
  $('introBack').addEventListener('click', () => P.exit());
  $('resRetry').addEventListener('click', () => P.retry());
  $('resHub').addEventListener('click', () => P.exit(() => G.hub.open()));
  $('resExit').addEventListener('click', () => P.exit());
  $('pauseResume').addEventListener('click', () => P.resume());
  $('pauseRetry').addEventListener('click', () => P.retry());
  $('pauseExit').addEventListener('click', () => P.exit());
  $('hudPause').addEventListener('click', () => (P.state === 'paused' ? P.resume() : P.pause()));
  addEventListener('blur', () => P.pause());
  document.addEventListener('visibilitychange', () => { if (document.hidden) P.pause(); });

  /* ═══════════ 미니게임 수첩 (허브) ═══════════ */
  let prevMode = null;
  const H = G.hub = {
    isOpen: false,
    open() {
      if (H.isOpen || P.current) return;
      const ex = E();
      prevMode = ex.mode;
      if (ex.mode === 'title') return;
      ex.clearMovement();
      ex.mode = 'menu';
      if (document.pointerLockElement) document.exitPointerLock();
      H.refresh();
      $('hub').hidden = false; H.isOpen = true;
      G.sfx.play('click');
      setTimeout(() => $('hubClose').focus({ preventScroll: true }), 30);
    },
    close(silent) {
      if (!H.isOpen) return;
      $('hub').hidden = true; H.isOpen = false;
      const ex = E();
      if (!silent || ex.mode === 'menu') {
        ex.mode = prevMode === 'walk' ? 'walk' : 'orbit';
      }
      document.activeElement?.blur?.();
    },
    refresh() {
      const total = G.games.length, cleared = G.games.filter(g => G.store.game(g.id).clears > 0).length;
      $('hubBtnCount').textContent = `★ ${cleared}/${total}`;
      $('hubProgress').textContent = `성공한 게임 ★ ${cleared} / ${total}`;
      if (!H.isOpen && !$('hub').hidden === false) { /* 닫혀 있으면 목록은 열 때 다시 그린다 */ }
      const list = $('hubList');
      list.innerHTML = '';
      G.games.forEach((def, i) => {
        const rec = G.store.game(def.id), found = !!G.store.data.found[def.id];
        const card = document.createElement('article');
        card.className = 'gcard' + (rec.clears ? ' cleared' : '') + (found ? '' : ' locked');
        card.innerHTML = `
          <div class="gtop"><span class="gicon" style="background:${def.color}">${def.icon}</span>
            <div><h3>${i + 1}. ${G.esc(def.name)}</h3><p class="gplace">📍 ${G.esc(def.place)}</p></div>
            <span class="gstate">${rec.clears ? '★ 성공' : found ? '발견' : '미발견'}</span></div>
          <p class="gtag">${G.esc(def.tagline)}</p>
          <p class="grec">${rec.best !== null ? `최고 기록 <b>${G.esc(def.format(rec.best))}</b> · ${rec.plays}판` : found ? '아직 기록이 없어요' : '도시에서 마커를 찾아가 E를 누르면 열려요'}</p>
          <div class="gbtns"><button type="button" class="ghostBtn" data-act="where">📍 위치 보기</button>
            <button type="button" class="playBtn" data-act="play" ${found ? '' : 'disabled'}>${rec.plays ? '▶ 다시 하기' : '▶ 하기'}</button></div>`;
        card.querySelector('[data-act="where"]').addEventListener('click', () => {
          H.close(true);
          const ex = E();
          ex.mode = 'orbit';
          if (ex.walking) ex.exitWalk({ keepOrbit: true });
          ex.focusMap({ x: def.spot.x, y: 2, z: def.spot.z, dist: 52 }, `${def.icon} ${def.name} — ${def.place}`);
        });
        card.querySelector('[data-act="play"]').addEventListener('click', () => { if (found) P.start(def.id); });
        list.appendChild(card);
      });
    },
  };
  $('hubBtn').addEventListener('click', () => (H.isOpen ? H.close() : H.open()));
  $('hubClose').addEventListener('click', () => H.close());
  $('hubReset').addEventListener('click', () => {
    if (!confirm('모든 미니게임 기록과 발견 표시를 지울까요?')) return;
    G.store.data.games = {}; G.store.data.found = {}; G.store.save();
    G.games.forEach(g => E().refreshMarker(g.id));
    H.refresh();
  });
  const soundBtn = $('soundBtn');
  const paintSound = () => { soundBtn.textContent = G.sfx.muted ? '🔇' : '🔊'; soundBtn.setAttribute('aria-label', G.sfx.muted ? '소리 켜기' : '소리 끄기'); };
  soundBtn.addEventListener('click', () => { G.sfx.setMuted(!G.sfx.muted); paintSound(); G.sfx.play('click'); });
  paintSound();

  /* ═══════════ 키보드 한 곳에서 나눠 준다: 게임 / 허브 / 탐험 ═══════════ */
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (e.isComposing) return;
    G.sfx.unlock();
    if (P.current) { P.onKey(e, true); return; }
    if (H.isOpen) {
      if (e.code === 'Escape' || e.code === 'Tab') { e.preventDefault(); H.close(); }
      return;
    }
    const ex = E();
    if (ex.mode === 'title') {
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); G.main.begin(); }
      return;
    }
    if (e.code === 'Tab') { e.preventDefault(); H.open(); return; }
    ex.onKey(e, true);
  });
  addEventListener('keyup', e => {
    if (P.current) P.onKey(e, false);
    E().onKey(e, false);
  });
})(window.G);
