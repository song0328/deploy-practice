'use strict';
/* ═══════════════════════════════════════════════════════════════
   world.js — 3D 도시 본체 (렌더러·조명·강·다리·도로·건물·나무·교통)
   · 원래 베이스 맵을 옮겨 온 부분. 건물 배치는 원본과 같은 시드·같은 난수 순서를
     쓰므로 위치·크기·높이·색이 원본과 똑같다.
   · 새 장소(학교·공원·선착장 등)는 places.js, 충돌 규칙은 이 파일 앞쪽.
   · 좌표: 평지 160×160, 가운데가 (0,0). 북쪽이 -z (미니맵 위쪽).
   ═══════════════════════════════════════════════════════════════ */
(function (G) {
  const T = THREE;

  /* ── 한곳에서 고치는 도시 설정 ── */
  const LAYOUT = G.LAYOUT = {
    bounds: { minX: -75, maxX: 75, minZ: -75, maxZ: 78 },   // 걸어갈 수 있는 끝
    river: { z: 38, width: 14, minZ: 30.2, maxZ: 45.8 },     // 이 z 사이는 물 (다리·선착장만 통과)
    bridge: { x: -8, z: 38, w: 4, d: 18 },
    spawn: { x: -8, z: 22, yaw: 0 },
    roads: [
      { x: 0, z: 14, w: 152, d: 4 }, { x: 0, z: -16, w: 152, d: 4 },
      { x: 14, z: -15, w: 4, d: 88 }, { x: -20, z: -15, w: 4, d: 88 },
      { x: 0, z: 61, w: 152, d: 4 },
    ],
    monorail: { x: -15.5, y: 6.2 },   // 건물·도로 사이 빈 줄 (걷는 길 머리 위를 가리지 않게)
  };

  /* ── 하늘·빛: 0이면 옛 베이스의 뿌연 하늘, 1이면 맑은 하늘 ── */
  const LOOK = G.LOOK = { skyMix: 0.9 };

  /* ── 렌더러 · 씬 · 카메라 (픽셀 비율 상한은 원본 그대로) ── */
  const canvas = G.$('stage');
  const renderer = new T.WebGLRenderer({ canvas, antialias: !G.LOW, powerPreference: 'high-performance' });
  renderer.setPixelRatio(G.LOW ? 1 : Math.min(devicePixelRatio, G.touch ? 1.25 : 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.shadowMap.enabled = !G.LOW;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(G.DEVICE_CFG.fov, 1, 0.1, 420);
  G.renderer = renderer; G.scene = scene; G.camera = camera;

  const mix = (a, b) => new T.Color(a).lerp(new T.Color(b), LOOK.skyMix);
  const skyColor = mix('#8E9AA5', '#7EC8E3');
  renderer.setClearColor(skyColor);
  scene.fog = new T.Fog(mix('#9AA6B0', '#BFE3F2'), 145 + LOOK.skyMix * 30, 340 + LOOK.skyMix * 100);
  const hemi = new T.HemisphereLight(mix('#8b9bb4', '#dfefff'), 0x3c4a3a, 0.7);
  scene.add(hemi);
  const sun = new T.DirectionalLight(mix('#ffb973', '#ffffff'), 0.5 + LOOK.skyMix * 0.3);
  sun.position.set(40, 25 + LOOK.skyMix * 35, 20 + LOOK.skyMix * 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(G.touch ? 1024 : 2048, G.touch ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { near: 0.5, far: 220, left: -95, right: 95, top: 95, bottom: -80 });
  scene.add(sun);
  G.sun = sun; G.hemi = hemi; G.skyColor = skyColor;

  /* ── 공유 지오메트리·재질 캐시: 같은 크기·같은 색이면 하나만 만든다 ── */
  const geoCache = new Map(), matCache = new Map();
  G.boxGeo = (w, h, d) => {
    const k = w + '|' + h + '|' + d;
    let g = geoCache.get(k);
    if (!g) { g = new T.BoxGeometry(w, h, d); geoCache.set(k, g); }
    return g;
  };
  G.mat = color => {
    let m = matCache.get(color);
    if (!m) { m = new T.MeshLambertMaterial({ color }); matCache.set(color, m); }
    return m;
  };
  /** 움직이는 물체·개별 물체용 상자 (재질·지오메트리는 공유) */
  G.box = (w, h, d, color) => {
    const m = new T.Mesh(G.boxGeo(w, h, d), G.mat(color));
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };

  /* ── 정적 상자 묶음: 움직이지 않는 상자 수백 개를 메시 1개(그리기 1번)로 합친다 ── */
  const BASE = new T.BoxGeometry(1, 1, 1);
  const VCMAT = new T.MeshLambertMaterial({ vertexColors: true });
  G.vcMat = VCMAT;
  class Batch {
    constructor() { this.p = []; }
    /** 가운데 좌표(x,y,z), 크기(w,h,d), 색, y축 회전 */
    add(w, h, d, x, y, z, color, ry = 0) { this.p.push(w, h, d, x, y, z, color, ry); return this; }
    build(parent = scene, { cast = true, receive = true } = {}) {
      const n = this.p.length / 8;
      if (!n) return null;
      const pos = new Float32Array(n * 72), nor = new Float32Array(n * 72), col = new Float32Array(n * 72);
      const idx = new (n * 24 > 65535 ? Uint32Array : Uint16Array)(n * 36);
      const bp = BASE.attributes.position.array, bn = BASE.attributes.normal.array, bi = BASE.index.array;
      const c = new T.Color();
      for (let i = 0; i < n; i++) {
        const o = i * 8, w = this.p[o], h = this.p[o + 1], d = this.p[o + 2];
        const x = this.p[o + 3], y = this.p[o + 4], z = this.p[o + 5], ry = this.p[o + 7];
        const cs = Math.cos(ry), sn = Math.sin(ry);
        c.setHex(this.p[o + 6]);
        for (let v = 0; v < 24; v++) {
          const px = bp[v * 3] * w, py = bp[v * 3 + 1] * h, pz = bp[v * 3 + 2] * d;
          const nx = bn[v * 3], ny = bn[v * 3 + 1], nz = bn[v * 3 + 2];
          const k = (i * 24 + v) * 3;
          pos[k] = x + px * cs + pz * sn; pos[k + 1] = y + py; pos[k + 2] = z - px * sn + pz * cs;
          nor[k] = nx * cs + nz * sn; nor[k + 1] = ny; nor[k + 2] = -nx * sn + nz * cs;
          col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
        }
        for (let j = 0; j < 36; j++) idx[i * 36 + j] = bi[j] + i * 24;
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setAttribute('normal', new T.BufferAttribute(nor, 3));
      g.setAttribute('color', new T.BufferAttribute(col, 3));
      g.setIndex(new T.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      const m = new T.Mesh(g, VCMAT);
      m.castShadow = cast; m.receiveShadow = receive;
      parent.add(m);
      this.p.length = 0;
      return m;
    }
  }
  G.Batch = Batch;
  const city = new Batch();          // 도시 전체의 정적 장식
  G.cityBatch = city;                // places.js도 여기에 보탠 뒤 main.js가 한 번에 만든다

  /* ═══════════ 충돌 규칙 (XZ 평면의 직사각형) ═══════════
     · obstacles: 끝까지 막힌 벽 (건물·벽·기둥)
     · waterWalks: 강 위를 걸을 수 있는 곳 (다리·선착장). 원본 다리 규칙 |x+8|≤1.35 그대로
     · decks: 바닥이 살짝 높은 곳 (다리 0.35)
     · platforms: 위에 올라설 수 있는 블록 (공원 언덕·점프 발판). 발이 윗면보다 낮으면 벽
  */
  const obstacles = G.obstacles = [];
  const waterWalks = G.waterWalks = [{ x: -8, z: 38, halfW: 1.35 }];
  const decks = G.decks = [{ minX: -10, maxX: -6, minZ: 29, maxZ: 47, y: 0.35 }];
  const platforms = G.platforms = [];
  function blockArea(x, z, w, d) { obstacles.push({ x, z, w, d }); }
  function overlaps(x, z, w, d, area, gap = 0) {
    return Math.abs(x - area.x) < (w + area.w) / 2 + gap && Math.abs(z - area.z) < (d + area.d) / 2 + gap;
  }
  G.blockArea = blockArea; G.overlaps = overlaps;

  const STAND_R = 0.3;   // 발판 위에 서 있다고 보는 여유 (가장자리에 걸쳐도 서 있다)
  /** 이 지점의 바닥 높이. feet(발 높이)를 주면 그 아래에 있는 발판까지 본다 */
  function groundHeight(x, z, feet = 0) {
    let h = 0;
    for (const d of decks) if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ && d.y > h) h = d.y;
    for (const p of platforms) {
      if (p.off) continue;
      if (Math.abs(x - p.x) <= p.w / 2 + STAND_R && Math.abs(z - p.z) <= p.d / 2 + STAND_R && p.top <= feet + 0.35 && p.top > h) h = p.top;
    }
    return h;
  }
  function canStand(x, z, feet = 0) {
    const B = LAYOUT.bounds, R = LAYOUT.river;
    if (x < B.minX || x > B.maxX || z < B.minZ || z > B.maxZ) return false;
    if (z > R.minZ && z < R.maxZ && !waterWalks.some(w => Math.abs(x - w.x) <= w.halfW && (w.minZ === undefined || (z >= w.minZ && z <= w.maxZ)))) return false;
    for (const a of obstacles) if (overlaps(x, z, 1, 1, a)) return false;
    for (const p of platforms) {
      if (p.off) continue;
      if (feet < p.top - 0.3 && feet + 1.9 > p.bottom && overlaps(x, z, 1, 1, p)) return false;
    }
    return true;
  }
  G.groundHeight = groundHeight; G.canStand = canStand;

  /* ── 고정 시드 난수: 원본과 같은 순서로 불러야 같은 도시가 나온다 ── */
  let citySeed = 20260905;
  function cityRandom(a = 0, b = 1) { citySeed = (Math.imul(1664525, citySeed) + 1013904223) >>> 0; return a + (citySeed / 4294967296) * (b - a); }
  const deco = G.rng(777);           // 장식 전용 난수 (도시 배치 순서에 영향 없음)
  const decoPick = arr => arr[Math.floor(deco(0, arr.length))];

  /* ═══════════ 땅 · 강 · 다리 · 도로 ═══════════ */
  const ground = new T.Mesh(G.boxGeo(160, 2, 160), G.mat(0x849577));
  ground.position.y = -1; ground.receiveShadow = true;
  scene.add(ground);

  const riverGeo = new T.PlaneGeometry(160, 14, 64, 4);
  riverGeo.rotateX(-Math.PI / 2);
  const riverMat = new T.MeshPhongMaterial({ color: 0x3A9ECA, shininess: 90, specular: 0xffffff, flatShading: true });
  const river = new T.Mesh(riverGeo, riverMat);
  river.receiveShadow = true; river.position.set(0, 0.2, 38);
  scene.add(river);
  G.riverMat = riverMat;

  city.add(160, 0.35, 1.6, 0, 0.1, 30.5, 0xA8B394).add(160, 0.35, 1.6, 0, 0.1, 45.5, 0xA8B394);   // 강둑
  city.add(4, 0.4, 18, -8, 0.15, 38, 0xd5c9ae);                                                   // 보행교
  [-10, -6].forEach(x => {
    city.add(0.16, 0.16, 17.5, x, 1.25, 38, 0x718a91);
    for (let z = 30; z <= 46; z += 2) city.add(0.16, 1.1, 0.16, x, 0.75, z, 0x718a91);
  });
  LAYOUT.roads.forEach(({ x, z, w, d }) => {
    city.add(w + 2, 0.12, d + 2, x, 0.04, z, 0xb9baa9);   // 보도
    city.add(w, 0.15, d, x, 0.08, z, 0x545C68);           // 차도
  });
  // 강변 산책로와 보행교 진입로
  [[0, 28, 154, 2.2], [0, 48, 154, 2.2], [-8, 23, 3, 10], [-8, 54, 3, 12]].forEach(([x, z, w, d]) => city.add(w, 0.14, d, x, 0.08, z, 0xd5c9ae));
  // 차선 점선
  for (let x = -72; x <= 72; x += 9) {
    if (Math.abs(x - 14) < 4 || Math.abs(x + 20) < 4) continue;
    [14, -16, 61].forEach(z => { if (z === 61 && Math.abs(x - 36) < 3) return; city.add(3, 0.16, 0.25, x, 0.17, z, 0xE8EDF2); });   // 학교 앞 횡단보도 자리는 비움
  }
  for (let z = -56; z <= 26; z += 9) {
    if (Math.abs(z - 14) < 4 || Math.abs(z + 16) < 4) continue;
    [14, -20].forEach(x => city.add(0.25, 0.16, 3, x, 0.17, z, 0xE8EDF2));
  }
  // 교차로 횡단보도
  for (const x of [-20, 14]) for (const z of [-16, 14]) for (const side of [-1, 1]) {
    for (let i = -1.5; i <= 1.5; i += 0.6) city.add(0.32, 0.04, 1.7, x + i, 0.2, z + side * 4, 0xf1ecdb);
  }

  /* ═══════════ 나무 (잎은 바람에 흔들린다 — 공유 지오메트리·재질) ═══════════ */
  const treeLeaves = [];
  const trunkGeo = new T.BoxGeometry(0.4, 1.2, 0.4);
  const trunkMat = new T.MeshLambertMaterial({ color: 0x7a5230 });
  const leafGeo = new T.DodecahedronGeometry(1.1);
  const leafMats = [0x3F9E4D, 0x4AA858, 0x348B40].map(c => new T.MeshLambertMaterial({ color: c }));
  G.leafMats = leafMats;
  function makeTree(s = 1) {
    const t = new T.Group();
    const trunk = new T.Mesh(trunkGeo, trunkMat);
    trunk.castShadow = true; trunk.receiveShadow = true; trunk.position.y = 0.6;
    t.add(trunk);
    const leaf = new T.Mesh(leafGeo, decoPick(leafMats));
    leaf.castShadow = true; leaf.receiveShadow = true;
    leaf.position.y = 2.1;
    leaf.rotation.set(deco(0, 3), deco(0, 3), deco(0, 3));
    leaf.userData.phase = deco(0, 100);
    treeLeaves.push(leaf);
    t.add(leaf);
    t.scale.set(s, s, s);
    return t;
  }
  G.makeTree = makeTree;
  G.addTree = (x, z, s = 1) => { const t = makeTree(s); t.position.set(x, 0, z); scene.add(t); return t; };

  // 원본 순서 그대로 (시드 난수를 같은 횟수 소비해야 건물 배치가 같다)
  // (10,-46)·(12,-40) 나무는 언덕 점프 코스와 겹쳐 심지 않지만 난수는 소비한다
  const SKIP_TREES = new Set(['10,-46', '12,-40']);
  [[-12, -38], [12, -40], [-14, -44], [10, -46], [-30, 26], [24, 26], [-52, 26], [48, 26]].forEach(([x, z]) => {
    const s = cityRandom(0.8, 1.15);
    if (!SKIP_TREES.has(x + ',' + z)) G.addTree(x, z, s);
  });
  for (let x = -68; x <= 68; x += 12) {
    if (Math.abs(x + 8) < 5) continue;
    G.addTree(x, 25, cityRandom(0.9, 1.3));
    city.add(2, 0.3, 0.7, x + 3, 0.65, 26.4, 0x966b47);     // 벤치
  }

  /* ═══════════ 도심 건물 ═══════════ */
  const winTexCache = {};
  function windowTex(floors) {
    if (winTexCache[floors]) return winTexCache[floors];
    const c = document.createElement('canvas'); c.width = 128; c.height = Math.max(64, floors * 64);
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    for (let y = 12; y < c.height - 12; y += 64) for (let x = 16; x < 112; x += 32) {
      const isLit = cityRandom() < 0.22;   // 원본과 같은 난수 소비
      g.fillStyle = isLit ? '#fff2b2' : '#1e2b38';
      g.fillRect(x, y, 20, 36);
      g.strokeStyle = '#888888'; g.lineWidth = 1; g.strokeRect(x, y, 20, 36);
      if (!isLit) {
        g.fillStyle = 'rgba(255,255,255,0.15)';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20, y); g.lineTo(x, y + 36); g.fill();
      }
    }
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding; t.magFilter = T.LinearFilter;
    return (winTexCache[floors] = t);
  }
  const buildings = G.buildings = [];
  const palette = [0xe1d5bd, 0xb9cddd, 0xd7bca4, 0xc6d4c6, 0xd9ccc8, 0xacc3cf];
  // 건물 생성 예약 영역 — 원본 목록을 그대로 둔다 (배치가 같게 유지되도록).
  // 새 장소는 모두 이 영역들 안이나 원래 빈 남쪽 강변에 있어 건물과 겹치지 않는다 (places.js가 검사).
  const reserved = G.reserved = [...LAYOUT.roads.map(r => ({ ...r, w: r.w + 3, d: r.d + 3 })),
    { x: 0, z: -48, w: 23, d: 26 }, { x: 0, z: -27, w: 6, d: 20 },          // 공원 언덕과 진입로
    { x: 0, z: 38, w: 160, d: 30 }, { x: -8, z: 22, w: 6, d: 16 }, { x: -8, z: 56, w: 6, d: 18 }, // 강변·다리 진입로
    { x: 38, z: 52, w: 15, d: 10 }, { x: 26, z: 6, w: 9, d: 9 }];             // 옛 발전소 자리(→ 학교 앞 광장), 빈 자리
  const bmat = new Map();
  for (let gx = -6; gx <= 6; gx++) for (let gz = -4; gz <= 6; gz++) {
    const x = gx * 11 + cityRandom(-0.6, 0.6), z = gz * 11 + cityRandom(-0.6, 0.6);
    const w = cityRandom(4.5, 7), d = cityRandom(4.5, 7);
    if (reserved.some(area => overlaps(x, z, w, d, area))) continue;
    if (cityRandom() < 0.12) continue;
    const h = z < -30 || z > 53 ? cityRandom(3, 6) : cityRandom(4, 12);
    const color = palette[Math.floor(cityRandom(0, palette.length))];
    const floors = Math.max(1, Math.round(h / 3.2));
    const key = color + '|' + floors;
    let mats = bmat.get(key);
    if (!mats) {
      const side = new T.MeshLambertMaterial({ color, map: windowTex(floors) });
      const plain = G.mat(color);
      mats = [side, side, plain, plain, side, side];
      bmat.set(key, mats);
    }
    const b = new T.Mesh(new T.BoxGeometry(w, h, d), mats);
    b.castShadow = true; b.receiveShadow = true;
    b.position.set(x, h / 2, z);
    scene.add(b);
    city.add(w + 0.7, 0.2, d + 0.7, x, 0.1, z, 0xc6c5b7);                         // 기단
    city.add(0.85, 1.5, 0.08, x, 0.75, z + d / 2 + 0.05, 0x39576b);               // 문
    city.add(1.4, 0.15, 0.6, x, 1.6, z + d / 2 + 0.3, decoPick([0xdddddd, 0xe26a5c, 0x4785b8])); // 차양
    city.add(w * 0.95, 0.4, d * 0.95, x, h + 0.2, z, 0x55606A);                   // 옥상 테두리
    if (w > 3 && d > 3) {
      const rh = deco(0.8, 1.5);
      city.add(1.8, rh, 1.8, x + (w / 4) * decoPick([-1, 1]), h + 0.7, z + (d / 4) * decoPick([-1, 1]), 0x88929A);
    }
    buildings.push({ x, z, w, d, h });
    blockArea(x, z, w + 0.3, d + 0.3);
  }

  /* ═══════════ 구름 · 차 · 모노레일 열차 · 새 ═══════════ */
  const clouds = [];
  const cloudGeo = new T.DodecahedronGeometry(1);
  const cloudMat = new T.MeshLambertMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 6; i++) {
    const g = new T.Group();
    for (let j = 0; j < 3; j++) {
      const b = new T.Mesh(cloudGeo, cloudMat);
      b.castShadow = true;
      const s = deco(3, 5.5);
      b.scale.set(s, s * 0.4, s * 0.7);
      b.position.set(deco(-3, 3), deco(-1, 1), deco(-2, 2));
      g.add(b);
    }
    g.position.set(deco(-85, 85), deco(38, 52), deco(-75, 55));
    g.userData.v = deco(0.012, 0.028);
    scene.add(g); clouds.push(g);
  }

  const cars = G.cars = [];
  const cabinGeo = G.boxGeo(1.0, 0.3, 0.8), cabinMat = G.mat(0x252525);
  function addCar(x, z, speed, color) {
    const c = G.box(1.6, 0.6, 0.9, color);
    const cabin = new T.Mesh(cabinGeo, cabinMat);
    cabin.position.y = 0.45; c.add(cabin);
    c.position.set(x, 0.45, z);
    c.userData.speed = speed;
    if (speed < 0) c.rotation.y = Math.PI;
    scene.add(c); cars.push(c);
  }
  const carColors = [0xd4574e, 0x4e7ad4, 0xd4b34e, 0xcccccc];
  for (let i = 0; i < 8; i++) {
    addCar(deco(-70, 70), i % 2 ? 14 + (i % 4 < 2 ? -1.2 : 1.2) : -16 + (i % 4 < 2 ? -1.2 : 1.2),
      deco(0.08, 0.16) * (i % 4 < 2 ? 1 : -1), decoPick(carColors));
  }
  // 학교 앞 도로 — 어린이 보호구역이라 천천히 달린다
  for (let i = 0; i < 4; i++) addCar(-60 + i * 36, 61 + (i % 2 ? 1.2 : -1.2), (i % 2 ? -1 : 1) * deco(0.06, 0.09), decoPick(carColors));

  // 모노레일: 원래 보행교 줄(x=-8)을 땅 높이로 달리며 사람을 뚫고 지나가던 열차를
  // 건물과 도로 사이 빈 줄의 고가 선로로 옮겼다
  const MR = LAYOUT.monorail;
  city.add(0.7, 0.35, 160, MR.x, MR.y, 0, 0x8d97a0);
  for (const z of [-70, -52, -34, -8, 22, 38, 54, 72]) {
    if (z === -16 || z === 14 || z === 61) continue;
    city.add(0.6, MR.y, 0.6, MR.x, MR.y / 2, z, 0x9aa3ab);              // 기둥
    city.add(1.6, 0.4, 0.8, MR.x, MR.y - 0.25, z, 0x9aa3ab);            // 받침
    if (z < 30 || z > 46) blockArea(MR.x, z, 0.6, 0.6);
  }
  const train = new T.Group();
  const carriageGeo = G.boxGeo(1.2, 1.4, 3.5), winGeo = G.boxGeo(1.25, 0.4, 3.2);
  for (let i = 0; i < 3; i++) {
    const carriage = new T.Mesh(carriageGeo, G.mat(0xEEEEEE));
    carriage.castShadow = true;
    const win = new T.Mesh(winGeo, G.mat(0x222222));
    win.position.y = 0.2; carriage.add(win);
    const stripe = new T.Mesh(G.boxGeo(1.26, 0.18, 3.52), G.mat(0x2FA7DA));
    stripe.position.y = -0.35; carriage.add(stripe);
    carriage.position.z = i * 3.8;
    train.add(carriage);
  }
  train.position.set(MR.x, MR.y + 0.9, 70);
  scene.add(train);

  const birds = [];
  const wingGeo = G.boxGeo(0.25, 0.05, 0.5), wingMat = G.mat(0x333333);
  for (let i = 0; i < 8; i++) {
    const b = new T.Group();
    const w1 = new T.Mesh(wingGeo, wingMat); w1.position.set(0, 0, 0.25); w1.rotation.y = -0.4; b.add(w1);
    const w2 = new T.Mesh(wingGeo, wingMat); w2.position.set(0, 0, -0.25); w2.rotation.y = 0.4; b.add(w2);
    b.position.set(deco(-60, 60), deco(35, 48), deco(-60, 60));
    b.userData.speed = deco(0.15, 0.25); b.userData.phase = deco(0, 100);
    scene.add(b); birds.push({ g: b, w1, w2 });
  }


  /* ═══════════ 매 프레임 애니메이션 (물결·나무·구름·차·열차·새) ═══════════ */
  const rpos = riverGeo.attributes.position;
  G.world = {
    river, train, clouds, birds,
    update(dt, now) {
      const time = now * 0.002;
      for (let i = 0; i < rpos.count; i++) {
        const x = rpos.getX(i), z = rpos.getZ(i);
        rpos.setY(i, Math.sin(x * 0.5 + time) * 0.12 + Math.cos(z * 0.5 + time) * 0.12);
      }
      rpos.needsUpdate = true;
      for (const l of treeLeaves) {
        l.rotation.x = Math.sin(time + l.userData.phase) * 0.06;
        l.rotation.z = Math.cos(time + l.userData.phase) * 0.06;
      }
      for (const c of clouds) { c.position.x += c.userData.v * dt * 60; if (c.position.x > 95) c.position.x = -95; }
      const sig = G.schoolSignal;
      for (const c of cars) {
        let v = c.userData.speed * dt * 60;
        if (sig && sig.walk && Math.abs(c.position.z - 61) < 3) {
          const ahead = (36 - c.position.x) * Math.sign(c.userData.speed);   // 학교 앞 횡단보도까지 남은 거리
          if (ahead > 2.4 && ahead < 5.5) v = 0;
        }
        c.position.x += v;
        if (c.position.x > 76) c.position.x = -76;
        if (c.position.x < -76) c.position.x = 76;
      }
      for (const b of birds) {
        b.g.position.x += b.g.userData.speed * dt * 60;
        if (b.g.position.x > 80) b.g.position.x = -80;
        const flap = Math.sin(time * 18 + b.g.userData.phase) * 0.4;
        b.w1.rotation.z = flap; b.w2.rotation.z = -flap;
      }
      train.position.z -= dt * 25;
      if (train.position.z < -86) train.position.z = 80;
    },
  };
})(window.G);
