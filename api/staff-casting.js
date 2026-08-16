/* eslint-env node */
/**
 * 체험단 지원자 선발 (/staff/casting 의 데이터 소스)
 *
 * 대상 base 는 TK_DB_V3 가 아니라 **IB_Casting**(캠페인 모집사이트 전용 base)이다.
 * casting_site 신청폼 → Applicants 로 쌓인 지원자를 캠페인(매장)별로 묶어 보여주고,
 * 담당자가 선발/탈락을 확정한다. 선정 통보는 위챗 수동(STEP 1) — 여기서는 상태만 바꾼다.
 *
 * Applicants.status 는 AI 심사 파이프라인 옵션(New→Scraping→…→HITL→Approved/Rejected)을
 * 공유한다. 수동 선발은 그중 New ↔ Approved/Rejected 만 오간다. 중간 단계 값이 있는
 * 레코드는 "심사중"으로 표시만 하고 여기서 건드리지 않는다.
 *
 * ⚠️ 배포 전 확인: Vercel 의 Airtable 토큰(TAMLINK_API_KEY)에 IB_Casting base 스코프가
 * 있어야 한다. 없으면 이 화면만 503/403 이 난다.
 */

import { staffIdentity } from './_staff-auth.js';
import { escFormula } from './_admin-auth.js';

/* IB_Casting 은 TK_DB_V3 와 다른 base 라 기존 토큰(TAMLINK_API_KEY)에 권한이 없을 수 있다.
 * 전용 토큰(IB_CASTING_TOKEN)을 먼저 찾고, 없으면 기존 토큰으로 폴백한다.
 * 실측 2026-08-12: TAMLINK_API_KEY 는 IB_Casting 에 403 — Vercel 에 IB_CASTING_TOKEN 필요. */
const KEY = process.env.IB_CASTING_TOKEN || process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE = process.env.IB_CASTING_BASE_ID || 'appDYOCw29mohYrIG';
const API = `https://api.airtable.com/v0/${BASE}`;

const T_CAMPAIGNS = 'Campaigns';
const T_APPLICANTS = 'Applicants';

const CAMPAIGN_FIELDS = [
  'slug', 'title_kr', 'title_zh', 'client', 'display_status',
  'applicants_max', 'recruit_start', 'recruit_end', 'announce_date',
];

/* base 에 남아 있는 중국어 동의문 옵션. 지금 폼은 한국어 라벨을 보내지만 옛 레코드가 있을 수 있다. */
const VISA_LEGACY = {
  '确认，我是常驻韩国的小红书博主': '재한상주',
  '确认，我是偶尔来韩国旅游的国内博主': '단기방문',
  '我长居国内但是想参加记者团': '기자단',
};

const APPLICANT_FIELDS = [
  'name', 'xhs_url', 'xhs_account_name', 'xhs_followers', 'dzdp_account',
  'gender', 'birth_year', 'visa_status', 'preferred_visit_date', 'pax',
  'companion_xhs_account', 'application_message', 'status', 'source',
  '🔒 pii_wechat', 'campaign_slug', 'referrer', 'team_key', 'team_role',
];

