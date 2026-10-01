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
 * 손님 질문(action=q_answer·q_approve·q_skip·q_manual_done, 2026-10-01): 사장님답변·질문_최종중문·질문상태만 쓴다.
 *   빈칸（？）·금칙어가 남은 질문 답은 승인 거부. 승인하면 CS_DB 리뷰_FAQ 에 한 줄 쌓는다(다음 답글안의 근거).
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
// post_replies.py FORBIDDEN 과 같은 목록 — 일괄 승인은 사람이 본문을 안 보므로 서버가 한 번 더 거른다
const FORBIDDEN_CN = ['退款', '赔偿', '赔付', '免费', '折扣', '打折', '优惠券', '律师', '法律', '保证', '承诺', '绝对', '最好', '第一', '唯一'];
const STORE_FLAGS = new Set(['리뷰서비스', '리뷰서비스_일시중지', '선플자동게시', '일일리포트']);
const OUT_FIELDS = ['키', '매장코드', '리뷰ID', '리뷰일시', '별점', '작성자', '원문', '번역', '사진수', '답변여부_포털',
  '등급', '대응유형', '초안_중문', '초안_한글', '최종_중문', '상태', '승인자', '승인시각', '통보시각',
  '고객회신', '게시시각', '게시결과', '주차', '수집일', '즉시게시요청', '즉시게시요청시각',
  // 게시 로그(Owner 2026-09-24: "로그가 남아야 나중에 추적 가능") — PC C post_replies 가 쓴다
  '게시이력', '포털답글ID', '게시시도',
  // 손님 댓글·질문(2026-10-01) — PC C 가 분류하고 질문 답글안을 만든다. 담당자는 여기서 사장님 답을 넣고 승인한다.
  '손님댓글수', '손님댓글_구조', '댓글대응', '질문상태', '질문_원문', '질문_한글', '질문_답글안', '질문_답글안_한글',
  '사장님답변', '질문_최종중문', '질문_최종한글', '질문통보시각',
  // 담당자 교정(2026-10-01 Owner: "교정 전후를 저장해 정기적으로 읽어 와 번역·추천답글 만들 때 참고")
  '교정전_중문', '번역_수정', '교정메모', '교정처리', '교정요약', '교정반영일', '교정자'];
const normCn = (s) => String(s || '').replace(/\s+/g, '');
// 교정 규칙 표(답글규칙_DB) — 상태만 여기서 바꾼다. 사용 = 다음 초안의 AI 지시에 들어간다(PC C 가 회차마다 읽음).
const RULE_TBL = '답글규칙_DB';
const RULE_STATES = new Set(['사용', '초안', '폐기']);
const LEARN_FIELDS = ['키', '매장코드', '작성자', '등급', '상태', '리뷰일시', '승인자', '승인시각', '교정자', '교정메모',
  '교정처리', '교정요약', '교정반영일', '교정전_중문', '초안_중문', '최종_중문', '번역', '번역_수정'];

/**
 * 교정 반영 현황(Owner 2026-10-01: "교정에 반영되는 내용도 요약되어서 시스템에서 같이 볼 수 있도록").
 * 반영 = PC C 가 하루 한 번(02:00, 초안 전) AI 원안과 비교해 요약을 적은 것. 대기 = 고쳤지만 아직 그 회차 전.
 */
