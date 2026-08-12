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

const KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
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
  'name', 'xhs_url', 'xhs_account_name', 'dzdp_account',
  'gender', 'birth_year', 'visa_status', 'preferred_visit_date', 'pax',
  'companion_xhs_account', 'application_message', 'status', 'source',
  '🔒 pii_wechat', 'campaign_slug',
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

function buildPayload(campRecs, applRecs) {
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
      dzdp: f.dzdp_account || '',
      gender: f.gender || '',
      birth: f.birth_year || '',
      visa: VISA_LEGACY[f.visa_status] || f.visa_status || '',
      visit: f.preferred_visit_date || '',
      pax: f.pax || '',
      companion: f.companion_xhs_account || '',
      msg: f.application_message || '',
      wechat: f['🔒 pii_wechat'] || '',
      status: st,
      bucket,
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

export default async function handler(req, res) {
  const who = staffIdentity(req, res);
  if (!who) return;
  if (!KEY) {
    res.status(503).json({ error: 'Airtable 토큰이 설정되지 않았습니다.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const [camps, appls] = await Promise.all([
        listAll(T_CAMPAIGNS, CAMPAIGN_FIELDS),
        listAll(T_APPLICANTS, APPLICANT_FIELDS),
      ]);
      res.status(200).json({ who, campaigns: buildPayload(camps, appls) });
      return;
    }

    if (req.method === 'POST') {
      const { id, action } = req.body || {};
      const next = ACTIONS[action];
      if (!id || !next) {
        res.status(400).json({ error: 'id 와 action(approve|reject|reset)이 필요합니다.' });
        return;
      }
      const d = await at(`${T_APPLICANTS}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { status: next } }),
      });
      res.status(200).json({ ok: true, id: d.id, status: next, who });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || '처리 중 오류가 발생했습니다.' });
  }
}
