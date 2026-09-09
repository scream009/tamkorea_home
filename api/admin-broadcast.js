/* eslint-env node */
/**
 * Gravity | 단체 메시지 + 신규 고객사 등록 API (관리자 전용)
 *
 * 체계 (Owner 확정 2026-09-09, 계획 dianping-resv-renewal):
 *   admin 화면에서 작성·승인 → Airtable 단체메시지_DB → 예약봇(PC C)이 읽어
 *   각 고객사 톡방으로 발송(이미지 포함) → 방별 결과를 다시 여기서 확인.
 *
 * 안전장치가 API 레벨에 박혀 있다:
 *   · 상태 변경은 화이트리스트(작성중/승인/취소)만 — '발송중·완료'는 봇만 쓴다
 *   · 필드 화이트리스트 — 본문에 담긴 아무 필드나 통과시키지 않는다
 *   · 발송은 이 API 가 하지 않는다. 여기는 명세를 쓰는 곳, 카톡은 예약봇 몫.
 *
 * 신규 등록(action=register)은 A안(계정 직접 입력) — CS_DB 행 + 이번 달
 * Campaign 레코드를 만든다. PC C 가 새벽 pull 로 수집 목록에 자동 편입하고,
 * 세션 없음은 기존 아침 알림망이 "로그인 필요"로 통보한다.
 *
 * 인증 _admin-auth.js(404 은폐). CORS 헤더 없음(같은 오리진 전용).
 */
import { blockedByAdminGate, escFormula } from './_admin-auth.js';

const TOKEN = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const TBL = '단체메시지_DB';

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

/** 계약월 라벨 — KST 기준. UTC 자정 언저리에 달이 밀리면 안 된다. */
function monthLabelKST() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return `${kst.getUTCFullYear()}. ${kst.getUTCMonth() + 1}월`;
}

const SLUG_RE = /^[A-Za-z][A-Za-z0-9_]{2,30}$/;
const REC_RE = /^rec[A-Za-z0-9]{14}$/;

// ── 신규 등록: CS_DB 행 + 이번 달 Campaign 레코드 (파이썬 wire_airtable 과 동일 규칙) ──
async function register(body) {
  const name = String(body.name || '').trim();
  const branch = String(body.branch || '').trim();
  const acctId = String(body.acctId || '').trim();
  const acctPw = String(body.acctPw || '').trim();
  const slug = String(body.slug || '').trim();
  if (!name || !acctId || !acctPw) return { code: 400, error: '매장명·계정번호·비밀번호는 필수' };
  if (!SLUG_RE.test(slug)) return { code: 400, error: 'slug 형식: 영문 시작, 영문/숫자/_ (3~31자)' };
  if (!/^[A-Za-z0-9]{4,20}$/.test(acctId)) return { code: 400, error: '계정번호 형식 오류' };
  if (acctPw.length > 120) return { code: 400, error: '비밀번호가 너무 깁니다' };

  // 중복 검사 — 같은 계정 또는 같은 slug 가 이미 배선돼 있으면 막는다
  const dup = await fetchAll('CS_DB', {
    formula: `OR({DP-office_ID}='${escFormula(acctId)}', {DP_매장코드}='${escFormula(slug)}')`,
    fields: ['매장명_검색용', 'DP-office_ID', 'DP_매장코드'],
  });
  const hard = dup.find((r) => String(r.fields['DP_매장코드'] || '') === slug
    || String(r.fields['DP-office_ID'] || '') === acctId);
  if (hard) {
    return { code: 409, error: `이미 등록됨: ${hard.fields['매장명_검색용'] || hard.id}` };
  }

  const now = new Date().toISOString();
  const fields = {
    'DP-office_ID': acctId, 'DP_계정ID': acctId, 'DP_계정PW': acctPw,
    'DP_계정수정일': now, 'DP_매장코드': slug,
    // 매장명_검색용 은 수식 필드(422) — 고객사명+지점명에서 자동 계산된다
    '고객사명(필수)': name, '지점명(필수)': branch || name,
  };
  const made = await at('POST', 'CS_DB', { records: [{ fields }], typecast: true });
  const csId = made.records[0].id;

  const month = monthLabelKST();
  let campId = null;
  const camp = await fetchAll('Campaign_DB', {
    formula: `AND({DP_매장코드}='${escFormula(slug)}', {계약월}='${escFormula(month)}')`,
    fields: ['계약월'],
  });
  if (!camp.length) {
    const c = await at('POST', 'Campaign_DB', {
      records: [{
        fields: {
          '업체명': [csId], '계약월': month, 'DP_매장코드': slug,
          '협력사': '직영', '표출': true, '표출여부': '표출', '공유표출': true,
        },
      }],
      typecast: true,
    });
    campId = c.records[0].id;
  }
  console.log('[admin-broadcast] 신규 등록', slug, csId, campId || '(캠페인 기존)');
  return { code: 200, ok: true, csId, campId, month };
}

