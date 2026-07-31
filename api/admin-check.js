/* eslint-env node */
/**
 * Gravity | Admin Key 검증 전용 엔드포인트
 * GET /api/admin-check   (헤더: x-admin-key)
 *
 * 관리자 화면 게이트가 "이 키가 맞나"만 물어보는 용도. 데이터는 일절 반환하지 않는다.
 * 키 확인을 위해 admin-dashboard 같은 무거운 엔드포인트를 호출하지 않으려고 둔다.
 */

import { blockedByAdminGate } from './_admin-auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (blockedByAdminGate(req, res)) return;
  return res.status(200).json({ ok: true });
}
