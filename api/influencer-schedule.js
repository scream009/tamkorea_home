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

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appEzEPLBz4t30wmt';

// ★ 에어테이블 테이블/필드명 - 실제 필드명으로 수정 필요
const SCHEDULE_TABLE  = '진행_DB_OLD';   // 스케줄 테이블명
const INFL_ID_FIELD   = 'INFL_ID';          // 인플루언서 ID 필드명 (텍스트 or Linked Record)
const INFL_NAME_FIELD = 'XHS_ID';            // 인플 닉네임(또는 Lookup된 이름 필드)
const CLIENT_FIELD    = '고객명';           // 고객사 필드명
const ZH_CLIENT_FIELD = '중문명';           // 중문 고객사명 (CS_DB에서 Lookup, 에어테이블 추가 필요)
const GUIDE_FIELD     = '촬영 가이드';       // CS_DB에서 Lookup된 촬영가이드 URL 필드명
const DATE_FIELD      = 'Date Rollup';        // 촬영일자 필드명
const DEADLINE_FIELD  = '제출마감일';        // ▲ 서트 기준 마감일 필드 (에어테이블 추가 필요)
const RESULT_FIELD    = 'XHS_Result';       // 결과물 제출 링크 필드명 (기존 XHS_Result 사용)
const STATUS_FIELD    = '제출상태';         // 제출상태 필드명 (새로 추가한 필드)

const INF_TABLE       = 'INFL_DB';          // 인플루언서 마스터 테이블
const INF_TOKEN_FIELD = 'Submit_Token';     // URL 파라미터용 보안 토큰 (생성 방식: "submit_" & LEFT(RECORD_ID(), 12))

// ─── 마감일 포맷 헬퍼 ─────────────────────────────────────────────
function formatDeadline(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const month = d.getMonth() + 1;
    const day   = d.getDate();
    const days  = ['일', '월', '화', '수', '목', '금', '토'];
    return `${month}/${day} (${days[d.getDay()]})`;
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
        const fieldList = [CLIENT_FIELD, ZH_CLIENT_FIELD, INFL_NAME_FIELD, GUIDE_FIELD, DATE_FIELD, DEADLINE_FIELD, RESULT_FIELD, STATUS_FIELD]
          .map(f => `fields[]=${encodeURIComponent(f)}`)
          .join('&');
        const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(SCHEDULE_TABLE)}?filterByFormula=${filter}&${fieldList}&sort[0][field]=${encodeURIComponent(DATE_FIELD)}&sort[0][direction]=asc`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
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

      // 닉네임 및 마감일 추출 (1번째 레코드 기준, 만약 INFL_DB에서 가져온 이름이 없다면)
      const firstFields = rawRecords[0].fields;
      const inflName = resolvedInflName || firstFields[INFL_NAME_FIELD] || '';
      const deadlineRaw = firstFields[DEADLINE_FIELD] || '';
      const deadline = deadlineRaw ? formatDeadline(deadlineRaw) : '';

      // 클라이언트에 필요한 데이터만 정제하여 반환
      const records = rawRecords.map(rec => ({
        id:         rec.id,
        client:     rec.fields[ZH_CLIENT_FIELD] || rec.fields[CLIENT_FIELD] || '',
        guide:      rec.fields[GUIDE_FIELD]   || '',
        date:       rec.fields[DATE_FIELD]    || '',
        resultLink: rec.fields[RESULT_FIELD]  || '',
        status:     rec.fields[STATUS_FIELD]  || '대기 중',
      }));

      return res.status(200).json({ records, inflId: resolvedInflId, inflName, deadline, token });

    } catch (err) {
      console.error('Server error (GET):', err);
      // 클라이언트에게 명확한 에러 메시지 전달
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }

  // ─── PATCH: 결과물 링크 업데이트 ─────────────────────────────────
  if (req.method === 'PATCH') {
    const { recordId, resultLink } = req.body;

    if (!recordId || !resultLink) {
      return res.status(400).json({ error: 'recordId and resultLink are required' });
    }

    try {
      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(SCHEDULE_TABLE)}/${recordId}`;

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            [RESULT_FIELD]: resultLink,
            [STATUS_FIELD]: '제출완료',
          },
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
