/* eslint-env node */
/**
 * 결과물 링크 저장 공용 규칙 — 진행_DB_OLD 의 XHS_Result·DP_Result·DY_Result.
 * 진도 보드(staff-board 'result')와 예약발송(staff-queue 'result')이 같은 규칙을 쓴다 (2026-09-29).
 *
 * 입력 규칙 (기존 보드 규칙 유지): 빈 칸 = 안 건드림, '-' = 지움, 그 외 = 링크.
 * 붙여넣은 공유 문구(【小红书】… http://xhslink… 复制本条信息)에서 URL 만 뽑고 앞뒤 공백·nbsp 를 없앤다.
 *
 * 막는 것 (2026-09-28 기자단 전수점검에서 실측된 사고 유형):
 *   - 칸 뒤바뀜: 샤오홍슈 링크를 따종 칸에 넣는 등 — 알려진 도메인이 다른 칸 것이면 400.
 *     (인스타·틱톡 등 다른 플랫폼 계약은 도메인을 모르므로 통과시킨다)
 *   - 프로필 링크: xiaohongshu.com/user/profile — 게시물이 아니다.
 *   - 중복: 다른 레코드에 같은 링크가 이미 있으면 409 + 어디에 있는지. force=true 면 저장
 *     (두 사람이 게시물 하나를 같이 올린 경우가 있을 수 있어 막지는 않는다).
 */

import { extractLinks } from './_press.js';
import { escFormula } from './_admin-auth.js';

export const RESULT_FIELDS = { rx: 'XHS_Result', rd: 'DP_Result', ry: 'DY_Result' };
const LABEL = { rx: '샤오홍슈', rd: '따종', ry: '틱톡(더우인)' };

const err = (status, message, extra) => Object.assign(new Error(message), { status }, extra || {});

/** 도메인으로 본 플랫폼 — 'rx' | 'rd' | 'ry' | '' (모름) */
export function platformOf(url) {
  let h = '';
  try { h = new URL(url).hostname.toLowerCase(); } catch { return ''; }
  if (/(^|\.)xhslink\.(cn|com)$/.test(h) || /(^|\.)xiaohongshu\.com$/.test(h)) return 'rx';
  if (/(^|\.)dpurl\.cn$/.test(h) || /(^|\.)dianping\.com$/.test(h) || /(^|\.)meituan\.com$/.test(h)) return 'rd';
  if (/(^|\.)douyin\.com$/.test(h) || /(^|\.)iesdouyin\.com$/.test(h)) return 'ry';
  return '';
}

/** 중복 비교 키 — 호스트(소문자, www 제거) + 경로(끝 '/' 제거). http/https·쿼리 차이는 무시 */
export function linkKey(url) {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase().replace(/^www\./, '') + u.pathname.replace(/\/+$/, '');
  } catch { return String(url || ''); }
}

