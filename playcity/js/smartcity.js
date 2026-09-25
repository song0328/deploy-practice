'use strict';
/* ═══════════════════════════════════════════════════════════════
   smartcity.js — 도시 곳곳의 「스마트시티 팻말」 5개

   게임이 아니다. 걸어가서 읽기만 하면 된다.
   팻말 하나 = 아래 SIGNS 배열의 덩이 하나. 덩이를 더하거나 빼면
   구조물·팻말·미니맵 표시·진행 칩(0/5)이 전부 따라온다.

   각 덩이가 채우는 것
     id      기록 저장 키 (바꾸면 예전 「읽음」 기록과 끊긴다)
     name    팻말 제목 · icon 이모지 · color 강조색
     place   어디에 있는지 한 줄
     sign    {x, z, yaw}  팻말이 설 자리. yaw 는 팻말이 바라보는 쪽(라디안)
     lead    패널 맨 위 한 줄 설명
     data    모으는 데이터 · issue 푸는 문제 · how 하는 일 (두 줄)
     build() 그 자리에 세울 구조물 (없어도 된다)

   자리를 옮기거나 새로 잡을 때는 반드시  node tests/probe.mjs  로
   그 땅이 비어 있는지 먼저 확인한다. 겹침은 화면에서 잘 안 보인다.
   ═══════════════════════════════════════════════════════════════ */
