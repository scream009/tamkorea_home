/* eslint-env node */
/**
 * Gravity | Influencer Schedule API
 * Vercel Serverless Function
 *
 * GET  /api/influencer-schedule?inflId=I260419780
 *   → 해당 인플루언서의 담당 고객사 리스트 반환
 *
 * PATCH /api/influencer-schedule
 *   → { recordId, resultLink } 로 결과물 링크 업데이트
 */

const AIRTABLE_API_KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa'; // 기존 고객문의(AIRTABLE_BASE_ID)와 분리

// ★ 에어테이블 테이블/필드명 - 실제 필드명으로 수정 필요
const SCHEDULE_TABLE  = '진행_DB_OLD';   // 스케줄 테이블명
const INFL_ID_FIELD   = 'INFL_ID';          // 인플루언서 ID 필드명 (텍스트 or Linked Record)
const INFL_NAME_FIELD = 'XHS_ID(필수)';        // INFL_DB의 닉네임 필드
const SCHEDULE_INFL_NAME_FIELD = 'XHS_ID_';        // 진행_DB_OLD의 닉네임 필드
const CLIENT_FIELD    = '매장명_검색용';       // 고객사 필드명 (CS_DB에서 Lookup 필수)
const ZH_CLIENT_FIELD = '중문명';           // 중문 고객사명 (CS_DB에서 Lookup 필수)

/* ── 모집사이트(IB_Casting) 카드 연결 ─────────────────────────────
 * 촬영 기준의 정본은 모집사이트 카드다 (Owner 확정 2026-08-13).
 * 카드가 있는 매장은 CS_DB 옛 가이드 대신 카드 상세로 보낸다 — 정본이 두 곳이면
 * 반드시 불일치가 난다. 카드가 없는 매장(기존 운영분)만 옛 가이드를 유지한다.
 * IB 조회가 실패해도 스케줄은 살아야 하므로 빈 맵으로 넘어간다. */
const IB_KEY = process.env.IB_CASTING_TOKEN || process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const IB_BASE = process.env.IB_CASTING_BASE_ID || 'appDYOCw29mohYrIG';
const CARD_ORIGIN = 'https://campaign.tamkorea.com';
const ROUND_PRIORITY = { uploading: 0, recruiting: 1, closed: 2, completed: 3, hidden: 4 };

async function ibList(table, fields) {
  const rows = [];
  let offset = '';
  do {
    const qs = new URLSearchParams({ pageSize: '100' });
    (fields || []).forEach((f) => qs.append('fields[]', f));
    if (offset) qs.set('offset', offset);
    const resp = await fetch(`https://api.airtable.com/v0/${IB_BASE}/${encodeURIComponent(table)}?${qs}`, {
      headers: { Authorization: `Bearer ${IB_KEY}` },
    });
    if (!resp.ok) return rows;
    const d = await resp.json();
    rows.push(...(d.records || []));
    offset = d.offset || '';
  } while (offset);
  return rows;
}

const lines = (v) => String(v || '').split('\n').map((x) => x.trim()).filter(Boolean);

async function fetchCardMap() {
  try {
    const [camps, tasks] = await Promise.all([
      ibList('Campaigns', ['slug', 'client', 'display_status', 'recruit_start',
        'provisions_zh', 'provision_notes_zh', 'cautions_zh', 'visit_hours_zh', 'subway_zh', 'dzdp_url', 'naver_place_url']),
      ibList('Platform_Tasks', ['task_id', 'platform', 'photo_count_min', 'photo_count_max',
        'photo_required_shots_zh', 'hashtag_required_zh', 'hashtag_optional_zh',
        'content_must_include_zh', 'content_word_min']),
    ]);

    // slug → 미션 목록
    const taskBySlug = {};
    tasks.forEach((t) => {
      const f = t.fields || {};
      const m = /^(.*)-(xhs|dzdp|weibo)$/.exec(String(f.task_id || ''));
      if (!m) return;
      (taskBySlug[m[1]] = taskBySlug[m[1]] || []).push({
        platform: f.platform || m[2],
        photoMin: f.photo_count_min || 0,
        photoMax: f.photo_count_max || 0,
        shots: lines(f.photo_required_shots_zh),
        hashtags: String(f.hashtag_required_zh || ''),
        hashtagsOpt: String(f.hashtag_optional_zh || ''),
        must: lines(f.content_must_include_zh),
        wordMin: f.content_word_min || 0,
      });
    });

    // 고객사명 → 대표 라운드 (방문·업로드 중 > 모집 중 > 마감 순, 같은 급이면 최신)
    const best = {};
    camps.forEach((r) => {
      const f = r.fields || {};
      if (!f.slug || !f.client) return;
      const cur = best[f.client];
      const pri = ROUND_PRIORITY[f.display_status] ?? 9;
      if (!cur || pri < cur.pri
        || (pri === cur.pri && String(f.recruit_start || '') > String(cur.start || ''))) {
        best[f.client] = { f, pri, start: f.recruit_start };
      }
    });

    const map = {};
    Object.keys(best).forEach((client) => {
      const f = best[client].f;
      map[client] = {
        url: `${CARD_ORIGIN}/campaign/${f.slug}`,
        provisions: lines(f.provisions_zh),
        notes: lines(f.provision_notes_zh),
        cautions: lines(f.cautions_zh),
        hours: f.visit_hours_zh || '',
        subway: f.subway_zh || '',
        dzdpUrl: f.dzdp_url || '',
        naverUrl: f.naver_place_url || '',
        tasks: taskBySlug[f.slug] || [],
      };
    });
    return map;
  } catch {
    return {};
  }
}

