'use strict';
/* 학생이 입력한 수업 코드를 확인하고, 맞으면 입장 쿠키를 준다. */
const U = require('./_lib/util');
const codes = require('./_lib/codes');
const store = require('./_lib/store');

const FAIL_LIMIT = 60;          // 같은 곳(예: 한 학교 와이파이)에서 10분 동안 틀려도 되는 횟수
const FAIL_WINDOW = 600;        // 초
const FAIL_LOG_MAX = 30;        // 기록에 남기는 실패 횟수 (넘치면 기록은 생략)
const DEVICE_COOKIE_SEC = 60 * 60 * 24 * 120;

function fmtDate(d) { const [, m, dd] = d.split('-'); return `${Number(m)}월 ${Number(dd)}일`; }

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return U.sendJson(res, 405, { ok: false, msg: '잘못된 요청이에요.' });
  }
  if (!U.sameOrigin(req)) return U.sendJson(res, 403, { ok: false, msg: '잘못된 요청이에요.' });
  if (!U.configured()) return U.sendJson(res, 503, { ok: false, msg: '아직 준비 중이에요. 선생님께 알려 주세요.' });
  if (!store.available()) return U.sendJson(res, 503, { ok: false, msg: '지금은 입장 확인이 안 돼요. 선생님께 알려 주세요.' });

  const body = U.readBody(req);
  const appKey = String(body.app || '');
  const app = Object.prototype.hasOwnProperty.call(U.APPS, appKey) ? U.APPS[appKey] : null;
  if (!app) return U.sendJson(res, 400, { ok: false, msg: '잘못된 요청이에요.' });

  try {
    const ih = U.ipHash(req);
    const fails = await codes.rlCount('code', ih);
    if (fails >= FAIL_LIMIT) {
      return U.sendJson(res, 429, { ok: false, msg: '너무 여러 번 틀렸어요. 10분 뒤에 다시 해 보세요.' });
    }

    const fail = async (reason, msg) => {
      const n = await codes.rlHit('code', ih, FAIL_WINDOW);
      if (n <= FAIL_LOG_MAX) await codes.recordEvent({ k: 'fail', r: reason, a: appKey, ip: ih.slice(0, 6) });
      return U.sendJson(res, 200, { ok: false, msg });
    };

    const code = U.normalizeCode(body.code);
    if (code.length !== 6) return fail('format', '코드는 6자리예요. 칠판에 적힌 코드를 다시 확인해 주세요.');

    const rec = await codes.getCode(code, { fresh: true });
    if (!rec) return fail('unknown', '없는 코드예요. 글자를 다시 확인해 주세요.');
    if (rec.revoked) return fail('revoked', '중지된 코드예요. 선생님께 문의해 주세요.');

    const today = U.kstDate();
    if (today < rec.date) return fail('early', `아직 열리지 않은 코드예요. (${fmtDate(rec.date)}에 열려요)`);
    if (today > rec.date) return fail('expired', '수업 날짜가 지난 코드예요. 새 코드를 받아 주세요.');
    if (!rec.apps.includes(app.grant)) return fail('app', '이 놀이도시에서는 쓸 수 없는 코드예요.');

    /* 통과 — 기기 번호(무작위)를 붙여 입장 기록을 남긴다 */
    const cookies = U.parseCookies(req.headers.cookie);
    let dev = /^d[A-Za-z0-9_-]{8,16}$/.test(cookies.pc_dev || '') ? cookies.pc_dev : U.newDeviceId();
    const { isNewDevice } = await codes.recordEntry(code, dev);
    await codes.recordEvent({ k: 'ok', c: code, a: appKey, d: dev.slice(1, 5), n: isNewDevice ? 1 : 0, ip: ih.slice(0, 6) });

    const expMs = U.endOfKstDay(rec.date);
    const token = U.sign('session', { c: code, a: rec.apps, e: Math.floor(expMs / 1000) });
    U.addCookies(res, [
      U.cookie(req, 'pc_session', token, (expMs - Date.now()) / 1000),
      U.cookie(req, 'pc_dev', dev, DEVICE_COOKIE_SEC),
    ]);
    return U.sendJson(res, 200, { ok: true });
  } catch (err) {
    console.error('code error', err && err.message);
    return U.sendJson(res, 500, { ok: false, msg: '잠시 문제가 생겼어요. 다시 눌러 주세요.' });
  }
};
