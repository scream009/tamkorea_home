# STAFF_WEB_HANDOVER — 담당자 웹 (Softr 대체) 설계·현황

*작성 2026-08-05 · Claude (Fable 5) · AG(Antigravity) 공동 검토용*
*실화면 캡처: [docs/staff_screens/](docs/staff_screens/) (로컬 dev, 실데이터)*

## 0. 한 줄 요약

Softr 실무 앱(8화면)을 tamkorea.com 자체 웹 3화면(`/staff` 보드 · `/staff/new` 예약입력 ·
`/staff/queue` 발송큐)으로 압축 이전 중. **쓰기는 Softr가 쓰던 테이블·필드를 그대로 쓰고,
Airtable 자동화·예약봇(TK_Resv_V7)과의 계약을 벗어나지 않는 것이 제1원칙.**

## 1. 화면 지도 — Softr → 웹

| Softr 화면 | 연결 테이블 | 웹 화면 | 상태 |
|---|---|---|---|
| ① 체험단 진행현황 | Campaign_DB | `/staff` 진도 보드 | ✅ (확인요망·전달사항 포함) |
| ② 담당자 업무조회 | 진행_DB_OLD | `/staff` 세부리스트(조회·메모) + `/staff/queue`(액션) | ✅ |
| ③ 신규예약 폼 | 예약입력_DB (create) | `/staff/new` | ✅ |
| ④ 신규인플 폼 | INFL_DB (create) | `/staff/new` 안 인라인 모달 | ✅ |
| ⑤ 인플 조회 | INFL_DB | 폼 검색선택으로 대체 (전용 페이지 미정) | 🟡 |
| ⑥ 예약 메시지 전송 | 예약입력_DB | `/staff/queue` 발송대기 탭 | ✅ |
| ⑦ 변경 메시지 전송 | 예약입력_DB | `/staff/queue` 변경요청·확정 탭 | ✅ |
| ⑧ 고객등록 (어드민) | CS_DB (create) | 미구현 — /admin 영역 예정 | ❌ |

레거시: `/manager`(recruiter-schedule.js)는 구세대 조회 화면 — `/staff`가 대체하면 정리 대상
(무인증 + CORS `*` 위반 청산 겸).

## 2. 업무 플로우 × 화면

```
[0] 계약      CS_DB 등록(⑧, 미구현) → Campaign_DB 목표 (/admin 관리화면)
[1] 섭외준비  /staff 보드 — 미달·지연 확인 (섭외지연·업로드지연·완료 필터)
[2] 인플등록  /staff/new 모달 → INFL_DB (중복 시 기존 수정/선택 분기)
[3] 예약입력  /staff/new → 예약입력_DB 1건(팀 단위)
                └ Airtable 자동화: 팀명생성기 키 생성 → Repeating Group 이
                  참여 인플(XHS_ID_) 수만큼 진행_DB_OLD 분할
[4] 발송      /staff/queue 전송 → 자동발송체크 ON → 예약봇 폴링 → 카톡 발송
                → 진행상태 예약확정 + 진행_DB_OLD 캐스케이드(팀명생성기 exact)
[5] 변경관리  /staff/queue 변경(변경일시 필수)·변경확정·취소/노쇼 — 전부 봇 경로
[6] 방문촬영  (봇 캐스케이드로 상태 관리; 화면 액션은 Phase 후속)
[7] 업로드    인플 /submit(인플전달링크) 제출 → 제출상태 완료
              /staff 세부리스트 — 지연(방문+7일 초과 미제출) 추적, 메모(비고) 편집
[8] 집계보고  rollup → Campaign_DB → /staff 보드 · 고객 공유(/schedule /report)
```

## 3. 파일 구성

