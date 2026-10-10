'use strict';
/* 수업 코드 — 저장·조회·기록 */
const store = require('./store');
const U = require('./util');

const K = {
  codes: 'pc:codes',                     // 코드 목록 (집합)
  code: c => 'pc:code:' + c,             // 코드 한 개의 정보 (JSON)
  dev: c => 'pc:dev:' + c,               // 그 코드로 입장한 기기 번호들 (집합)
  cnt: c => 'pc:cnt:' + c,               // 입장 횟수
  last: c => 'pc:last:' + c,             // 마지막 입장 시각
  ev: 'pc:ev',                           // 최근 기록 (목록)
  rl: (kind, h) => `pc:rl:${kind}:${h}`, // 시도 제한
};
const KEEP_SEC = 60 * 60 * 24 * 120;     // 입장 기록은 120일 뒤 자동 삭제
const EVENT_KEEP = 500;

/* ── 코드 한 개 읽기 (함수 한 대 안에서 15초만 기억) ───────── */
const cache = new Map();
const CACHE_MS = 15000;

async function getCode(code, opts) {
  const now = Date.now();
  const hit = cache.get(code);
  if (!(opts && opts.fresh) && hit && now - hit.t < CACHE_MS) return hit.v;
  const raw = await store.cmd('GET', K.code(code));
  let v = null;
  if (raw) { try { v = JSON.parse(raw); } catch { v = null; } }
  cache.set(code, { t: now, v });
  return v;
}
function forget(code) { cache.delete(code); }

/* ── 발급 ──────────────────────────────────────────────── */
async function createCode({ label, teacher, date, limit, apps }) {
  const rec = {
    label: String(label).slice(0, 40),
    teacher: String(teacher || '').slice(0, 30),
    date,
    limit: limit > 0 ? Math.min(Math.floor(limit), 999) : 0,
    apps,
    createdAt: Date.now(),
    revoked: false,
  };
  for (let i = 0; i < 12; i++) {
    const code = U.newCode();
    rec.code = code;
    const ok = await store.cmd('SET', K.code(code), JSON.stringify(rec), 'NX');
    if (ok === 'OK') {
      await store.cmd('SADD', K.codes, code);
      return rec;
    }
  }
  throw new Error('코드를 만들지 못했어요. 다시 눌러 주세요.');
}

async function setRevoked(code, revoked) {
  const rec = await getCode(code, { fresh: true });
  if (!rec) return null;
  rec.revoked = !!revoked;
  rec.revokedAt = revoked ? Date.now() : 0;
  await store.cmd('SET', K.code(code), JSON.stringify(rec));
  forget(code);
  return rec;
}

/* ── 목록 (관리 화면용) ─────────────────────────────────── */
/* 저장소 사용량을 아끼려고, 입장 통계는 최근 14일 코드만 읽는다 (더 오래된 코드는 통계 칸이 비어 보인다) */
const STATS_DAYS = 14;

async function listCodes() {
  const members = await store.cmd('SMEMBERS', K.codes);
  if (!members || !members.length) return [];
  const raws = await store.pipeline(members.map(c => ['GET', K.code(c)]));
  const list = [];
  raws.forEach(raw => {
    if (!raw) return;
    try { list.push(JSON.parse(raw)); } catch { /* 깨진 항목은 건너뜀 */ }
  });
  const from = U.kstDate(Date.now() - STATS_DAYS * 86400000);
  const recent = list.filter(r => r.date >= from);
  if (recent.length) {
    const out = await store.pipeline(recent.flatMap(r => [['SCARD', K.dev(r.code)], ['GET', K.cnt(r.code)], ['GET', K.last(r.code)]]));
    recent.forEach((r, i) => {
      r.devices = Number(out[i * 3]) || 0;
      r.entries = Number(out[i * 3 + 1]) || 0;
      r.lastEntry = Number(out[i * 3 + 2]) || 0;
    });
  }
  list.forEach(r => { if (r.devices === undefined) { r.devices = null; r.entries = null; r.lastEntry = 0; } });
  list.sort((a, b) => (b.date + String(b.createdAt)).localeCompare(a.date + String(a.createdAt)));
  return list;
}

/* ── 입장 기록 ─────────────────────────────────────────── */
async function recordEntry(code, deviceId) {
  const [added] = await store.pipeline([
    ['SADD', K.dev(code), deviceId],
    ['INCR', K.cnt(code)],
    ['SET', K.last(code), String(Date.now())],
    ['EXPIRE', K.dev(code), KEEP_SEC],
    ['EXPIRE', K.cnt(code), KEEP_SEC],
    ['EXPIRE', K.last(code), KEEP_SEC],
  ]);
  return { isNewDevice: Number(added) === 1 };
}

async function recordEvent(ev) {
  try {
    await store.pipeline([
      ['LPUSH', K.ev, JSON.stringify(Object.assign({ t: Date.now() }, ev))],
      ['LTRIM', K.ev, 0, EVENT_KEEP - 1],
    ]);
  } catch { /* 기록이 안 돼도 입장은 막지 않는다 */ }
}

async function recentEvents(n) {
  const rows = await store.cmd('LRANGE', K.ev, 0, (n || 100) - 1);
  return (rows || []).map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
}

/* ── 시도 제한 ─────────────────────────────────────────── */
async function rlCount(kind, hash) {
  const v = await store.cmd('GET', K.rl(kind, hash));
  return Number(v) || 0;
}
async function rlHit(kind, hash, windowSec) {
  const n = await store.cmd('INCR', K.rl(kind, hash));
  if (n === 1) await store.cmd('EXPIRE', K.rl(kind, hash), windowSec);
  return n;
}
async function rlClear(kind, hash) { await store.cmd('DEL', K.rl(kind, hash)); }

module.exports = {
  getCode, forget, createCode, setRevoked, listCodes,
  recordEntry, recordEvent, recentEvents,
  rlCount, rlHit, rlClear,
};
