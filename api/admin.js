'use strict';
/* 송 전용 관리 화면과 그 기능 (로그인 · 코드 발급 · 중지 · 감시).
   주소: /class-admin  (vercel.json 의 rewrites 가 이 함수로 보낸다) */
const fs = require('fs');
const path = require('path');
const U = require('./_lib/util');
const codes = require('./_lib/codes');
const store = require('./_lib/store');

const ADMIN_HTML = fs.readFileSync(path.join(__dirname, '_private', '_ui', 'admin.html'), 'utf8');

const ADMIN_SESSION_SEC = 12 * 3600;   // 로그인 유지 12시간
const LOGIN_FAIL_LIMIT = 8;            // 비밀번호를 15분 안에 틀려도 되는 횟수
const LOGIN_WINDOW = 900;
const FAIL_WARN = 10;                  // 10분 안에 틀린 코드 입력이 이만큼이면 경고
const WINDOW_MS = 10 * 60 * 1000;

function statusOf(rec, today) {
  if (rec.revoked) return 'revoked';
  if (rec.date > today) return 'upcoming';
  if (rec.date === today) return 'today';
  return 'expired';
}

function isAdmin(req) {
  return !!U.verify('admin', U.parseCookies(req.headers.cookie).pc_admin);
}

function warningsFor(list, events, today) {
  const out = [];
  const label = c => `"${c.label}" (${U.prettyCode(c.code)})`;

  list.forEach(c => {
    if (c.limit > 0 && c.devices > c.limit && (c.date === today || c.date > today) && !c.revoked) {
      out.push(`${label(c)} 코드로 기기 ${c.devices}대가 들어왔어요. 예상 인원은 ${c.limit}명이에요. 다른 곳으로 코드가 퍼졌는지 확인해 보세요.`);
    }
  });

  const since = Date.now() - WINDOW_MS;
  const recentFails = events.filter(e => e.k === 'fail' && e.t >= since);
  if (recentFails.length >= FAIL_WARN) {
    const by = {};
    recentFails.forEach(e => { by[e.r] = (by[e.r] || 0) + 1; });
    const names = { format: '6자리가 아님', unknown: '없는 코드', revoked: '중지된 코드', early: '아직 안 열린 코드', expired: '날짜 지난 코드', app: '허용 안 된 놀이도시' };
    const parts = Object.keys(by).map(k => `${names[k] || k} ${by[k]}번`).join(', ');
    out.push(`최근 10분 동안 틀린 코드 입력이 ${recentFails.length}번 있었어요. (${parts}) 코드를 모르는 사람이 접속을 시도하는 걸 수 있어요.`);
  }
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    U.noStore(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(req.method === 'HEAD' ? undefined : ADMIN_HTML);
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return U.sendJson(res, 405, { ok: false, msg: '잘못된 요청이에요.' });
  }
  if (!U.sameOrigin(req) || !/application\/json/i.test(String(req.headers['content-type'] || ''))) {
    return U.sendJson(res, 403, { ok: false, msg: '잘못된 요청이에요.' });
  }
  if (!U.configured()) {
    return U.sendJson(res, 503, { ok: false, msg: '관리자 비밀번호(ADMIN_PASSWORD)가 아직 설정되지 않았어요. (8자 이상)' });
  }

  const body = U.readBody(req);
  const action = String(body.action || '');

  try {
    /* ── 로그인 ── */
    if (action === 'login') {
      if (!store.available()) {
        /* 저장소가 없어도 로그인은 되게 한다 (안내 문구를 보여 주기 위해). 시도 제한은 건너뜀. */
        if (U.safeEqual(String(body.password || ''), U.adminPassword())) return loginOk(req, res);
        return U.sendJson(res, 200, { ok: false, msg: '비밀번호가 맞지 않아요.' });
      }
      const ih = U.ipHash(req);
      if ((await codes.rlCount('admin', ih)) >= LOGIN_FAIL_LIMIT) {
        return U.sendJson(res, 429, { ok: false, msg: '너무 여러 번 틀렸어요. 15분 뒤에 다시 해 보세요.' });
      }
      if (U.safeEqual(String(body.password || ''), U.adminPassword())) {
        await codes.rlClear('admin', ih);
        return loginOk(req, res);
      }
      await codes.rlHit('admin', ih, LOGIN_WINDOW);
      return U.sendJson(res, 200, { ok: false, msg: '비밀번호가 맞지 않아요.' });
    }

    if (action === 'logout') {
      U.addCookies(res, [U.cookie(req, 'pc_admin', '', 0)]);
      return U.sendJson(res, 200, { ok: true });
    }

    /* ── 여기부터는 로그인이 필요 ── */
    if (!isAdmin(req)) return U.sendJson(res, 200, { ok: false, login: true, msg: '다시 로그인해 주세요.' });

    const today = U.kstDate();

    if (action === 'state') {
      if (!store.available()) {
        return U.sendJson(res, 200, { ok: true, today, store: 'none', codes: [], events: [], warnings: [] });
      }
      const [list, events] = await Promise.all([codes.listCodes(), codes.recentEvents(200)]);
      list.forEach(c => { c.status = statusOf(c, today); });
      return U.sendJson(res, 200, { ok: true, today, store: store.mode(), codes: list, events, warnings: warningsFor(list, events, today) });
    }

    if (!store.available()) return U.sendJson(res, 503, { ok: false, msg: '저장소가 아직 연결되지 않았어요.' });

    if (action === 'create') {
      const label = String(body.label || '').trim();
      const date = String(body.date || '');
      const apps = Array.isArray(body.apps) ? body.apps.filter(a => Object.prototype.hasOwnProperty.call(U.GRANTS, a)) : [];
      if (!label) return U.sendJson(res, 200, { ok: false, msg: '반 이름을 적어 주세요.' });
      if (!U.isDateStr(date)) return U.sendJson(res, 200, { ok: false, msg: '날짜를 골라 주세요.' });
      if (date < today) return U.sendJson(res, 200, { ok: false, msg: '지난 날짜로는 발급할 수 없어요.' });
      if (!apps.length) return U.sendJson(res, 200, { ok: false, msg: '쓸 수 있는 놀이도시를 하나 이상 골라 주세요.' });
      const rec = await codes.createCode({ label, teacher: body.teacher, date, limit: Number(body.limit) || 0, apps: [...new Set(apps)] });
      return U.sendJson(res, 200, { ok: true, code: rec });
    }

    if (action === 'revoke' || action === 'restore') {
      const code = U.normalizeCode(body.code);
      const rec = await codes.setRevoked(code, action === 'revoke');
      if (!rec) return U.sendJson(res, 200, { ok: false, msg: '없는 코드예요.' });
      return U.sendJson(res, 200, { ok: true });
    }

    return U.sendJson(res, 400, { ok: false, msg: '알 수 없는 요청이에요.' });
  } catch (err) {
    console.error('admin error', err && err.message);
    return U.sendJson(res, 500, { ok: false, msg: '잠시 문제가 생겼어요. 다시 눌러 주세요.' });
  }
};

function loginOk(req, res) {
  const token = U.sign('admin', { r: 'admin', e: Math.floor(Date.now() / 1000) + ADMIN_SESSION_SEC });
  U.addCookies(res, [U.cookie(req, 'pc_admin', token, ADMIN_SESSION_SEC)]);
  return U.sendJson(res, 200, { ok: true });
}
