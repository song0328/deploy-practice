'use strict';
/* 청도 장날 놀이도시 — 온라인판(팀 태블릿 참가) 서버.
   선생님 화면이 게임의 주인이다. 선생님 화면은 게임 상태(snap)를 여기에 올리고,
   팀 태블릿은 그 상태를 받아 보며 자기 팀의 입찰·가게 준비를 여기에 제출한다.
   선생님 화면은 제출함(inbox)을 받아 가서 게임에 반영한다.

   저장 위치 (12시간 뒤 자동 삭제)
     jn:room:<방코드>  → { code, tkey, created, snap }   선생님만 쓸 수 있음
     jn:in:<방코드>    → 해시. join:<팀번호> / bid:<날>:<집터>:<팀번호> / plan:<날>:<팀번호>

   요청: POST /api/jangnal  본문 { a: 동작, ... }
     create                       → { code, tkey }
     state  {code,tkey,snap}      → { inbox }          상태 올리기 + 제출함 받기
     tpoll  {code,tkey}           → { inbox }          제출함만 받기
     kick   {code,tkey,team}      → { ok }             팀 자리 비우기
     join   {code,team,name,token?} → { token, team }
     poll   {code,token}          → { snap, me, bid, plan }
     bid    {code,token,day,spot,amount} → { ok }
     plan   {code,token,day,d}    → { ok }
     leave  {code,token}          → { ok } */
const crypto = require('crypto');
const U = require('./_lib/util');
const store = require('./_lib/store');

const TTL = 12 * 3600;          // 방 수명(초)
const N = 5;                    // 언제나 5팀
const SNAP_MAX = 120000;        // 상태 크기 제한(글자)

const rk = c => 'jn:room:' + c;
const ik = c => 'jn:in:' + c;
const bad = (res, msg, status = 400) => U.sendJson(res, status, { ok: false, msg });
const rand = n => crypto.randomBytes(n).toString('base64url');

function newRoomCode() { let s = ''; for (let i = 0; i < 4; i++) s += crypto.randomInt(10); return s; }
function normCode(v) { return String(v || '').replace(/\D/g, '').slice(0, 4); }
function teamIdx(v) { const n = Number(v); return Number.isInteger(n) && n >= 0 && n < N ? n : -1; }

