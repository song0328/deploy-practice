'use strict';
/* 놀이도시 입구.
   /ai-ethics-city/ · /playcity/ · /playcity-standalone.html 로 오는 모든 요청이 vercel.json 의
   rewrites 를 거쳐 여기로 온다. 입장 쿠키가 맞으면 api/_private 안의 게임 파일을 내주고,
   아니면 코드 입력 화면을 보여 준다. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const U = require('./_lib/util');
const codes = require('./_lib/codes');
const store = require('./_lib/store');

const GATE_HTML = fs.readFileSync(path.join(__dirname, '_private', '_ui', 'gate.html'), 'utf8');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.map': 'application/json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.txt', '.svg', '.map']);

/* 예전에 이 기기에 저장된 오프라인 캐시(서비스워커)를 지우고 스스로 사라지는 스크립트 */
const CLEANUP_SW = `/* 입장 코드 방식으로 바뀌어서, 예전에 저장해 둔 오프라인 캐시를 정리하고 물러난다 */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try { var ks = await caches.keys(); await Promise.all(ks.map(function (k) { return caches.delete(k); })); } catch (_) {}
    try { await self.registration.unregister(); } catch (_) {}
    try { var cs = await self.clients.matchAll({ type: 'window' }); cs.forEach(function (c) { try { c.navigate(c.url); } catch (_) {} }); } catch (_) {}
  })());
});
`;

const NOTES = {
  revoked: '이 수업 코드는 중지됐어요. 선생님께 새 코드를 받아 주세요.',
  unknown: '이 코드는 더 이상 쓸 수 없어요. 새 코드를 입력해 주세요.',
  app: '이 코드로는 이 놀이도시에 들어올 수 없어요. 선생님께 확인해 주세요.',
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function gatePage(appKey, app, reason) {
  const note = NOTES[reason] ? `<div class="note">${esc(NOTES[reason])}</div>` : '';
  return GATE_HTML
    .replace(/\{\{TITLE\}\}/g, esc(app.title))
    .replace('{{NOTE}}', note)
    .replace('{{APP_JSON}}', JSON.stringify(appKey));
}

function noticePage(title, text) {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title>
<body style="font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;line-height:1.6">
<h2>${esc(title)}</h2><p>${esc(text)}</p></body></html>`;
}

/* ── 게임 파일 위치 ─────────────────────────────────────── */
function privateRoot() {
  const cands = [path.join(__dirname, '_private'), path.join(process.cwd(), 'api', '_private')];
  return cands.find(c => fs.existsSync(c)) || cands[0];
}

function resolveFile(app, rel) {
  if (!rel) rel = 'index.html';
  if (rel.includes('..') || rel.includes('\0') || rel.includes('\\')) return null;
  const dir = path.join(privateRoot(), app.dir);
  let full = path.join(dir, rel);
  if (!full.startsWith(dir + path.sep)) return null;
  try {
    if (fs.statSync(full).isDirectory()) full = path.join(full, 'index.html');
    return fs.statSync(full).isFile() ? full : null;
  } catch { return null; }
}

const fileCache = new Map();
function load(full) {
  let e = fileCache.get(full);
  if (!e) { e = { buf: fs.readFileSync(full), gz: null }; fileCache.set(full, e); }
  return e;
}

function serveFile(req, res, full) {
  const ext = path.extname(full).toLowerCase();
  const e = load(full);
  U.noStore(res);
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  /* 화면(html)은 저장하지 않고, 나머지 파일은 이 기기에서만 10분 기억 */
  res.setHeader('Cache-Control', ext === '.html' ? 'private, no-store' : 'private, max-age=600');
  res.setHeader('Vary', 'Cookie, Accept-Encoding');
  let body = e.buf;
  if (body.length > 1024 && COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
    if (!e.gz) e.gz = zlib.gzipSync(body, { level: 6 });
    body = e.gz;
    res.setHeader('Content-Encoding', 'gzip');
  }
  res.setHeader('Content-Length', body.length);
  res.statusCode = 200;
  if (req.method === 'HEAD') return res.end();
  res.end(body);
}

/* ── 입장 확인 ─────────────────────────────────────────── */
async function checkSession(req, app) {
  const cookies = U.parseCookies(req.headers.cookie);

  /* 송이 관리 화면에 로그인해 둔 상태면 확인용으로 들어갈 수 있다 */
  if (U.verify('admin', cookies.pc_admin)) return { ok: true, admin: true };

  const tok = U.verify('session', cookies.pc_session);
  if (!tok || !Array.isArray(tok.a)) return { ok: false };
  if (!tok.a.includes(app.grant)) return { ok: false, reason: 'app' };

  if (!store.available()) return { ok: true };       // 저장소가 잠깐 안 되어도 이미 입장한 학생은 계속
  try {
    const rec = await codes.getCode(tok.c);
    if (!rec) return { ok: false, reason: 'unknown' };
    if (rec.revoked) return { ok: false, reason: 'revoked' };
  } catch { /* 저장소 오류 — 서명이 맞는 입장 쿠키는 그대로 인정 */ }
  return { ok: true };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return U.sendText(res, 405, 'Method Not Allowed');
  }

  const q = req.query || {};
  const appKey = String(q.app || '');
  const app = Object.prototype.hasOwnProperty.call(U.APPS, appKey) ? U.APPS[appKey] : null;
  if (!app) return U.sendText(res, 404, 'Not found');

  let rel = String(q.p || '').replace(/^\/+/, '');
  if (rel.includes('%')) { try { rel = decodeURIComponent(rel); } catch { /* 그대로 */ } }

  /* 예전 오프라인 캐시를 정리하는 서비스워커 (비밀 내용 없음 — 입장 확인 없이 내준다) */
  if (appKey === 'playcity' && rel === 'sw.js') {
    U.noStore(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Service-Worker-Allowed', '/playcity/');
    return res.end(req.method === 'HEAD' ? undefined : CLEANUP_SW);
  }

  if (!U.configured()) {
    return U.sendHtml(res, 503, noticePage('아직 준비 중이에요', '관리자 설정이 끝나지 않아 지금은 열 수 없어요.'));
  }

  const auth = await checkSession(req, app);
  if (!auth.ok) {
    const isDoc = !rel || /\.html?$/i.test(rel);
    if (isDoc) return U.sendHtml(res, 200, gatePage(appKey, app, auth.reason));
    return U.sendText(res, 401, '수업 코드가 필요해요.');
  }

  const full = resolveFile(app, rel);
  if (!full) return U.sendText(res, 404, 'Not found');
  return serveFile(req, res, full);
};
