/* eslint-env node */
import crypto from 'crypto';
import { escFormula } from './_admin-auth.js';
import { storeSig, storeCodeDaily } from './_qr-sign.js';

const KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const API = `https://api.airtable.com/v0/${BASE}`;

const T_PROGRESS = '진행_DB_OLD';
const T_ENTRY = '예약입력_DB';
const T_INFL = 'INFL_DB';
const T_STORE = 'CS_DB';

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
async function at(path, init) {
  const method = String(init?.method || 'GET').toUpperCase();
  for (let attempt = 0; ; attempt += 1) {
    const r = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
    if (r.ok) return r.json().catch(() => ({}));
    const retriable = r.status === 429 || (method === 'GET' && r.status >= 500);
    if (retriable && attempt < 3) {
      await sleep(400 * 2 ** attempt + Math.random() * 200);
      continue;
    }
    const body = await r.json().catch(() => ({}));
    const msg = body?.error?.message || body?.error?.type || `Airtable ${r.status}`;
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
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

    const d = await at(`/${encodeURIComponent(table)}?${p.toString()}`);
    out.push(...(d.records || []));
    offset = d.offset || '';
  } while (offset);
  return out;
}

function one(v) {
  if (Array.isArray(v)) {
    for (const x of v) { const s = String(x ?? '').trim(); if (s) return s; }
    return '';
  }
  return String(v ?? '').trim();
}

