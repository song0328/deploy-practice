'use strict';
/* ═══════════════════════════════════════════════════════════════
   core.js — 모든 스크립트가 함께 쓰는 도구 상자
   · 전역 이름공간 G 하나만 만든다 (빌드 없이 <script> 순서대로 불린다)
   · 유틸, 토스트, 기록 저장(localStorage), 효과음(WebAudio 합성 — 소리 파일 없음)
   ═══════════════════════════════════════════════════════════════ */
window.G = {};
(function (G) {
  G.$ = id => document.getElementById(id);
  G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.smooth = t => t * t * (3 - 2 * t);
  G.rnd = (a, b) => a + Math.random() * (b - a);
  G.pick = arr => arr[Math.floor(Math.random() * arr.length)];
  /** 고정 시드 난수 — 같은 시드면 모든 사람에게 같은 배치가 나온다 */
  G.rng = seed => {
    let s = seed >>> 0;
    return (a = 0, b = 1) => {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return a + (s / 4294967296) * (b - a);
    };
  };
  G.touch = matchMedia('(pointer: coarse)').matches;
  /** 기기 버전: 주소의 ?device=phone|tablet|pc (phone.html·tablet.html이 붙여 준다). 없으면 자동 판단 */
  const qDev = (location.search.match(/[?&]device=(phone|tablet|pc)\b/) || [])[1];
  G.DEVICE = qDev || (G.touch ? (Math.min(screen.width, screen.height) < 600 ? 'phone' : 'tablet') : 'pc');
  if (G.DEVICE !== 'pc') G.touch = true;            // 폰·태블릿 버전은 늘 터치 화면 배치
  /** 기기별 맞춤 값 — 시야각(걷기), 조이스틱 반지름(px) */
  G.DEVICE_CFG = ({
    phone: { fov: 70, joyR: 52 },
    tablet: { fov: 58, joyR: 72 },
    pc: { fov: 55, joyR: 58 },
  })[G.DEVICE];
  /** 저사양 모드: 주소 끝에 ?low 를 붙이면 그림자·계단 현상 보정을 끄고 해상도를 낮춘다 */
  G.LOW = /[?&]low\b/.test(location.search);
  G.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  G.esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** 매 프레임 불리는 배경 움직임 (교실 선생님 등). 게임 파일이 f(dt, now)를 넣는다 */
  G.ambient = [];

  /* ── 토스트 알림 ── */
  G.toast = (text, ms = 3200) => {
    const box = G.$('toasts');
    if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    t.style.setProperty('--life', ms + 'ms');
    box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), ms + 500);
  };

  /* ── 기록 저장: 새 게임 전용 키. 저장이 막힌 브라우저에서도 게임은 된다 ── */
  const KEY = 'playcity-records-v1';
  G.store = {
    data: { v: 1, games: {}, found: {}, smart: {}, muted: false },
    load() {
      try {
        const d = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (d && d.v === 1) this.data = { v: 1, games: d.games || {}, found: d.found || {}, smart: d.smart || {}, muted: !!d.muted };
      } catch (e) { /* 저장 불가 환경 */ }
    },
    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* 무시 */ }
    },
    game(id) {
      const g = this.data.games[id] || (this.data.games[id] = { best: null, pts: 0, clears: 0, plays: 0 });
      if (g.pts === undefined) g.pts = 0;   // 예전에 저장된 기록에도 칸을 만들어 준다
      return g;
    },
  };
  G.store.load();

  /* ── 효과음: 짧은 합성음. 파일을 받지 않으니 용량이 0 ── */
  G.sfx = (() => {
    let ctx = null, noise = null, master = null;
    const api = { muted: G.store.data.muted };
    function ac() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.55;
        master.connect(ctx.destination);
        noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, dur, { type = 'square', vol = 0.06, slide = 0, delay = 0 } = {}) {
      const t0 = ctx.currentTime + delay;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    }
    function hiss(dur, { vol = 0.08, freq = 1200, delay = 0 } = {}) {
      const t0 = ctx.currentTime + delay;
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise;
      f.type = 'bandpass';
      f.frequency.value = freq;
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f).connect(g).connect(master);
      s.start(t0);
      s.stop(t0 + dur);
    }
    const lib = {
      click: () => tone(720, 0.05, { type: 'triangle', vol: 0.05 }),
      hop: () => tone(420, 0.08, { type: 'triangle', slide: 260, vol: 0.05 }),
      coin: () => { tone(988, 0.06, { vol: 0.045 }); tone(1319, 0.14, { delay: 0.06, vol: 0.045 }); },
      splash: () => { hiss(0.35, { vol: 0.12, freq: 900 }); tone(300, 0.2, { type: 'sine', slide: -200, vol: 0.05 }); },
      bite: () => { tone(880, 0.07, { vol: 0.06 }); tone(880, 0.07, { delay: 0.1, vol: 0.06 }); },
      reel: () => tone(200 + Math.random() * 60, 0.03, { type: 'sawtooth', vol: 0.018 }),
      catch: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, { delay: i * 0.07, type: 'triangle', vol: 0.06 })),
      lose: () => tone(330, 0.35, { type: 'sawtooth', slide: -220, vol: 0.05 }),
      crash: () => { hiss(0.25, { vol: 0.14, freq: 500 }); tone(150, 0.25, { slide: -80, vol: 0.07 }); },
      horn: () => { tone(392, 0.18, { type: 'sawtooth', vol: 0.03 }); tone(494, 0.18, { type: 'sawtooth', vol: 0.03 }); },
      ding: () => tone(1175, 0.25, { type: 'sine', vol: 0.07 }),
      alarm: () => { tone(740, 0.1, { vol: 0.05 }); tone(587, 0.1, { delay: 0.12, vol: 0.05 }); },
      step: () => tone(180 + Math.random() * 40, 0.04, { type: 'triangle', vol: 0.04 }),
      perfect: () => { tone(1047, 0.07, { type: 'triangle', vol: 0.05 }); tone(1568, 0.1, { delay: 0.05, type: 'triangle', vol: 0.05 }); },
      caught: () => { tone(220, 0.12, { type: 'square', vol: 0.07 }); tone(165, 0.3, { delay: 0.12, type: 'square', vol: 0.07 }); },
      win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, { delay: i * 0.09, type: 'triangle', vol: 0.06 })),
      whoosh: () => hiss(0.3, { vol: 0.06, freq: 2200 }),
      boing: () => tone(260, 0.22, { type: 'sine', slide: 520, vol: 0.07 }),
      checkpoint: () => { tone(784, 0.08, { type: 'triangle', vol: 0.06 }); tone(1175, 0.16, { delay: 0.08, type: 'triangle', vol: 0.06 }); },
      tick: () => tone(1400, 0.03, { type: 'sine', vol: 0.03 }),
      beat: () => tone(95, 0.14, { type: 'sine', vol: 0.16, slide: -45 }),
      hat: () => hiss(0.04, { vol: 0.035, freq: 7000 }),
      hmm: () => { tone(260, 0.16, { type: 'triangle', vol: 0.07, slide: 60 }); tone(330, 0.2, { type: 'triangle', vol: 0.06, delay: 0.16, slide: 90 }); },
      chalk: () => hiss(0.06, { vol: 0.02, freq: 3500 }),
    };
    api.play = name => {
      if (api.muted) return;
      const c = ac();
      if (!c || !lib[name]) return;
      try { lib[name](); } catch (e) { /* 오디오 실패는 게임을 멈추지 않는다 */ }
    };
    api.unlock = () => { if (!api.muted) ac(); };
    api.setMuted = m => { api.muted = m; G.store.data.muted = m; G.store.save(); };
    return api;
  })();

  /* ── 캔버스 텍스처·글자 스프라이트 ── */
  G.canvasTex = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  };
  G.FONT = '"Jua","Malgun Gothic","Apple SD Gothic Neo",sans-serif';
  /** 글자판 스프라이트 — 표지·마커 이름에 쓴다 */
  G.labelSprite = (text, { bg = '#132a3e', fg = '#ffffff', border = '#e7cf7b', w = 256, h = 64, font = 30, scale = 1, depthTest = true } = {}) => {
    const tex = G.canvasTex(w, h, (g) => {
      g.fillStyle = bg;
      const r = h * 0.3;
      g.beginPath();
      g.moveTo(r, 2); g.arcTo(w - 2, 2, w - 2, h - 2, r); g.arcTo(w - 2, h - 2, 2, h - 2, r);
      g.arcTo(2, h - 2, 2, 2, r); g.arcTo(2, 2, w - 2, 2, r); g.closePath();
      g.fill();
      if (border) { g.lineWidth = 4; g.strokeStyle = border; g.stroke(); }
      g.fillStyle = fg;
      g.font = `${font}px ${G.FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest, transparent: true }));
    s.scale.set((w / h) * scale, scale, 1);
    return s;
  };
})(window.G);