function findCardUrl(cardMap, clientKr) {
  if (!clientKr) return null;
  const hit = Object.keys(cardMap).find((c) => clientKr.includes(c));
  return hit ? cardMap[hit] : null;
}
const GUIDE_FIELD     = '拍摄剧本';       // 가이드 링크 (CS_DB에서 Lookup 필수)
const DATE_FIELD      = '예약일시';        // 촬영일자 필드명
const DEADLINE_FIELD  = '제출마감일';        // 제출마감일 필드
const RESULT_FIELD    = 'XHS_Result';       // 결과물 제출 링크 (XHS)
const DP_RESULT_FIELD = 'DP_Result';        // 결과물 제출 링크 (DP)
const DY_RESULT_FIELD = 'DY_Result';        // 결과물 제출 링크 (DY 및 기타)
const STATUS_FIELD    = '제출상태';         // 제출상태 필드명
const PROG_STATUS_FIELD = '진행상태';       // 진행상태 (취소, 변경확정 등 확인용)
const CHANGE_DATE_FIELD = '변경일시';       // 예약 변경 시의 일시
const TYPE_FIELD        = '유형';           // 인플/체험단/기자단 유형 (마감일 일수 결정)

const INF_TABLE       = 'INFL_DB';          // 인플루언서 마스터 테이블
const INF_TOKEN_FIELD = 'Submit_Token';     // URL 파라미터용 보안 토큰 (생성 방식: "submit_" & LEFT(RECORD_ID(), 12))

// ─── 유형별 업로드 마감 일수 결정 ──────────────────────────────────────────
// 체험단(체험 계열) = 촬영일 +5일 / 인플·기자단 = 촬영일 +14일(2주)
function deadlineDaysForType(type) {
  const t = (type || '').trim();
  if (t === '체험' || t === '체험단' || t === '기자→체험') return 5;
  return 14; // 인플·인플루언서·체험→인플·기자→인플·기자단 등은 2주
}