/** ISO → KST 'M/D HH:mm' */
function fmtKst(dt) {
  if (!dt) return '';
  const d = new Date(new Date(dt).getTime() + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function timingSafeEqual(a, b) {
  try {
    if (!a || !b) return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { inflToken, sig } = body;
    let storeId = body.storeId || '';
    const who = body.who ? 1 : 0;         // 스캔 후 오늘 이 매장 예약 명단 (토큰 없는 폰)
    const pick = String(body.pick || ''); // 명단에서 고른 진행 레코드 ID
    const code = String(body.code || '').replace(/\D/g, ''); // v1.7: 일별 회전 코드 (2차 수단)

    // 도착 증명 = 매장 QR 서명(sig) 또는 매장 게시 일별 코드(code) — 자가 탭 경로는 없다.
    // 명단 조회(who)·선택 체크인(pick)은 QR 스캔 전용(sig 필수).
    // 코드 경로는 제출 토큰 신원이 전제(제출 페이지 안에서만 쓰는 폴백).
    const sigPath = !!(storeId && sig);
    const codePath = !sigPath && !!(inflToken && code);
    if ((!sigPath && !codePath) || ((who || pick) && !sigPath) || (!who && !pick && !inflToken)) {
      return res.status(400).json({ error: '누락된 파라미터가 있습니다.' });
    }
    if (!process.env.QR_CHECKIN_SECRET) {
      return res.status(500).json({ error: '서버 설정 오류 (Secret 누락)' });
    }
    if (sigPath) {
      if (!timingSafeEqual(storeSig(storeId), sig)) {
        return res.status(404).json({ error: 'Not found' });
      }
    } else {
      // 코드 경로 — 오늘/어제 코드만 인정 (매장 화면 자정 미갱신 유예)
      if (code.length !== 6) {
        return res.status(400).json({ error: '签到码为6位数字 / 체크인 코드는 6자리 숫자입니다.' });
      }
      const codeOk = (id) => code === storeCodeDaily(id, 0) || code === storeCodeDaily(id, -1);
      const stores = await fetchAll(T_STORE, { fields: ['고객사명(필수)'] });
      const hits = stores.filter((r) => codeOk(r.id));
      if (hits.length === 0) {
        return res.status(404).json({ error: '签到码不正确。请确认店内今日码 / 코드가 맞지 않습니다. 매장의 오늘 코드를 확인하세요.' });
      }
      if (hits.length > 1) {
        // 일별 파생 코드 충돌(희귀) — 이 날은 QR 스캔만 쓰게 한다
        return res.status(409).json({ error: '此签到码今日无法使用，请扫描店内二维码 / 오늘은 이 코드를 쓸 수 없습니다. QR을 스캔해 주세요.' });
      }
      storeId = hits[0].id;
    }

    const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
    const yest = new Date(nowKst.getTime() - 24 * 3600 * 1000);
    const tmrw = new Date(nowKst.getTime() + 24 * 3600 * 1000);
    const ymdStart = yest.toISOString().split('T')[0];
    const ymdEnd = tmrw.toISOString().split('T')[0];

    const formula = `AND(` + 
      `IS_AFTER({예약일시}, DATETIME_PARSE('${ymdStart} 00:00', 'YYYY-MM-DD HH:mm')),` +
      `IS_BEFORE({예약일시}, DATETIME_PARSE('${ymdEnd} 23:59', 'YYYY-MM-DD HH:mm')),` +
      `NOT({진행상태} = '취소_방문자'), NOT({진행상태} = '취소_고객사'), NOT({진행상태} = '노쇼')` +
    `)`;

    const all = await fetchAll(T_PROGRESS, {
      formula,
      // '고객사+지점명' 필드는 진행_DB_OLD 에 없다 — 매장 표기는 `매장명_검색용` (제출 페이지와 동일)
      // XHS_ID(닉네임 룩업)는 명단 표시·선택 체크인의 신원 표기에 쓴다
      fields: ['예약일시', '진행상태', 'XHS_ID_', 'XHS_ID', '매장코드', '팀명생성기', '체크인일시', '매장명_검색용', '총인원']
    });
    const bySort = (a, b) => new Date(a.fields['예약일시'] || 0) - new Date(b.fields['예약일시'] || 0);
    const atStore = all.filter(r => (r.fields['매장코드'] || []).includes(storeId)).sort(bySort);

    const alreadyPayload = (rec, name) => ({
      ok: 1, already: 1,
      when: fmtKst(rec.fields['체크인일시']), // 날짜 포함 (Owner 요청)
      xid: name,
      store: one(rec.fields['매장명_검색용']),
      resvWhen: fmtKst(rec.fields['예약일시']),
      pax: rec.fields['총인원'] ?? '',
    });

    if (who) {
      // 스캔만으로 신원까지 해결 — 오늘 이 매장 예약 명단을 주고 본인 계정을 고르게 한다.
      // 매장 QR 서명을 통과해야만 볼 수 있으므로 명단 노출 범위 = 그 매장 현장.
      return res.status(200).json({
        ok: 1,
        store: atStore.length ? one(atStore[0].fields['매장명_검색용']) : '',
        cands: atStore.map(r => ({
          pid: r.id,
          xid: one(r.fields['XHS_ID']) || '(계정 미표기)',
          when: fmtKst(r.fields['예약일시']),
          checked: r.fields['체크인일시'] ? 1 : 0,
        })),
      });
    }

    let targetResv = null;
    let xhsId = '';

    if (pick) {
      // 명단 선택 체크인 — 창·상태·매장 조건을 통과한 atStore 안에서만 고를 수 있다
      const rec = atStore.find(r => r.id === pick);
      if (!rec) {
        return res.status(404).json({ error: '선택한 예약을 찾을 수 없습니다. 다시 스캔해 주세요.' });
      }
      xhsId = one(rec.fields['XHS_ID']) || '인플루언서';
      if (rec.fields['체크인일시']) {
        return res.status(200).json(alreadyPayload(rec, xhsId));
      }
      targetResv = rec;
    } else {
      // 제출 토큰 자동 경로 (제출 링크를 연 적 있는 폰은 명단 선택 없이 즉시)
      // ⚠️ 필드명 함정: INFL_DB 는 `XHS_ID(필수)` — 접미까지가 실명 (2026-08-06 메타 실측)
      const inflRecs = await fetchAll(T_INFL, {
        formula: `{Submit_Token}='${escFormula(inflToken)}'`,
        fields: ['XHS_ID(필수)']
      });
      if (!inflRecs.length) {
        return res.status(404).json({ error: '인플루언서 토큰을 찾을 수 없습니다.', badToken: 1 });
      }
      const inflRecId = inflRecs[0].id;
      xhsId = one(inflRecs[0].fields['XHS_ID(필수)']) || '인플루언서';

      const mine = all.filter(r => (r.fields['XHS_ID_'] || []).includes(inflRecId)).sort(bySort);
      const myStore = mine.filter(r => (r.fields['매장코드'] || []).includes(storeId));

      if (myStore.length === 0) {
        // 다른 지점을 스캔한 경우 — 오늘의 실제 예약 지점을 알려줘 현장에서 바로 교정한다
        const otherToday = mine.slice(0, 3).map(r => ({
          store: one(r.fields['매장명_검색용']),
          when: fmtKst(r.fields['예약일시']),
        }));
        return res.status(409).json({
          error: '오늘 이 매장의 예약을 찾을 수 없습니다. 담당자에게 문의하세요.',
          noMatch: 1,
          otherToday,
          // 어느 매장 QR을 찍었는지 화면에 보여줘 현장 판별을 돕는다
          scanStore: atStore.length ? one(atStore[0].fields['매장명_검색용']) : '',
        });
      }

      targetResv = myStore.find(r => !r.fields['체크인일시']);
      if (!targetResv) {
        return res.status(200).json(alreadyPayload(myStore[myStore.length - 1], xhsId));
      }
    }

    const nowIso = new Date().toISOString();
    const patchFields = { '체크인일시': nowIso };
    const currentStatus = one(targetResv.fields['진행상태']);
    const upgradeStatus = ['예약요청', '예약확정', '긴급예약', '변경확정'].includes(currentStatus);
    if (upgradeStatus) {
      patchFields['진행상태'] = '촬영완료';
    }

    await at(`/${encodeURIComponent(T_PROGRESS)}/${targetResv.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: patchFields, typecast: false })
    });

    const teamKey = one(targetResv.fields['팀명생성기']);
    const storeName = one(targetResv.fields['매장명_검색용']);

    if (teamKey) {
      const parents = await fetchAll(T_ENTRY, {
        formula: `{팀명생성기}='${escFormula(teamKey)}'`,
        fields: ['체크인내용', '체크인일시']
      });

      if (parents.length > 0) {
        const parent = parents[0];
        const oldContent = one(parent.fields['체크인내용']);
        // 날짜 포함 표기 (Owner 요청) — 카톡 알림·기록에서 언제 건인지 바로 보이게
        const stamp = `${xhsId} ${fmtKst(nowIso)}`;
        const newContent = oldContent ? `${oldContent}\n${stamp}` : stamp;
        const parentPatch = {
          '체크인내용': newContent,
          '체크인알림대기': true
        };
        if (!parent.fields['체크인일시']) {
          parentPatch['체크인일시'] = nowIso;
        }

        await at(`/${encodeURIComponent(T_ENTRY)}/${parent.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: parentPatch, typecast: false })
        });
      }
    }

    return res.status(200).json({
      ok: 1, store: storeName, xid: xhsId, when: fmtKst(nowIso), // 날짜 포함
      resvWhen: fmtKst(targetResv.fields['예약일시']),
      pax: targetResv.fields['총인원'] ?? '',
    });
  } catch (e) {
    console.error(e);
    return res.status(e.status || 500).json({ error: e.message || '체크인 처리 중 오류가 발생했습니다.' });
  }
}