function learningOf(ruleRows, rows, days = 60) {
  const corrections = rows.map((r) => ({ id: r.id, ...r.fields }))
    .filter((f) => f['교정전_중문'] || f['번역_수정'] || (f['최종_중문'] && f['초안_중문'] && normCn(f['최종_중문']) !== normCn(f['초안_중문'])))
    .map((f) => ({
      id: f.id, key: f['키'], slug: f['매장코드'], who: f['교정자'] || f['승인자'] || '', grade: f['등급'] || '',
      at: f['승인시각'] || f['리뷰일시'] || '', reflectedAt: f['교정반영일'] || '', status: f['교정처리'] || '',
      summary: f['교정요약'] || '', memo: f['교정메모'] || '',
      before: f['교정전_중문'] || f['초안_중문'] || '', after: f['최종_중문'] || '',
      trBefore: f['번역_수정'] ? (f['번역'] || '') : '', trAfter: f['번역_수정'] || '',
    }))
    .sort((a, b) => String(b.reflectedAt || '9999').localeCompare(String(a.reflectedAt || '9999')) || String(b.at).localeCompare(String(a.at)));
  const rules = ruleRows.map((r) => ({
    id: r.id, rid: r.fields['규칙ID'] || '', state: r.fields['상태'] || '', use: r.fields['적용'] || '',
    slug: r.fields['매장코드'] || '', grade: r.fields['등급'] || '', kind: r.fields['종류'] || '',
    text: r.fields['지시'] || '', terms: r.fields['바꿀말'] || '', ban: r.fields['금지말'] || '',
    exBefore: r.fields['예시_원안'] || '', exAfter: r.fields['예시_수정'] || '',
    evidence: String(r.fields['근거'] || '').split('\n').filter((x) => x.trim()).length,
    by: r.fields['등록자'] || '', day: r.fields['등록일'] || '', memo: r.fields['메모'] || '',
  })).sort((a, b) => String(a.rid).localeCompare(String(b.rid)));
  return { days, corrections, rules };
}

// ── 손님 질문 답글 (2026-10-01 · Owner 지시: ★3.5 이하 리뷰처럼 답글안 → 사장님 확인 → 승인 → 게시) ──
//   사장님확인중 ─(사장님 답을 한글로 입력)→ 답변받음 ─(PC C 가 중문 채움)→ 중문확인 ─(승인)→ 승인
//   사장님확인중 ─(담당자가 중문을 직접 완성해 승인)───────────────────────────→ 승인
//   승인 → PC C 가 본 답글에 합쳐 게시. 본 답글이 이미 나갔으면 수동게시필요(담당자가 포털에서 직접).
// 🔴 질문 답은 사실(메뉴·부위·영업시간) 답이다 — AI 가 지어낸 빈칸（？）이 남은 문안은 승인하지 않는다.
const Q_OPEN = new Set(['사장님확인중', '답변받음', '중문확인', '기한종료', '처리안함', '승인']);
const Q_BLANK = /[（(]\s*[？?]\s*[）)]/;
// review_notes.FORBIDDEN_Q 와 같은 목록 — 사실 답에 필요한 免费·元 은 허용, 확약·보상·연락 유도는 막는다
const FORBIDDEN_Q = ['退款', '赔偿', '赔付', '律师', '法律', '保证', '承诺', '绝对', '最好', '第一', '唯一',
  '微信', '加V', 'VX', '联系我们', '补偿', '赠送', '小礼'];
// 본 답글이 이 상태면 질문 답을 본 답글에 실을 수 없다 → 담당자가 포털에서 직접 단다
const MAIN_GONE = new Set(['게시완료', '게시중', '게시확인필요', '반려', '보류']);

// 한국 날짜(YYYY-MM-DD). Airtable dateTime 은 UTC 라 그대로 자르면 KST 00~09시가 전날로 간다.
const KST_MS = 9 * 3600 * 1000;
const kstDay = (iso) => {
  const t = Date.parse(iso || '');
  return Number.isNaN(t) ? '' : new Date(t + KST_MS).toISOString().slice(0, 10);
};

/**
 * 매장별 답글 실적(Owner 2026-09-24: "답글 단 결과를 우리가 확인하고 집계할 수 있어야").
 * 이번 주 = 한국 시간 월요일 0시부터. '이번 주 게시' 는 **게시시각** 기준이다(리뷰가 언제 쓰였든) —
 * 주간 리포트의 '이번 주 올린 답글' 과 같은 기준이어야 화면과 리포트 숫자가 맞는다.
 */
