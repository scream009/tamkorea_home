/* eslint-env node */
/**
 * 담당자 키 검증 — StaffGate(프론트)가 저장된 키의 생사를 확인하는 용도.
 * admin-check.js 의 담당자판. 데이터는 반환하지 않는다.
 */

import { staffIdentity } from './_staff-auth.js';

export default function handler(req, res) {
  const who = staffIdentity(req, res);
  if (!who) return;
  res.status(200).json({ ok: true, who });
}
