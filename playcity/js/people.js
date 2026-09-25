'use strict';
/* ═══════════════════════════════════════════════════════════════
   people.js — 저폴리 사람 캐릭터 (주인공·선생님·친구들)
   · 상자 몇 개로 만든다. 지오메트리·재질은 공유 캐시를 쓴다
   · 앞쪽이 +z. 키 약 2.2 (걷기 시점 눈높이 2.1과 맞춤)
   ═══════════════════════════════════════════════════════════════ */
(function (G) {
  const T = THREE;
  const part = (w, h, d, color, x, y, z, parent) => {
    const m = new T.Mesh(G.boxGeo(w, h, d), G.mat(color));
    m.castShadow = true;
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const pivot = (x, y, z, parent) => { const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; };

  /**
   * @param {object} o skin·hair·shirt·pants·shoes 색, hat(색)·bag(색)·glasses(true)·long(긴 머리)·skirt
   */
  G.makePerson = (o = {}) => {
    const c = Object.assign({ skin: 0xf2c9a0, hair: 0x2b2118, shirt: 0x4e7ad4, pants: 0x34405a, shoes: 0x222222 }, o);
    const root = new T.Group();
    const body = pivot(0, 0.9, 0, root);            // 허리 — 몸통을 흔들 때 이 축을 돌린다
    const legL = pivot(-0.15, 0.9, 0, root), legR = pivot(0.15, 0.9, 0, root);
    [legL, legR].forEach(l => {
      part(0.24, 0.8, 0.26, c.skirt ? c.skin : c.pants, 0, -0.4, 0, l);
      part(0.26, 0.14, 0.34, c.shoes, 0, -0.84, 0.04, l);
    });
    if (c.skirt) part(0.66, 0.36, 0.42, c.pants, 0, 0.06, 0, body);
    part(0.62, 0.74, 0.36, c.shirt, 0, 0.4, 0, body);
    const armL = pivot(-0.4, 0.72, 0, body), armR = pivot(0.4, 0.72, 0, body);
    [armL, armR].forEach(a => {
      part(0.18, 0.62, 0.2, c.shirt, 0, -0.28, 0, a);
      part(0.16, 0.14, 0.18, c.skin, 0, -0.64, 0, a);
    });
    const head = pivot(0, 0.8, 0, body);
    part(0.5, 0.5, 0.46, c.skin, 0, 0.25, 0, head);
    part(0.54, 0.16, 0.5, c.hair, 0, 0.52, -0.01, head);
    part(0.54, 0.34, 0.12, c.hair, 0, 0.33, -0.2, head);
    if (c.long) part(0.54, 0.5, 0.14, c.hair, 0, 0.12, -0.22, head);
    part(0.07, 0.08, 0.02, 0x1b1b1b, -0.11, 0.28, 0.235, head);
    part(0.07, 0.08, 0.02, 0x1b1b1b, 0.11, 0.28, 0.235, head);
    if (c.glasses) {
      part(0.16, 0.12, 0.02, 0x3a3a3a, -0.11, 0.28, 0.25, head);
      part(0.16, 0.12, 0.02, 0x3a3a3a, 0.11, 0.28, 0.25, head);
    }
    if (c.hat) { part(0.56, 0.18, 0.52, c.hat, 0, 0.58, 0, head); part(0.56, 0.05, 0.22, c.hat, 0, 0.5, 0.33, head); }
    if (c.bag) part(0.46, 0.5, 0.2, c.bag, 0, 0.42, -0.28, body);
    root.userData.rig = { body, head, armL, armR, legL, legR };
    return root;
  };

  /** 가벼운 앉은 친구 (상자 4개). 교실 배경 인물용 — 앞쪽 +z */
  G.makeKid = (o = {}) => {
    const c = Object.assign({ skin: 0xf2c9a0, hair: 0x2b2118, shirt: 0x4e7ad4 }, o);
    const g = new T.Group();
    const upper = pivot(0, 0.55, 0, g);
    part(0.5, 0.58, 0.3, c.shirt, 0, 0.29, 0, upper);
    const head = pivot(0, 0.6, 0, upper);
    part(0.42, 0.42, 0.4, c.skin, 0, 0.21, 0, head);
    part(0.46, 0.14, 0.44, c.hair, 0, 0.45, -0.01, head);
    if (c.long) part(0.46, 0.4, 0.1, c.hair, 0, 0.2, -0.2, head);
    part(0.46, 0.2, 0.56, 0x34405a, 0, 0.1, 0.12, g);     // 앉은 다리
    g.userData.rig = { upper, head };
    return g;
  };

  /** 작은 보트 (선착장 장식·보트 게임 공용). 앞쪽이 +z */
  G.makeBoat = (color = 0xe8533f) => {
    const g = new T.Group();
    part(1.5, 0.45, 2.6, color, 0, 0.1, 0, g);                  // 선체
    const bow = part(1.06, 0.45, 1.06, color, 0, 0.1, 1.3, g);   // 뱃머리 (45도 돌린 상자)
    bow.rotation.y = Math.PI / 4;
    part(1.3, 0.06, 2.4, 0xf4ecd8, 0, 0.34, -0.05, g);          // 갑판
    part(1.52, 0.12, 2.62, 0xffffff, 0, 0.36, 0, g);            // 테두리
    part(0.9, 0.5, 0.7, 0xdfeff7, 0, 0.62, -0.5, g);            // 조종석 창
    part(0.3, 0.3, 0.4, 0x333333, 0, 0.1, -1.4, g);             // 모터
    return g;
  };

  /** 기본 자세로 되돌린다 */
  G.resetPose = p => {
    const r = p.userData.rig;
    for (const k of ['body', 'head', 'armL', 'armR', 'legL', 'legR']) r[k].rotation.set(0, 0, 0);
    r.body.position.y = 0.9;
  };
  /** 걷기 흔들림 (t: 진행 위상) */
  G.walkPose = (p, t, amp = 0.7) => {
    const r = p.userData.rig, s = Math.sin(t) * amp;
    r.legL.rotation.x = s; r.legR.rotation.x = -s;
    r.armL.rotation.x = -s * 0.8; r.armR.rotation.x = s * 0.8;
  };
  /** 앉은 자세 */
  G.sitPose = p => {
    const r = p.userData.rig;
    G.resetPose(p);
    r.legL.rotation.x = r.legR.rotation.x = -1.45;
    r.body.position.y = 0.55;
    r.legL.position.y = r.legR.position.y = 0.55;
  };
  G.standLegs = p => { const r = p.userData.rig; r.legL.position.y = r.legR.position.y = 0.9; };
})(window.G);