// ─── 마감일 포맷 헬퍼 (촬영일 기준 + 유형별 일수 자동 계산) ──────────────────
function formatDeadline(dateStr, days = 14) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    d.setDate(d.getDate() + days); // 유형별 마감 일수 추가
    const month = d.getMonth() + 1;
    const day   = d.getDate();
    return `${month}/${day}`; // 요일 제거
  } catch {
    return dateStr;
  }
}

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!AIRTABLE_API_KEY) {
    return res.status(500).json({ error: 'Airtable API key not configured' });
  }

  // ─── GET: 인플루언서 스케줄 조회 ─────────────────────────────────
  if (req.method === 'GET') {
    const token = req.query.token || req.query.inflId; // token 우선, 하위호환 inflId

    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    try {
      let resolvedInflId = token;
      let resolvedInflName = '';

      // 토큰인 경우 INFL_DB에서 INFL_ID(원래 식별자)를 조회
      if (token.startsWith('submit_')) {
        const infFilter = encodeURIComponent(`{${INF_TOKEN_FIELD}} = "${token}"`);
        const infUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(INF_TABLE)}?filterByFormula=${infFilter}&fields[]=${encodeURIComponent(INFL_ID_FIELD)}&fields[]=${encodeURIComponent(INFL_NAME_FIELD)}`;
        const infResp = await fetch(infUrl, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
        const infJson = await infResp.json();
        if (!infResp.ok) {
          console.error('INFL_DB Error:', infJson);
          throw new Error(`INFL_DB 연동 오류: ${infJson.error?.message || '알 수 없는 에러'}`);
        }
        if (infJson.records && infJson.records.length > 0) {
          resolvedInflId = infJson.records[0].fields[INFL_ID_FIELD];
          resolvedInflName = infJson.records[0].fields[INFL_NAME_FIELD] || '';
        } else {
          return res.status(200).json({ records: [], token });
        }
      }

      const fetchSchedule = async (formula) => {
        const filter    = encodeURIComponent(formula);
        const fieldList = [CLIENT_FIELD, ZH_CLIENT_FIELD, SCHEDULE_INFL_NAME_FIELD, GUIDE_FIELD, DATE_FIELD, DEADLINE_FIELD, RESULT_FIELD, DP_RESULT_FIELD, DY_RESULT_FIELD, STATUS_FIELD, PROG_STATUS_FIELD, CHANGE_DATE_FIELD, TYPE_FIELD]
          .map(f => `fields[]=${encodeURIComponent(f)}`)
          .join('&');
        const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(SCHEDULE_TABLE)}?filterByFormula=${filter}&${fieldList}&sort[0][field]=${encodeURIComponent(DATE_FIELD)}&sort[0][direction]=asc`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
        const json = await resp.json();
        if (!resp.ok) {
          console.error('SCHEDULE_TABLE Error:', json);
          throw new Error(`진행_DB_OLD 연동 오류: ${json.error?.message || '알 수 없는 에러'}`);
        }
        return json.records || [];
      };

      // 1선: 단순 텍스트 필드 필터
      let rawRecords = await fetchSchedule(`{${INFL_ID_FIELD}} = "${resolvedInflId}"`);

      // 2선: Linked Record인 경우 FIND 필터 폴백
      if (rawRecords.length === 0) {
        console.log('[fallback] Trying FIND filter for Linked Record INFL_ID');
        rawRecords = await fetchSchedule(`FIND("${resolvedInflId}", {${INFL_ID_FIELD}})`);
      }

      if (rawRecords.length === 0) {
        return res.status(200).json({ records: [], token });
      }

      // 닉네임 추출 (만약 INFL_DB에서 가져온 이름이 없다면)
      const firstFields = rawRecords[0].fields;
      const inflName = resolvedInflName || firstFields[SCHEDULE_INFL_NAME_FIELD] || '';

      // 클라이언트에 필요한 데이터만 정제하여 반환
      const cardMap = await fetchCardMap();
      const records = rawRecords.map(rec => {
        const progStatus = rec.fields[PROG_STATUS_FIELD] || '';
        
        // 취소되거나 노쇼인 건은 인플루언서 제출 리스트에서 제외 (null 반환 후 filter로 제거)
        if (progStatus.includes('취소') || progStatus.includes('노쇼')) {
          return null;
        }

        // 상태가 변경되었거나 변경일시가 있는 경우 변경일시를 최우선으로 사용
        let finalDate = rec.fields[DATE_FIELD] || '';
        if (rec.fields[CHANGE_DATE_FIELD] && (progStatus.includes('변경') || true)) {
          finalDate = rec.fields[CHANGE_DATE_FIELD];
        }

        return {
          id:         rec.id,
          client:     rec.fields[ZH_CLIENT_FIELD] || rec.fields[CLIENT_FIELD] || '',
          mission:    findCardUrl(cardMap, String(rec.fields[CLIENT_FIELD] || '')),
          guide:      rec.fields[GUIDE_FIELD]   || '',
          date:       finalDate,
          deadline:   finalDate ? formatDeadline(finalDate, deadlineDaysForType(rec.fields[TYPE_FIELD])) : '',
          resultLink: rec.fields[RESULT_FIELD]  || '',
          dpResultLink: rec.fields[DP_RESULT_FIELD] || '',
          dyResultLink: rec.fields[DY_RESULT_FIELD] || '',
          status:     rec.fields[STATUS_FIELD]  || '대기 중',
        };
      }).filter(r => r !== null);

      // 변경일시가 반영된 최종 날짜 기준으로 오름차순 재정렬
      records.sort((a, b) => {
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;
        return timeA - timeB;
      });

      return res.status(200).json({ records, inflId: resolvedInflId, inflName, token });

    } catch (err) {
      console.error('Server error (GET):', err);
      // 클라이언트에게 명확한 에러 메시지 전달
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }

  // ─── PATCH: 결과물 링크 업데이트 ─────────────────────────────────
  if (req.method === 'PATCH') {
    const { recordId, resultLink, dpResultLink, dyResultLink } = req.body;

    if (!recordId) {
      return res.status(400).json({ error: 'recordId is required' });
    }

    try {
      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(SCHEDULE_TABLE)}/${recordId}`;

      const updateFields = {};
      if (resultLink !== undefined) updateFields[RESULT_FIELD] = resultLink || null;
      if (dpResultLink !== undefined) updateFields[DP_RESULT_FIELD] = dpResultLink || null;
      if (dyResultLink !== undefined) updateFields[DY_RESULT_FIELD] = dyResultLink || null;

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: updateFields,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Airtable PATCH error:', data);
        return res.status(response.status).json({ error: data.error?.message || 'Airtable error' });
      }

      return res.status(200).json({ success: true, id: data.id });

    } catch (err) {
      console.error('Server error (PATCH):', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
