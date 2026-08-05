/* eslint-env node */
/**
 * 관리자 엔드포인트 공통 게이트.
 *
 * 표준은 clients-link.js 다 — env 시크릿 + timingSafeEqual + 실패 시 404(존재 은폐).
 * client-partner.js·influencer-schedule.js 의 `?t=` 방식은 **공유토큰(데이터 스코핑)**이지
 * 인증이 아니다. 전체 덤프와 쓰기가 가능한 관리자 엔드포인트에 그걸 복사하면 안 된다.
 *
 * 키는 CLIENTS_ADMIN_KEY 를 재사용한다. 관리자 페르소나가 같고 이미 배포에 설정돼 있어,
 * 새 환경변수를 넣기 전까지 관리자 화면이 죽는 일이 없다.
 * 굳이 분리하고 싶으면 ADMIN_KEY 를 따로 넣으면 그쪽이 우선한다.
 *
 * 파일명 앞의 `_` 는 Vercel 이 이걸 라우트로 만들지 않게 하는 표시다.
 */

import crypto from 'crypto';

const ADMIN_KEY = process.env.ADMIN_KEY || process.env.CLIENTS_ADMIN_KEY || '';

/** 개인별 관리자 키 (2026-08-06 도입) — 두 형식을 다 받는다:
    ① ADMIN_KEYS="GG:키1,QN:키2" (한 줄 목록)
    ② ADMIN_KEY_GG="키1", ADMIN_KEY_QN="키2" (개별 변수 — Vercel UI 에서 긴 값
       저장이 실패하는 경우의 우회로, 2026-08-06 실전에서 필요해짐)
    키가 곧 신원이라 나중에 수정이력에 누가 했는지 남길 수 있다. */
export function parseAdminKeys() {
  const out = [];
  String(process.env.ADMIN_KEYS || '').split(',').forEach((pair) => {
    const i = pair.indexOf(':');
    if (i <= 0) return;
    const id = pair.slice(0, i).trim();
    const key = pair.slice(i + 1).trim();
    if (id && key) out.push([id, key]);
  });
  Object.keys(process.env).forEach((name) => {
    const m = /^ADMIN_KEY_([A-Za-z0-9]+)$/.exec(name);
    if (!m) return;
    const key = String(process.env[name] || '').trim();
    if (key) out.push([m[1], key]);
  });
  return out;
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
  catch { return false; }
}
export { safeEqual };

/** 제시된 키의 관리자 신원 — 개인ID | 'admin'(공용키) | null(불일치) */
export function adminWho(provided) {
  for (const [id, key] of parseAdminKeys()) {
    if (safeEqual(provided, key)) return id;
  }
  if (ADMIN_KEY && safeEqual(provided, ADMIN_KEY)) return 'admin';
  return null;
}

/**
 * 통과하면 false, 막았으면 true — 호출부는 true 일 때 즉시 return 한다.
 * 응답은 이 함수가 직접 보낸다.
 */
export function blockedByAdminGate(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // 키가 설정 안 된 배포에서 통과시키면 게이트가 없는 것과 같다.
  // 열어두느니 닫는다 — 정산·계약 데이터라 오작동보다 노출이 비싸다.
  if (!ADMIN_KEY && !parseAdminKeys().length) {
    res.status(503).json({ error: 'ADMIN_KEYS (또는 CLIENTS_ADMIN_KEY) 가 설정되지 않았습니다.' });
    return true;
  }

  const provided = String(req.headers['x-admin-key'] || req.query?.k || '');
  if (!adminWho(provided)) {
    // 존재 자체를 숨긴다. 401 을 주면 "여기 관리자 API 가 있다"는 신호가 된다.
    res.status(404).json({ error: 'Not found' });
    return true;
  }
  return false;
}

/**
 * Airtable filterByFormula 안에 들어갈 문자열 리터럴 이스케이프.
 *
 * ⚠️ `String(v).replace(/'/g, "\'")` 는 **아무 일도 하지 않는다.**
 *    JS 에서 "\'" 는 그냥 "'" 이라 작은따옴표를 자기 자신으로 바꾼다.
 *    client-partner.js 에 실제로 이 버그가 있었다(no-op 이스케이프).
 *    백슬래시를 먼저 늘리지 않으면 `\` 로 끝나는 입력이 다음 따옴표를 삼킨다.
 *
 * 이스케이프에만 의존하지 말고, 가능하면 호출부에서 화이트리스트 정규식으로 먼저 거를 것.
 */
export function escFormula(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