function replyStats(all, names) {
  const nowK = new Date(Date.now() + KST_MS);
  const mon = new Date(nowK);
  mon.setUTCDate(nowK.getUTCDate() - ((nowK.getUTCDay() + 6) % 7));
  const weekStart = mon.toISOString().slice(0, 10);
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const by = {};
  for (const r of all) {
    const f = r.fields || {};
    const slug = String(f['매장코드'] || '').trim();
    if (!slug) continue;
    const s = by[slug] || (by[slug] = { slug, name: names[slug] || slug, week: 0, total: 0,
      waiting: 0, approved: 0, check: 0, lags: [] });
    const st = String(f['상태'] || '');
    if (st === '게시완료') {
      s.total += 1;
      if (kstDay(f['게시시각']) >= weekStart) s.week += 1;
      // 응답 시간은 최근 30일 게시분만 — 오래된 밀린 리뷰가 평균을 끌어올리지 않게
      const a = Date.parse(f['리뷰일시'] || ''), b = Date.parse(f['게시시각'] || '');
      if (!Number.isNaN(a) && !Number.isNaN(b) && String(f['게시시각']) >= since30 && b >= a) {
        s.lags.push((b - a) / 3600000);
      }
    } else if (st === '검토대기' || st === '고객협의') s.waiting += 1;
    else if (st === '승인') s.approved += 1;
    else if (st === '게시확인필요' || st === '게시실패') s.check += 1;
  }
  return {
    weekStart,
    rows: Object.values(by).map(({ lags, ...s }) => {
      lags.sort((x, y) => x - y);
      const lagH = lags.length ? Math.round(lags[Math.floor(lags.length / 2)]) : null;   // 중앙값
      return { ...s, lagH };
    }).sort((x, y) => (y.week - x.week) || (y.total - x.total) || x.name.localeCompare(y.name, 'ko')),
  };
}

