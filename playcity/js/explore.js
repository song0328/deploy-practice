'use strict';
/* ═══════════════════════════════════════════════════════════════
   explore.js — 탐험 조작: 1인칭 걷기 · 도시 조망 카메라 · 미니맵 · 게임 마커
   · 걷기 수치(속도·점프·중력)는 WALK_CFG 한곳에 모았다
   · 원본 베이스의 조작을 그대로 옮기고, 걷기 속도만 8 → 12로 올렸다
   ═══════════════════════════════════════════════════════════════ */
(function (G) {
  const T = THREE, $ = G.$, camera = G.camera, canvas = G.renderer.domElement;

  const WALK_CFG = G.WALK_CFG = {
    walk: 12, run: 14,             // 맵 단위/초 (걷기, Shift 질주)
    jump: 5.6, airJump: 5.2,        // 첫 점프·공중 재점프 수직 속도
    air: 0.6,                       // 공중에서의 좌우·앞뒤 이동 속도 배율 (1이면 땅과 같음)
    gravity: 16, eye: 2.1,          // 중력, 눈높이
    look: 0.0024, drag: 0.004,      // 마우스 잠금 감도, 드래그 감도
  };
  // 폰 세로 화면은 도시 전체가 들어오게 더 멀리서 본다
  const HOME_VIEW = { theta: -0.38, phi: 0.76, dist: G.DEVICE === 'phone' ? 205 : 158, x: 0, y: 3, z: 0 };
  const orbit = { theta: HOME_VIEW.theta, phi: HOME_VIEW.phi, dist: HOME_VIEW.dist, target: new T.Vector3(0, 3, 0) };
  const walk = { pos: new T.Vector3(G.LAYOUT.spawn.x, WALK_CFG.eye, G.LAYOUT.spawn.z), yaw: G.LAYOUT.spawn.yaw, pitch: 0, vy: 0, keys: {}, jumps: 0, bob: 0, turnTo: null };

  const E = G.explore = {
    mode: 'title',        // title | orbit | walk | game
    walking: false,
    walk, orbit, HOME_VIEW,
    near: null,           // 지금 가까이 있는 마커
    walkGame: false,      // 걷기 조작을 쓰는 미니게임(점프 챌린지) 중이면 true
  };
  const active = () => E.mode === 'orbit' || E.mode === 'walk' || (E.mode === 'game' && E.walkGame);

  /* ═══════════ 조망 카메라 ═══════════ */
  let cameraTrip = null, introAt = 0, mapExpanded = false;
  function applyOrbit() {
    const { theta, phi, dist, target } = orbit;
    camera.position.set(
      target.x + dist * Math.cos(phi) * Math.sin(theta),
      target.y + dist * Math.sin(phi),
      target.z + dist * Math.cos(phi) * Math.cos(theta));
    camera.lookAt(target);
  }
  function stopCameraTrip() { introAt = 0; cameraTrip = null; }
  function clampOrbit() {
    orbit.phi = G.clamp(orbit.phi, 0.25, 1.3);
    orbit.dist = G.clamp(orbit.dist, 28, 220);
    orbit.target.x = G.clamp(orbit.target.x, -70, 70);
    orbit.target.z = G.clamp(orbit.target.z, -68, 72);
  }
  function panMap(dx, dy) {
    const scale = 2 * orbit.dist * Math.tan(camera.fov * Math.PI / 360) / innerHeight;
    const c = Math.cos(orbit.theta), s = Math.sin(orbit.theta);
    orbit.target.x += (-dx * c - dy * s) * scale;
    orbit.target.z += (dx * s - dy * c) * scale;
    clampOrbit();
  }
  function zoomMap(f) { stopCameraTrip(); orbit.dist *= f; clampOrbit(); }
  function focusMap(view) {
    if (E.walking) exitWalk();
    stopCameraTrip();
    const to = { theta: view.theta ?? orbit.theta, phi: view.phi ?? 0.72, dist: view.dist, x: view.x, y: view.y ?? 2, z: view.z };
    cameraTrip = { at: performance.now(), from: { theta: orbit.theta, phi: orbit.phi, dist: orbit.dist, x: orbit.target.x, y: orbit.target.y, z: orbit.target.z }, to };
  }
  function updateCameraTrip(now) {
    if (!cameraTrip) return;
    const t = G.reduceMotion ? 1 : Math.min(1, (now - cameraTrip.at) / 700), k = G.smooth(t);
    const { from, to } = cameraTrip;
    for (const key of ['theta', 'phi', 'dist']) orbit[key] = from[key] + (to[key] - from[key]) * k;
    orbit.target.set(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, from.z + (to.z - from.z) * k);
    if (t === 1) cameraTrip = null;
  }
  E.focusMap = focusMap;
  E.applyOrbit = applyOrbit;

  /* ═══════════ 카메라 부드러운 전환 (걷기↔조망, 게임→탐험) ═══════════ */
  const blend = { on: false, at: 0, dur: 0.6, pos: new T.Vector3(), quat: new T.Quaternion() };
  const _q = new T.Quaternion();
  E.startBlend = (dur = 0.6) => {
    if (G.reduceMotion || dur <= 0) { blend.on = false; return; }
    blend.on = true; blend.at = performance.now(); blend.dur = dur;
    blend.pos.copy(camera.position); blend.quat.copy(camera.quaternion);
  };
  function applyBlend(now) {
    if (!blend.on) return;
    const k = G.smooth(Math.min(1, (now - blend.at) / 1000 / blend.dur));   // 실제 시간 기준 (느린 기기에서도 같은 길이)
    camera.position.lerpVectors(blend.pos, camera.position, k);
    _q.copy(blend.quat).slerp(camera.quaternion, k);
    camera.quaternion.copy(_q);
    if (k >= 1) blend.on = false;
  }

  /* ═══════════ 마우스·터치 (조망 회전/이동/확대, 걷기 둘러보기) ═══════════ */
  const pointers = new Map();
  let gesture = null, downAt = null;
  function readGesture() {
    const p = [...pointers.values()];
    if (!p.length) return null;
    return {
      x: p.reduce((s, v) => s + v.x, 0) / p.length, y: p.reduce((s, v) => s + v.y, 0) / p.length,
      distance: p.length > 1 ? Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y) : 0, count: p.length,
    };
  }
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  /* ── 터치 조이스틱: 화면 왼쪽 아무 데나 누르면 그 자리에 원형 조작기가 생긴다 (마인크래프트·모바일 게임식) ──
     끝까지 밀면 질주. 오른쪽 화면을 밀면 둘러보기 */
  const JOY_R = G.DEVICE_CFG.joyR;
  document.documentElement.style.setProperty('--joy', JOY_R * 2 + 16 + 'px');
  let joyUsed = false;                          // 조작기 반지름(px)
  const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, el: $('joy'), knob: $('joyKnob') };
  walk.stick = { x: 0, y: 0 };               // 오른쪽·앞으로 (-1~1)
  function joyStart(e) {
    joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY;
    joy.el.style.left = joy.ox + 'px'; joy.el.style.top = joy.oy + 'px';
    joy.knob.style.transform = 'translate(-50%,-50%)';
    joy.el.hidden = false; joyUsed = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 합성 이벤트 */ }
  }
  function joyMove(e) {
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
    joy.knob.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
    const m = Math.min(1, d / JOY_R), dead = 0.12;
    walk.stick.x = m < dead ? 0 : (dx / Math.max(Math.hypot(dx, dy), 1e-6)) * (m - dead) / (1 - dead);
    walk.stick.y = m < dead ? 0 : (-dy / Math.max(Math.hypot(dx, dy), 1e-6)) * (m - dead) / (1 - dead);
    joy.el.classList.toggle('run', m > 0.94);
  }
  function joyEnd() {
    if (joy.id === null) return;
    try { if (canvas.hasPointerCapture(joy.id)) canvas.releasePointerCapture(joy.id); } catch (err) { /* 무시 */ }
    joy.id = null; walk.stick.x = walk.stick.y = 0;
    joy.el.hidden = true; joy.el.classList.remove('run');
  }
  E.joyEnd = joyEnd;
  canvas.addEventListener('pointerdown', e => {
    if (!active() || ![0, 1, 2].includes(e.button)) return;
    if (E.walking && (e.pointerType === 'touch' || G.DEVICE !== 'pc') && joy.id === null && e.clientX < innerWidth * 0.45) { stopCameraTrip(); joyStart(e); return; }
    stopCameraTrip();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.button !== 0 || e.shiftKey });
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 합성 이벤트 */ }
    gesture = readGesture();
    canvas.style.cursor = E.walking ? 'crosshair' : 'grabbing';
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId === joy.id) { joyMove(e); return; }
    if (!active()) return;
    if (E.walking && document.pointerLockElement === canvas) {
      walk.yaw -= e.movementX * WALK_CFG.look;
      walk.pitch = G.clamp(walk.pitch - e.movementY * WALK_CFG.look, -1.15, 1.15);
      walk.turnTo = null;
      return;
    }
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    const next = readGesture();
    if (gesture && next.count === gesture.count) {
      const dx = next.x - gesture.x, dy = next.y - gesture.y;
      if (E.walking) {
        const sens = e.pointerType === 'touch' ? WALK_CFG.drag * 1.3 : WALK_CFG.drag;
        walk.yaw -= dx * sens;
        walk.pitch = G.clamp(walk.pitch - dy * sens, -1.15, 1.15);
        walk.turnTo = null;
      } else if (next.count > 1) {
        panMap(dx, dy);
        if (gesture.distance > 8 && next.distance > 8) orbit.dist *= gesture.distance / next.distance;
        clampOrbit();
      } else if (p.pan || e.shiftKey) panMap(dx, dy);
      else { orbit.theta -= dx * 0.005; orbit.phi += dy * 0.004; clampOrbit(); }
    }
    gesture = next;
  });
  function releasePointer(e) {
    if (e.pointerId === joy.id) { joyEnd(); return; }
    pointers.delete(e.pointerId);
    gesture = readGesture();
    try { if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    canvas.style.cursor = E.walking ? 'crosshair' : 'grab';
    // 걷기 중 화면을 "클릭"(끌지 않음)하면 마우스 잠금을 다시 건다 (Esc로 풀린 뒤 복귀용)
    if (e.type === 'pointerup' && downAt && E.walking && !G.touch && document.pointerLockElement !== canvas &&
        Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5 && performance.now() - downAt.t < 350) requestLock();
    downAt = null;
  }
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('lostpointercapture', e => { if (e.pointerId === joy.id) joyEnd(); pointers.delete(e.pointerId); gesture = readGesture(); });
  canvas.addEventListener('wheel', e => {
    if (!active() || E.walking) return;
    e.preventDefault();
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
    zoomMap(Math.exp(G.clamp(delta, -300, 300) * 0.0015));
  }, { passive: false });

  /* ═══════════ 키보드 (hub.js가 탐험 중일 때만 여기로 보낸다) ═══════════ */
  const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight']);
  E.onKey = (e, down) => {
    if (!down) { walk.keys[e.code] = false; return false; }
    if (e.code === 'Escape') {
      if (mapExpanded) setMapExpanded(false);
      return true;
    }
    if (E.mode === 'game' && !E.walkGame) return false;
    if (E.walking && movementKeys.has(e.code)) {
      e.preventDefault();
      walk.keys[e.code] = true;
      if (e.code === 'Space' && !e.repeat) jump();
      return true;
    }
    if (E.mode === 'game') return false;
    if (e.code === 'KeyE' && !e.repeat && E.near) { G.play.start(E.near.id); return true; }
    if (e.code === 'KeyM' && !e.repeat) { E.walking ? exitWalk() : enterWalk(); return true; }
    return false;
  };
  function clearMovement() {
    walk.keys = {};
    pointers.clear(); gesture = null;
    joyEnd();
  }
  E.clearMovement = clearMovement;
  addEventListener('blur', clearMovement);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearMovement(); });

  /* ═══════════ 걷기 ↔ 조망 전환 ═══════════ */
  function setMapExpanded(v) {
    mapExpanded = v;
    document.body.classList.toggle('map-expanded', v);
    $('mapBig').textContent = v ? '지도 작게' : '지도 크게';
    $('mapBig').setAttribute('aria-pressed', String(v));
  }
  // 마우스 잠금은 화면을 직접 클릭했을 때만 건다. 막힌 환경(웹 페이지 안 틀 등)이면 다시 시도하지 않고 드래그로 둘러본다
  let lockBlocked = false;
  function requestLock() {
    if (G.touch || lockBlocked || !canvas.requestPointerLock) return;
    try {
      const r = canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => pointerLockFallback());
    } catch (err) { pointerLockFallback(); }
  }
  function enterWalk(opts = {}) {
    if (E.mode === 'title') return;
    stopCameraTrip(); setMapExpanded(false); clearMovement(); keepWalkerClear();
    if (!opts.noBlend) E.startBlend(0.55);
    E.walking = true;
    if (E.mode !== 'game') E.mode = 'walk';
    document.activeElement?.blur?.();
    document.body.classList.add('walking');
    canvas.classList.add('walking');
    $('walkBtn').textContent = '🌐 조망';
    E.refreshUi();
  }
  function pointerLockFallback() { lockBlocked = true; }
  function exitWalk(opts = {}) {
    E.walking = false; clearMovement(); walk.vy = 0;
    walk.pos.y = G.groundHeight(walk.pos.x, walk.pos.z, walk.pos.y - WALK_CFG.eye) + WALK_CFG.eye;
    canvas.classList.remove('walking', 'locked');
    canvas.style.cursor = 'grab';
    document.body.classList.remove('walking');
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    $('walkBtn').textContent = '🚶 걷기';
    if (E.mode !== 'game') {
      E.mode = 'orbit';
      if (!opts.keepOrbit) {
        // 걷던 자리를 내려다보도록 조망 목표를 옮긴다
        orbit.target.set(walk.pos.x, 2, walk.pos.z);
        orbit.theta = walk.yaw; orbit.dist = Math.max(orbit.dist, 70); orbit.phi = Math.max(orbit.phi, 0.7);
        clampOrbit();
      }
      E.startBlend(0.6);
    }
    setMapExpanded(false);
    E.refreshUi();
  }
  E.enterWalk = enterWalk; E.exitWalk = exitWalk; E.requestLock = requestLock;
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    const wasLocked = canvas.classList.contains('locked');
    canvas.classList.toggle('locked', locked);
    if (!locked && wasLocked && E.walking) {
      // Esc로 잠금이 풀리면 마우스만 풀어 준다 (걷기는 그대로, 조망 전환은 M·버튼으로). 점프 챌린지 중엔 일시정지
      clearMovement();
      if (E.mode === 'game' && E.walkGame) G.play.pause();
    }
  });
  document.addEventListener('pointerlockerror', pointerLockFallback);

  // 터치 방향·점프 버튼
  $('jumpBtn').addEventListener('pointerdown', e => { e.preventDefault(); if (E.walking && active()) jump(); });

  /* ═══════════ 걷기 물리 (원본 규칙 그대로 + 발판 위 서기) ═══════════ */
  function keepWalkerClear() {
    const feet = walk.pos.y - WALK_CFG.eye;
    if (G.canStand(walk.pos.x, walk.pos.z, feet)) return;
    let safe = { x: G.LAYOUT.spawn.x, z: G.LAYOUT.spawn.z };
    search: for (let radius = 0.5; radius <= 12; radius += 0.5) {
      for (let a = 0; a < 16; a++) {
        const h = walk.yaw + a * Math.PI / 8;
        const x = walk.pos.x - Math.sin(h) * radius, z = walk.pos.z - Math.cos(h) * radius;
        if (G.canStand(x, z, 0)) { safe = { x, z }; break search; }
      }
    }
    walk.pos.set(safe.x, G.groundHeight(safe.x, safe.z) + WALK_CFG.eye, safe.z);
    walk.vy = 0; clearMovement();
  }
  E.keepWalkerClear = keepWalkerClear;
  function jump() {
    const floor = G.groundHeight(walk.pos.x, walk.pos.z, walk.pos.y - WALK_CFG.eye) + WALK_CFG.eye + 0.02;
    if (walk.pos.y <= floor) { walk.vy = WALK_CFG.jump; walk.jumps = 1; G.sfx.play('hop'); }
    else if (walk.jumps === 1) { walk.vy = WALK_CFG.airJump; walk.jumps = 2; G.sfx.play('hop'); }
  }
  E.jump = jump;
  function stepWalk(dt) {
    const key = walk.keys;
    let forward = Number(!!(key.KeyW || key.ArrowUp)) - Number(!!(key.KeyS || key.ArrowDown));
    let right = Number(!!(key.KeyD || key.ArrowRight)) - Number(!!(key.KeyA || key.ArrowLeft));
    const length = Math.hypot(forward, right) || 1;
    forward /= length; right /= length;                         // 대각선 속도 정규화
    let speed = (key.ShiftLeft || key.ShiftRight) ? WALK_CFG.run : WALK_CFG.walk;
    const sm = Math.hypot(walk.stick.x, walk.stick.y);
    if (sm > 0 && !forward && !right) {
      // 조이스틱: 민 만큼 걷고, 끝까지 밀면 질주
      forward = walk.stick.y; right = walk.stick.x;
      if (sm > 1) { forward /= sm; right /= sm; }
      speed = sm > 0.92 ? WALK_CFG.run : WALK_CFG.walk;
    }
    const airborne = walk.pos.y > G.groundHeight(walk.pos.x, walk.pos.z, walk.pos.y - WALK_CFG.eye) + WALK_CFG.eye + 0.01;
    if (airborne) speed *= WALK_CFG.air;
    const dx = (-Math.sin(walk.yaw) * forward + Math.cos(walk.yaw) * right) * speed * dt;
    const dz = (-Math.cos(walk.yaw) * forward - Math.sin(walk.yaw) * right) * speed * dt;
    const feet = walk.pos.y - WALK_CFG.eye;
    if (G.canStand(walk.pos.x + dx, walk.pos.z, feet)) walk.pos.x += dx;   // X, Z 따로 검사 → 벽 미끄러짐
    if (G.canStand(walk.pos.x, walk.pos.z + dz, feet)) walk.pos.z += dz;
    const floor = G.groundHeight(walk.pos.x, walk.pos.z, walk.pos.y - WALK_CFG.eye) + WALK_CFG.eye;
    walk.pos.y += walk.vy * dt - 7 * dt * dt;
    walk.vy -= WALK_CFG.gravity * dt;
    if (walk.pos.y <= floor) {
      if (walk.vy < -9 && E.onLand) E.onLand(walk.vy);
      walk.pos.y = floor; walk.vy = 0; walk.jumps = 0;
      walk.bob = (forward || right) ? walk.bob + dt * (speed === WALK_CFG.run ? 16 : 10) : 0;
    } else if (walk.jumps === 0 && walk.pos.y > floor + 0.05) {
      walk.jumps = 1;   // 발판에서 걸어 내려가도 공중 재점프 한 번은 남겨 둔다
    }
    if (walk.pos.y < -20) { walk.pos.set(G.LAYOUT.spawn.x, WALK_CFG.eye, G.LAYOUT.spawn.z); walk.vy = 0; }
  }
  function turnToward(dt) {
    if (walk.turnTo === null) return;
    let d = walk.turnTo - walk.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) < 0.01) { walk.yaw = walk.turnTo; walk.turnTo = null; return; }
    walk.yaw += d * Math.min(1, dt * 7);
    walk.pitch *= 1 - Math.min(1, dt * 4);
  }
  function placeWalkCamera() {
    camera.position.copy(walk.pos);
    const bobOffset = walk.bob ? Math.sin(walk.bob) * 0.12 : 0;
    camera.position.y += bobOffset;
    camera.lookAt(walk.pos.x - Math.sin(walk.yaw), walk.pos.y + Math.tan(walk.pitch) + bobOffset, walk.pos.z - Math.cos(walk.yaw));
  }

  /* ═══════════ 미니맵 (걷기 중에도 보이고 매번 갱신) ═══════════ */
  const mini = $('miniMap'), mctx = mini.getContext('2d');
  const MW = 240, MH = 180;
  const mapPoint = (x, z) => [120 + x * 1.4, 90 + z];
  const mapWorld = (mx, my) => [(mx - 120) / 1.4, my - 90];
  let baseLayer = null, lastPaint = 0;
  function paintBase() {
    baseLayer = document.createElement('canvas');
    baseLayer.width = MW; baseLayer.height = MH;
    const ctx = baseLayer.getContext('2d');
    const rect = (x, z, w, d, color) => { const [mx, my] = mapPoint(x - w / 2, z - d / 2); ctx.fillStyle = color; ctx.fillRect(mx, my, w * 1.4, d); };
    ctx.fillStyle = '#54705c'; ctx.fillRect(8, 10, 224, 160);
    rect(0, 38, 160, 14, '#68b8d5');
    G.LAYOUT.roads.forEach(r => rect(r.x, r.z, r.w, r.d, '#253d49'));
    G.buildings.forEach(b => rect(b.x, b.z, b.w, b.d, '#d4cbb4'));
    rect(-8, 38, 4, 18, '#f2d9a0');
    G.mapShapes.forEach(s => rect(s.x, s.z, s.w, s.d, s.color));
    ctx.font = `12px ${G.FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const l of G.mapLabels) {
      const [mx, my] = mapPoint(l.x, l.z);
      const w = ctx.measureText(l.text).width + 8;
      ctx.fillStyle = 'rgba(18,42,53,.85)'; ctx.fillRect(mx - w / 2, my - 7, w, 14);
      ctx.fillStyle = '#fff3c9'; ctx.fillText(l.text, mx, my + 1);
    }
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText('N ↑', 13, 20);
  }
  function paintMiniMap(now) {
    if (!baseLayer) paintBase();
    mctx.clearRect(0, 0, MW, MH);
    mctx.drawImage(baseLayer, 0, 0);
    // 게임 마커
    const pulse = 1 + Math.sin(now * 0.006) * 0.18;
    for (const m of markers) {
      const [mx, my] = mapPoint(m.x, m.z);
      mctx.fillStyle = m.color; mctx.strokeStyle = '#fff'; mctx.lineWidth = 2;
      mctx.beginPath(); mctx.arc(mx, my, 7 * (E.near === m ? pulse : 1), 0, Math.PI * 2); mctx.fill(); mctx.stroke();
      mctx.fillStyle = '#10202a'; mctx.font = `bold 10px ${G.FONT}`; mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
      mctx.fillText(m.num, mx, my + 1);
      if (G.store.game(m.id).clears) { mctx.fillStyle = '#ffd23f'; mctx.font = '10px sans-serif'; mctx.fillText('★', mx + 7, my - 7); }
    }
    // 내 위치 (걷기) 또는 조망 중심
    if (E.walking) {
      const [px, py] = mapPoint(walk.pos.x, walk.pos.z);
      const fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw);
      mctx.save(); mctx.translate(px, py); mctx.rotate(Math.atan2(fz, fx * 1.4));
      mctx.fillStyle = '#ffe071'; mctx.strokeStyle = '#17283d'; mctx.lineWidth = 1.5;
      mctx.beginPath(); mctx.moveTo(8, 0); mctx.lineTo(-5, -5); mctx.lineTo(-2, 0); mctx.lineTo(-5, 5); mctx.closePath(); mctx.fill(); mctx.stroke();
      mctx.restore();
    } else {
      const [mx, my] = mapPoint(orbit.target.x, orbit.target.z);
      mctx.strokeStyle = '#ffe071'; mctx.lineWidth = 2;
      mctx.beginPath(); mctx.arc(mx, my, 5, 0, Math.PI * 2); mctx.stroke();
      mctx.fillStyle = '#ffe071'; mctx.beginPath(); mctx.arc(mx, my, 2, 0, Math.PI * 2); mctx.fill();
    }
    lastPaint = now;
  }
  E.repaintMap = () => { baseLayer = null; };
  mini.addEventListener('pointerdown', e => {
    e.preventDefault();
    const r = mini.getBoundingClientRect();
    const [x, z] = mapWorld((e.clientX - r.left) / r.width * MW, (e.clientY - r.top) / r.height * MH);
    if (E.walking && E.mode === 'walk') {
      // 걷는 중: 그 장소 쪽으로 몸을 돌린다
      const dx = x - walk.pos.x, dz = z - walk.pos.z;
      if (Math.hypot(dx, dz) > 1) walk.turnTo = walk.yaw + Math.atan2(Math.sin(Math.atan2(-dx, -dz) - walk.yaw), Math.cos(Math.atan2(-dx, -dz) - walk.yaw));
      G.toast('🧭 그쪽을 바라봐요', 1400);
    } else if (E.mode === 'orbit') {
      focusMap({ x: G.clamp(x, -70, 70), y: 2, z: G.clamp(z, -68, 72), dist: 78 }, '선택한 동네 둘러보기');
    }
  });

  /* ═══════════ 미니게임 마커 (바닥 고리 + 빛기둥 + 떠 있는 아이콘) ═══════════ */
  const markers = E.markers = [];
  const ringGeo = new T.RingGeometry(1.15, 1.55, 36).rotateX(-Math.PI / 2);
  const discGeo = new T.CircleGeometry(1.15, 36).rotateX(-Math.PI / 2);
  const beamGeo = new T.CylinderGeometry(0.75, 0.75, 44, 18, 1, true).translate(0, 22, 0);
  function iconTexture(def, cleared) {
    return G.canvasTex(128, 128, (g) => {
      g.fillStyle = def.color; g.beginPath(); g.arc(64, 60, 50, 0, Math.PI * 2); g.fill();
      g.lineWidth = 8; g.strokeStyle = '#ffffff'; g.stroke();
      g.beginPath(); g.moveTo(48, 104); g.lineTo(64, 124); g.lineTo(80, 104); g.fillStyle = '#ffffff'; g.fill();
      g.font = '58px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(def.icon, 64, 64);
      if (cleared) { g.fillStyle = '#ffd23f'; g.font = 'bold 40px sans-serif'; g.fillText('★', 104, 24); }
    });
  }
  E.buildMarkers = () => {
    G.games.forEach((def, i) => {
      const s = def.spot, y = G.groundHeight(s.x, s.z) + 0.04;
      const color = new T.Color(def.color);
      const group = new T.Group(); group.position.set(s.x, y, s.z);
      const disc = new T.Mesh(discGeo, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false }));
      const ring = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
      ring.position.y = disc.position.y = 0.06;
      const beam = new T.Mesh(beamGeo, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.13, depthWrite: false, side: T.DoubleSide }));
      const icon = new T.Sprite(new T.SpriteMaterial({ map: iconTexture(def, G.store.game(def.id).clears > 0), depthTest: false, transparent: true }));
      icon.renderOrder = 10;
      const label = G.labelSprite(def.name, { bg: 'rgba(12,24,40,.88)', border: def.color, scale: 0.7, font: 30, depthTest: false });
      label.renderOrder = 10;
      group.add(disc, ring, beam, icon, label);
      G.scene.add(group);
      markers.push({ id: def.id, def, x: s.x, z: s.z, y, r: def.spotRadius || 2.6, color: def.color, num: String(i + 1), group, ring, icon, label, beam });
    });
  };
  E.refreshMarker = id => {
    const m = markers.find(v => v.id === id);
    if (!m) return;
    m.icon.material.map.dispose();
    m.icon.material.map = iconTexture(m.def, G.store.game(id).clears > 0);
    m.icon.material.needsUpdate = true;
  };
  E.setMarkersVisible = v => markers.forEach(m => { m.group.visible = v; });
  const _v = new T.Vector3();
  function updateMarkers(now) {
    const t = now * 0.001;
    for (const m of markers) {
      if (!m.group.visible) continue;
      _v.set(m.x, m.y + 3, m.z);
      const d = camera.position.distanceTo(_v);
      // 바로 옆에 서면 빛기둥·아이콘을 숨긴다 (기둥 안에 갇힌 것처럼 보이지 않게)
      const flat = Math.hypot(camera.position.x - m.x, camera.position.z - m.z);
      const close = E.walking && flat < 3.4;
      m.icon.visible = !close; m.beam.visible = !close;
      const s = G.clamp(d * 0.05, 1.5, 9);
      const lift = G.clamp(d * 0.035, 3, 10);
      m.icon.scale.set(s, s, 1);
      m.icon.position.y = lift + Math.sin(t * 2 + m.x) * 0.25 * s * 0.4;
      m.label.visible = !close && (d < 60 || !E.walking);
      m.label.scale.set(s * 2.4 * 0.62, s * 0.62, 1);
      m.label.position.y = m.icon.position.y - s * 0.72;
      m.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
      m.ring.material.opacity = E.near === m ? 1 : 0.75;
      m.beam.material.opacity = E.walking ? (d < 12 ? 0.05 : 0.13) : 0.2;
    }
  }

  /* ── 가까이 가면 안내 카드 (자동 시작하지 않는다 — E 또는 버튼) ── */
  function checkNear() {
    let near = null;
    if (E.mode === 'walk') {
      const feet = walk.pos.y - WALK_CFG.eye;
      for (const m of markers) {
        const dx = walk.pos.x - m.x, dz = walk.pos.z - m.z;
        if (dx * dx + dz * dz < m.r * m.r && Math.abs(feet - m.y) < 2.5) { near = m; break; }
      }
    }
    if (near === E.near) return;
    E.near = near;
    const card = $('prompt');
    if (!near) { card.hidden = true; return; }
    const def = near.def, rec = G.store.game(def.id);
    if (!G.store.data.found[def.id]) { G.store.data.found[def.id] = true; G.store.save(); G.hub.refresh(); }
    $('promptIcon').textContent = def.icon;
    $('promptIcon').style.background = def.color;
    $('promptName').textContent = def.name;
    $('promptDesc').textContent = def.tagline;
    $('promptCtl').textContent = (G.touch ? def.controlsTouch : def.controlsKey) || '';
    $('promptRec').textContent = rec.best !== null ? `최고 기록 ${def.format(rec.best)}${rec.clears ? ' · ★ 성공' : ''}` : '첫 도전!';
    $('promptKey').textContent = G.touch ? '' : 'E';
    card.hidden = false;
    G.sfx.play('ding');
  }
  $('promptStart').addEventListener('click', () => { if (E.near) G.play.start(E.near.id); });

  /* ═══════════ 화면 요소 표시 상태 ═══════════ */
  E.refreshUi = () => {
    const walking = E.walking, inGame = E.mode === 'game';
    $('crosshair').hidden = !walking || (inGame && !E.walkGame);
    const touchWalk = walking && G.touch && (!inGame || E.walkGame);
    $('jumpBtn').hidden = !touchWalk;
    if (!touchWalk) joyEnd();
    if (walking) E.near = undefined; else { E.near = null; $('prompt').hidden = true; }
  };

  /* ═══════════ 게임 시작/종료 때 탐험 상태 보관·복원 ═══════════ */
  E.suspend = () => {
    const snap = {
      mode: E.mode, walking: E.walking,
      pos: walk.pos.clone(), yaw: walk.yaw, pitch: walk.pitch,
      orbit: { theta: orbit.theta, phi: orbit.phi, dist: orbit.dist, target: orbit.target.clone() },
    };
    E.mode = 'game';
    clearMovement(); stopCameraTrip();
    walk.vy = 0;
    E.near = null; $('prompt').hidden = true;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    document.body.classList.add('in-game');
    E.refreshUi();
    return snap;
  };
  E.resume = (snap, { blend: doBlend = true } = {}) => {
    E.walkGame = false;
    walk.pos.copy(snap.pos); walk.yaw = snap.yaw; walk.pitch = snap.pitch; walk.vy = 0; walk.jumps = 0; walk.turnTo = null;
    orbit.theta = snap.orbit.theta; orbit.phi = snap.orbit.phi; orbit.dist = snap.orbit.dist; orbit.target.copy(snap.orbit.target);
    clearMovement();
    document.body.classList.remove('in-game');
    E.mode = snap.walking ? 'walk' : 'orbit';
    E.walking = snap.walking;
    if (snap.walking) {
      document.body.classList.add('walking'); canvas.classList.add('walking');
      $('walkBtn').textContent = '🌐 조망';
    } else {
      document.body.classList.remove('walking'); canvas.classList.remove('walking');
      $('walkBtn').textContent = '🚶 걷기';
    }
    if (doBlend) E.startBlend(0.7); else blend.on = false;
    E.refreshUi();
  };

  /* ═══════════ 버튼 ═══════════ */
  $('walkBtn').addEventListener('click', () => (E.walking ? exitWalk() : enterWalk()));
  $('mapBig').addEventListener('click', () => setMapExpanded(!mapExpanded));
  $('zoomIn').addEventListener('click', () => zoomMap(0.8));
  $('zoomOut').addEventListener('click', () => zoomMap(1.25));
  $('resetView').addEventListener('click', () => focusMap(HOME_VIEW));
  const placeBox = $('mapPlaces');
  Object.entries(G.PLACES).forEach(([key, p]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = `${p.icon} ${p.name}`; b.setAttribute('aria-label', p.label + ' 보기');
    b.addEventListener('click', () => focusMap(p, p.label));
    placeBox.appendChild(b);
  });

  /* ═══════════ 첫 화면: 도시 위를 천천히 도는 카메라 ═══════════ */
  E.begin = () => {
    E.mode = 'orbit';
    introAt = 0;
    orbit.theta = HOME_VIEW.theta; orbit.phi = HOME_VIEW.phi; orbit.dist = HOME_VIEW.dist; orbit.target.set(0, 3, 0);
    E.startBlend(0.8);
    enterWalk({ noBlend: false });
  };

  /* ═══════════ 프레임 갱신 ═══════════ */
  E.update = (dt, now) => {
    if (E.mode === 'title') {
      orbit.theta += dt * 0.05;
      applyOrbit();
    } else if (E.walking && (E.mode === 'walk' || E.walkGame)) {
      stepWalk(dt);
      turnToward(dt);
      placeWalkCamera();
      if (E.mode === 'walk') checkNear();
    } else if (E.mode === 'orbit') {
      updateCameraTrip(now);
      applyOrbit();
    }
    if (E.mode !== 'game' || E.walkGame) applyBlend(now);
    updateMarkers(now);
    if (E.mode !== 'title' && (!document.body.classList.contains('in-game') || E.walkGame) && now - lastPaint > (E.walking ? 66 : 33)) paintMiniMap(now);
  };
  E.applyBlend = applyBlend;
})(window.G);