/** body {rx?, rd?, ry?} → { fields(Airtable), values(화면에 돌려줄 정리된 값) }. 잘못되면 400 */
export function parseResultInput(body) {
  const fields = {};
  const values = {};
  for (const [k, fname] of Object.entries(RESULT_FIELDS)) {
    if (body[k] === undefined) continue;
    const raw = String(body[k] ?? '').trim();
    if (raw === '') continue;                                   // 빈 칸 = 기존 값 유지
    if (raw === '-') { fields[fname] = null; values[k] = ''; continue; }   // '-' = 지움
    const url = extractLinks(raw)[0];
    if (!url) throw err(400, `${LABEL[k]}: 링크를 찾지 못했습니다. http 로 시작하는 주소를 붙여넣으세요. (지우려면 -)`);
    const p = platformOf(url);
    if (p && p !== k) throw err(400, `${LABEL[k]} 칸에 ${LABEL[p]} 링크가 들어왔습니다. 칸을 확인하세요.`);
    if (/xiaohongshu\.com\/user\/profile\//i.test(url)) throw err(400, `${LABEL[k]}: 게시물이 아니라 계정 프로필 링크입니다.`);
    fields[fname] = url.slice(0, 1000);
    values[k] = fields[fname];
  }
  if (!Object.keys(fields).length) throw err(400, '저장할 링크가 없습니다.');
  return { fields, values };
}

/**
 * 같은 링크가 다른 진행_DB_OLD 레코드에 있는가 — 경로(단축코드)로 좁혀 찾고 호스트까지 다시 맞춘다.
 * fetchAll 은 호출하는 API 파일의 것을 넘겨받는다(재시도·페이지 처리 동일하게).
 */
/*
 * 무엇을 '중복'으로 보나 (2026-09-29 실측 반영):
 *   8~9월 샤오홍슈 링크의 10%(41/416)가 여러 레코드에 들어가 있는데 대부분 **같은 인플이 한 게시물에
 *   여러 매장을 담은 경우**다(예: 한 인플의 링크 하나가 5개 매장 레코드). 그건 정상이라 경고하지 않는다.
 *   경고 = 다른 인플의 레코드에 있음(잘못 붙임) 또는 같은 매장·같은 정산월에 이미 있음(이중 집계).
 *   self = { infl, store, month } — 인플이 없는 레코드(기자단 등)는 인플 예외를 두지 않는다.
 */
export async function findDupes(fetchAll, table, fields, selfId, self = {}) {
  const keys = Object.values(fields).filter(Boolean).map(linkKey);
  const paths = keys.map((k) => k.slice(k.indexOf('/'))).filter((p) => p.length >= 6);
  if (!paths.length) return [];
  const hay = "{XHS_Result}&' '&{DP_Result}&' '&{DY_Result}";
  const formula = `AND(RECORD_ID()!='${escFormula(selfId)}',OR(${paths.map((p) => `FIND('${escFormula(p)}',${hay})`).join(',')}))`;
  const recs = await fetchAll(table, {
    formula,
    fields: ['XHS_Result', 'DP_Result', 'DY_Result', '고객명', '지점명', '정산월', 'XHS_ID', '유형', 'XHS_ID_', '매장코드'],
  });
  const want = new Set(keys);
  const first = (v) => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '')).trim();
  return recs
    .filter((r) => Object.values(RESULT_FIELDS).some((f) => {
      const u = extractLinks(r.fields[f] || '')[0];
      return u && want.has(linkKey(u));
    }))
    .filter((r) => {
      // 같은 사람 = 인플 레코드가 같거나 샤오홍슈 아이디(이름)가 같다 — INFL_DB 에 같은 사람이
      // 두 레코드로 중복 등록된 경우가 실재한다(敏敏特穆尔👑 2건, 2026-09-29 실측)
      const sameInfl = (self.infl && first(r.fields['XHS_ID_']) === self.infl)
        || (self.name && first(r.fields['XHS_ID']) === self.name);
      const sameSlot = self.store && first(r.fields['매장코드']) === self.store && first(r.fields['정산월']) === self.month;
      return !sameInfl || sameSlot;
    })
    .slice(0, 5)
    .map((r) => ({
      store: `${first(r.fields['고객명'])} ${first(r.fields['지점명'])}`.trim(),
      month: first(r.fields['정산월']),
      infl: first(r.fields['XHS_ID']),
      type: first(r.fields['유형']),
    }));
}

/** 한 레코드의 결과 링크 저장 — 두 API 의 'result' 액션 본체 */
export async function saveResultLinks({ at, fetchAll, table, body }) {
  const id = String(body.id || '');
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) throw err(400, '레코드가 올바르지 않습니다.');
  const { fields, values } = parseResultInput(body);
  if (!body.force) {
    // 저장하려는 건의 인플·매장·월 — 같은 인플의 여러 매장 게시물을 중복으로 보지 않기 위해
    const me = (await at(`/${encodeURIComponent(table)}/${id}`)).fields || {};
    const first = (v) => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '')).trim();
    const self = {
      infl: first(me['XHS_ID_']), name: first(me['XHS_ID']), store: first(me['매장코드']), month: first(me['정산월']),
    };
    const dup = await findDupes(fetchAll, table, fields, id, self);
    if (dup.length) {
      const where = dup.map((d) => `${d.store} · ${d.month}${d.infl ? ` · ${d.infl}` : ''}`).join('\n');
      throw err(409, `이 링크가 이미 다른 건에 들어가 있습니다:\n${where}`, { dup });
    }
  }
  await at(`/${encodeURIComponent(table)}/${id}`, {
    method: 'PATCH', body: JSON.stringify({ fields, typecast: false }),
  });
  return { ok: true, saved: Object.keys(fields), values };
}