async function at(method, path, body) {
  // 🔴 경로를 통째로 encodeURIComponent 하면 `CS_DB/recXXX` 의 슬래시가 %2F 로 바뀐다.
  //    그러면 Airtable 이 "CS_DB/recXXX" 라는 **테이블 이름**을 찾다가 실패하고
  //    403 INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND 를 준다 — 권한 문제로 착각하기 쉽다.
  //    (2026-09-09 실측: admin 리뷰 화면의 매장 체크박스가 이걸로 전부 실패. 읽기는
  //     fetchAll 이 테이블명만 인코딩해서 정상이었고 **쓰기만** 죽어 있었다.
  //     같은 버그를 `client-review-pdf.js` 에서 먼저 겪었다 — TRAPS §17)
  //    한글 테이블명은 인코딩이 필요하니 **구분자를 남기고 세그먼트만** 인코딩한다.
  const seg = String(path).split('/').map(encodeURIComponent).join('/');
  const r = await fetch(`https://api.airtable.com/v0/${BASE}/${seg}`, {
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
      // 끝난 것(게시완료·반려)은 최근 N일만 — 큐가 이력으로 무거워지지 않게.
      // 단 손님 질문이 진행 중인 행은 리뷰가 오래돼도 보여 준다(본 답글은 끝났어도 질문 답이 남았을 수 있다).
      const formula = `AND(${slug ? `{매장코드}='${escFormula(slug)}', ` : ''}`
        + `OR(NOT(OR({상태}='게시완료', {상태}='반려')), IS_AFTER({리뷰일시}, DATEADD(TODAY(), -${days}, 'days')),`
        + ` {질문상태}='사장님확인중', {질문상태}='답변받음', {질문상태}='중문확인', {질문상태}='승인', {질문상태}='수동게시필요'))`;
      const [rows, stores, allRows, weeklyRows] = await Promise.all([
        fetchAll(TBL, { formula, fields: OUT_FIELDS }),
        fetchAll('CS_DB', { fields: ['매장명_검색용', '고객사명(필수)', 'DP_매장코드', '톡방명', '리뷰서비스',
          '리뷰서비스_시작일', '리뷰서비스_일시중지', '선플자동게시', '일일리포트'] }),
        // 실적 집계용 — 위 큐는 끝난 건을 최근 N일로 자르므로 누적을 셀 수 없다. 칸 4개만 받는다.
        fetchAll(TBL, { fields: ['매장코드', '상태', '게시시각', '리뷰일시'],
          formula: slug ? `{매장코드}='${escFormula(slug)}'` : '' }),
        // 주간 리포트(Owner 2026-09-24) — 매장별 최근 6주. 잘못 나간 것을 '숨김' 으로 거둘 수 있게.
        // 실패해도 승인 화면은 떠야 한다 → 빈 목록으로.
        fetchAll('리뷰주간_DB', { fields: ['매장코드', '주차', '기간', '발송상태', '숨김', '첫주', '안내발송시각', '생성시각', 'PDF'] })
          .catch(() => []),
      ]);
      // 교정 반영 현황 — 실패해도 승인 화면은 떠야 한다(표가 없거나 칸이 없으면 null)
      const learning = await Promise.all([
        fetchAll(RULE_TBL, {}),
        fetchAll(TBL, {
          fields: LEARN_FIELDS,
          formula: `AND(${slug ? `{매장코드}='${escFormula(slug)}', ` : ''}IS_AFTER({리뷰일시}, DATEADD(TODAY(), -60, 'days')), `
            + `OR({교정전_중문}!='', {번역_수정}!='', AND({최종_중문}!='', {초안_중문}!='')))`,
        }),
      ]).then(([ru, co]) => learningOf(ru, co)).catch((e) => { console.error('[admin-reviews] learning', e); return null; });
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
      const weekly = {};
      weeklyRows
        .sort((a, b) => String(b.fields['주차'] || '').localeCompare(String(a.fields['주차'] || '')))
        .forEach((r) => {
          const f = r.fields || {};
          const k = String(f['매장코드'] || '');
          if (!k || (weekly[k] || []).length >= 6) return;
          (weekly[k] = weekly[k] || []).push({
            id: r.id, week: f['주차'] || '', period: f['기간'] || '', status: f['발송상태'] || '',
            hidden: !!f['숨김'], first: !!f['첫주'], notifiedAt: f['안내발송시각'] || '', createdAt: f['생성시각'] || '',
            // 관리자 화면이라 첨부 URL 을 그대로 준다(약 2시간 만료 — 화면을 새로고침하면 새 URL)
            pdf: ((f['PDF'] || [])[0] || {}).url || '',
          });
        });
      return res.status(200).json({ items, stores: storeRows, who, stats: replyStats(allRows, names), weekly, learning });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = String(body.action || '');
    const now = new Date().toISOString();

    // ── 호평 일괄 승인 ────────────────────────────────────────────────────
    // 🔴 2026-09-24 재정의(Owner): **선플자동게시 미체크 매장**의 호평만 대상이다.
    //    09-23 밤 정책 개정으로 체크된 매장의 호평은 승인 없이 정기 게시(12·14·16시)로 올라간다 —
    //    거기에 일괄승인을 거는 건 의미가 없다. 승인이 실제로 필요한 쪽이 미체크 매장이다.
    //    (09-23 판은 정반대였다 — 체크된 매장에서만 동작하고 미체크 매장에서는 막혀 있었다.)
    // 🔴 승인 = 다음 정기 회차에 **실제로 공개 게시**된다. 한 번 누르면 여러 건이 나간다.
    // 서버가 건마다 다시 검사한다: 검토대기·등급 호평·초안 있음·금칙어 없음 만 통과. 나머지는 건너뛰고 사유를 돌려준다.
    if (action === 'approve_bulk') {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((x) => REC_RE.test(x)).slice(0, 60);
      if (!ids.length) return res.status(400).json({ error: 'ids 없음' });
      const csRows = await fetchAll('CS_DB', { fields: ['DP_매장코드', '선플자동게시'] });
      const autoOk = new Set(csRows.filter((r) => r.fields['선플자동게시'])
        .map((r) => String(r.fields['DP_매장코드'] || '').trim()).filter(Boolean));
      const approved = [], skipped = [];
      for (const rid of ids) {
        let cur;
        try { cur = await at('GET', `${TBL}/${rid}`); } catch { skipped.push([rid, '조회 실패']); continue; }
        const f = cur.fields || {};
        const st = String(f['상태'] || '');
        const draft = String(f['최종_중문'] || f['초안_중문'] || '').trim();
        if (st !== '검토대기') { skipped.push([f['키'] || rid, `상태 ${st || '없음'}`]); continue; }
        if (f['등급'] !== '호평') { skipped.push([f['키'] || rid, `등급 ${f['등급'] || '없음'}`]); continue; }
        if (autoOk.has(String(f['매장코드'] || '').trim())) {
          skipped.push([f['키'] || rid, '선플자동게시 매장 — 승인 없이 정기 게시로 올라갑니다']); continue;
        }
        if (!draft) { skipped.push([f['키'] || rid, '초안 없음']); continue; }
        const hit = FORBIDDEN_CN.find((w) => draft.includes(w));
        if (hit) { skipped.push([f['키'] || rid, `금칙어 ${hit}`]); continue; }
        try {
          await at('PATCH', `${TBL}/${rid}`, { fields: { '최종_중문': draft.slice(0, 2000), '상태': '승인', '승인자': who, '승인시각': now }, typecast: true });
          approved.push(f['키'] || rid);
        } catch (e) { skipped.push([f['키'] || rid, `저장 실패 ${String(e.message || e).slice(0, 60)}`]); }
      }
      console.log('[admin-reviews] approve_bulk', who, `ok=${approved.length} skip=${skipped.length}`);
      return res.status(200).json({ ok: true, approved: approved.length, skipped });
    }

    const id = String(body.id || '');
    if (!REC_RE.test(id)) return res.status(400).json({ error: 'bad id' });

    // 교정 규칙 상태 — 사용으로 바꾸면 다음 초안부터 AI 지시에 들어간다(PC C 가 회차마다 표를 읽는다)
    if (action === 'rule_state') {
      const state = String(body.state || '');
      if (!RULE_STATES.has(state)) return res.status(400).json({ error: 'state 는 사용·초안·폐기' });
      const cur = await at('GET', `${RULE_TBL}/${id}`);
      const memo = String(cur.fields?.['메모'] || '');
      await at('PATCH', `${RULE_TBL}/${id}`, { fields: { '상태': state,
        '메모': `${memo}${memo ? '\n' : ''}${kstDay(now)} ${who}: ${cur.fields?.['상태'] || '?'} → ${state}`.slice(-2000) }, typecast: true });
      console.log('[admin-reviews] rule_state', who, cur.fields?.['규칙ID'], state);
      return res.status(200).json({ ok: true, state });
    }

    // 주간 리포트 숨김/복원 — 고객 대시보드·PDF 링크·금요일 메시지에서 뺀다(행은 지우지 않는다)
    if (action === 'weekly_hide') {
      const f = { '숨김': !!body.hide };
      await at('PATCH', `리뷰주간_DB/${id}`, { fields: f });
      console.log('[admin-reviews] weekly_hide', who, id, f['숨김']);
      return res.status(200).json({ ok: true, state: f['숨김'] ? '숨김' : '공개' });
    }

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

    // ── 손님 질문 답 — 본 답글 상태와 무관하게 다룬다(본 답글이 이미 게시됐어도 질문 답은 남는다) ──
    if (action.startsWith('q_')) {
      const cf = cur.fields || {};
      const qs = String(cf['질문상태'] || '');
      const owner = typeof body.ownerAnswer === 'string' ? body.ownerAnswer.trim().slice(0, 1000) : null;
      const qFinal = typeof body.qFinal === 'string' ? body.qFinal.trim().slice(0, 600) : null;
      const qf = {};
      if (action === 'q_answer') {
        // 사장님 답(한글)만 받았다 → PC C 가 다음 회차(매일 11시 무렵)에 답글안 빈칸을 채워 '중문확인' 으로 올린다
        if (!Q_OPEN.has(qs) || qs === '승인') return res.status(409).json({ error: `질문상태 '${qs || '없음'}' 에서는 답을 받을 수 없습니다` });
        if (!owner) return res.status(400).json({ error: '사장님 답이 비어 있습니다' });
        Object.assign(qf, { '사장님답변': owner, '질문상태': '답변받음', '질문_최종중문': '', '질문_최종한글': '' });
      } else if (action === 'q_approve') {
        if (!Q_OPEN.has(qs)) return res.status(409).json({ error: `질문상태 '${qs || '없음'}' 에서는 승인할 수 없습니다` });
        if (!qFinal) return res.status(400).json({ error: '게시할 중국어 질문 답이 비어 있습니다' });
        if (Q_BLANK.test(qFinal)) return res.status(400).json({ error: '빈칸（？）이 남아 있습니다 — 사장님 답으로 채운 뒤 승인하세요' });
        const hit = FORBIDDEN_Q.find((w) => qFinal.includes(w));
        if (hit) return res.status(400).json({ error: `금칙어 ${hit} — 보상·확약·연락 유도는 공개 답에 쓰지 않습니다` });
        Object.assign(qf, { '질문_최종중문': qFinal, '질문상태': MAIN_GONE.has(curState) ? '수동게시필요' : '승인' });
        if (owner !== null) qf['사장님답변'] = owner;
      } else if (action === 'q_skip') {
        if (['게시완료'].includes(qs)) return res.status(409).json({ error: '이미 게시된 질문 답입니다' });
        Object.assign(qf, { '질문상태': '처리안함', '댓글통보대기': false });
      } else if (action === 'q_manual_done') {
        if (qs !== '수동게시필요') return res.status(409).json({ error: `질문상태 '${qs || '없음'}' — 수동 게시 대상이 아닙니다` });
        qf['질문상태'] = '게시완료';
      } else {
        return res.status(400).json({ error: 'unknown action' });
      }
      await at('PATCH', `${TBL}/${id}`, { fields: qf, typecast: true });
      console.log('[admin-reviews]', action, who, id, cf['키'] || '', qf['질문상태'] || '');

      // 승인한 질문 답은 매장 FAQ 에 한 줄 쌓는다 → 다음에 같은 질문이 오면 PC C 가 빈칸 없이 답글안을 만든다.
      // 실패해도 승인은 이미 저장됐다(FAQ 는 다음 답글안의 근거일 뿐) → 경고만 돌려준다.
      let faq = null;
      const ans = String(qf['사장님답변'] ?? cf['사장님답변'] ?? '').trim();
      if (action === 'q_approve' && ans) {
        const slugQ = String(cf['매장코드'] || '').trim();
        try {
          if (!SLUG_RE.test(slugQ)) throw new Error('매장코드 형식 오류');
          const cs = await fetchAll('CS_DB', { formula: `{DP_매장코드}='${escFormula(slugQ)}'`, fields: ['DP_매장코드', '리뷰_FAQ'] });
          if (!cs.length) throw new Error('CS_DB 에 매장이 없습니다');
          const qText = String(cf['질문_한글'] || '').split('\n').map((l) => l.replace(/^[^:]{1,30}:\s*/, '').trim()).filter(Boolean).join(' / ');
          const line = `${kstDay(new Date().toISOString())} Q: ${qText || '(질문)'} → A: ${ans.replace(/\s+/g, ' ')}`;
          const prev = String(cs[0].fields['리뷰_FAQ'] || '');
          if (!prev.includes(`→ A: ${ans.replace(/\s+/g, ' ')}`)) {
            await at('PATCH', `CS_DB/${cs[0].id}`, { fields: { '리뷰_FAQ': (prev ? `${prev}\n` : '') + line }, typecast: true });
          }
          faq = 'saved';
        } catch (e) {
          faq = `failed: ${String(e.message || e).slice(0, 80)}`;
          console.error('[admin-reviews] faq', slugQ, faq);
        }
      }
      return res.status(200).json({ ok: true, state: curState, qState: qf['질문상태'] || qs, faq });
    }
    if (['게시중', '게시완료'].includes(curState)) {
      return res.status(409).json({ error: `상태 '${curState}' 은 봇 전용이라 여기서 바꿀 수 없습니다` });
    }
    const fields = {};
    if (typeof body.finalCn === 'string') fields['최종_중문'] = body.finalCn.slice(0, 2000);
    if (typeof body.reply === 'string') fields['고객회신'] = body.reply.slice(0, 2000);
    // ── 담당자 교정 기록 — PC C 가 다음 초안·번역을 만들 때 이 짝을 사례로 읽는다(review_service/reply_rules.py) ──
    if (typeof body.fixMemo === 'string') fields['교정메모'] = body.fixMemo.trim().slice(0, 500);
    if (typeof body.trFix === 'string') {
      // 원래 번역과 같으면 비운다 — '고친 번역' 이 아닌데 사례로 읽히면 안 된다
      const tr = body.trFix.trim().slice(0, 4000);
      fields['번역_수정'] = normCn(tr) === normCn(cur.fields?.['번역']) ? '' : tr;
    }

    if (action === 'approve' || action === 'approve_now') {
      const finalCn = typeof body.finalCn === 'string' ? body.finalCn.trim()
        : String(cur.fields?.['최종_중문'] || cur.fields?.['초안_중문'] || '').trim();
      if (!finalCn) return res.status(400).json({ error: '게시할 중국어 답글이 비어 있습니다' });
      fields['최종_중문'] = finalCn.slice(0, 2000);
      fields['상태'] = '승인';
      fields['승인자'] = who;
      fields['승인시각'] = now;
      // ⚡ 즉시게시(Owner 2026-09-24) — 악플을 사장님과 협의해 고친 뒤 **그 한 건만** 바로 올린다.
      //    PC C 워커가 60초 안에 집는다. 시간 제한 없음(새벽 야간 배치가 포털을 쓰는 동안만 기다린다).
      if (action === 'approve_now') {
        fields['즉시게시요청'] = true;
        fields['즉시게시요청시각'] = now;
      }
    } else if (action === 'unapprove') {
      fields['상태'] = '검토대기';
      fields['즉시게시요청'] = false;       // 승인을 되돌리면 대기 중인 즉시게시도 같이 거둔다
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
    // 처음 고친 순간의 AI 원안을 따로 찍는다 — 나중에 '초안 다시'로 초안이 바뀌어도 교정 전후 짝이 남게.
    // 이미 찍혀 있으면 덮지 않는다(담당자가 두 번 고쳐도 비교 기준은 AI 원안이다).
    if (typeof fields['최종_중문'] === 'string' && fields['최종_중문'] && action !== 'redraft') {
      const draft = String(cur.fields?.['초안_중문'] || '');
      if (draft && normCn(fields['최종_중문']) !== normCn(draft) && !cur.fields?.['교정전_중문']) {
        fields['교정전_중문'] = draft;
        fields['교정자'] = who;           // 처음 고친 사람 — 승인자와 다를 수 있다(예전엔 남지 않았다)
        if (!cur.fields?.['교정처리']) fields['교정처리'] = '미검토';
      }
      // 이미 하루 반영을 거친 교정을 다시 고쳤으면 다음 회차에 다시 반영되게 반영일을 비운다
      if (cur.fields?.['교정반영일'] && normCn(fields['최종_중문']) !== normCn(cur.fields?.['최종_중문'])) {
        fields['교정반영일'] = null;
      }
    }
    if (typeof fields['번역_수정'] === 'string' && cur.fields?.['교정반영일']
        && normCn(fields['번역_수정']) !== normCn(cur.fields?.['번역_수정'])) {
      fields['교정반영일'] = null;
      if (!cur.fields?.['교정자']) fields['교정자'] = who;
    } else if (typeof fields['번역_수정'] === 'string' && fields['번역_수정'] && !cur.fields?.['교정자']) {
      fields['교정자'] = who;
    }
    if (!Object.keys(fields).length) return res.status(400).json({ error: '바꿀 내용 없음' });
    await at('PATCH', `${TBL}/${id}`, { fields, typecast: true });
    console.log('[admin-reviews]', action, who, id, cur.fields?.['키'] || '');

    // ⚡ 즉시게시 신호. 워커는 60초마다 **CS_DB 만** 본다 — 리뷰_DB 를 따로 폴링하면 Airtable 호출이
    //    하루 ~1,000회 는다(월 10만 한도가 이미 병목). 그래서 매장 행에 `리뷰즉시게시` 신호를 켠다.
    //    🔴 행을 **먼저** 저장하고 신호를 켠다(위 PATCH 가 먼저다). 반대면 워커가 신호를 보고 왔는데
    //       행이 아직 준비 안 된 틈이 생긴다.
    let signal = null;
    if (action === 'approve_now') {
      const slug = String(cur.fields?.['매장코드'] || '').trim();
      try {
        if (!SLUG_RE.test(slug)) throw new Error('매장코드 형식 오류');
        const cs = await fetchAll('CS_DB', { formula: `{DP_매장코드}='${escFormula(slug)}'`, fields: ['DP_매장코드'] });
        if (!cs.length) throw new Error('CS_DB 에 매장이 없습니다');
        await at('PATCH', `CS_DB/${cs[0].id}`, { fields: { '리뷰즉시게시': true }, typecast: true });
        signal = 'sent';
      } catch (e) {
        // 신호를 못 켜도 승인은 이미 저장됐다 → 다음 정기 게시에 올라간다. '즉시'만 안 된 것이니 그대로 알린다.
        signal = `failed: ${String(e.message || e).slice(0, 80)}`;
        console.error('[admin-reviews] approve_now signal', slug, signal);
      }
    }
    return res.status(200).json({ ok: true, state: fields['상태'] || curState, signal });
  } catch (e) {
    console.error('[admin-reviews]', e);
    return res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
}