/* 수동 선발이 만들 수 있는 상태 전이만 허용한다 */
const ACTIONS = {
  approve: 'Approved',
  reject: 'Rejected',
  reset: 'New',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function at(path, init) {
  for (let i = 0; ; i += 1) {
    const resp = await fetch(`${API}/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        ...(init && init.headers),
      },
    });
    if (resp.status === 429 && i < 4) { await sleep(600 * (i + 1)); continue; }
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      const err = new Error(`Airtable ${resp.status}: ${body.slice(0, 200)}`);
      err.status = resp.status === 403 ? 503 : 502;
      throw err;
    }
    return resp.json();
  }
}

async function listAll(table, fields) {
  const rows = [];
  let offset = '';
  do {
    const qs = new URLSearchParams({ pageSize: '100' });
    fields.forEach((f) => qs.append('fields[]', f));
    if (offset) qs.set('offset', offset);
    const d = await at(`${encodeURIComponent(table)}?${qs}`);
    rows.push(...d.records);
    offset = d.offset || '';
  } while (offset);
  return rows;
}

function buildPayload(campRecs, applRecs, resvMap) {
  const bySlug = new Map();
  campRecs.forEach((r) => {
    const f = r.fields;
    if (!f.slug) return;
    bySlug.set(f.slug, {
      id: r.id,
      slug: f.slug,
      title: f.title_kr || f.title_zh || f.slug,
      client: f.client || '',
      display_status: f.display_status || '',
      max: f.applicants_max || 0,
      recruit_end: f.recruit_end || '',
      announce_date: f.announce_date || '',
      stats: { total: 0, new: 0, approved: 0, rejected: 0, reviewing: 0 },
      applicants: [],
    });
  });

  applRecs.forEach((r) => {
    const f = r.fields;
    const camp = bySlug.get(f.campaign_slug);
    if (!camp) return;
    const st = f.status || 'New';
    const bucket = st === 'New' ? 'new'
      : st === 'Approved' ? 'approved'
        : st === 'Rejected' ? 'rejected' : 'reviewing';
    camp.stats.total += 1;
    camp.stats[bucket] += 1;
    camp.applicants.push({
      id: r.id,
      name: f.name || '',
      xhsUrl: f.xhs_url || '',
      xhsName: f.xhs_account_name || '',
      followers: f.xhs_followers || 0,
      dzdp: f.dzdp_account || '',
      gender: f.gender || '',
      birth: f.birth_year || '',
      visa: VISA_LEGACY[f.visa_status] || f.visa_status || '',
      visit: f.preferred_visit_date || '',
      pax: f.pax || '',
      companion: f.companion_xhs_account || '',
      msg: f.application_message || '',
      wechat: f['🔒 pii_wechat'] || '',
      referrer: f.referrer || '',
      teamKey: f.team_key || '',
      teamRole: f.team_role || '',
      status: st,
      bucket,
      resv: (resvMap && resvMap[r.id]) || null,
      source: f.source || '',
      createdAt: r.createdTime || '',
    });
  });

  const campaigns = [...bySlug.values()]
    .filter((c) => c.stats.total > 0 || c.display_status === 'recruiting')
    .sort((a, b) => b.stats.new - a.stats.new || b.stats.total - a.stats.total);
  campaigns.forEach((c) => {
    c.applicants.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  });
  return campaigns;
}

/* ══════════════════════════════════════════════════════════════════
 * 선발 → TK_DB_V3 예약입력_DB 연계 (Owner 확정 2026-08-12)
 *
 * 선발 순간 예약입력_DB 에 「예약요청」 레코드만 만든다. 자동발송체크는 건드리지
 * 않으므로(OFF) 봇은 아무것도 보내지 않는다 — **발송은 기존 발송 큐에서 사람이
 * 따로 누른다.** 담당(예약_ID) = referrer(홍보 링크 주인), 없으면 선발 누른 사람.
 *
 * 인플이 INFL_DB 에 없으면 신규 등록한다 (PAL 은 폼에서 안 받으므로 모집 최소
 * 기준 1000 으로 넣고 비고에 미검증 표기 — 담당자가 조율하며 교정).
 * 팀 동행(member)은 대표의 예약 레코드에 XHS_ID_ 로 합류시킨다.
 *
 * 실패해도 선발(Approve)은 유효하다 — 응답 warning 으로 알리고 수동(/staff/new) 처리.
 * ══════════════════════════════════════════════════════════════════ */
const TK_KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const TK_BASE = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const TK_API = `https://api.airtable.com/v0/${TK_BASE}`;
const MGRS = ['HH', 'LH', 'AN', 'FB'];

async function tk(path, init) {
  for (let i = 0; ; i += 1) {
    const resp = await fetch(`${TK_API}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${TK_KEY}`, 'Content-Type': 'application/json', ...(init && init.headers) },
    });
    if (resp.status === 429 && i < 4) { await sleep(600 * (i + 1)); continue; }
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`TK Airtable ${resp.status}: ${body.slice(0, 160)}`);
    }
    return resp.json();
  }
}

