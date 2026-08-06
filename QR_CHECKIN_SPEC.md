# QR 체크인 시스템 — 구현 스펙 v1

*설계: Claude Fable 5 (2026-08-06) · 구현: Opus 5 · 교차검토: AG(Antigravity)*
*전제 지식: `STAFF_WEB_HANDOVER.md` (특히 §4 예약봇 계약·§8 TRAPS) 필독*

## 0. 목적·핵심 결정

인플이 매장 QR을 찍으면 → 체크인이 DB에 기록되고 개별 예약이 촬영완료로 전환되며
→ (2단계) 예약봇이 해당 카톡방에 입장 확인 메시지를 보낸다.

| 결정 | 내용 | 근거 |
|---|---|---|
| D1 | **QR 이미지는 DB에 저장하지 않는다** | QR = `storeId + HMAC 서명`에서 결정적 생성. 화면에서 그때그때 렌더. 저장하면 관리·유출면만 늘어남 |
| D2 | QR 내용물은 **URL** (`https://tamkorea.com/checkin?s=<storeId>&t=<sig>`) | 제출 페이지 스캐너는 URL에서 s·t만 파싱. 인플이 실수로 기본 카메라로 찍어도 안내 페이지가 떠서 유도 가능 (이중 안전망) |
| D3 | 스캔은 **사진 촬영(input capture) + jsQR 디코드**가 기본 | 위챗 내장 브라우저에서 getUserMedia(실시간 스트림)가 불안정 — 중국 인플의 주 환경. BarcodeDetector 지원 시 우선 사용, 폴백 jsQR |
| D4 | 체크인은 **개별 인플 단위** (팀 캐스케이드 아님) | 팀 3명 중 1명만 도착할 수 있다. 진행_DB_OLD 그 사람 건만 PATCH |
| D5 | 체크인 시 진행상태 → `촬영완료` (이미 상위 상태면 상태는 유지, 체크인일시만 기록) | 옵션 기존 존재. 예약확정→촬영완료 수동 전환이 자동화됨. 부산물: 체크인 없는 건 = 노쇼 후보 |
| D6 | 봇 알림은 **2단계 분리** | 1단계는 봇 무수정 (알림대기만 쌓임) — 카톡 발송 리스크 0으로 먼저 가동 |
| D7 | 인플 신원 = 기존 `Submit_Token` 재사용 | `"submit_" + LEFT(RECORD_ID(),12)` formula (influencer-schedule.js L35 실측). 서명 없는 토큰이지만 매장 서명(t)과 조합돼야 체크인이 성립하므로 수용 |

**감수하는 한계**: QR 사진을 원격 전달받아 찍는 부정은 웹 기술로 원천 차단 불가
(GPS는 위챗 권한 문제로 신뢰 불가). 영상 결과물 사후 검증으로 감수 — Owner 승인 (2026-08-06).

---

## 1. 사전 준비 (사람 작업 — Owner/Opus 지시로)

### Airtable 필드 신설 (API로 필드 생성 불가 — 수동)

| 테이블 | 필드 | 타입 | 비고 |
|---|---|---|---|
| 진행_DB_OLD | `체크인일시` | Date+Time | ⚠️ 필드별 타임존 토글 ON + Asia/Seoul (타임존 표준 룰) |
| 예약입력_DB | `체크인일시` | Date+Time | 〃 (팀 첫 체크인 시각) |
| 예약입력_DB | `체크인내용` | Long text | 서버가 "XHS_ID hh:mm" 줄 단위 append, 봇이 발송 후 비움 |
| 예약입력_DB | `체크인알림대기` | Checkbox | 봇 폴링 트리거 (자동발송체크와 **별개** — 기존 발송 흐름과 절대 혼용 금지) |

### Vercel 환경변수

- `QR_CHECKIN_SECRET` = 무작위 32자+ (신규 생성). 개별 변수라 저장 이슈 없음. 등록 후 Redeploy

---

## 2. 서명·토큰 규격

