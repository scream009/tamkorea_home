/* eslint-env node */
/**
 * 모집카드 게시·마감 관리 (/staff/cards 의 데이터 소스)
 *
 * 설계: Sagan_MAS/04_IB캐스팅/카드운영시스템_설계_2026-08-12.md
 * 핵심 = 카드 1장 = 「모집 라운드」. 새 모집은 직전 라운드를 **복제**해 올린다.
 * 그래서 같은 매장의 카드가 다른 기간으로 여러 장 공존할 수 있고,
 * 과거 라운드는 지우지 않는 이력이 된다.
 *
 * actions:
 *   publish — source 라운드 복제 + 수정분 반영 + Platform_Tasks 도 함께 복제
 *   close / reopen / hide — display_status 만 바꾼다 (조기마감·재개·내리기)
 *   update  — 게시 중 라운드의 기간·인원·제공내역 수정
 */

import { staffIdentity } from './_staff-auth.js';

const KEY = process.env.IB_CASTING_TOKEN || process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE = process.env.IB_CASTING_BASE_ID || 'appDYOCw29mohYrIG';
const API = `https://api.airtable.com/v0/${BASE}`;

/* 게시 사고 방지 — 제공내역에 사내 표기가 남아 있으면 새 라운드를 게시할 수 없다 */
const INTERNAL_MARKERS = ['미제공', '확인필요', '실장', '[TBD]'];

/* 복제 시 원본에서 그대로 가져가는 필드 (콘텐츠 전량) */
const COPY_FIELDS = [
  'store_key', 'name', 'client', 'title_zh', 'title_kr', 'subtitle_zh', 'subtitle_kr',
  'district_zh', 'district_kr', 'type', 'address_kr', 'address_zh', 'subway_zh', 'subway_kr',
  'provisions_zh', 'provisions_kr', 'provision_notes_zh',
  'visit_hours_zh', 'visit_hours_kr', 'reservation_hours_zh',
  'requirements_zh', 'requirements_kr', 'cautions_zh', 'cautions_kr', 'card_tags_zh',
  'naver_place_url', 'dzdp_url', 'dzdp_rating', 'dzdp_reviews', 'dzdp_rank', 'avg_price',
];
const ATTACH_FIELDS = ['thumbnail', 'hero_images'];

/* update 로 고칠 수 있는 필드 화이트리스트 */
const EDITABLE = [
  'recruit_start', 'recruit_end', 'announce_date', 'upload_start', 'upload_end',
  'applicants_max', 'provisions_zh', 'provisions_kr', 'requirements_zh', 'requirements_kr',
  'round_label',
];

const LIST_FIELDS = [
  'slug', 'store_key', 'round_label', 'title_kr', 'title_zh', 'client', 'type',
  'display_status', 'recruit_start', 'recruit_end', 'announce_date',
  'upload_start', 'upload_end', 'applicants_max', 'applicants_current',
  'provisions_zh', 'provisions_kr', 'requirements_zh',
];

const STATUS_ACTIONS = { close: 'closed', reopen: 'recruiting', hide: 'hidden', show: 'recruiting' };

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
    (fields || []).forEach((f) => qs.append('fields[]', f));
    if (offset) qs.set('offset', offset);
    const d = await at(`${encodeURIComponent(table)}?${qs}`);
    rows.push(...d.records);
    offset = d.offset || '';
  } while (offset);
  return rows;
}

function hasMarker(v) {
  const s = String(v || '');
  return !s.trim() || INTERNAL_MARKERS.some((m) => s.includes(m));
}

/* 새 slug: {store_key}-{YYMM}{a..z} — 그 매장의 기존 라운드와 안 겹치는 첫 글자 */
function nextSlug(storeKey, recruitStart, existingSlugs) {
  const d = new Date(recruitStart || Date.now());
  const yymm = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  for (let i = 0; i < 26; i += 1) {
    const cand = `${storeKey}-${yymm}${String.fromCharCode(97 + i)}`;
    if (!existingSlugs.has(cand)) return cand;
  }
  throw new Error('라운드 코드가 소진되었습니다 (한 달 26개 초과)');
}

function buildStores(recs) {
  const byStore = new Map();
  recs.forEach((r) => {
    const f = r.fields;
    const key = f.store_key || f.slug || r.id;
    if (!byStore.has(key)) {
      byStore.set(key, {
        store_key: key,
        title: f.title_kr || f.client || key,
        title_zh: f.title_zh || '',
        rounds: [],
      });
    }
    byStore.get(key).rounds.push({
      id: r.id,
      slug: f.slug || '',
      label: f.round_label || f.slug || '',
      status: f.display_status || 'hidden',
      recruit_start: f.recruit_start || '',
      recruit_end: f.recruit_end || '',
      announce_date: f.announce_date || '',
      upload_start: f.upload_start || '',
      upload_end: f.upload_end || '',
      max: f.applicants_max || 0,
      current: f.applicants_current || 0,
      provisions_zh: f.provisions_zh || '',
      provisions_kr: f.provisions_kr || '',
      requirements_zh: f.requirements_zh || '',
      provisionsMissing: hasMarker(f.provisions_zh),
    });
  });
  const stores = [...byStore.values()];
  stores.forEach((s) => {
    s.rounds.sort((a, b) => String(b.recruit_start).localeCompare(String(a.recruit_start)));
    s.recruiting = s.rounds.filter((x) => x.status === 'recruiting').length;
    s.provisionsMissing = s.rounds[0] ? s.rounds[0].provisionsMissing : true;
  });
  stores.sort((a, b) => b.recruiting - a.recruiting || a.title.localeCompare(b.title, 'ko'));
  return stores;
}

