'use strict';
/* ═══════════════════════════════════════════════════════════════
   places.js — 새 장소: 학교·운동장, 학교 앞 횡단보도 광장, 강변 낚시터,
               선착장, 하늘언덕 공원(옛 남산 언덕 재활용), 길 안내판
   · 각 장소는 「보이는 메시 + 충돌 + 미니맵 도형」을 한 함수에서 같이 만든다.
     위치를 옮기려면 SPOTS와 해당 함수의 숫자만 고치면 된다.
   · 원래 비어 있던 남쪽 강변과 옛 남산·발전소 자리만 쓴다 (건물과 겹침 검사는 맨 아래).
   ═══════════════════════════════════════════════════════════════ */
(function (G) {
  const T = THREE, scene = G.scene, city = G.cityBatch;

  /** 미니게임 마커 자리 — 게임 파일들이 이 좌표를 쓴다 */
  G.SPOTS = {
    fishing: { x: 35, z: 34.6 },     // 북쪽 강변 낚시터 끝
    crossing: { x: 36, z: 54.2 },    // 학교 앞 횡단보도 광장
    dance: { x: 45.4, z: 74.5 },     // 학교 교실 맨 뒷자리 옆
    obby: { x: 7.5, z: -39.5 },      // 하늘언덕 공원 출발 발판
    boat: { x: -40, z: 41.4 },       // 남쪽 선착장 끝
      // 퀴즈 자리들은 js/games/quiz-data.js 가 G.SPOTS 에 직접 넣는다
  };
  /** 조망 카메라 장소 버튼 */
  G.PLACES = {
    park: { x: 0, y: 6, z: -50, dist: 62, label: '하늘언덕 공원 · 점프 챌린지', icon: '⛰️', name: '공원' },
    pier: { x: 35, y: 1, z: 32, dist: 46, label: '강변 낚시터', icon: '🎣', name: '낚시터' },
    school: { x: 42, y: 2, z: 64, dist: 60, label: '놀이초등학교 · 교실과 운동장', icon: '🏫', name: '학교' },
    plaza: { x: 36, y: 1, z: 56, dist: 44, label: '학교 앞 횡단보도', icon: '🚸', name: '횡단보도' },
    dock: { x: -40, y: 1, z: 44, dist: 46, label: '강변 선착장', icon: '🚤', name: '선착장' },
  };
  G.mapShapes = [];     // 미니맵에 그릴 사각형 {x,z,w,d,color}
  G.mapLabels = [];     // 미니맵 글자 {text,x,z}
  const shape = (x, z, w, d, color) => G.mapShapes.push({ x, z, w, d, color });
  const newAreas = [];  // 새 구조물 영역 (건물 겹침 검사용)
  const area = (x, z, w, d, name) => { newAreas.push({ x, z, w, d, name }); G.reserved.push({ x, z, w, d }); };

  /* 텍스처 입힌 판 (간판·칠판 등). 앞면만 그림, 옆·뒤는 단색 */
  function signBox(w, h, d, tex, edge = 0x2d3b48) {
    const e = G.mat(edge);
    const front = new T.MeshLambertMaterial({ map: tex });
    const m = new T.Mesh(G.boxGeo(w, h, d), [e, e, e, e, front, e]);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  G.signBox = signBox;
  function textTex(lines, { w = 512, h = 256, bg = '#173049', fg = '#ffffff', border = '#e7cf7b', title } = {}) {
    return G.canvasTex(w, h, (g) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      if (border) { g.strokeStyle = border; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); }
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      let y = 0;
      const rows = lines.length + (title ? 1 : 0), step = h / (rows + 0.4);
      if (title) { g.font = `${Math.round(step * 0.62)}px ${G.FONT}`; g.fillStyle = border || fg; g.fillText(title, w / 2, step * 0.8); y = 1; g.fillStyle = fg; }
      g.font = `${Math.round(step * 0.5)}px ${G.FONT}`;
      lines.forEach((t, i) => g.fillText(t, w / 2, step * (0.8 + y + i)));
    });
  }
  G.textTex = textTex;

  /* ═══════════ 1. 강변 낚시터 (북쪽 강변, x=35) ═══════════ */
  {
    const x = 35;
    city.add(3.2, 0.3, 8.8, x, 0.2, 31.8, 0xb88a5a);                       // 나무 데크
    for (let z = 28.5; z <= 36; z += 1.1) city.add(3.2, 0.02, 0.08, x, 0.36, z, 0x9c7248);   // 판자 줄
    for (const sx of [-1.45, 1.45]) {
      for (const z of [30.5, 33, 36]) city.add(0.22, 1.4, 0.22, x + sx, 0.1, z, 0x7a5230);  // 말뚝
      city.add(0.1, 0.1, 5.6, x + sx, 1.05, 33.2, 0x8a6a48);                                // 난간
    }
    // 낚시 가게 매점
    city.add(2.4, 2.2, 1.8, 38.6, 1.1, 24.6, 0xe9d8b4).add(2.8, 0.2, 2.2, 38.6, 2.3, 24.8, 0x3f8fbf).add(1.2, 0.08, 0.1, 38.6, 1.3, 25.55, 0x4b3a2a);
    G.blockArea(38.6, 24.6, 2.4, 1.8);
    const sign = G.labelSprite('🎣 강변 낚시터', { scale: 1.05, bg: '#0f4a66', border: '#9fe3ff' });
    sign.position.set(x, 3.6, 29.4); scene.add(sign);
    G.waterWalks.push({ x, halfW: 1.0, minZ: 29, maxZ: 35.7 });
    G.decks.push({ minX: x - 1.6, maxX: x + 1.6, minZ: 27.4, maxZ: 36.2, y: 0.35 });
    shape(x, 32, 3.2, 8.8, '#d7b27e');
    area(x, 32, 3.2, 8.8, '낚시터');
    G.mapLabels.push({ text: '낚시터', x: 35, z: 22 });
  }

  /* ═══════════ 2. 선착장 (남쪽 강변, x=-40) ═══════════ */
  {
    const x = -40;
    city.add(3.2, 0.3, 8.8, x, 0.2, 44.6, 0xb88a5a);
    for (let z = 40.6; z <= 48.4; z += 1.1) city.add(3.2, 0.02, 0.08, x, 0.36, z, 0x9c7248);
    for (const sx of [-1.45, 1.45]) for (const z of [40.5, 43, 45.5]) city.add(0.22, 1.4, 0.22, x + sx, 0.1, z, 0x7a5230);
    // 매표소
    city.add(3, 2.4, 2.2, -45.5, 1.2, 52.4, 0xf0e4c8).add(3.4, 0.25, 2.6, -45.5, 2.5, 52.4, 0xd05a45).add(1.4, 0.8, 0.1, -45.5, 1.5, 51.25, 0x2d4c63);
    G.blockArea(-45.5, 52.4, 3, 2.2);
    const sign = G.labelSprite('🚤 강변 선착장', { scale: 1.05, bg: '#5a2a1a', border: '#ffc39a' });
    sign.position.set(x, 3.6, 47.6); scene.add(sign);
    G.waterWalks.push({ x, halfW: 1.0, minZ: 40.8, maxZ: 46.5 });
    G.decks.push({ minX: x - 1.6, maxX: x + 1.6, minZ: 40.2, maxZ: 49, y: 0.35 });
    shape(x, 44.6, 3.2, 8.8, '#d7b27e');
    area(x, 44.6, 3.2, 8.8, '선착장');
    area(-45.5, 52.4, 3, 2.2, '매표소');
    G.mapLabels.push({ text: '선착장', x: -40, z: 55 });
    // 묶여 있는 작은 배 (보트 게임의 배와 같은 모양)
    G.dockBoats = [];
    [[-43.2, 42.2, 0.2], [-36.8, 43.6, -0.15]].forEach(([bx, bz, ry], i) => {
      const b = G.makeBoat(i ? 0xf2f2f2 : 0xe8533f);
      b.position.set(bx, 0.25, bz); b.rotation.y = ry + Math.PI / 2;
      scene.add(b); G.dockBoats.push(b);
    });
  }

  /* ═══════════ 3. 학교 앞 횡단보도 광장 (옛 발전소 자리) ═══════════ */
  G.schoolSignal = { t: 0, walk: false, lights: [] };
  {
    city.add(16, 0.12, 7.2, 36, 0.07, 53.6, 0xd9c9a8);
    for (let i = 0; i < 8; i++) city.add(1.6, 0.13, 7.2, 29 + i * 2, 0.075, 53.6, i % 2 ? 0xcdb994 : 0xe2d4b6);
    // 어린이 보호구역: 빨간 노면 + 지그재그 없이 굵은 흰 선
    city.add(22, 0.02, 4, 36, 0.165, 61, 0xb8483c);
    for (let z = 59.3; z <= 62.8; z += 0.7) city.add(3.4, 0.04, 0.36, 36, 0.19, z, 0xf4f1e6);
    // 신호등 두 개 (보행자 신호: 빨강/초록)
    const lightMatR = new T.MeshBasicMaterial({ color: 0x5a1a1a }), lightMatG = new T.MeshBasicMaterial({ color: 0x1a4a2a });
    G.schoolSignal.mats = { red: lightMatR, green: lightMatG };
    [[33.6, 57.9], [38.4, 64.1]].forEach(([lx, lz]) => {
      city.add(0.18, 3, 0.18, lx, 1.5, lz, 0x5d6670);
      const head = G.box(0.5, 1.0, 0.36, 0x2b3138); head.position.set(lx, 3.2, lz); scene.add(head);
      const r = new T.Mesh(G.boxGeo(0.34, 0.34, 0.05), lightMatR); r.position.set(0, 0.22, lz < 60 ? 0.2 : -0.2); head.add(r);
      const g = new T.Mesh(G.boxGeo(0.34, 0.34, 0.05), lightMatG); g.position.set(0, -0.22, lz < 60 ? 0.2 : -0.2); head.add(g);
      G.blockArea(lx, lz, 0.4, 0.4);
    });
    // 버스 정류장 쉼터
    city.add(3.6, 0.15, 1.4, 42.4, 2.4, 56.6, 0x3f8fbf).add(0.12, 2.4, 0.12, 40.8, 1.2, 57.1, 0x5d6670).add(0.12, 2.4, 0.12, 44, 1.2, 57.1, 0x5d6670)
      .add(3.2, 1.6, 0.08, 42.4, 1.4, 57.25, 0xbfd9e6).add(2.6, 0.12, 0.5, 42.4, 0.6, 56.85, 0x966b47);
    G.blockArea(42.4, 57.1, 3.6, 0.5);
    const sign = G.labelSprite('🚸 학교 앞 횡단보도', { scale: 1.05, bg: '#3a2a08', border: '#ffd23f' });
    sign.position.set(36, 3.8, 51.2); scene.add(sign);
    shape(36, 53.6, 16, 7.2, '#e2d4b6');
    shape(36, 61, 3.4, 4, '#f4f1e6');
    area(36, 53.6, 16, 7.2, '횡단보도 광장');
  }

  /* ═══════════ 4. 놀이초등학교 (길 남쪽 x 24~48, z 67.4~78.4) ═══════════ */
  const SCHOOL = G.SCHOOL = { minX: 24, maxX: 48, minZ: 67.4, maxZ: 78.4, wallH: 6.4, divZ: 70.6 };
  {
    const S = SCHOOL, cx = (S.minX + S.maxX) / 2, cz = (S.minZ + S.maxZ) / 2, W = S.maxX - S.minX, D = S.maxZ - S.minZ, H = S.wallH;
    // 벽 창문 텍스처: 4칸마다 창 하나, 위아래 2줄
    const wallTex = G.canvasTex(128, 128, (g) => {
      g.fillStyle = '#f3e7cf'; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#c8553d'; g.fillRect(0, 60, 128, 8);
      for (const y of [12, 76]) {
        g.fillStyle = '#e6d9bd'; g.fillRect(22, y - 3, 84, 44);
        g.fillStyle = '#2c4a63'; g.fillRect(26, y, 76, 38);
        g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.moveTo(26, y); g.lineTo(70, y); g.lineTo(26, y + 30); g.fill();
        g.fillStyle = '#e6d9bd'; g.fillRect(62, y, 4, 38);
      }
    });
    wallTex.wrapS = wallTex.wrapT = T.RepeatWrapping;
    const walls = [];
    function wall(x, z, w, d, h = H, y = h / 2) {
      const len = Math.max(w, d);
      const t = wallTex.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, Math.round(len / 4)), 1);
      const m = new T.Mesh(G.boxGeo(w, h, d), new T.MeshLambertMaterial({ map: t }));
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
      scene.add(m); walls.push(m);
      if (y - h / 2 < 1.8) G.blockArea(x, z, w, d);
    }
    // 바닥: 복도(회색 타일) + 교실(나무 마루)
    city.add(W, 0.1, S.divZ - S.minZ, cx, 0.05, (S.minZ + S.divZ) / 2, 0xd8d2c4);
    city.add(W, 0.1, S.maxZ - S.divZ, cx, 0.05, (S.divZ + S.maxZ) / 2, 0xc49a6c);
    for (let x = S.minX + 1; x < S.maxX; x += 1.2) city.add(0.05, 0.02, S.maxZ - S.divZ - 0.3, x, 0.11, (S.divZ + S.maxZ) / 2, 0xb38a5e);
    // 바깥벽 — 정문(북쪽, x 34~38)만 뚫려 있다
    wall(29, S.minZ, 10, 0.3); wall(43, S.minZ, 10, 0.3);
    wall(36, S.minZ, 4, 0.3, H - 3.6, 3.6 + (H - 3.6) / 2);
    wall(cx, S.maxZ, W, 0.3); wall(S.minX, cz, 0.3, D); wall(S.maxX, cz, 0.3, D);
    // 교실 벽 (복도와 교실 사이) — 앞문 x 25.4~27.4, 뒷문 x 43.6~46.0
    const ic = 0xe9e1d3;
    [[24.15, 25.4], [27.4, 43.6], [46.0, 47.85]].forEach(([a, b]) => { city.add(b - a, H, 0.26, (a + b) / 2, H / 2, S.divZ, ic); G.blockArea((a + b) / 2, S.divZ, b - a, 0.26); });
    [[25.4, 27.4], [43.6, 46.0]].forEach(([a, b]) => city.add(b - a, H - 2.8, 0.26, (a + b) / 2, 2.8 + (H - 2.8) / 2, S.divZ, ic));
    city.add(1.6, 0.35, 0.06, 44.8, 3.2, S.divZ - 0.16, 0x2d4c63);      // 반 이름판 자리
    // 복도 신발장
    city.add(13, 1.5, 0.5, 35.5, 0.75, S.divZ - 0.4, 0x9fb7c9);
    for (let x = 29.5; x <= 41.5; x += 1.3) city.add(0.05, 1.4, 0.02, x, 0.78, S.divZ - 0.66, 0x7d95a8);
    G.blockArea(35.5, S.divZ - 0.4, 13, 0.5);
    // 지붕 — 그림자를 드리우지 않아 교실 안이 어둡지 않다
    const roof = new T.Mesh(G.boxGeo(W + 0.6, 0.4, D + 0.6), G.mat(0x9a6b57));
    roof.position.set(cx, H + 0.2, cz); roof.receiveShadow = true; scene.add(roof);
    city.add(W + 0.8, 0.5, 0.3, cx, H + 0.55, S.minZ - 0.25, 0xc8553d).add(W + 0.8, 0.5, 0.3, cx, H + 0.55, S.maxZ + 0.25, 0xc8553d)
      .add(0.3, 0.5, D + 0.8, S.minX - 0.25, H + 0.55, cz, 0xc8553d).add(0.3, 0.5, D + 0.8, S.maxX + 0.25, H + 0.55, cz, 0xc8553d);
    // 현관: 벽에 붙은 차양 + 학교 이름판 + 시계
    city.add(6.4, 0.25, 1.6, 36, 3.7, S.minZ - 0.8, 0xc8553d);
    const nameTex = textTex(['놀이초등학교'], { w: 512, h: 96, bg: '#f7f0de', fg: '#7a2f22', border: '#c8553d' });
    const nameBoard = signBox(5.6, 1.05, 0.12, nameTex); nameBoard.rotation.y = Math.PI; nameBoard.position.set(36, 4.6, S.minZ - 0.2); scene.add(nameBoard);
    const clockTex = G.canvasTex(128, 128, (g) => {
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
      g.lineWidth = 7; g.strokeStyle = '#7a2f22'; g.stroke();
      g.strokeStyle = '#222'; g.lineCap = 'round'; g.lineWidth = 7;
      g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 26); g.stroke();
      g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(92, 74); g.stroke();
    });
    const clock = new T.Mesh(new T.CircleGeometry(0.6, 20), new T.MeshBasicMaterial({ map: clockTex }));
    clock.rotation.y = Math.PI; clock.position.set(36, 5.75, S.minZ - 0.17); scene.add(clock);
    // 국기 게양대
    city.add(0.12, 8, 0.12, 30, 4, 66.2, 0xdddddd);
    const flag = new T.Mesh(G.boxGeo(1.4, 0.9, 0.04), G.mat(0xf6f6f6)); flag.position.set(30.75, 7.4, 66.2); scene.add(flag);
    G.blockArea(30, 66.2, 0.3, 0.3);

    /* ── 교실 안 (칠판은 서쪽 벽, 학생은 서쪽을 본다) ── */
    const boardTex = G.canvasTex(512, 160, (g) => {
      g.fillStyle = '#2f5d46'; g.fillRect(0, 0, 512, 160);
      g.fillStyle = 'rgba(255,255,255,.85)'; g.font = `38px ${G.FONT}`; g.textAlign = 'left';
      g.fillText('오늘의 공부: 받아쓰기', 26, 58);
      g.font = `28px ${G.FONT}`; g.fillText('1. 가나다라  2. 마바사  3. …', 26, 112);
    });
    const board = signBox(0.1, 1.8, 6, null, 0x7b5a3c);
    board.material[0] = new T.MeshLambertMaterial({ map: boardTex });   // +x 면 (교실 쪽)
    board.position.set(S.minX + 0.2, 2.4, 74.5); scene.add(board);
    city.add(0.3, 0.08, 6, S.minX + 0.3, 1.46, 74.5, 0x7b5a3c);
    city.add(1.2, 1.05, 2.2, 27.8, 0.55, 74.5, 0x8b6b4a);                 // 교탁
    G.blockArea(27.8, 74.5, 1.2, 2.2);
    G.classroom = { desks: [], teacherSpot: { x: 25.3, z: 74.5 }, playerDesk: null };
    const ROWS = [31.5, 35, 38.5, 42], COLS = [72.4, 74.5, 76.6];
    ROWS.forEach(x => COLS.forEach(z => {
      city.add(1.1, 0.08, 0.76, x, 0.8, z, 0xd8b98e).add(1.0, 0.72, 0.66, x, 0.4, z, 0x8a95a0);          // 책상
      city.add(0.62, 0.08, 0.6, x + 0.85, 0.48, z, 0xc68d57).add(0.08, 0.7, 0.6, x + 1.16, 0.85, z, 0xc68d57)
        .add(0.5, 0.44, 0.5, x + 0.85, 0.22, z, 0x8a95a0);                                               // 의자
      G.blockArea(x + 0.35, z, 1.8, 0.8);
      G.classroom.desks.push({ x, z });
    }));
    G.classroom.playerDesk = { x: 42, z: 74.5 };
    // 창가 화분·사물함
    city.add(8, 1.2, 0.5, 38, 0.6, S.maxZ - 0.45, 0x9fb7c9);
    G.blockArea(38, S.maxZ - 0.45, 8, 0.5);
    shape(cx, cz, W, D, '#e8c9a8');
    shape(cx, (S.divZ + S.maxZ) / 2, W - 1, S.maxZ - S.divZ - 0.6, '#caa27a');
    area(cx, cz - 1.5, W + 1, D + 5, '학교');
    G.mapLabels.push({ text: '학교', x: 36, z: 79 });
  }

  /* ═══════════ 5. 운동장 · 울타리 ═══════════ */
  {
    city.add(22, 0.06, 11.6, 64, 0.04, 72, 0xd2b48c);
    [[64, 66.5, 21, 0.12], [64, 77.5, 21, 0.12], [53.6, 72, 0.12, 11], [74.4, 72, 0.12, 11], [64, 72, 0.12, 11]].forEach(([x, z, w, d]) => city.add(w, 0.02, d, x, 0.08, z, 0xf7f4ea));
    for (const gx of [54.2, 73.8]) {
      city.add(0.14, 1.8, 0.14, gx, 0.9, 70.6, 0xf4f4f4).add(0.14, 1.8, 0.14, gx, 0.9, 73.4, 0xf4f4f4).add(0.14, 0.14, 2.9, gx, 1.8, 72, 0xf4f4f4);
      G.blockArea(gx, 72, 0.3, 3);
    }
    // 정글짐
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) city.add(0.1, 2.4, 0.1, 58 + i, 1.2, 75.8 + j * 0.8 - 0.8, 0xe8533f);
    for (let y = 0.8; y <= 2.4; y += 0.8) city.add(2.1, 0.08, 0.08, 59, y, 75, 0x3f8fbf).add(2.1, 0.08, 0.08, 59, y, 76.6, 0x3f8fbf);
    G.blockArea(59, 75.8, 2.2, 1.8);
    // 울타리 — 학교 정문(x 33~39)과 운동장 입구(x 60~64)는 열려 있다
    const fence = (a, b, z) => {
      city.add(b - a, 0.08, 0.08, (a + b) / 2, 0.9, z, 0x5f7f6a).add(b - a, 0.08, 0.08, (a + b) / 2, 0.45, z, 0x5f7f6a);
      for (let x = a; x <= b + 0.01; x += 1.5) city.add(0.1, 1.1, 0.1, x, 0.55, z, 0x5f7f6a);
      G.blockArea((a + b) / 2, z, b - a, 0.2);
    };
    const fenceZ = (x, a, b) => {
      city.add(0.08, 0.08, b - a, x, 0.9, (a + b) / 2, 0x5f7f6a).add(0.08, 0.08, b - a, x, 0.45, (a + b) / 2, 0x5f7f6a);
      for (let z = a; z <= b + 0.01; z += 1.5) city.add(0.1, 1.1, 0.1, x, 0.55, z, 0x5f7f6a);
      G.blockArea(x, (a + b) / 2, 0.2, b - a);
    };
    fence(22, 33, 64.9); fence(39, 60, 64.9); fence(64, 76, 64.9);
    fenceZ(22, 64.9, 79); fenceZ(76, 64.9, 79);
    city.add(0.5, 2.2, 0.5, 33, 1.1, 64.9, 0xc8553d).add(0.5, 2.2, 0.5, 39, 1.1, 64.9, 0xc8553d);
    [[51, 78.4]].forEach(([x, z]) => G.addTree(x, z, 1.05));
    shape(64, 72, 22, 11.6, '#d2b48c');
    area(64, 72, 22, 11.6, '운동장');
  }

  /* ═══════════ 6. 하늘언덕 공원 (옛 남산 언덕 → 올라갈 수 있는 공원) ═══════════ */
  const HILL = G.HILL = { x: 0, z: -52, tiers: [[16, 5, 0], [12, 4, 4], [8, 3.5, 7.5], [5, 3, 10.5]] };
  {
    // 계단식 언덕 — 원본과 같은 모양. 대신 각 단 위에 올라설 수 있다
    HILL.tiers.forEach(([s, h, y], i) => {
      city.add(s, h, s, HILL.x, y + h / 2, HILL.z, 0x4e7a45);
      G.platforms.push({ x: HILL.x, z: HILL.z, w: s, d: s, top: y + h, bottom: y, name: 'tier' + i });
    });
    // 꼭대기 정자
    const top = 13.5;
    for (const [px, pz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) {
      city.add(0.25, 2.6, 0.25, HILL.x + px, top + 1.3, HILL.z + pz, 0x8b3a2e);
      G.blockArea(HILL.x + px, HILL.z + pz, 0.25, 0.25);
    }
    city.add(4.8, 0.3, 4.8, HILL.x, top + 2.75, HILL.z, 0xa0443a).add(3.6, 0.3, 3.6, HILL.x, top + 3.05, HILL.z, 0xb04d40).add(2.2, 0.3, 2.2, HILL.x, top + 3.35, HILL.z, 0xa0443a).add(0.6, 0.5, 0.6, HILL.x, top + 3.7, HILL.z, 0xe7cf7b);
    // 광장 + 진입로 (원본 자리)
    city.add(19, 0.16, 7, 0, 0.08, -39, 0xc6bc9f).add(3, 0.12, 18, 0, 0.07, -27, 0xc6bc9f);
    // 놀이터: 미끄럼틀 + 그네
    city.add(1.4, 0.2, 1.4, -4.5, 1.8, -40.2, 0xe8533f);
    for (const [px, pz] of [[-5.1, -40.8], [-3.9, -40.8], [-5.1, -39.6], [-3.9, -39.6]]) city.add(0.12, 1.8, 0.12, px, 0.9, pz, 0x3f8fbf);
    const slide = new T.Mesh(G.boxGeo(1, 0.1, 2.9), G.mat(0xffd23f));
    slide.position.set(-4.5, 1.0, -38.1); slide.rotation.x = -0.66; slide.castShadow = true; scene.add(slide);
    G.blockArea(-4.5, -39.6, 1.4, 3);
    city.add(3.6, 0.14, 0.14, -8, 2.7, -39.5, 0x3f8fbf);
    for (const px of [-9.7, -6.3]) for (const pz of [-40.1, -38.9]) city.add(0.12, 2.8, 0.12, px, 1.4, pz, 0x3f8fbf);
    G.swings = [];
    [-8.8, -7.2].forEach(px => {
      const sw = new T.Group(); sw.position.set(px, 2.65, -39.5);
      const rope = new T.Mesh(G.boxGeo(0.03, 1.9, 0.03), G.mat(0x444444)); rope.position.set(-0.28, -0.95, 0); sw.add(rope);
      const rope2 = rope.clone(); rope2.position.x = 0.28; sw.add(rope2);
      const seat = new T.Mesh(G.boxGeo(0.7, 0.08, 0.4), G.mat(0xe8533f)); seat.position.y = -1.9; seat.castShadow = true; sw.add(seat);
      scene.add(sw); G.swings.push(sw);
    });
    G.blockArea(-8, -39.5, 3.6, 1.4);
    const sign = G.labelSprite('⛰️ 하늘언덕 공원', { scale: 1.2, bg: '#1d3a1a', border: '#b8f28c' });
    sign.position.set(0, 4.6, -35.8); scene.add(sign);
    shape(HILL.x, HILL.z, 16, 16, '#6f9b5e'); shape(HILL.x, HILL.z, 8, 8, '#85b865');
    shape(0, -39, 19, 7, '#c6bc9f');
    G.mapLabels.push({ text: '공원', x: 0, z: -64 });
  }

  /* ═══════════ 7. 길 안내판 (출발 지점 앞) ═══════════ */
  {
    const tex = textTex(['🎣 낚시터 → 동쪽 강변', '🚤 선착장 → 다리 건너 서쪽', '🏫 학교 · 🚸 횡단보도 → 다리 건너 동쪽', '⛰️ 하늘언덕 공원 → 북쪽'],
      { w: 512, h: 300, title: '🧭 놀이도시 안내' });
    // 출발 지점(-8, 22)에서 오른쪽 앞으로 비스듬히 보이게 돌려 세운다
    const bx = -4.3, bz = 16.4, ry = Math.atan2(-8 - bx, 22 - bz);
    const board = signBox(4.2, 2.5, 0.14, tex);
    board.position.set(bx, 2.05, bz); board.rotation.y = ry; scene.add(board);
    city.add(0.16, 1.7, 0.16, bx - Math.cos(ry) * 1.8, 0.85, bz + Math.sin(ry) * 1.8, 0x6b4a2e).add(0.16, 1.7, 0.16, bx + Math.cos(ry) * 1.8, 0.85, bz - Math.sin(ry) * 1.8, 0x6b4a2e);
    G.blockArea(bx, bz, 2.8, 2.8);
    // 다리 남쪽 끝 이정표
    const tex2 = textTex(['← 학교 · 횡단보도', '선착장 →'], { w: 512, h: 170 });
    const b2 = signBox(3.2, 1.1, 0.12, tex2); b2.rotation.y = Math.PI; b2.position.set(-4.6, 2.2, 49.8); scene.add(b2);
    city.add(0.14, 1.7, 0.14, -4.6, 0.85, 49.8, 0x6b4a2e);
    G.blockArea(-4.6, 49.8, 0.4, 0.3);
    // 남쪽 강변에 나무 몇 그루 (빈 들판에 길 따라)
    [[-58, 51], [-26, 51], [8, 51], [22, 51], [52, 51], [66, 51]].forEach(([x, z]) => G.addTree(x, z, 1));
  }

  /* ── 학교 앞 보행 신호: 초록 3.5초 / 빨강 5.5초. 초록이면 학교 앞 차가 멈춘다 (world.js) ── */
  G.updateSignal = dt => {
    const S = G.schoolSignal;
    S.t = (S.t + dt) % 9;
    const walk = S.t < 3.5;
    if (walk !== S.walk) {
      S.walk = walk;
      S.mats.red.color.set(walk ? 0x5a1a1a : 0xff4a3d);
      S.mats.green.color.set(walk ? 0x3dfa86 : 0x1a4a2a);
    }
  };
  G.updateSignal(0);

  /* ── 새 구조물이 기존 건물과 겹치지 않는지 검사 (개발용 경고) ── */
  for (const a of newAreas) for (const b of G.buildings) {
    if (G.overlaps(a.x, a.z, a.w, a.d, b)) console.warn('[배치 경고] 새 구조물이 건물과 겹칩니다:', a.name, b);
  }
})(window.G);