```js
sig = HMAC_SHA256(storeId, QR_CHECKIN_SECRET).hex().slice(0, 24)
qrUrl = `https://tamkorea.com/checkin?s=${storeId}&t=${sig}`
```

- 검증: `timingSafeEqual(재계산 sig, 제시된 t)` — `_admin-auth.js` safeEqual 재사용
- 고정 토큰(인쇄물)이라 만료 없음. 유출 의심 시 시크릿 교체 = 전 매장 QR 재발급 (절차를 운영 문서에 명시할 것)

---

## 3. 신규 API — `api/checkin.js`

게이트 없음(공개) — 신원은 body 토큰 2종으로 검증. **CORS 헤더 두지 말 것** (같은 오리진).
`at()` 헬퍼는 staff-queue.js의 429 백오프 버전을 복사.

### POST `{ inflToken, storeId, sig }`

1. **매장 검증**: sig ≠ HMAC(storeId) → 404 `{error:'Not found'}` (존재 은폐)
2. **인플 검증**: INFL_DB에서 `{Submit_Token}='<inflToken>'` 조회 (escFormula 필수) → 없으면 404
3. **예약 매칭**: 진행_DB_OLD에서
   - `XHS_ID_` links contains 인플recId **AND** `매장코드` links contains storeId
   - `예약일시` ∈ [오늘-1일 00:00, 오늘+1일 23:59] KST (자정 넘김·조기 도착 대비)
   - 진행상태 not in 취소·노쇼
   - 링크 필드는 formula로 못 거르므로: 날짜 범위 formula(`IS_AFTER/IS_BEFORE` + `DATETIME_PARSE`, staff-resv 중복가드 패턴 복사)로 좁힌 뒤 **코드에서 링크 비교**
4. 분기:
   - **0건** → 409 `{error:'오늘 이 매장의 예약을 찾을 수 없습니다. 담당자에게 문의하세요.', noMatch:1}`
   - **체크인일시 이미 존재** → 200 `{ok:1, already:1, when:<기존시각>}` (멱등)
   - **매칭** → 아래 5·6 수행
5. **개별 건 PATCH** (진행_DB_OLD): `체크인일시 = now(ISO)` + 진행상태가 `예약요청·예약확정·긴급예약·변경확정`일 때만 `진행상태='촬영완료'` (업로드완료·송부완료 등 상위 상태면 상태 유지)
6. **팀 부모 기록** (예약입력_DB): `팀명생성기` exact 매칭(escFormula)으로 부모 찾아
   - `체크인내용` += `"\n{XHS_ID} {HH:mm}"` (기존 값 이어붙임)
   - `체크인알림대기 = true` / `체크인일시` 비어 있으면 now
7. 응답: `{ok:1, store:'매장명', xid, when:'HH:mm'}`

**함정 주의**: 팀명생성기·escFormula·필드명 공백·rate limit — HANDOVER §8 그대로 적용.

---

## 4. 인플 제출 페이지 (`/submit`, InfluencerSubmitPage) 확장

- 스케줄 카드마다(또는 페이지 상단에) **「📷 입장 체크인」** 버튼
- 클릭 → `<input type="file" accept="image/*" capture="environment">` 트리거 → 사진 선택/촬영
- 디코드: `BarcodeDetector`('qr_code') 지원 시 우선, 폴백 **jsQR** (`npm i jsqr`, 번들 포함 — CSP 무관)
  이미지를 canvas에 리사이즈(최대 1280px)해서 디코드 — 원본 대형 사진은 느림
- 디코드 결과 URL에서 `s`·`t` 파싱 → `POST /api/checkin {inflToken(현재 페이지 토큰), storeId:s, sig:t}`
- UI 상태: 성공 `✅ [매장명] 입장 확인 14:32` / already `이미 체크인됨 (14:10)` / noMatch 안내 / 디코드 실패 `QR이 인식되지 않았습니다 — 화면을 채워 다시 찍어주세요`
- 문구는 **중국어 병기** (제출 페이지 기존 톤 확인 후 맞출 것 — 인플은 중국어 사용자)

## 5. `/checkin` 안내 라우트 (기본 카메라로 찍은 경우의 안전망)

- 신규 얇은 페이지: "체크인은 전달받은 제출 링크에서 해주세요 / 请通过收到的提交链接签到"
- 링크 소지자만 체크인 가능하므로 여기서 직접 체크인은 제공하지 않음 (신원 없음)
- App.jsx 라우트 + client.html 경로군에 추가 여부는 불필요 (브랜드 노출 무해)

## 6. QR 표시 2곳

### (a) 고객 달력뷰 (/schedule — ClientSchedulePage) 상단
- `client-schedule.js`가 campaignId → 업체명 링크(storeId) → `qrUrl` 계산해 응답에 추가
- 클라: 작은 QR 카드(합의된 위치: 달력 위) — **클릭 시 풀스크린 확대 모달** (스캔 거리 대비 화면 꽉 차게, 흰 배경 + quiet zone 필수)
- QR 렌더: `npm i qrcode` — canvas 렌더, 외부 요청 없음
- 매장(고객사 사장)이 태블릿·폰으로 띄워놓고 인플에게 보여주는 시나리오 — 인쇄 배포 전에도 즉시 가동

### (b) 어드민 고객사 등록 (/admin/stores)
- 선택 매장 정보 탭에 「QR 다운로드」 버튼 → canvas → PNG 다운로드 (파일명 `QR_{고객사}_{지점}.png`)
- 카드형 인쇄물 제작·배포는 운영 몫 (나중에 카드 템플릿 요청 오면 별도)
- 서버: admin-stores GET 응답에 storeId별 sig 포함 (관리자 게이트 뒤라 안전)

## 7. 담당자 화면 반영 (가시화)

- 진도 보드 세부리스트·발송 큐 상세에 체크인 표시: `체크인 14:32` 칩 (진행_DB_OLD `체크인일시` 읽기만 추가 — staff-board PROGRESS_FIELDS에 필드 1개 추가)
- 지연·노쇼 감지 확장은 후속 (체크인 없음 + 방문시각 경과 = 노쇼 후보 필터)

---

## 8. 2단계 — 예약봇 V8 (별도 착수, 통제 테스트 필수)

- config 추가: `checkin_trigger_field='체크인알림대기'`, `checkin_content_field='체크인내용'`, `checkin_template`
- 폴링 루프에서 체크인알림대기 checked 수집 → **즉시 해제(중복 방지, L1975 패턴)** → 톡방 열기 → 발송:
  ```
  ✅ 입장 확인
  {체크인내용}
  — {매장명}
  ```
  → 발송 성공 시 `체크인내용` 비움. 실패 시 재시도 3회 + 관리자 통보 (V7.2 패턴 그대로)
- **상태 변경·캐스케이드 없음** — 서버(checkin API)가 이미 처리. 봇은 발송만
- 기존 자동발송체크 흐름과 완전 분리. V7과 V8 동시 실행 금지 (V8 = V7 + 체크인 패스)
- 1단계 배포 후 봇 없이도 체크인·상태전환은 정상 동작, 알림대기만 쌓임 → V8 가동 시 소급 발송되지 않게 **가동 직전 기존 알림대기 일괄 해제** 절차 포함

---

## 9. 구현 순서 (Opus 5 체크리스트)

1. [ ] Airtable 필드 4개 (§1 표 — Owner에게 생성 요청 후 필드명 실측 확인)
2. [ ] `QR_CHECKIN_SECRET` env + Redeploy
3. [ ] `api/checkin.js` (§3) + dev-api.js ROUTES 추가
4. [ ] `npm i jsqr qrcode`
5. [ ] /submit 체크인 UI (§4) — **위챗 실기기 테스트 항목으로 표기**
6. [ ] /checkin 안내 라우트 (§5)
7. [ ] /schedule QR 카드 + 확대 모달 (§6a)
8. [ ] /admin/stores QR 다운로드 (§6b)
9. [ ] staff-board 체크인 칩 (§7)
10. [ ] lint 0건 + 빌드 + 로컬 스모크 (체크인 검증 경로: sig 불일치 404 / 토큰 불일치 404 / noMatch 409 — **실제 체크인 생성은 통제 1건만**)
11. [ ] HANDOVER·TRAPS 갱신 (QR 시크릿 교체 절차 포함)
12. [ ] (2단계) 봇 V8 (§8) — 통제 테스트: 테스트 톡방으로 1건

## 10. 통제 테스트 시나리오 (1단계)

1. 테스트 매장 QR 생성 (/admin/stores) → 본인 폰 위챗으로 /submit 열기 (실제 인플 토큰 1개 차용)
2. 오늘 날짜 테스트 예약 1건 생성 (예약폼 — 발송 안 함) → QR 촬영 체크인
3. 확인: 진행_DB_OLD 체크인일시·촬영완료 / 예약입력_DB 체크인내용·알림대기 / 재스캔 시 already / 보드 칩 표시
4. 뒷정리: 테스트 예약 삭제 (발송 전이므로 큐 삭제 → 자식 동반 정리)

## 11. AG 교차검토 요청 포인트

- §3 매칭 규칙의 엣지 (같은 날 같은 매장 2건 예약된 인플 — 현재 스펙은 첫 건 매칭. 충분한가?)
- 체크인내용 append의 동시성 (두 인플이 같은 초에 스캔 — read-modify-write race. 실무 빈도 낮아 수용했는데 이견 있으면 제시)
- /checkin 공개 엔드포인트의 남용 면 (rate limit 없음 — Vercel 기본 방어에 의존)
