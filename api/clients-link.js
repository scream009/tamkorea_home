/* eslint-env node */
/**
 * Gravity | Clients Link Generator (어드민 전용)
 * GET /api/clients-link?month=2026-05&k=<ADMIN_KEY>
 *
 * 보안: CLIENTS_ADMIN_KEY 헤더/쿼리 검증 후에만 토큰·URL 반환.
 *       잘못된 키 → 404 (존재 자체를 숨김).
 */

import crypto from 'crypto';

const TOKEN_SECRET = process.env.CLIENTS_TOKEN_SECRET || '';
const ADMIN_KEY    = process.env.CLIENTS_ADMIN_KEY    || '';

function generateMonthToken(month) {
  if (!TOKEN_SECRET) return '';
  return crypto.createHash('sha256')
    .update(`clients|${month}|${TOKEN_SECRET}`)
    .digest('hex')
    .slice(0, 8);
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
  catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── Admin Key 검증 ───────────────────────────────────────
  const provided = String(req.headers['x-admin-key'] || req.query.k || '');
  if (!ADMIN_KEY || !safeEqual(provided, ADMIN_KEY)) {
    // 존재 노출 방지: 404 통일
    return res.status(404).json({ error: 'Not found' });
  }

  if (!TOKEN_SECRET) {
    return res.status(503).json({ error: 'CLIENTS_TOKEN_SECRET not configured' });
  }

  const { month } = req.query;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month required (YYYY-MM)' });
  }

  const token = generateMonthToken(month);
  const host  = req.headers.host || 'www.tamkorea.com';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const url   = `${proto}://${host}/clients?m=${encodeURIComponent(month)}&t=${token}`;

  return res.status(200).json({ month, token, url });
}