| 경로 | 역할 |
|---|---|
| `api/_staff-auth.js` | 담당자 게이트. `STAFF_KEY`(공용)·`STAFF_KEYS`(개인 `HH:키,…`)·admin 키 상위호환. 404 은폐, fail-closed |
| `api/staff-check.js` | 키 검증 (게이트 UI용) |
| `api/staff-board.js` | 보드 GET(±1개월 Campaign+진행 조인, CS_DB ⓘ정보) + POST memo(비고만) |
| `api/staff-resv.js` | meta(매장 129·인플 966) · 매장가드(CS→Campaign 링크 조인) · create(예약입력_DB) · createInfl/updateInfl(INFL_DB) |
| `api/staff-queue.js` | 큐 GET(정산월 ±1개월) + send/unsend/modify/confirmChange/cancel/remove |
| `src/components/StaffGate.jsx` | 세션 게이트. `?k=` 파라미터 지원(Softr iframe 임베드용) — 검증 전 저장(StrictMode 안전) |
| `src/pages/StaffBoardPage.jsx` | 진도 보드 |
| `src/pages/StaffResvPage.jsx` | 예약입력 + 인플 모달 |
| `src/pages/StaffQueuePage.jsx` | 업무·발송 큐 |

## 4. Airtable 연결 상세

### 읽기/쓰기 범위

| 테이블 | 읽기 | 쓰기 |
|---|---|---|
| Campaign_DB | 목표·방문·업완·취소 rollup, 협력사, 추가체험단, 확인요망, 전달사항, 업체명 링크 | ❌ (목표수정은 /admin 전용) |
| CS_DB | 영업·브레이크·피크·정기휴무·방문가능·제공내역·섭외주의·비고·拍摄剧本 | ❌ (고객등록 화면 예정) |
| 진행_DB_OLD | 건 단위 상태·링크·인플·건수 등 22필드 | `비고`(메모) / 삭제(remove 시 자식만) |
| 예약입력_DB | 큐 목록 24필드 | create + 진행상태·자동발송체크·변경일시·변경인원·고객전달메모 |
| INFL_DB | XHS_ID·WC_ID·PAL | create / update(중복 수정 흐름) |

### 봇·자동화와의 계약 (절대 침범 금지선)

1. **신규 예약은 예약입력_DB에만 만든다.** 진행_DB_OLD 직접 생성 금지 — 분할 자동화·팀명생성기·봇 캐스케이드가 전부 그 경로에 붙어 있다.
2. **발송 트리거 = `자동발송체크`(checkbox).** 봇(TK_Resv_V7)이 폴링. 버튼→필드 명세는
   `03_Epic_Automation_RPA/TK_Resv_V7_App/README.md` "Softr 모달" 절이 원본.
3. **변경요청은 변경일시 없이 만들지 않는다** — 봇 Formula 차단(⚠)과 서버 400 이중 방어.
4. **팀명생성기**(`{매장명}_MMDD_{XHS_ID}`)가 예약입력_DB↔진행_DB_OLD 조인 키. 삭제 시 이 키로 자식 정리.

### 오입력 방지 장치

- **정산월 3중 가드**: ① 미달인 이른 달 기본값(권장 뱃지) ② 앞달 미달·목표초과 시 confirm ③ 서버가 매장×월 Campaign 존재 검증(409). Campaign 조회는 이름 매칭이 아니라 **CS_DB 링크 필드**(`Campaign_DB`+오타쌍둥이 `Campain_DB` 둘 다) 사용.
- **지연 판정**: 방문(예약일시) 후 **7일 초과** 미제출 (Owner 확정. `UPLOAD_GRACE_DAYS=7`).
- **숫자 기준**: 보드 목·섭·업·취 = Campaign_DB rollup(정산 기준). 담당자 선택 시 지연·대기만 건 목록 재계산 (rollup은 담당자 분리 불가).
- 보드 대상 = **체험단만** (인플·기자 제외, FB 버튼 제외 — FB는 인플 입력용 계정).
- 계약유형은 섭외 화면에서 안 본다 — 목표·실적 숫자 전부 0인 껍데기만 제외 (8월 95건 중 75건이 유형 공란이었고 그중 5건이 실적 보유).

