/* eslint-env node */
/**
 * 담당자(섭외 실무) 엔드포인트 공통 게이트.
 *
 * _admin-auth.js 와 같은 패턴(env 시크릿 + timingSafeEqual + 실패 시 404 은폐)이지만
 * **키를 분리한다.** admin 키는 목표 수정·Campaign 전량 덤프 권한이라, 담당자 4명에게
 * 그 키를 주면 권한 분리가 사라진다. 담당자 키의 범위는 조회(보드·큐)와
 * 이후 Phase 의 예약입력_DB 생성·진행 건 수정까지다.
 *
 * 키 우선순위 (제시된 키를 위에서부터 대조):
 *   1) STAFF_KEYS  — "HH:키1,LH:키2" 개인별 키. 키가 곧 신원이라 파라미터 조작이 안 통하고,
 *                    이후 수정이력에 누가 했는지 남길 수 있다. (Phase 2~3)
 *   2) STAFF_KEY   — 공용 담당자 키. (Phase 1 은 이걸로 시작해도 된다)
 *   3) ADMIN_KEY / CLIENTS_ADMIN_KEY — 관리자는 상위 권한이므로 담당자 화면도 통과.
 *                    덕분에 STAFF_KEY 를 Vercel 에 넣기 전에도 화면이 죽지 않는다.
 *
 * 아무 키도 설정돼 있지 않으면 503 fail-closed — 열어두느니 닫는다.
 */

import crypto from 'crypto';
import { adminWho, parseAdminKeys } from './_admin-auth.js';

const ADMIN_KEY = process.env.ADMIN_KEY || process.env.CLIENTS_ADMIN_KEY || '';
const STAFF_KEY = process.env.STAFF_KEY || '';

/** STAFF_KEYS="HH:abc,LH:def" 한 줄 목록 + STAFF_KEY_HH="abc" 개별 변수 둘 다 지원 */
function parsePersonal() {
  const out = [];
  String(process.env.STAFF_KEYS || '').split(',').forEach((pair) => {
    const i = pair.indexOf(':');
    if (i <= 0) return;
    const id = pair.slice(0, i).trim();
    const key = pair.slice(i + 1).trim();
    if (id && key) out.push([id, key]);
  });
  Object.keys(process.env).forEach((name) => {
    const m = /^STAFF_KEY_([A-Za-z0-9]+)$/.exec(name);
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

/**
 * 통과하면 신원 문자열(개인ID | 'staff' | 'admin'), 막았으면 null.
 * 막은 경우 응답은 이 함수가 이미 보냈다 — 호출부는 null 이면 즉시 return.
 */
export function staffIdentity(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const personal = parsePersonal();
  if (!ADMIN_KEY && !STAFF_KEY && !personal.length && !parseAdminKeys().length) {
    res.status(503).json({ error: 'STAFF_KEY (또는 ADMIN_KEYS) 가 설정되지 않았습니다.' });
    return null;
  }

  const provided = String(
    req.headers['x-staff-key'] || req.headers['x-admin-key'] || req.query?.k || ''
  );

  for (const [id, key] of personal) {
    if (safeEqual(provided, key)) return id;
  }
  if (STAFF_KEY && safeEqual(provided, STAFF_KEY)) return 'staff';
  // 관리자는 상위 호환 통과 — 개인 관리자 키(ADMIN_KEYS)면 신원도 그 사람으로.
  // 겸직자(AN·LH)가 담당자 화면에서 자기 ID 로 잡히는 근거.
  const aw = adminWho(provided);
  if (aw) return aw;

  // 존재 자체를 숨긴다 — _admin-auth.js 와 같은 이유.
  res.status(404).json({ error: 'Not found' });
  return null;
}
