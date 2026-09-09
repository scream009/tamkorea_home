/* eslint-env node */
/**
 * Gravity | 리뷰서비스 답글 승인 큐 API (관리자 전용)
 *
 * 체계 (계획 dianping-review-service-yap Phase 3, Owner 결정 2026-09-09):
 *   따종봇이 새벽에 리뷰_DB 에 초안을 만든다 → 데일리 리포트 리뷰 섹션으로 사장님께 나간다
 *   → 사장님 회신을 담당자가 톡방에서 읽고 → **여기서 최종본을 확인·수정하고 승인** →
 *   PC C 의 post_replies.py 가 '승인'만 집어 게시한다.
 *
 * 안전장치가 API 레벨에 박혀 있다:
 *   · 상태 변경은 화이트리스트(검토대기/고객협의/승인/반려/보류/신규)만 — '게시중·게시완료·게시실패' 는 봇 전용
 *   · 쓰기 필드 화이트리스트(최종_중문·고객회신·상태·승인자·승인시각) — 원문·초안은 여기서 못 고친다
 *   · 승인 시 최종_중문 이 비면 거부(빈 답글 게시 방지) · 등급=민감 은 승인해도 봇이 드롭한다(자동게시 영구 금지) — 화면이 경고
 *   · 게시는 이 API 가 하지 않는다. 여기는 명세를 쓰는 곳.
 *
 * 매장 스위치(action=store): CS_DB 의 리뷰서비스·리뷰서비스_일시중지·선플자동게시·일일리포트 만.
 * 인증 _admin-auth.js(404 은폐). CORS 헤더 없음(같은 오리진 전용).
 */
import { blockedByAdminGate, adminWho, escFormula } from './_admin-auth.js';

const TOKEN = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const TBL = '리뷰_DB';
const REC_RE = /^rec[A-Za-z0-9]{14}$/;
const SLUG_RE = /^[A-Za-z][A-Za-z0-9_]{2,30}$/;
// 사람이 바꿀 수 있는 상태. 게시중·게시확인필요·게시완료·게시실패 는 post_replies.py 만 쓴다.
const HUMAN_STATES = new Set(['검토대기', '고객협의', '승인', '반려', '보류', '신규']);
const STORE_FLAGS = new Set(['리뷰서비스', '리뷰서비스_일시중지', '선플자동게시', '일일리포트']);
const OUT_FIELDS = ['키', '매장코드', '리뷰ID', '리뷰일시', '별점', '작성자', '원문', '번역', '사진수', '답변여부_포털',
  '등급', '대응유형', '초안_중문', '초안_한글', '최종_중문', '상태', '승인자', '승인시각', '통보시각',
  '고객회신', '게시시각', '게시결과', '주차', '수집일'];