async function tkList(table, formula, fields) {
  const qs = new URLSearchParams({ pageSize: '20' });
  if (formula) qs.set('filterByFormula', formula);
  (fields || []).forEach((f) => qs.append('fields[]', f));
  const d = await tk(`${encodeURIComponent(table)}?${qs}`);
  return d.records;
}

function monthLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}월`;
}

/** 선발된 지원자를 예약입력_DB 로 넘긴다. 반환 {status:'ok'|'warn', msg} — throw 하지 않는다 */
async function pushToResv(applicantId, who, mgrOverride) {
  try {
    const a = (await at(`Applicants/${encodeURIComponent(applicantId)}`)).fields;
    const slug = a.campaign_slug || '';
    const tag = `IB:${applicantId}`;

    // 담당 우선순위: 화면에서 지정 > 홍보링크 referrer > 선발자 개인키.
    // admin·공용키로 선발하면 셋 다 아닐 수 있다 → no_mgr 로 돌려보내 화면이 물어본다.
    const mgr = MGRS.includes(mgrOverride) ? mgrOverride
      : MGRS.includes(a.referrer) ? a.referrer
        : (MGRS.includes(who) ? who : null);
    if (!mgr) {
      return { status: 'warn', code: 'no_mgr',
        msg: `담당자 판별 불가 (referrer=${a.referrer || '없음'}, 선발자=${who})` };
    }

    const camps = await listAll('Campaigns', ['slug', 'client', 'upload_start']);
    const camp = camps.find((c) => c.fields.slug === slug);
    if (!camp) return { status: 'warn', msg: `캠페인(${slug})을 찾지 못함 — 수동 입력` };
    const client = camp.fields.client || '';

    const dup = await tkList('예약입력_DB', `FIND('${escFormula(tag)}',{비고})`, ['Shoot_ID']);
    if (dup.length) return { status: 'ok', msg: '이미 예약입력_DB에 있음' };

    const stores = await tkList('CS_DB', `{고객사명(필수)}='${escFormula(client)}'`, ['고객사명(필수)', '지점명(필수)']);
    if (stores.length !== 1) {
      return { status: 'warn', msg: `매장 매칭 ${stores.length}건('${client}') — /staff/new 수동 입력` };
    }
    const storeId = stores[0].id;

    const xid = String(a.xhs_account_name || '').trim();
    if (!xid) return { status: 'warn', msg: '샤오홍슈 계정명이 비어 있음 — 수동 입력' };
    let inflId;
    let inflNew = false;
    const found = await tkList('INFL_DB', `{XHS_ID(필수)}='${escFormula(xid)}'`, ['XHS_ID(필수)']);
    if (found.length) {
      inflId = found[0].id;
    } else {
      const made = await tk('INFL_DB', {
        method: 'POST',
        body: JSON.stringify({
          records: [{ fields: {
            'XHS_ID(필수)': xid,
            '섭외_ID(필수)': mgr,
            'XHS_link1(필수)': a.xhs_url || 'https://www.xiaohongshu.com',
            'PAL(필수)': Number(a.xhs_followers) || 1000,   // 지원서 자기신고값 — 없을 때만 1000 가등록
            WC_ID: a['🔒 pii_wechat'] || '',
            닉네임: a.name || '',
          } }],
          typecast: true,
        }),
      });
      inflId = made.records[0].id;
      inflNew = true;
    }

    if (a.team_role === 'member' && a.team_key) {
      const leadResv = await tkList('예약입력_DB', `FIND('IB:${escFormula(a.team_key)}',{비고})`,
        ['XHS_ID_', '비고', '진행상태', '자동발송체크']);
      if (!leadResv.length) return { status: 'warn', msg: '팀 대표의 예약이 아직 없음 — 대표 먼저 선발 후 다시, 또는 수동 합류' };
      const lr = leadResv[0];
      const lrSt = Array.isArray(lr.fields['진행상태']) ? lr.fields['진행상태'][0] : (lr.fields['진행상태'] || '');
      if (lrSt !== '예약요청' || lr.fields['자동발송체크']) {
        // 이미 나간 예약에 인원을 몰래 붙이면 고객사가 아는 인원과 어긋난다 — 변경요청 절차로
        return { status: 'warn', msg: `대표 예약이 이미 나갔습니다(${lrSt}) — 동행 추가는 발송 화면의 「변경」으로 처리하세요.` };
      }
      const ids = new Set(lr.fields['XHS_ID_'] || []);
      ids.add(inflId);
      await tk(`예약입력_DB/${lr.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: {
          'XHS_ID_': [...ids],
          'XHS_건수': ids.size,
          'DP_건수': ids.size,
          비고: `${lr.fields['비고'] || ''} | 동행 합류 ${xid} (${tag})`.trim(),
        }, typecast: true }),
      });
      return { status: 'ok', msg: `팀 대표 예약에 동행 합류 (${xid})` };
    }

    // 🔴 지원자가 적어 낸 **시간을 그대로 쓴다.**
    //    예전에는 날짜만 잘라 12:00 으로 덮어썼는데, 그 시절 지원서는 날짜만 받았기 때문이다.
    //    지금 폼은 datetime-local 로 시간까지 받는다 — 덮어쓰면 조율된 시간이 사라진다
    //    (Owner 2026-08-15: 10:30 으로 적어 낸 건이 12:00 으로 들어갔다).
    //    자정(00:00)만 '시간 미기재'로 보고 12:00 으로 가등록한다 — 아무도 자정에 방문하지 않는다.
    const rawVisit = String(a.preferred_visit_date || '');
    const day = rawVisit.slice(0, 10);
    if (!day) return { status: 'warn', msg: '희망 방문일이 없음 — 수동 입력' };
    const kst = rawVisit ? new Date(rawVisit) : null;
    // Airtable 은 UTC 로 준다 → KST 로 옮겨 시:분을 본다
    const kstMs = kst && !Number.isNaN(kst.getTime()) ? kst.getTime() + 9 * 3600 * 1000 : null;
    const kstDate = kstMs !== null ? new Date(kstMs) : null;
    const hh = kstDate ? kstDate.getUTCHours() : 0;
    const mm = kstDate ? kstDate.getUTCMinutes() : 0;
    const hasTime = kstDate !== null && !(hh === 0 && mm === 0);
    const dayKst = kstDate
      ? `${kstDate.getUTCFullYear()}-${String(kstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(kstDate.getUTCDate()).padStart(2, '0')}`
      : day;
    const hhmm = hasTime ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` : '12:00';
    const whenIso = new Date(`${dayKst}T${hhmm}:00+09:00`).toISOString();

    await tk('예약입력_DB', {
      method: 'POST',
      body: JSON.stringify({
        records: [{ fields: {
          매장코드: [storeId],
          '예약_ID': mgr,
          유형: '체험',
          진행상태: '예약요청',
          정산월: monthLabel(camp.fields.upload_start) || monthLabel(new Date().toISOString()),
          예약일시: whenIso,
          총인원: Number(a.pax) || 1,
          'XHS_건수': 1,
          'DP_건수': 1,
          대표인플: [inflId],
          'XHS_ID_': [inflId],
          인원메모: `모집사이트 선발 · ${hasTime ? `희망 ${hhmm}` : '시간 미기재(기본 12:00)'} · 위챗 ${a['🔒 pii_wechat'] || '-'}`,
          비고: `${tag} · 담당 ${mgr}${inflNew ? (a.xhs_followers ? ' · 인플 신규등록(PAL 자기신고)' : ' · 인플 신규등록(PAL 미검증)') : ''} · 계약월 확인 필요`,
        } }],
        typecast: true,
      }),
    });
    // 인플 전달용 링크 — 기존 /submit 체계(일정·링크제출·QR)가 INFL_ID 로 이미 돌고 있다.
    // 선발 통보 위챗에 이 링크만 붙이면 이후 과정이 전부 그 링크 하나로 이어진다.
    let submitUrl = '';
    try {
      const inflRec = await tk(`INFL_DB/${inflId}`);
      // 정식 경로는 보안 토큰(Submit_Token, 수식 자동생성). 없을 때만 구형 inflId 폴백
      const tok2 = inflRec.fields['Submit_Token'];
      const iid = inflRec.fields['INFL_ID'];
      if (tok2) submitUrl = `https://www.tamkorea.com/submit?token=${encodeURIComponent(tok2)}`;
      else if (iid) submitUrl = `https://www.tamkorea.com/submit?inflId=${encodeURIComponent(iid)}`;
    } catch { /* 링크는 부가 정보 — 실패해도 선발·예약은 유효 */ }
    return { status: 'ok', submitUrl,
      msg: `예약입력_DB 생성 (담당 ${mgr}, ${dayKst} ${hhmm}${hasTime ? '' : ' 가등록'})` };
  } catch (e) {
    return { status: 'warn', msg: `예약입력_DB 연계 실패: ${e.message} — /staff/new 수동 입력` };
  }
}


