'use strict';
/* 놀이도시 입장 코드 — 공통 도구
   이 폴더(api/_lib)는 이름이 _ 로 시작해서 주소로는 열리지 않고, 다른 함수들이 가져다 쓴다. */
const crypto = require('crypto');

const KST_MS = 9 * 3600 * 1000;

/* 입장 대상 목록. key = 주소에 쓰이는 이름, grant = 코드에 "허용"으로 저장되는 이름 */
const APPS = {
  'ai-ethics-city':      { title: 'AI 윤리 놀이도시', grant: 'ai-ethics-city', dir: 'ai-ethics-city', mount: true },
  'playcity':            { title: '스마트 놀이도시',  grant: 'playcity',       dir: 'playcity',       mount: true },
  'playcity-standalone': { title: '스마트 놀이도시',  grant: 'playcity',       dir: 'playcity-standalone', mount: false },
};
const GRANTS = {
  'ai-ethics-city': 'AI 윤리 놀이도시',
  'playcity': '스마트 놀이도시',
};

/* ── 비밀값 ─────────────────────────────────────────────── */
function adminPassword() { return process.env.ADMIN_PASSWORD || ''; }

function configured() {
  const base = process.env.SESSION_SECRET || adminPassword();
  return base.length >= 8 && adminPassword().length >= 8;
}

function secretFor(purpose) {
  const base = process.env.SESSION_SECRET || adminPassword();
  return crypto.createHmac('sha256', base || 'unset').update('playcity:' + purpose).digest();
}

/* ── 서명된 토큰 (쿠키 값) ──────────────────────────────── */
function sign(purpose, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secretFor(purpose)).update(body).digest('base64url');
  return body + '.' + sig;
}

function verify(purpose, token) {
  if (!token || typeof token !== 'string') return null;
  const i = token.indexOf('.');
  if (i < 1) return null;
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const want = crypto.createHmac('sha256', secretFor(purpose)).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!payload || typeof payload.e !== 'number' || payload.e * 1000 < Date.now()) return null;
  return payload;
}

function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

/* ── 쿠키 ──────────────────────────────────────────────── */
function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

function isHttps(req) {
  return req.headers['x-forwarded-proto'] === 'https' || !!process.env.VERCEL;
}

function cookie(req, name, value, maxAgeSec) {
  let s = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`;
  if (isHttps(req)) s += '; Secure';
  return s;
}

function addCookies(res, list) {
  const prev = res.getHeader('Set-Cookie');
  const all = (Array.isArray(prev) ? prev : prev ? [prev] : []).concat(list);
  res.setHeader('Set-Cookie', all);
}

/* ── 시간 (한국 시간 기준 "수업 당일") ───────────────────── */
function kstDate(ms) {
  return new Date((ms === undefined ? Date.now() : ms) + KST_MS).toISOString().slice(0, 10);
}
function endOfKstDay(dateStr) {
  return Date.parse(dateStr + 'T00:00:00Z') - KST_MS + 86400000 - 1;
}
function isDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
}

/* ── 코드 ──────────────────────────────────────────────── */
/* 헷갈리는 글자(0 O 1 I L)를 뺀 31자 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return s;
}
function normalizeCode(input) {
  return String(input || '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function prettyCode(code) { return code.slice(0, 3) + '-' + code.slice(3); }

function newDeviceId() { return 'd' + crypto.randomBytes(9).toString('base64url'); }

/* ── 요청 도구 ─────────────────────────────────────────── */
function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '';
}
/* 접속 주소를 그대로 저장하지 않고, 짧게 줄인 지문만 쓴다 (같은 곳에서 왔는지만 구분) */
function ipHash(req) {
  return crypto.createHmac('sha256', secretFor('ip')).update(clientIp(req)).digest('hex').slice(0, 16);
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b && typeof b === 'object' ? b : {};
}

/* ── 응답 ──────────────────────────────────────────────── */
function noStore(res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}
function sendJson(res, status, obj) {
  noStore(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}
function sendHtml(res, status, html) {
  noStore(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}
function sendText(res, status, text) {
  noStore(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}

module.exports = {
  APPS, GRANTS, KST_MS,
  adminPassword, configured, sign, verify, safeEqual,
  parseCookies, cookie, addCookies, isHttps,
  kstDate, endOfKstDay, isDateStr,
  newCode, normalizeCode, prettyCode, newDeviceId, ALPHABET,
  clientIp, ipHash, sameOrigin, readBody,
  noStore, sendJson, sendHtml, sendText,
};