async function at(method, path, body) {
  const r = await fetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(path)}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`Airtable ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function fetchAll(table, { formula, fields } = {}) {
  const out = [];
  let offset = '';
  do {
    const p = new URLSearchParams();
    p.set('pageSize', '100');
    if (formula) p.set('filterByFormula', formula);
    (fields || []).forEach((f) => p.append('fields[]', f));
    if (offset) p.set('offset', offset);
    const r = await fetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}?${p}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!r.ok) throw new Error(`Airtable ${r.status}`);
    const j = await r.json();
    out.push(...(j.records || []));
    offset = j.offset || '';
  } while (offset);
  return out;
}

const ORDER = { '검토대기': 0, '고객협의': 1, '승인': 2, '게시중': 3, '게시확인필요': 4, '게시실패': 5,
  '신규': 6, '초안': 7, '보류': 8, '반려': 9, '게시완료': 10 };

export default async function handler(req, res) {
  if (blockedByAdminGate(req, res)) return;
  const who = adminWho(String(req.headers['x-admin-key'] || req.query?.k || '')) || 'admin';

  try {
    if (req.method === 'GET') {
      const slug = String(req.query?.slug || '');
      if (slug && !SLUG_RE.test(slug)) return res.status(400).json({ error: 'bad slug' });
      const days = Math.min(90, Math.max(1, Number(req.query?.days) || 14));
      // 끝난 것(게시완료·반려)은 최근 N일만 — 큐가 이력으로 무거워지지 않게
      const formula = `AND(${slug ? `{매장코드}='${escFormula(slug)}', ` : ''}`
        + `OR(NOT(OR({상태}='게시완료', {상태}='반려')), IS_AFTER({리뷰일시}, DATEADD(TODAY(), -${days}, 'days'))))`;
      const [rows, stores] = await Promise.all([
        fetchAll(TBL, { formula, fields: OUT_FIELDS }),
        fetchAll('CS_DB', { fields: ['매장명_검색용', '고객사명(필수)', 'DP_매장코드', '톡방명', '리뷰서비스',
          '리뷰서비스_시작일', '리뷰서비스_일시중지', '선플자동게시', '일일리포트'] }),
      ]);
      const names = {};
      stores.forEach((s) => { const c = String(s.fields['DP_매장코드'] || '').trim(); if (c) names[c] = s.fields['매장명_검색용'] || s.fields['고객사명(필수)'] || c; });
      const items = rows.map((r) => ({ id: r.id, store: names[r.fields['매장코드']] || r.fields['매장코드'], ...r.fields }));
      items.sort((a, b) => (ORDER[a['상태']] ?? 99) - (ORDER[b['상태']] ?? 99)
        || String(b['리뷰일시'] || '').localeCompare(String(a['리뷰일시'] || '')));
      const storeRows = stores
        .filter((s) => String(s.fields['DP_매장코드'] || '').trim() && (s.fields['리뷰서비스'] || s.fields['일일리포트'] || s.fields['톡방명']))
        .map((s) => ({
          id: s.id, slug: s.fields['DP_매장코드'], name: names[s.fields['DP_매장코드']],
          room: !!String(s.fields['톡방명'] || '').trim(),
          review: !!s.fields['리뷰서비스'], start: s.fields['리뷰서비스_시작일'] || '',
          paused: !!s.fields['리뷰서비스_일시중지'], autoGood: !!s.fields['선플자동게시'], daily: !!s.fields['일일리포트'],
        }))
        .sort((a, b) => (b.review - a.review) || (b.daily - a.daily) || a.name.localeCompare(b.name, 'ko'));
      return res.status(200).json({ items, stores: storeRows, who });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = String(body.action || '');
    const id = String(body.id || '');
    if (!REC_RE.test(id)) return res.status(400).json({ error: 'bad id' });
    const now = new Date().toISOString();

    if (action === 'store') {
      const fields = {};
      Object.entries(body.set || {}).forEach(([k, v]) => { if (STORE_FLAGS.has(k)) fields[k] = !!v; });
      if (!Object.keys(fields).length) return res.status(400).json({ error: '바꿀 스위치 없음' });
      if (fields['리뷰서비스'] === true && body.start) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.start))) return res.status(400).json({ error: '시작일 형식 YYYY-MM-DD' });
        fields['리뷰서비스_시작일'] = String(body.start);
      }
      await at('PATCH', `CS_DB/${id}`, { fields, typecast: true });
      console.log('[admin-reviews] store', who, id, JSON.stringify(fields));
      return res.status(200).json({ ok: true });
    }

    // 답글 행 — 현재 상태를 읽어 봇 전용 상태면 손대지 않는다
    const cur = await at('GET', `${TBL}/${id}`);
    const curState = String(cur.fields?.['상태'] || '');
    if (['게시중', '게시완료'].includes(curState)) {
      return res.status(409).json({ error: `상태 '${curState}' 은 봇 전용이라 여기서 바꿀 수 없습니다` });
    }
    const fields = {};
    if (typeof body.finalCn === 'string') fields['최종_중문'] = body.finalCn.slice(0, 2000);
    if (typeof body.reply === 'string') fields['고객회신'] = body.reply.slice(0, 2000);

    if (action === 'approve') {
      const finalCn = typeof body.finalCn === 'string' ? body.finalCn.trim()
        : String(cur.fields?.['최종_중문'] || cur.fields?.['초안_중문'] || '').trim();
      if (!finalCn) return res.status(400).json({ error: '게시할 중국어 답글이 비어 있습니다' });
      fields['최종_중문'] = finalCn.slice(0, 2000);
      fields['상태'] = '승인';
      fields['승인자'] = who;
      fields['승인시각'] = now;
    } else if (action === 'unapprove') {
      fields['상태'] = '검토대기';
    } else if (action === 'reject') {
      fields['상태'] = '반려';
    } else if (action === 'hold') {
      fields['상태'] = '보류';
    } else if (action === 'consult') {
      fields['상태'] = '고객협의';
    } else if (action === 'redraft') {
      fields['상태'] = '신규';
      fields['최종_중문'] = '';
    } else if (action === 'edit') {
      // 최종본·회신만 저장, 상태 그대로
    } else {
      return res.status(400).json({ error: 'unknown action' });
    }
    if (fields['상태'] && !HUMAN_STATES.has(fields['상태'])) return res.status(400).json({ error: 'bad state' });
    if (!Object.keys(fields).length) return res.status(400).json({ error: '바꿀 내용 없음' });
    await at('PATCH', `${TBL}/${id}`, { fields, typecast: true });
    console.log('[admin-reviews]', action, who, id, cur.fields?.['키'] || '');
    return res.status(200).json({ ok: true, state: fields['상태'] || curState });
  } catch (e) {
    console.error('[admin-reviews]', e);
    return res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
}