async function publish(sourceId, overrides, who) {
  const src = await at(`Campaigns/${encodeURIComponent(sourceId)}`);
  const sf = src.fields;
  const storeKey = sf.store_key;
  if (!storeKey) throw new Error('원본 라운드에 store_key 가 없습니다.');

  const provisions = overrides.provisions_zh != null ? overrides.provisions_zh : sf.provisions_zh;
  if (hasMarker(provisions)) {
    const err = new Error('제공내역이 확정되지 않아 게시할 수 없습니다 (「실장 미제공」 등 사내 표기 포함).');
    err.status = 400;
    throw err;
  }
  const rs = overrides.recruit_start;
  const re = overrides.recruit_end;
  if (!rs || !re || rs > re) {
    const err = new Error('모집 기간이 비었거나 역전돼 있습니다.');
    err.status = 400;
    throw err;
  }
  if (overrides.upload_start && overrides.upload_end && overrides.upload_start > overrides.upload_end) {
    const err = new Error('방문 기간이 역전돼 있습니다.');
    err.status = 400;
    throw err;
  }

  const all = await listAll('Campaigns', ['slug']);
  const slugs = new Set(all.map((r) => r.fields.slug).filter(Boolean));
  const slug = nextSlug(storeKey, rs, slugs);

  const fields = { slug, display_status: 'recruiting', status: 'Active', applicants_current: 0 };
  COPY_FIELDS.forEach((k) => { if (sf[k] != null) fields[k] = sf[k]; });
  ATTACH_FIELDS.forEach((k) => {
    if (Array.isArray(sf[k]) && sf[k].length) {
      fields[k] = sf[k].map((a) => ({ url: a.url })).filter((a) => a.url);
    }
  });
  EDITABLE.forEach((k) => { if (overrides[k] != null && overrides[k] !== '') fields[k] = overrides[k]; });
  if (!fields.round_label) {
    const d = new Date(rs);
    fields.round_label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')} 라운드`;
  }
  fields.name = `${sf.client || storeKey} ${fields.round_label} (게시: ${who})`;

  const created = await at('Campaigns', {
    method: 'POST',
    body: JSON.stringify({ fields, typecast: true }),
  });

  // 미션(Platform_Tasks)도 함께 복제 — 없으면 새 라운드에 임무 탭이 빈다
  const srcSlug = sf.slug || '';
  if (srcSlug) {
    const tasks = await listAll('Platform_Tasks');
    const mine = tasks.filter((t) => String(t.fields.task_id || '').startsWith(`${srcSlug}-`));
    for (const t of mine) {
      const tf = { ...t.fields };
      delete tf.campaign;
      tf.task_id = String(t.fields.task_id).replace(srcSlug, slug);
      await at('Platform_Tasks', {
        method: 'POST',
        body: JSON.stringify({ fields: { ...tf, campaign: [created.id] }, typecast: true }),
      });
    }
  }
  return { id: created.id, slug };
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
      const recs = await listAll('Campaigns', LIST_FIELDS);
      res.status(200).json({ who, stores: buildStores(recs) });
      return;
    }

    if (req.method === 'POST') {
      const { action, id, overrides, fields } = req.body || {};

      if (action === 'publish') {
        const out = await publish(id, overrides || {}, who);
        res.status(200).json({ ok: true, ...out, who });
        return;
      }

      if (STATUS_ACTIONS[action]) {
        if (!id) { res.status(400).json({ error: 'id 가 필요합니다.' }); return; }
        await at(`Campaigns/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: { display_status: STATUS_ACTIONS[action] }, typecast: true }),
        });
        res.status(200).json({ ok: true, id, status: STATUS_ACTIONS[action], who });
        return;
      }

      if (action === 'update') {
        if (!id) { res.status(400).json({ error: 'id 가 필요합니다.' }); return; }
        const clean = {};
        EDITABLE.forEach((k) => { if (fields && fields[k] != null) clean[k] = fields[k]; });
        if (!Object.keys(clean).length) {
          res.status(400).json({ error: '수정할 필드가 없습니다.' });
          return;
        }
        await at(`Campaigns/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: clean, typecast: true }),
        });
        res.status(200).json({ ok: true, id, who });
        return;
      }

      res.status(400).json({ error: 'action 은 publish|close|reopen|hide|update 중 하나여야 합니다.' });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || '처리 중 오류가 발생했습니다.' });
  }
}