## 5. 확정된 정책 결정 (Owner)

| # | 결정 |
|---|---|
| F1 | 취소·노쇼는 **봇 발송 경로(예약입력_DB) 하나로 통일**. 진행_DB_OLD 직접 수정 경로는 웹으로 옮기지 않음. 봇은 취소 안내를 DB에 안 남기므로 달력은 `api/_resv-message.js`로 복원 표시 |
| F2 | 정산월 이동 = **정산월+귀속 정산월 동시 쓰기** (admin-targets `moveSettlement` 방식). 링크 비우고 자동화 재실행에 맡기는 방식은 재실행 미보장이라 기각. 큐에 버튼 추가 예정 |
| F3 | 삭제 = **예약요청 & 미발송만** (발송 이력 없으니 무방). 분할된 진행_DB_OLD 자식도 팀명생성기 매칭으로 동반 삭제, 자식 중 진행 나간 건 있으면 거부 |
| F4 | Campaign_DB 확인요망·전달사항 = 관리자↔섭외자 소통 → 보드 🔔 칩 + ⓘ 카드 표시 |
| — | 영문이름(과거 잠수함 여권 요건)은 폼 하단 "특수 요청 항목" 접힘으로 보존 |
| — | 봇 처리중에 머무는 건 = 봇 미실행 신호 → 경고 문구 + "발송취소(대기로)" 제공 |

## 6. 인증

- 게이트: `x-staff-key` 헤더 (또는 `?k=` URL — Softr iframe 임베드용, 검증 후 주소창에서 제거)
- 키 위계: `STAFF_KEYS` 개인키 > `STAFF_KEY` 공용 > `ADMIN_KEY`/`CLIENTS_ADMIN_KEY`(관리자는 상위 호환)
- **현재 Vercel에 STAFF_KEY 미설정 → 관리자 키로 입장.** 담당자 배포 전 STAFF_KEY 추가 필요
- 방향: 개인키(키=신원, 감사 가능) → 인원 10명+ 시 Clerk 등 검토. 자체 비밀번호 구현은 안 함

## 7. 함정 (TRAPS)

- 필드명 공백: `입력 정산월` `귀속 정산월` `XHS_link1 (from WC_ID_)` — 붙여 쓰면 UNKNOWN_FIELD_NAME
- `정산월`·`계약월` singleSelect에 **2026. 8월까지만** 옵션 존재 — 9월 오면 Airtable에서 사람이 추가 (API 불가). 서버가 choice 오류를 사람 말로 번역함
- Airtable rate limit 5rps — 청크 80건×동시 4개 패턴 유지
- `비고`(진행_DB_OLD)는 richText — 마크다운 이스케이프(`2026\.`) 표시 시 벗겨야 함
- CS_DB 필수 필드명에 접미 붙음: `고객사명(필수)` `영업시간(필수)` 등
- StaffGate `?k=`는 **검증 전에 sessionStorage 저장** — StrictMode 이중 실행에서 1회차가 URL을 지우면 2회차가 빈손이 되는 버그 있었음(수정됨)
- 예약입력_DB 쓰기는 **실탄** — 자동화 분할 + 봇 카톡이 실제로 나간다. 테스트는 통제된 1건으로

## 8. 남은 것 / 검증 체크리스트

- [ ] **통제 실전 테스트**: 예약 1건 생성 → 예약입력_DB·분할·귀속 확인 → 큐 전송 → 봇 발송 → 캐스케이드 확인 → (필요시 삭제 흐름 검증)
- [ ] Vercel `STAFF_KEY` (+개인 `STAFF_KEYS`) 설정 → 담당자 배포
- [ ] 큐에 정산월 이동 버튼 (F2 로직)
- [ ] 인플 조회 전용 페이지 여부 결정 (현재 폼 검색으로 충분한지)
- [ ] 고객등록 화면 (/admin)
- [ ] Softr 병행 운영 1~2주 → 화면별 전환 → Softr 정리 (레거시 /manager 포함)
