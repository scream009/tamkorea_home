/* eslint-env node */
/**
 * 기자단 링크 대량등록 — 관리자 입구 (/admin/press).
 * 본체(추출·판정·등록)는 _press.js. 여기는 게이트만 — _admin-auth.js (실패 시 404 은폐).
 */

import { blockedByAdminGate, adminWho } from './_admin-auth.js';
import { pressHandler } from './_press.js';

export default async function handler(req, res) {
  if (blockedByAdminGate(req, res)) return;
  const who = adminWho(String(req.headers['x-admin-key'] || req.query?.k || '')) || 'admin';
  await pressHandler(req, res, who);
}
