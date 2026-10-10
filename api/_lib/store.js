'use strict';
/* 저장소 연결.
   · 실제 운영: Vercel에서 만든 Upstash Redis(REST 주소·토큰이 환경변수로 들어옴)
   · 내 컴퓨터에서 시험할 때만: PLAYCITY_STORE=memory (메모리에 잠깐 저장, 운영에서는 무시됨) */

const URL_ = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN_ = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

function mode() {
  if (URL_() && TOKEN_()) return 'redis';
  if (!process.env.VERCEL && process.env.PLAYCITY_STORE === 'memory') return 'memory';
  return 'none';
}
function available() { return mode() !== 'none'; }

/* ── Redis REST ─────────────────────────────────────────── */
async function redisFetch(path, body) {
  const r = await fetch(URL_().replace(/\/+$/, '') + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN_(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('저장소 오류 ' + r.status + (j.error ? ': ' + j.error : ''));
  return j;
}

/* ── 시험용 메모리 저장소 (필요한 명령만 흉내) ──────────── */
const mem = new Map(); // key -> { v, exp }
function memGet(key) {
  const e = mem.get(key);
  if (!e) return undefined;
  if (e.exp && e.exp < Date.now()) { mem.delete(key); return undefined; }
  return e;
}
function memRun(args) {
  const [cmd, key, ...rest] = args;
  const C = String(cmd).toUpperCase();
  switch (C) {
    case 'GET': { const e = memGet(key); return e ? e.v : null; }
    case 'SET': {
      let nx = false, ex = 0;
      for (let i = 1; i < rest.length; i++) {
        const o = String(rest[i]).toUpperCase();
        if (o === 'NX') nx = true;
        if (o === 'EX') ex = Number(rest[++i]);
      }
      if (nx && memGet(key)) return null;
      mem.set(key, { v: String(rest[0]), exp: ex ? Date.now() + ex * 1000 : 0 });
      return 'OK';
    }
    case 'DEL': return mem.delete(key) ? 1 : 0;
    case 'INCR': { const e = memGet(key); const n = (e ? Number(e.v) : 0) + 1; mem.set(key, { v: String(n), exp: e ? e.exp : 0 }); return n; }
    case 'EXPIRE': { const e = memGet(key); if (!e) return 0; e.exp = Date.now() + Number(rest[0]) * 1000; return 1; }
    case 'SADD': { let e = memGet(key); if (!e) { e = { v: new Set(), exp: 0 }; mem.set(key, e); } let n = 0; rest.forEach(m => { if (!e.v.has(String(m))) { e.v.add(String(m)); n++; } }); return n; }
    case 'SCARD': { const e = memGet(key); return e ? e.v.size : 0; }
    case 'SMEMBERS': { const e = memGet(key); return e ? [...e.v] : []; }
    case 'LPUSH': { let e = memGet(key); if (!e) { e = { v: [], exp: 0 }; mem.set(key, e); } rest.forEach(m => e.v.unshift(String(m))); return e.v.length; }
    case 'LTRIM': { const e = memGet(key); if (e) e.v = e.v.slice(Number(rest[0]), Number(rest[1]) + 1); return 'OK'; }
    case 'LRANGE': { const e = memGet(key); if (!e) return []; const s = Number(rest[0]); const t = Number(rest[1]); return e.v.slice(s, t === -1 ? undefined : t + 1); }
    default: throw new Error('시험용 저장소가 모르는 명령: ' + C);
  }
}

/* ── 겉으로 쓰는 함수 ───────────────────────────────────── */
async function cmd(...args) {
  const m = mode();
  if (m === 'memory') return memRun(args);
  if (m !== 'redis') throw new Error('저장소가 연결되지 않았어요');
  const j = await redisFetch('', args);
  if (j.error) throw new Error('저장소 오류: ' + j.error);
  return j.result;
}

async function pipeline(cmds) {
  const m = mode();
  if (m === 'memory') return cmds.map(memRun);
  if (m !== 'redis') throw new Error('저장소가 연결되지 않았어요');
  if (!cmds.length) return [];
  const j = await redisFetch('/pipeline', cmds);
  return j.map(x => { if (x.error) throw new Error('저장소 오류: ' + x.error); return x.result; });
}

module.exports = { mode, available, cmd, pipeline, _mem: mem, _run: memRun };