/**
 * 되돌리기(선발 취소) ↔ 예약입력_DB 동기화 (Owner 확정 2026-08-12)
 *
 * 발송 큐의 삭제 규칙과 **같은 잣대**를 쓴다 — 「예약요청 & 미발송」만 지운다.
 * 그 조건이면 고객사에 나간 적이 없으므로 지워도 안전하고, 하나라도 벗어나면
 * (예약확정·발송됨·진행_DB 로 쪼개져 진행 중) 지우지 않고 사람에게 넘긴다.
 *
 * 반환:
 *   {code:'deleted'} — 예약도 같이 삭제함
 *   {code:'none'}    — 연결된 예약이 없음
 *   {code:'confirm'} — 이미 나간 건이라 삭제 불가. force 로 재호출하면 선발만 취소
 *   {code:'manual'}  — force 로 진행. 예약은 발송 큐에서 취소 처리해야 함
 */
async function revertResv(applicantId, force, cancelKind) {
  try {
    const tag = `IB:${applicantId}`;
    const hits = await tkList('예약입력_DB', `FIND('${escFormula(tag)}',{비고})`,
      ['진행상태', '자동발송체크', '팀명생성기', 'Shoot_ID']);
    if (!hits.length) return { code: 'none' };

    const r = hits[0];
    const st = Array.isArray(r.fields['진행상태']) ? r.fields['진행상태'][0] : (r.fields['진행상태'] || '');
    const sent = !!r.fields['자동발송체크'];
    const shoot = r.fields['Shoot_ID'] || r.id;

    // 쪼개진 진행 건이 이미 움직였으면 손대지 않는다
    let children = [];
    const teamKey = r.fields['팀명생성기'];
    if (teamKey) {
      children = await tkList('진행_DB_OLD', `{팀명생성기}='${escFormula(teamKey)}'`, ['진행상태']);
      const moved = children.filter((c) => {
        const cs = Array.isArray(c.fields['진행상태']) ? c.fields['진행상태'][0] : (c.fields['진행상태'] || '');
        return cs !== '예약요청';
      });
      if (moved.length) {
        if (!force) return { code: 'confirm', reason: `분할된 진행 건 ${moved.length}건이 이미 진행 중`, shoot };
        if (!cancelKind) {
          return { code: 'manual', msg: `분할 진행 건 ${moved.length}건이 진행 중 — 예약(${shoot})은 발송 화면에서 취소 처리하세요.` };
        }
        // 취소는 아래 공통 경로에서 처리된다 (진행상태 검사에 걸린다)
      }
    }

    if (st !== '예약요청' || sent) {
      if (!force) return { code: 'confirm', reason: sent ? '이미 발송됨' : `진행상태가 「${st}」`, shoot };
      if (cancelKind) {
        // 발송 큐의 취소와 **완전히 같은 방식** — 자동발송체크를 켜면 봇이 취소 안내를 보낸다.
        // 상태만 조용히 바꾸는 게 아니라 고객사에 실제로 통보된다.
        await tk(`${encodeURIComponent('예약입력_DB')}/${r.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: {
            진행상태: cancelKind,
            자동발송체크: true,
            고객전달메모: '체험단 사정으로 방문이 취소되었습니다. 불편을 드려 죄송합니다.',
          }, typecast: true }),
        });
        return { code: 'cancelled', msg: `예약(${shoot})을 「${cancelKind}」로 처리했습니다 — 취소 안내가 고객사에 발송됩니다.` };
      }
      return { code: 'manual', msg: `예약(${shoot})은 그대로 남아 있습니다 — 발송 화면에서 취소 처리하세요.` };
    }

    // 예약요청 & 미발송 → 자식부터 지우고 본체 삭제
    for (let k = 0; k < children.length; k += 10) {
      const qs = children.slice(k, k + 10).map((c) => `records[]=${c.id}`).join('&');
      await tk(`${encodeURIComponent('진행_DB_OLD')}?${qs}`, { method: 'DELETE' });
    }
    await tk(`${encodeURIComponent('예약입력_DB')}?records[]=${r.id}`, { method: 'DELETE' });
    return { code: 'deleted', msg: `예약(${shoot}) 도 함께 삭제했습니다 — 예약요청·미발송 건이라 안전합니다.` };
  } catch (e) {
    return { code: 'manual', msg: `예약 동기화 실패: ${e.message} — 발송 큐에서 직접 확인하세요.` };
  }
}

/**
 * 지원자 → 예약 상태 맵. 화면이 **누르기 전에** 올바른 버튼만 보여주기 위해 필요하다.
 * 비고의 `IB:{지원서ID}` 태그로 역추적한다. 실패해도 목록은 살아야 하므로 빈 맵을 준다.
 */
async function fetchResvMap() {
  try {
    const records = [];
    let offset = '';
    do {
      const qs = new URLSearchParams({ pageSize: '100' });
      qs.set('filterByFormula', "FIND('IB:',{비고})");
      ['비고', '진행상태', '자동발송체크', 'Shoot_ID'].forEach((f) => qs.append('fields[]', f));
      if (offset) qs.set('offset', offset);
      const d = await tk(`${encodeURIComponent('예약입력_DB')}?${qs}`);
      records.push(...(d.records || []));
      offset = d.offset || '';
    } while (offset);
    const map = {};
    records.forEach((r) => {
      const m = /IB:(rec[A-Za-z0-9]+)/.exec(String(r.fields['비고'] || ''));
      if (!m) return;
      const st = Array.isArray(r.fields['진행상태']) ? r.fields['진행상태'][0] : (r.fields['진행상태'] || '');
      map[m[1]] = {
        shoot: r.fields['Shoot_ID'] || '',
        status: st,
        sent: !!r.fields['자동발송체크'],
        // 지울 수 있는 건가 = 발송 큐의 삭제 규칙과 같은 잣대
        removable: st === '예약요청' && !r.fields['자동발송체크'],
      };
    });
    return map;
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  const who = staffIdentity(req, res);
  if (!who) return;
  if (!KEY) {
    res.status(503).json({ error: 'Airtable 토큰이 설정되지 않았습니다.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const [camps, appls, resvMap] = await Promise.all([
        listAll(T_CAMPAIGNS, CAMPAIGN_FIELDS),
        listAll(T_APPLICANTS, APPLICANT_FIELDS),
        fetchResvMap(),
      ]);
      res.status(200).json({ who, campaigns: buildPayload(camps, appls, resvMap) });
      return;
    }

    if (req.method === 'POST') {
      const { id, action, mgr, force, cancelKind, slug, count } = req.body || {};

      // ── 교육용 연습 지원자 ──────────────────────────────────────────
      // 실사이트에 가짜 지원수·마감을 노출하는 대신, **연습 대상만** 여기서 만든다.
      // 전부 source='training' 으로 찍히므로 개시 전에 purge_test 한 번으로 걷힌다.
      if (action === 'seed_test') {
        if (!slug) { res.status(400).json({ error: 'slug 가 필요합니다.' }); return; }
        const n = Math.min(Math.max(parseInt(count, 10) || 5, 1), 20);
        const made = [];
        for (let i = 0; i < n; i += 1) {
          const seq = String(Date.now()).slice(-5) + i;
          const d = await at(T_APPLICANTS, {
            method: 'POST',
            body: JSON.stringify({
              fields: {
                name: `测试·연습${seq}`,
                gender: i % 2 ? '男' : '女',
                birth_year: 1992 + (i % 8),
                xhs_url: `https://www.xiaohongshu.com/user/profile/training${seq}`,
                xhs_followers: 1200 + i * 830,
                '🔒 pii_wechat': `training_${seq}`,
                campaign_slug: slug,
                status: 'New',
                source: 'training',
                agreed_wechat_contact: true,
                referrer: who,
              },
              typecast: true,
            }),
          });
          made.push(d.id);
        }
        res.status(200).json({ ok: true, made: made.length, slug, who });
        return;
      }

      if (action === 'purge_test') {
        // 선발까지 연습했다면 예약입력_DB 에 레코드가 생겼을 수 있다 → 먼저 되돌린다
        const found = await at(
          `${T_APPLICANTS}?pageSize=100&filterByFormula=${encodeURIComponent(
            "OR({source}='training', LEFT({name},3)='测试·')"
          )}`
        );
        let reverted = 0;
        for (const r of found.records) {
          if ((r.fields.status || '') === 'Approved') {
            await revertResv(r.id, true, 'deleted');
            reverted += 1;
          }
        }
        const ids = found.records.map((r) => r.id);
        for (let i = 0; i < ids.length; i += 10) {
          const qs = ids.slice(i, i + 10).map((x) => `records[]=${encodeURIComponent(x)}`).join('&');
          await at(`${T_APPLICANTS}?${qs}`, { method: 'DELETE' });
        }
        res.status(200).json({ ok: true, deleted: ids.length, reverted, who });
        return;
      }

      const next = ACTIONS[action];
      if (!id || !next) {
        res.status(400).json({ error: 'id 와 action(approve|reject|reset)이 필요합니다.' });
        return;
      }
      // 🔴 **Approved 를 벗어나는 모든 전이**에 예약 동기화를 건다 (되돌리기·탈락 모두).
      // action 이름으로 분기하면 새 버튼이 생길 때마다 예약이 고아로 남는다 —
      // 실제로 '탈락' 에 동기화가 빠져 예약만 살아남는 사고가 났다 (2026-08-12).
      const cur = await at(`${T_APPLICANTS}/${encodeURIComponent(id)}`);
      const curStatus = cur.fields.status || 'New';
      if (curStatus === 'Approved' && next !== 'Approved') {
        const rv = await revertResv(id, !!force, cancelKind);
        if (rv.code === 'confirm') {
          res.status(200).json({ ok: false, needConfirm: true, resv: rv, who });
          return;
        }
        const d0 = await at(`${T_APPLICANTS}/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: { status: next } }),
        });
        res.status(200).json({ ok: true, id: d0.id, status: next, who, resv: rv });
        return;
      }

      const d = await at(`${T_APPLICANTS}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: {
          status: next,
          // 선발자 기록 — 유입(referrer)과 별개로 남긴다. 정산 포함 여부는 내부협의 (Owner 2026-08-12)
          ...(action === 'approve' ? { approved_by: who } : {}),
        } }),
      });
      // 선발이면 예약입력_DB 로 넘긴다 (실패해도 선발은 유효 — warning 으로 알림)
      let resv = null;
      if (action === 'approve') resv = await pushToResv(id, who, mgr);
      res.status(200).json({ ok: true, id: d.id, status: next, who, resv });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || '처리 중 오류가 발생했습니다.' });
  }
}
