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
    const code = String(body.code || '').replace(/\D/g, ''); // 일별 회전 코드 (QR 백업)
    const wantList = body.list ? 1 : 0; // 오늘 예약 목록 조회 (모달 표시용 — 체크인 권한 아님)

    // 도착 증명은 필수다 (v1.4 — Owner 판정: 탭만으로 체크인되면 확인 수단이 없다).
    // 체크인 성립 = QR 서명(sig) 또는 매장 게시 일별 코드(code). 자가 탭 경로는 없다.
    if (!inflToken || (!wantList && !sig && !code)) {
      return res.status(400).json({ error: '누락된 파라미터가 있습니다.' });
    }

    if (!wantList) {
      if (!process.env.QR_CHECKIN_SECRET) {
        return res.status(500).json({ error: '서버 설정 오류 (Secret 누락)' });
      }
      const codeOk = (id) => code.length === 6
        && (code === storeCodeDaily(id, 0) || code === storeCodeDaily(id, -1)); // 오늘 + 어제 유예
      if (storeId && sig) {
        // 경로 1: QR 스캔 — /checkin?s=&t= 에서 넘어온 서명 검증
        if (!timingSafeEqual(storeSig(storeId), sig)) {
          return res.status(404).json({ error: 'Not found' });
        }
      } else if (storeId && code) {
        // 경로 2: 예약 탭 + 매장 게시 코드 입력 — 그 매장의 오늘/어제 코드만 인정
        if (!codeOk(storeId)) {
          return res.status(404).json({ error: '签到码不正确。请确认店内今日码 / 코드가 맞지 않습니다. 매장의 오늘 코드를 확인하세요.' });
        }
      } else {
        // 경로 3: 코드만 — 전 매장 역조회 (예약 목록이 안 뜨는 예외 상황용)
        if (code.length !== 6) {
          return res.status(400).json({ error: '签到码为6位数字 / 체크인 코드는 6자리 숫자입니다.' });
        }
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
    }

    // ⚠️ 필드명 함정: INFL_DB 는 `XHS_ID(필수)` — 접미까지가 실명 (2026-08-06 메타 실측.
    // 'XHS_ID' 로 요청하면 Airtable 422 로 모든 체크인이 죽는다)
    const inflRecs = await fetchAll(T_INFL, {
      formula: `{Submit_Token}='${escFormula(inflToken)}'`,
      fields: ['XHS_ID(필수)']
    });
    if (!inflRecs.length) {
      return res.status(404).json({ error: '인플루언서 토큰을 찾을 수 없습니다.' });
    }
    const inflRecId = inflRecs[0].id;
    const xhsId = one(inflRecs[0].fields['XHS_ID(필수)']) || '인플루언서';

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

    let resvs = await fetchAll(T_PROGRESS, {
      formula,
      // '고객사+지점명' 필드는 진행_DB_OLD 에 없다 — 매장 표기는 `매장명_검색용` (제출 페이지와 동일)
      fields: ['예약일시', '진행상태', 'XHS_ID_', '매장코드', '팀명생성기', '체크인일시', '매장명_검색용']
    });

    resvs = resvs.filter(r => (r.fields['XHS_ID_'] || []).includes(inflRecId));

    if (wantList) {
      // 자가 체크인 1단계 — 오늘(±1일) 이 인플의 예약 목록. 인플은 여기서 도착한 매장을 탭한다.
      const items = resvs
        .filter(r => (r.fields['매장코드'] || []).length) // 매장 링크 없는 건은 특정 불가
        .sort((a, b) => new Date(a.fields['예약일시'] || 0) - new Date(b.fields['예약일시'] || 0))
        .map(r => {
          const d = new Date(new Date(r.fields['예약일시']).getTime() + 9 * 3600 * 1000);
          const when = `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
          return {
            storeId: (r.fields['매장코드'] || [])[0],
            store: one(r.fields['매장명_검색용']),
            when,
            checked: r.fields['체크인일시'] ? 1 : 0,
          };
        });
      return res.status(200).json({ ok: 1, items });
    }

    resvs = resvs.filter(r => (r.fields['매장코드'] || []).includes(storeId));

    if (resvs.length === 0) {
      return res.status(409).json({ error: '오늘 이 매장의 예약을 찾을 수 없습니다. 담당자에게 문의하세요.', noMatch: 1 });
    }

    resvs.sort((a, b) => {
      const timeA = new Date(a.fields['예약일시'] || 0).getTime();
      const timeB = new Date(b.fields['예약일시'] || 0).getTime();
      return timeA - timeB;
    });
    
    let targetResv = resvs.find(r => !r.fields['체크인일시']);

    if (!targetResv) {
      const lastCheckedIn = resvs[resvs.length - 1];
      const kstTime = new Date(new Date(lastCheckedIn.fields['체크인일시']).getTime() + 9 * 3600 * 1000);
      const hhmm = `${String(kstTime.getUTCHours()).padStart(2, '0')}:${String(kstTime.getUTCMinutes()).padStart(2, '0')}`;
      return res.status(200).json({ ok: 1, already: 1, when: hhmm, store: one(lastCheckedIn.fields['매장명_검색용']) });
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
    const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
    const nowHhmm = `${String(kstNow.getUTCHours()).padStart(2, '0')}:${String(kstNow.getUTCMinutes()).padStart(2, '0')}`;
    const storeName = one(targetResv.fields['매장명_검색용']);

    if (teamKey) {
      const parents = await fetchAll(T_ENTRY, {
        formula: `{팀명생성기}='${escFormula(teamKey)}'`,
        fields: ['체크인내용', '체크인일시']
      });

      if (parents.length > 0) {
        const parent = parents[0];
        const oldContent = one(parent.fields['체크인내용']);
        const newContent = oldContent ? `${oldContent}\n${xhsId} ${nowHhmm}` : `${xhsId} ${nowHhmm}`;
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

    return res.status(200).json({ ok: 1, store: storeName, xid: xhsId, when: nowHhmm });
  } catch (e) {
    console.error(e);
    return res.status(e.status || 500).json({ error: e.message || '체크인 처리 중 오류가 발생했습니다.' });
  }
}
