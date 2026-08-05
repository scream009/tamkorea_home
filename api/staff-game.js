/* eslint-env node */
/**
 * 스태프 아케이드 점수판 — /staff 하단 「인플 캐치!」 게임의 리더보드.
 *
 * GET  → { ok, who, top:[{id,score,at}×10], best:{score,at}|null }
 * POST { score } → 기록 저장 + { ok, rank, newBest }
 *
 * 저장소는 Game_DB (2026-08-06 신설, tblAso7MZHFW3cNNn).
 * 게이트는 _staff-auth.js — 키가 곧 신원이라 점수의 ID 를 클라이언트가 조작할 수 없다.
 * 개인당 상위 5개만 남기고 정리한다(무한 적재 방지). CORS 헤더는 두지 않는다.
 */

import { staffIdentity } from './_staff-auth.js';

const KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const API = `https://api.airtable.com/v0/${BASE}`;

const T_GAME = 'Game_DB';
const GAME_CODE = 'catch';
/** 점수 상한 — 정상 플레이로 도달 불가능한 값은 버린다 (콘솔 조작 방어의 최소선) */
const MAX_SCORE = 200000;
/** 개인당 남기는 기록 수 */
const KEEP_PER_USER = 5;

async function at(path, opts = {}) {
  const res = await fetch(`${API}/${encodeURIComponent(T_GAME)}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.message || `Airtable ${res.status}`);
  }
  return body;
}

/** catch 게임 기록 전량 (개인당 5개 정리 덕에 한 페이지면 충분) */
async function listScores() {
  const qs = new URLSearchParams({
    filterByFormula: `{Game}='${GAME_CODE}'`,
    pageSize: '100',
    'sort[0][field]': 'Score',
    'sort[0][direction]': 'desc',
  });
  const body = await at(`?${qs.toString()}`);
  return (body.records || []).map((r) => ({
    rec: r.id,
    id: String(r.fields.ID || '?'),
    score: Number(r.fields.Score || 0),
    at: kstDate(r.fields.PlayedAt || r.createdTime),
  }));
}

/** ISO 시각 → KST 날짜 "YYYY-MM-DD" — UTC 그대로 자르면 새벽 기록이 전날로 보인다 */
function kstDate(iso) {
  const t = Date.parse(iso || '');
  if (Number.isNaN(t)) return '';
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  const who = staffIdentity(req, res);
  if (!who) return;
  const me = String(who).toUpperCase();

  try {
    if (req.method === 'POST') {
      const score = Math.floor(Number(req.body?.score));
      if (!Number.isFinite(score) || score < 1 || score > MAX_SCORE) {
        return res.status(400).json({ error: '점수가 올바르지 않습니다.' });
      }

      const before = await listScores();
      const myBest = before.filter((s) => s.id === me)
        .reduce((m, s) => Math.max(m, s.score), 0);

      await at('', {
        method: 'POST',
        body: JSON.stringify({
          records: [{
            fields: {
              Key: `${me}-${Date.now()}`,
              ID: me,
              Score: score,
              Game: GAME_CODE,
              PlayedAt: new Date().toISOString(),
            },
          }],
        }),
      });

      // 개인당 상위 KEEP_PER_USER 개만 남긴다 — 정렬된 목록에서 넘치는 것을 지운다.
      const mine = before.filter((s) => s.id === me);
      mine.push({ rec: null, score });          // 방금 넣은 것 포함해 자리 계산
      mine.sort((a, b) => b.score - a.score);
      const drop = mine.slice(KEEP_PER_USER).filter((s) => s.rec).map((s) => s.rec);
      if (drop.length) {
        const dq = drop.slice(0, 10).map((id) => `records[]=${id}`).join('&');
        await at(`?${dq}`, { method: 'DELETE' });
      }

      const rank = before.filter((s) => s.score > score).length + 1;
      return res.status(200).json({ ok: true, rank, newBest: score > myBest });
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const all = await listScores();
    const top = all.slice(0, 10).map(({ id, score, at: d }) => ({ id, score, at: d }));
    const mine = all.filter((s) => s.id === me);
    const best = mine.length
      ? { score: mine[0].score, at: mine[0].at }
      : null;
    return res.status(200).json({ ok: true, who: me, top, best });
  } catch (e) {
    return res.status(500).json({ error: e.message || '서버 오류' });
  }
}