(function (G) {
  const T = THREE, scene = G.scene, city = G.cityBatch, $ = G.$;

  /* ═══════════ 팻말 5개 ═══════════ */
  const SIGNS = G.SMART_SIGNS = [
    {
      id: 'sc-cross', name: '스마트 횡단보도', icon: '🚸', color: '#FFD23F',
      place: '학교 앞 횡단보도',
      sign: { x: 29.5, z: 50.3, yaw: Math.PI * 0.25 },
      lead: '길을 건너는 사람을 알아보고 신호를 맞춰 준다.',
      data: '보행자 감지 — 횡단보도 위에 사람이 있는지',
      issue: '보행자 사고. 특히 어린이·어르신은 초록불 안에 다 못 건널 때가 있다',
      how: ['아직 건너는 사람이 있으면 초록불을 조금 더 준다',
        '차가 다가오면 바닥 조명이 켜져 운전자에게 알린다'],
      build: () => {
        // 감지 센서 기둥 두 개 (횡단보도 양쪽) + 바닥 LED 띠
        for (const [sx, sz] of [[28.2, 57.6], [43.8, 50.0]]) {
          city.add(0.16, 2.8, 0.16, sx, 1.4, sz, 0x5d6670);
          const eye = G.box(0.42, 0.3, 0.34, 0x1e2a36); eye.position.set(sx, 2.95, sz); scene.add(eye);
          const lens = new T.Mesh(G.boxGeo(0.16, 0.16, 0.05), new T.MeshBasicMaterial({ color: 0x5AC8FA, transparent: true }));
          lens.position.set(sx, 2.95, sz + (sz < 54 ? 0.19 : -0.19)); scene.add(lens);
          G.blockArea(sx, sz, 0.3, 0.3);
          blink.push(lens.material);
        }
        // 횡단보도 가장자리 조명 띠
        for (const lz of [49.9, 57.3]) city.add(16, 0.03, 0.18, 36, 0.2, lz, 0xffe9a8);
      },
    },
    {
      id: 'sc-flood', name: '침수 예측 시스템', icon: '🌊', color: '#5AC8FA',
      place: '다리 북쪽 강가',
      sign: { x: -3.8, z: 28.6, yaw: Math.PI * 0.12 },
      lead: '비가 얼마나 왔는지, 강물이 얼마나 찼는지 계속 잰다.',
      data: '강수량과 하천 수위 — 시간마다 얼마나 올랐는지',
      issue: '집중호우로 하천이 넘치는 것. 물은 순식간에 불어난다',
      how: ['물이 빠르게 오르면 넘치기 전에 미리 알린다',
        '위험해지면 강변길과 다리 아래를 먼저 막는다'],
      build: () => {
        // 강 안 수위 관측 기둥 (빨강·흰색 눈금 + 꼭대기 경보등)
        const px = -2.6, pz = 33.5;
        for (let i = 0; i < 8; i++) city.add(0.26, 0.5, 0.26, px, 0.25 + i * 0.5, pz, i % 2 ? 0xf4f1e6 : 0xd8493c);
        const lampBase = G.box(0.4, 0.28, 0.4, 0x2b3138); lampBase.position.set(px, 4.3, pz); scene.add(lampBase);
        const lamp = new T.Mesh(G.boxGeo(0.26, 0.26, 0.26), new T.MeshBasicMaterial({ color: 0xFF7A70, transparent: true }));
        lamp.position.set(px, 4.58, pz); scene.add(lamp);
        blink.push(lamp.material);
        // 강가 계측함 + 빗물받이
        city.add(0.9, 1.1, 0.7, -5.6, 0.55, 29.8, 0xcfd8de).add(1.0, 0.12, 0.8, -5.6, 1.16, 29.8, 0x8d97a0);
        G.blockArea(-5.6, 29.8, 0.9, 0.7);
        city.add(0.5, 0.06, 0.5, -2.0, 0.04, 29.2, 0x6f7b85);
      },
    },
    {
      id: 'sc-bin', name: '스마트 쓰레기통', icon: '🗑️', color: '#3ED47E',
      place: '하늘언덕 공원 놀이터',
      sign: { x: 2.0, z: -36.6, yaw: Math.PI * 1.0 },
      lead: '통이 얼마나 찼는지 스스로 알리는 쓰레기통.',
      data: '쓰레기 적재량 — 지금 몇 퍼센트 찼는지',
      issue: '넘치는 쓰레기. 비어 있는 통까지 수거차가 매일 도는 낭비',
      how: ['가득 찬 통만 골라서 수거한다',
        '헛걸음이 줄어 수거차가 덜 다니고 매연도 줄어든다'],
      build: () => {
        // 적재량 표시등이 달린 쓰레기통 세 개
        [[-0.4, -36.6, 0x3ED47E], [1.9, -41.4, 0xFFD23F], [4.4, -36.6, 0xFF7A70]].forEach(([bx, bz, c]) => {
          city.add(0.62, 0.95, 0.62, bx, 0.48, bz, 0x2f5d46).add(0.7, 0.1, 0.7, bx, 1.0, bz, 0x24493a);
          const led = new T.Mesh(G.boxGeo(0.3, 0.09, 0.04), new T.MeshBasicMaterial({ color: c }));
          led.position.set(bx, 0.82, bz + 0.32); scene.add(led);
          G.blockArea(bx, bz, 0.7, 0.7);
        });
      },
    },
    {
      id: 'sc-park', name: '스마트 주차장', icon: '🅿️', color: '#5AC8FA',
      place: '놀이초등학교 서쪽',
      sign: { x: 20.4, z: 67.6, yaw: Math.PI * 1.15 },
      lead: '칸마다 센서가 있어 빈자리를 바로 알려 준다.',
      data: '주차 칸 센서 — 칸마다 차가 있는지 없는지',
      issue: '빈자리를 찾느라 주차장을 빙빙 도는 것. 그만큼 시간과 기름이 든다',
      how: ['입구 전광판에 남은 자리 수가 바로 뜬다',
        '어느 줄이 비었는지 알려 주니 헤매지 않는다'],
      build: () => {
        const cx = 17, cz = 72, W = 7.5, D = 10;
        city.add(W, 0.08, D, cx, 0.04, cz, 0x4a5058);                       // 아스팔트
        for (let i = 0; i <= 4; i++) city.add(3.2, 0.02, 0.12, cx - 1.9, 0.09, cz - D / 2 + 1 + i * 2, 0xf2efe4);
        city.add(0.12, 0.02, D - 1.4, cx + 0.2, 0.09, cz, 0xf2efe4);
        // 주차된 차 두 대 + 빈 칸 센서 점
        [[cx - 1.9, cz - 3.5, 0xe8533f], [cx - 1.9, cz + 0.5, 0xf2f2f2]].forEach(([carX, carZ, c]) => {
          city.add(2.6, 0.75, 1.5, carX, 0.45, carZ, c).add(1.5, 0.45, 1.4, carX, 1.05, carZ, 0x2b3138);
          G.blockArea(carX, carZ, 2.6, 1.5);
        });
        [[cx - 1.9, cz + 4.5], [cx - 1.9, cz + 2.5], [cx - 1.9, cz - 1.5]].forEach(([dx, dz]) => {
          const dot = new T.Mesh(G.boxGeo(0.2, 0.02, 0.2), new T.MeshBasicMaterial({ color: 0x3ED47E }));
          dot.position.set(dx, 0.1, dz); scene.add(dot);
        });
        // 입구 전광판
        const tex = G.canvasTex(256, 128, g => {
          g.fillStyle = '#0b1a26'; g.fillRect(0, 0, 256, 128);
          g.fillStyle = '#5AC8FA'; g.font = `26px ${G.FONT}`; g.textAlign = 'center';
          g.fillText('남은 자리', 128, 42);
          g.fillStyle = '#3ED47E'; g.font = `bold 58px ${G.FONT}`; g.fillText('3', 128, 100);
        });
        const board = G.signBox(1.5, 0.85, 0.1, tex, 0x2b3138);
        board.rotation.y = Math.PI * 1.15; board.position.set(20.9, 2.5, 69.6); scene.add(board);
        city.add(0.14, 2.1, 0.14, 20.9, 1.05, 69.6, 0x5d6670);
        G.blockArea(20.9, 69.6, 0.3, 0.3);
        G.mapShapes.push({ x: cx, z: cz, w: W, d: D, color: '#6b737c' });
      },
    },
    {
      id: 'sc-station', name: '스마트 기차역', icon: '🚉', color: '#FF9F4A',
      place: '모노레일 선로 옆 승강장',
      sign: { x: -18.4, z: 17.6, yaw: Math.PI * 0.05 },
      lead: '시간마다 몇 명이 타고 내리는지 세어 열차를 조절한다.',
      data: '시간대별 승하차 인원 — 어느 때 가장 붐비는지',
      issue: '출퇴근 시간에 너무 붐비는 것. 어떤 칸만 유독 꽉 찬다',
      how: ['붐빌 시간을 미리 내다보고 열차를 늘린다',
        '승강장 전광판에 칸마다 얼마나 찼는지 보여 준다'],
      build: () => {
        const px = -18.4, pz = 22, W = 3.4, D = 8;
        city.add(W, 0.35, D, px, 0.175, pz, 0xd8d2c4);                        // 승강장
        for (let z = pz - D / 2 + 0.4; z < pz + D / 2; z += 0.8) city.add(W - 0.3, 0.02, 0.1, px, 0.36, z, 0xc4bdad);
        city.add(0.12, 0.02, D, px + W / 2 - 0.15, 0.36, pz, 0xffd23f);       // 안전선
        G.platforms.push({ x: px, z: pz, w: W, d: D, top: 0.35, bottom: 0, name: 'station' });
        // 지붕
        for (const [qx, qz] of [[px - 1.3, pz - 3], [px + 1.3, pz - 3], [px - 1.3, pz + 3], [px + 1.3, pz + 3]]) {
          city.add(0.14, 2.8, 0.14, qx, 1.75, qz, 0x8d97a0);
          G.blockArea(qx, qz, 0.2, 0.2);
        }
        city.add(W + 0.6, 0.18, D - 0.6, px, 3.24, pz, 0xbfd9e6);
        // 벤치
        city.add(1.6, 0.1, 0.5, px - 0.8, 0.75, pz + 1.2, 0x966b47).add(0.12, 0.4, 0.5, px - 1.5, 0.55, pz + 1.2, 0x7a5230);
        // 혼잡도 전광판
        const tex = G.canvasTex(256, 128, g => {
          g.fillStyle = '#0b1a26'; g.fillRect(0, 0, 256, 128);
          g.fillStyle = '#EDF4FF'; g.font = `22px ${G.FONT}`; g.textAlign = 'center';
          g.fillText('칸별 혼잡도', 128, 32);
          [['#3ED47E', 36], ['#FFD23F', 100], ['#FF7A70', 164], ['#3ED47E', 228]].forEach(([c, x], i) => {
            g.fillStyle = c; g.fillRect(x - 24, 52, 48, 40);
            g.fillStyle = '#0b1a26'; g.font = `bold 20px ${G.FONT}`; g.fillText(String(i + 1), x, 80);
          });
        });
        const board = G.signBox(2.0, 1.0, 0.1, tex, 0x2b3138);
        board.rotation.y = Math.PI * 1.05; board.position.set(px, 2.5, pz + 3.6); scene.add(board);
        G.mapShapes.push({ x: px, z: pz, w: W, d: D, color: '#cfd8de' });
        G.mapLabels.push({ text: '기차역', x: px, z: pz + 6.5 });
      },
    },
  ];

  const byId = id => SIGNS.find(s => s.id === id);
  const readSet = () => (G.store.data.smart || (G.store.data.smart = {}));
  const isRead = id => !!readSet()[id];
  const readCount = () => SIGNS.filter(s => isRead(s.id)).length;

  /* ═══════════ 팻말 만들기 ═══════════ */
  const blink = [];          // 깜빡이는 표시등 재질
  const posts = [];          // {def, x, z, y, group, icon, stamp, ring}

  /** 팻말 판에 그릴 그림 — 제목 띠 + 「모으는 데이터」 + 「푸는 문제」 두 줄 */
  function boardTex(def) {
    return G.canvasTex(640, 400, (g) => {
      g.fillStyle = '#0E2233'; g.fillRect(0, 0, 640, 400);
      g.strokeStyle = def.color; g.lineWidth = 10; g.strokeRect(5, 5, 630, 390);
      // 제목 띠
      g.fillStyle = def.color; g.fillRect(10, 10, 620, 96);
      g.fillStyle = '#10202a'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `bold 50px ${G.FONT}`;
      g.fillText(`${def.icon} ${def.name}`, 320, 60);
      // 본문 두 줄 — 꼬리표 폭은 글자를 재서 정한다 (고정 폭으로 뒀더니 잘렸다)
      const row = (y, chip, chipColor, text) => {
        g.font = `bold 24px ${G.FONT}`;
        const cw = g.measureText(chip).width + 26;
        g.fillStyle = chipColor; g.fillRect(34, y - 21, cw, 42);
        g.fillStyle = '#10202a'; g.textAlign = 'center';
        g.fillText(chip, 34 + cw / 2, y + 1);
        g.fillStyle = '#EDF4FF'; g.font = `29px ${G.FONT}`; g.textAlign = 'left';
        g.fillText(text, 34 + cw + 16, y + 1);
      };
      row(172, '모으는 데이터', '#9FC8E8', def.data.split(' — ')[0]);
      row(244, '푸는 문제', '#F2B8B2', def.issue.split('.')[0]);
      // 안내
      g.fillStyle = '#8FA6C8'; g.font = `26px ${G.FONT}`; g.textAlign = 'center';
      g.fillText(G.touch ? '가까이 와서 「읽기」를 눌러 보세요' : '가까이 와서 E 를 눌러 보세요', 320, 336);
    });
  }

  function iconTex(def) {
    return G.canvasTex(128, 128, (g) => {
      g.fillStyle = def.color; g.beginPath(); g.arc(64, 60, 50, 0, Math.PI * 2); g.fill();
      g.lineWidth = 8; g.strokeStyle = '#ffffff'; g.stroke();
      g.beginPath(); g.moveTo(48, 104); g.lineTo(64, 124); g.lineTo(80, 104); g.fillStyle = '#ffffff'; g.fill();
      g.font = '58px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(def.icon, 64, 62);
    });
  }

  const ringGeo = new T.RingGeometry(0.95, 1.3, 30).rotateX(-Math.PI / 2);

  G.buildSmartCity = () => {
    for (const def of SIGNS) {
      def.build?.();
      const { x, z, yaw } = def.sign;
      const y = G.groundHeight(x, z);
      // 판 + 기둥 두 개
      const board = G.signBox(3.0, 1.9, 0.14, boardTex(def), 0x243447);
      board.position.set(x, y + 2.35, z); board.rotation.y = yaw; scene.add(board);
      const ox = Math.cos(yaw) * 1.25, oz = -Math.sin(yaw) * 1.25;
      city.add(0.15, 1.5, 0.15, x - ox, y + 0.75, z - oz, 0x6b4a2e);
      city.add(0.15, 1.5, 0.15, x + ox, y + 0.75, z + oz, 0x6b4a2e);
      G.blockArea(x, z, 1.4, 1.4);

      // 바닥 고리 + 떠 있는 아이콘 + 읽음 도장
      const group = new T.Group(); group.position.set(x, y + 0.05, z);
      const color = new T.Color(def.color);
      const ring = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false }));
      const icon = new T.Sprite(new T.SpriteMaterial({ map: iconTex(def), depthTest: false, transparent: true }));
      icon.renderOrder = 10; icon.position.y = 4.4; icon.scale.set(1.6, 1.6, 1);
      const stamp = G.labelSprite('✓ 읽음', { bg: 'rgba(18,50,31,.92)', border: '#3ED47E', scale: 0.62, font: 30, depthTest: false });
      stamp.renderOrder = 11; stamp.position.y = 3.5; stamp.visible = isRead(def.id);
      group.add(ring, icon, stamp);
      scene.add(group);
      posts.push({ def, x, z, y, r: 2.7, group, ring, icon, stamp });
    }
    paintCount();
  };

  /* ═══════════ 가까이 가면 뜨는 안내 · 읽기 패널 ═══════════ */
  const S = G.smart = { near: null, posts, signs: SIGNS };

  S.clear = () => { S.near = null; $('signPrompt').hidden = true; };

  function checkNear() {
    const E = G.explore;
    let near = null;
    if (E.mode === 'walk' && E.walking && $('signPanel').hidden) {
      const p = E.walk.pos;
      let best = Infinity;
      for (const m of posts) {
        const d = Math.hypot(p.x - m.x, p.z - m.z);
        if (d < m.r && d < best) { best = d; near = m; }
      }
      // 게임 마커가 더 가까우면 그쪽에 양보한다 (카드 두 장이 겹쳐 뜨지 않게)
      if (near && E.near && Math.hypot(p.x - E.near.x, p.z - E.near.z) < best) near = null;
    }
    if (near === S.near) return;
    S.near = near;
    const card = $('signPrompt');
    if (!near) { card.hidden = true; return; }
    const def = near.def;
    $('signPromptIcon').textContent = def.icon;
    $('signPromptIcon').style.background = def.color;
    $('signPromptName').textContent = def.name;
    $('signPromptSub').textContent = isRead(def.id) ? '✓ 읽은 팻말이에요' : def.lead;
    $('signPromptKey').textContent = G.touch ? '' : 'E';
    card.hidden = false;
    G.sfx.play('ding');
  }

  S.open = (id) => {
    const def = id ? byId(id) : S.near?.def;
    if (!def) return;
    G.sfx.unlock(); G.sfx.play('click');
    $('signIcon').textContent = def.icon;
    $('signIcon').style.background = def.color;
    $('signName').textContent = def.name;
    $('signPlace').textContent = `📍 ${def.place}`;
    $('signLead').textContent = def.lead;
    $('signRows').innerHTML =
      row('📥', '모으는 데이터', def.data) +
      row('❓', '푸는 문제', def.issue) +
      row('💡', '이렇게 해결해요', def.how.map(h => `<span>${G.esc(h)}</span>`).join(''), true);
    $('signPanel').hidden = false;
    $('signPanel').style.setProperty('--sign', def.color);
    S.clear();
    mark(def.id);
  };
  const row = (icon, label, body, raw) =>
    `<div class="signRow"><i>${icon}</i><div><b>${label}</b>${raw ? body : `<span>${G.esc(body)}</span>`}</div></div>`;

  S.close = () => { $('signPanel').hidden = true; };

  /** 읽음으로 표시하고 진행 상황을 갱신한다 (두 번 읽어도 한 번만 센다) */
  function mark(id) {
    const first = !isRead(id);
    if (first) { readSet()[id] = true; G.store.save(); }
    const m = posts.find(p => p.def.id === id);
    if (m) m.stamp.visible = true;
    paintCount();
    $('signDone').hidden = !isRead(id);
    $('signProgress').textContent = `🏙️ 스마트시티 ${readCount()} / ${SIGNS.length}`;
    if (!first) return;
    G.sfx.play('checkpoint');
    if (readCount() === SIGNS.length) setTimeout(showAllDone, 500);
    else G.toast(`🏙️ 스마트시티 ${readCount()}/${SIGNS.length} — ${SIGNS.length - readCount()}곳 더 있어요`, 2600);
  }

  function paintCount() {
    const el = $('smartCount');
    if (el) el.textContent = `${readCount()}/${SIGNS.length}`;
    const wrap = $('smartWrap');
    if (wrap) wrap.classList.toggle('done', readCount() === SIGNS.length);
  }
  S.paintCount = paintCount;
  S.readCount = readCount;

  function showAllDone() {
    $('smartDoneList').innerHTML = SIGNS.map(s =>
      `<li>${s.icon} <b>${G.esc(s.name)}</b> — ${G.esc(s.lead)}</li>`).join('');
    $('smartDone').hidden = false;
    G.sfx.play('win');
  }

  $('signPromptRead').addEventListener('click', () => S.open());
  $('signClose').addEventListener('click', () => { S.close(); G.sfx.play('click'); });
  $('smartDoneClose').addEventListener('click', () => { $('smartDone').hidden = true; G.sfx.play('click'); });
  addEventListener('keydown', e => {
    if (e.code === 'Escape' && !$('signPanel').hidden) { S.close(); e.preventDefault(); }
    else if (e.code === 'Escape' && !$('smartDone').hidden) { $('smartDone').hidden = true; e.preventDefault(); }
  });

  /* ═══════════ 미니맵 ═══════════ */
  S.paintMap = (ctx, mapPoint, now) => {
    const pulse = 1 + Math.sin(now * 0.006) * 0.18;
    for (const m of posts) {
      const [mx, my] = mapPoint(m.x, m.z);
      const done = isRead(m.def.id);
      const s = 5.5 * (S.near === m ? pulse : 1);
      ctx.fillStyle = done ? '#3ED47E' : m.def.color;
      ctx.strokeStyle = '#0d1829'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mx, my - s); ctx.lineTo(mx + s, my); ctx.lineTo(mx, my + s); ctx.lineTo(mx - s, my);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      if (done) {
        ctx.strokeStyle = '#0d1829'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(mx - 2.6, my); ctx.lineTo(mx - 0.6, my + 2.2); ctx.lineTo(mx + 2.8, my - 2.4); ctx.stroke();
      }
    }
  };

  /* ═══════════ 매 프레임 ═══════════ */
  let blinkOn = false;
  G.ambient.push((dt, now) => {
    checkNear();
    const t = now * 0.001;
    // 센서·경보등 깜빡임 (색을 바꾸지 않고 보였다 감췄다 한다 — 가장 싸다)
    const on = Math.sin(t * 2.4) > -0.2;
    if (on !== blinkOn) { blinkOn = on; for (const m of blink) m.opacity = on ? 1 : 0.25; }
    // 고리·아이콘 움직임
    const p = G.explore.walk.pos;
    for (const m of posts) {
      m.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
      m.ring.material.opacity = S.near === m ? 1 : (isRead(m.def.id) ? 0.4 : 0.75);
      const close = G.explore.walking && Math.hypot(p.x - m.x, p.z - m.z) < 3.2;
      m.icon.visible = !close;
      m.icon.position.y = 4.4 + Math.sin(t * 2 + m.x) * 0.12;
      m.stamp.visible = isRead(m.def.id) && !close;
    }
  });

  /* 도시를 합치기(main.js) 전에 구조물을 세워 둔다 */
  G.buildSmartCity();
})(window.G);