async function loadRoom(code) {
  const raw = await store.cmd('GET', rk(code));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
async function saveRoom(room) { await store.cmd('SET', rk(room.code), JSON.stringify(room), 'EX', TTL); }

function toObj(flat) { const o = {}; for (let i = 0; i + 1 < (flat || []).length; i += 2) o[flat[i]] = flat[i + 1]; return o; }
async function inbox(code) {
  const o = toObj(await store.cmd('HGETALL', ik(code)));
  const out = { join: {}, bid: {}, plan: {} };
  for (const k in o) {
    const [kind, ...rest] = k.split(':');
    let v = o[k]; try { v = JSON.parse(v); } catch { /* 문자열 그대로 */ }
    if (kind === 'join') { const j = v || {}; out.join[rest[0]] = { name: j.name, at: j.at }; }   // 토큰은 숨긴다
    else if (kind === 'bid') out.bid[rest.join(':')] = v;
    else if (kind === 'plan') out.plan[rest.join(':')] = v;
  }
  return out;
}
async function joins(code) {
  const fields = []; for (let i = 0; i < N; i++) fields.push('join:' + i);
  const vals = await store.cmd('HMGET', ik(code), ...fields);
  return vals.map(v => { if (!v) return null; try { return JSON.parse(v); } catch { return null; } });
}
async function hset(code, field, value) {
  await store.pipeline([['HSET', ik(code), field, JSON.stringify(value)], ['EXPIRE', ik(code), TTL]]);
}

function teacherOf(room, tkey) { return !!room && typeof tkey === 'string' && tkey.length > 10 && U.safeEqual(room.tkey, tkey); }
async function teamOf(code, token) {
  if (typeof token !== 'string' || token.length < 10) return -1;
  const js = await joins(code);
  for (let i = 0; i < N; i++) if (js[i] && js[i].token && U.safeEqual(js[i].token, token)) return i;
  return -1;
}
function cleanName(s) { return String(s || '').normalize('NFKC').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12); }

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return bad(res, '잘못된 요청이에요.', 405); }
  if (!U.sameOrigin(req)) return bad(res, '잘못된 요청이에요.', 403);
  if (!store.available()) return bad(res, '지금은 서버 저장소가 연결되지 않았어요. 선생님께 알려 주세요.', 503);

  const b = U.readBody(req);
  const a = String(b.a || '');
  try {
    if (a === 'create') {
      for (let t = 0; t < 20; t++) {
        const code = newRoomCode();
        const room = { code, tkey: rand(24), created: Date.now(), snap: { phase: 'lobby', day: 0, n: N, teams: [] } };
        const ok = await store.cmd('SET', rk(code), JSON.stringify(room), 'NX', 'EX', TTL);
        if (ok) { await store.cmd('DEL', ik(code)); return U.sendJson(res, 200, { ok: true, code, tkey: room.tkey }); }
      }
      return bad(res, '방 코드를 만들지 못했어요. 다시 눌러 주세요.', 500);
    }

    const code = normCode(b.code);
    if (code.length !== 4) return bad(res, '방 코드는 숫자 4자리예요.');
    const room = await loadRoom(code);
    if (!room) return bad(res, '그런 방이 없어요. 코드를 다시 확인해 주세요.', 404);

    /* ── 선생님 ── */
    if (a === 'state' || a === 'tpoll' || a === 'kick') {
      if (!teacherOf(room, b.tkey)) return bad(res, '선생님 화면만 할 수 있어요.', 403);
      if (a === 'state') {
        const s = JSON.stringify(b.snap || {});
        if (s.length > SNAP_MAX) return bad(res, '상태가 너무 커요.');
        room.snap = JSON.parse(s);
        room.updated = Date.now();
        await saveRoom(room);
      }
      if (a === 'kick') {
        const i = teamIdx(b.team); if (i < 0) return bad(res, '팀 번호가 이상해요.');
        await store.cmd('HDEL', ik(code), 'join:' + i);
      }
      return U.sendJson(res, 200, { ok: true, inbox: await inbox(code) });
    }

    /* ── 팀 입장 ── */
    if (a === 'join') {
      const i = teamIdx(b.team); if (i < 0) return bad(res, '팀을 골라 주세요.');
      const js = await joins(code);
      const cur = js[i];
      if (cur && cur.token) {
        if (typeof b.token === 'string' && U.safeEqual(cur.token, b.token)) {
          const name = cleanName(b.name) || cur.name;
          await hset(code, 'join:' + i, { ...cur, name });
          return U.sendJson(res, 200, { ok: true, token: cur.token, team: i, name });
        }
        return bad(res, '그 팀은 이미 다른 태블릿이 들어와 있어요. 다른 팀을 고르거나 선생님께 말해 주세요.', 409);
      }
      const started = room.snap && room.snap.phase && room.snap.phase !== 'lobby' && room.snap.phase !== 'title';
      const seat = started ? (room.snap.teams || [])[i] : null;
      if (started && (!seat || seat.ai))   // 시작 뒤에는, 선생님이 자리를 비워 준 '사람 팀' 자리에만 다시 들어올 수 있다
        return bad(res, '이미 시작된 장날이에요. 선생님께 말해 주세요.', 409);
      const token = rand(24), name = cleanName(b.name) || `${i + 1}모둠`;
      await hset(code, 'join:' + i, { name, token, at: Date.now() });
      return U.sendJson(res, 200, { ok: true, token, team: i, name });
    }

    /* ── 팀 ── */
    const me = await teamOf(code, b.token);
    if (me < 0) return bad(res, '이 방에 들어와 있지 않아요. 다시 입장해 주세요.', 403);
    const snap = room.snap || {};

    if (a === 'poll') {
      const day = snap.day || 0;
      const fields = ['plan:' + day + ':' + me];
      const spot = snap.auction && typeof snap.auction.spot === 'number' ? snap.auction.spot : -1;
      if (spot >= 0) fields.push('bid:' + day + ':' + spot + ':' + me);
      const vals = await store.cmd('HMGET', ik(code), ...fields);
      const parse = v => { if (v == null) return null; try { return JSON.parse(v); } catch { return v; } };
      return U.sendJson(res, 200, { ok: true, me, snap, plan: parse(vals[0]), bid: spot >= 0 ? parse(vals[1]) : null, now: Date.now() });
    }
    if (a === 'leave') { await store.cmd('HDEL', ik(code), 'join:' + me); return U.sendJson(res, 200, { ok: true }); }

    if (a === 'bid') {
      const day = Number(b.day), spot = Number(b.spot), amount = Number(b.amount);
      if (snap.phase !== 'auction' || !snap.auction || snap.auction.open !== true) return bad(res, '지금은 입찰을 받지 않아요.');
      if (day !== snap.day || spot !== snap.auction.spot) return bad(res, '경매가 넘어갔어요. 화면을 확인해 주세요.');
      const t = (snap.teams || [])[me];
      if (!t || t.spot != null) return bad(res, '이미 집터가 정해진 팀이에요.');
      if (!Number.isFinite(amount) || amount < 0 || amount % 5000 !== 0 || amount > (snap.start || 150000)) return bad(res, '금액은 5,000원 단위로, 밑천 안에서만 쓸 수 있어요.');
      await hset(code, `bid:${day}:${spot}:${me}`, { amount, at: Date.now() });
      return U.sendJson(res, 200, { ok: true });
    }
    if (a === 'plan') {
      const day = Number(b.day);
      if (snap.phase !== 'decide') return bad(res, '지금은 가게 준비를 받지 않아요.');
      if (day !== snap.day) return bad(res, '장날이 넘어갔어요. 화면을 확인해 주세요.');
      const d = b.d || {};
      const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
      const clean = {
        p: { gam: { price: num(d.p && d.p.gam && d.p.gam.price, 0, 9900), qty: num(d.p && d.p.gam && d.p.gam.qty, 0, 200) },
             ice: { price: num(d.p && d.p.ice && d.p.ice.price, 0, 9900), qty: num(d.p && d.p.ice && d.p.ice.qty, 0, 200) } },
        quality: d.quality === 'good' ? 'good' : 'normal',
        pack: d.pack === 'pretty' ? 'pretty' : 'basic',
        promo: Array.isArray(d.promo) ? [...new Set(d.promo.filter(k => ['insta', 'flyer', 'taste'].includes(k)))] : [],
        note: String(d.note || '').replace(/[<>]/g, '').slice(0, 40),
        at: Date.now(),
      };
      await hset(code, `plan:${day}:${me}`, clean);
      return U.sendJson(res, 200, { ok: true });
    }
    return bad(res, '모르는 요청이에요.');
  } catch (e) {
    return bad(res, '서버 오류: ' + (e && e.message ? e.message : e), 500);
  }
};