export default async function handler(req, res) {
  if (blockedByAdminGate(req, res)) return;

  try {
    if (req.method === 'GET') {
      const [msgs, stores] = await Promise.all([
        fetchAll(TBL),
        fetchAll('CS_DB', { fields: ['매장명_검색용', '고객사명(필수)', '톡방명', 'DP_매장코드'] }),
      ]);
      msgs.sort((a, b) => (b.createdTime || '').localeCompare(a.createdTime || ''));
      return res.status(200).json({
        messages: msgs.map((r) => ({ id: r.id, created: r.createdTime, ...r.fields })),
        stores: stores
          .filter((r) => String(r.fields['톡방명'] || '').trim())
          .map((r) => ({
            id: r.id,
            name: r.fields['매장명_검색용'] || r.fields['고객사명(필수)'] || '?',
            dp: !!String(r.fields['DP_매장코드'] || '').trim(),
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body || {};
    const action = String(body.action || '');

    if (action === 'register') {
      const r = await register(body);
      return res.status(r.code).json(r.code === 200 ? r : { error: r.error });
    }

    if (action === 'create') {
      const title = String(body.title || '').trim().slice(0, 80);
      const text = String(body.body || '').slice(0, 3800);
      if (!title) return res.status(400).json({ error: '제목 필요' });
      const target = ['전체', '따종운영', '개별'].includes(body.target) ? body.target : '따종운영';
      const ids = (Array.isArray(body.targetIds) ? body.targetIds : [])
        .filter((x) => REC_RE.test(String(x))).slice(0, 200);
      const fields = { '제목': title, '본문': text, '대상': target, '상태': '작성중' };
      if (target === '개별') fields['대상매장'] = ids;
      if (body.sendAt) fields['발송시각'] = String(body.sendAt);
      const made = await at('POST', TBL, { records: [{ fields }], typecast: true });
      console.log('[admin-broadcast] 생성', made.records[0].id, title);
      return res.status(200).json({ ok: true, id: made.records[0].id });
    }

    if (action === 'update') {
      const id = String(body.id || '');
      if (!REC_RE.test(id)) return res.status(400).json({ error: 'bad id' });
      const set = body.set || {};
      const fields = {};
      // 화이트리스트 — 상태는 사람이 쓸 수 있는 3개만. 발송중/완료/일부실패는 봇 전용.
      if (set['상태'] !== undefined) {
        if (!['작성중', '승인', '취소'].includes(set['상태'])) {
          return res.status(400).json({ error: 'bad status' });
        }
        fields['상태'] = set['상태'];
      }
      if (set['테스트요청'] !== undefined) fields['테스트요청'] = !!set['테스트요청'];
      if (set['제목'] !== undefined) fields['제목'] = String(set['제목']).slice(0, 80);
      if (set['본문'] !== undefined) fields['본문'] = String(set['본문']).slice(0, 3800);
      if (set['대상'] !== undefined && ['전체', '따종운영', '개별'].includes(set['대상'])) {
        fields['대상'] = set['대상'];
      }
      if (set['대상매장'] !== undefined) {
        fields['대상매장'] = (Array.isArray(set['대상매장']) ? set['대상매장'] : [])
          .filter((x) => REC_RE.test(String(x))).slice(0, 200);
      }
      if (set['발송시각'] !== undefined) fields['발송시각'] = set['발송시각'] ? String(set['발송시각']) : null;
      if (!Object.keys(fields).length) return res.status(400).json({ error: 'nothing to update' });
      await at('PATCH', `${TBL}/${id}`, { fields, typecast: true });
      console.log('[admin-broadcast] 수정', id, Object.keys(fields).join(','));
      return res.status(200).json({ ok: true });
    }

    if (action === 'upload') {
      const id = String(body.id || '');
      if (!REC_RE.test(id)) return res.status(400).json({ error: 'bad id' });
      const filename = String(body.filename || 'image.png').slice(0, 80);
      const contentType = String(body.contentType || '');
      const data = String(body.dataBase64 || '');
      if (!/^image\//.test(contentType)) return res.status(400).json({ error: '이미지만 업로드 가능' });
      if (!data || data.length > 4200000) {
        return res.status(400).json({ error: '이미지는 3MB 이하로 (Vercel 본문 한도)' });
      }
      const r = await fetch(
        `https://content.airtable.com/v0/${BASE}/${id}/${encodeURIComponent('이미지')}/uploadAttachment`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType, file: data, filename }),
        },
      );
      if (!r.ok) throw new Error(`upload ${r.status}: ${(await r.text()).slice(0, 200)}`);
      console.log('[admin-broadcast] 이미지 업로드', id, filename);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    console.error('[admin-broadcast]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
