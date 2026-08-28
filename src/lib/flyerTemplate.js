/**
 * 따종디엔핑 리뷰이벤트 A4 전단 — 인쇄용 HTML 생성기.
 *
 * CSS/마크업은 승인된 전단
 *   05_Epic_Client_Assets/JEJU_GALCHI_JEONGWON/Galchi_Dianping_Review_Event.html
 * 에서 스크립트로 추출했다. 눈으로 옮겨 적지 않았다.
 *
 * A4 1페이지(209.9 x 297.0mm) 고정이다. 아래를 임의로 바꾸지 않는다:
 *   .slot { width/height: 58mm } — %/aspect-ratio 로 되돌리면 위쪽 내용이 줄었을 때
 *   가로도 같이 늘어 QR 패널이 지면 밖으로 밀려난다(실제로 겪음).
 */

const CSS = String.raw`:root {
            --dp-orange: #FF6600;
            --dp-deep: #DC4A00;
            --ink: #2A2D33;
            --ink-sub: #6E737B;
            --cream: #FFF3E4;
            --cream-line: #FFDCC0;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        body {
            font-family: 'Noto Sans SC', 'Pretendard', -apple-system, sans-serif;
            background: #5f6266;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            min-height: 100vh;
            padding: 24px;
            color: var(--ink);
        }

        /* A4 210 x 297mm */
        .a4 {
            width: 210mm;
            height: 297mm;
            position: relative;
            overflow: hidden;
            background: linear-gradient(180deg, #FF6512 0%, #FF7A28 32%, #FF8C39 62%, #FF9F4E 100%);
            padding: 11mm 12mm 9mm;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, .35);
        }

        @page {
            size: A4 portrait;
            margin: 0;
        }

        /* 인쇄는 무조건 1페이지다.
           예전에는 .a4 뒤에 강제 페이지나눔이 걸려 빈 2페이지가 딸려 나왔다.
           헤드리스 PDF 변환은 그 빈 페이지를 버리지만 실제 인쇄 대화상자는 버리지 않는다. */
        @media print {

            html,
            body {
                width: 210mm;
                height: 297mm;
                margin: 0;
                padding: 0;
                background: none;
                display: block;
                overflow: hidden;
            }

            .a4 {
                width: 210mm;
                height: 297mm;
                margin: 0;
                box-shadow: none;
                overflow: hidden;
                page-break-after: avoid;
                page-break-inside: avoid;
                break-after: avoid;
                break-inside: avoid;
            }

            /* 전단 뒤에 무엇이 와도 페이지를 넘기지 못하게 한다 */
            .a4~* {
                display: none !important;
            }
        }

        .wave {
            position: absolute;
            left: -12%;
            right: -12%;
            bottom: -46mm;
            height: 108mm;
            background: linear-gradient(180deg, #FFF4E2 0%, #FFE7C6 100%);
            border-radius: 50% 50% 0 0 / 30mm 30mm 0 0;
            box-shadow: 0 -3px 0 rgba(255, 255, 255, .45);
            z-index: 0;
        }

        .glow {
            position: absolute;
            border-radius: 50%;
            background: rgba(255, 255, 255, .12);
            z-index: 0;
        }

        .glow-1 {
            width: 70mm;
            height: 70mm;
            top: -22mm;
            right: -18mm;
        }

        .glow-2 {
            width: 40mm;
            height: 40mm;
            top: 42mm;
            left: -16mm;
            background: rgba(255, 255, 255, .09);
        }

        .layer {
            position: relative;
            z-index: 2;
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        /* ───── 공통 · 상단 로고 칩 ───── */
        .logo-chip {
            align-self: center;
            background: #fff;
            border-radius: 16px;
            padding: 6px 20px 6px 8px;
            display: flex;
            align-items: center;
            gap: 9px;
            box-shadow: 0 6px 16px rgba(160, 50, 0, .18);
            flex-shrink: 0;
        }

        .logo-chip img {
            width: 34px;
            height: 34px;
            border-radius: 9px;
            display: block;
        }

        .logo-cn {
            font-size: 21px;
            font-weight: 900;
            color: #FF5A1F;
            line-height: 1.05;
        }

        .logo-en {
            font-size: 11px;
            font-weight: 700;
            color: #FF7A45;
            letter-spacing: 2.5px;
            line-height: 1.2;
        }

        /* ───── 공통 · 헤드라인 ───── */
        .head {
            text-align: center;
            margin-top: 6mm;
            flex-shrink: 0;
            color: #fff;
        }

        .head-en {
            font-size: 21px;
            font-weight: 900;
            color: rgba(255, 255, 255, .95);
        }

        .head-cn {
            margin-top: 6px;
            font-size: 66px;
            font-weight: 900;
            letter-spacing: 1px;
            line-height: 1.08;
            text-shadow: 0 4px 0 rgba(190, 60, 0, .22);
        }

        .lead-cn {
            margin-top: 9px;
            font-size: 16px;
            font-weight: 500;
            color: rgba(255, 255, 255, .93);
        }

        .lead-kr {
            margin-top: 3px;
            font-size: 13px;
            color: rgba(255, 255, 255, .75);
        }

        /* ───── 공통 · 안내 패널 (좌 3스텝 / 우 작성 팁) ───── */
        .guide {
            margin-top: 6mm;
            background: rgba(255, 255, 255, .97);
            border-radius: 20px;
            padding: 6mm;
            box-shadow: 0 10px 26px rgba(150, 50, 0, .16);
            display: flex;
            gap: 6mm;
            flex-shrink: 0;
        }

        .g-steps {
            flex: 1.3;
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 4.6mm;
        }

        .step {
            display: flex;
            align-items: center;
            gap: 4mm;
            position: relative;
        }

        .step+.step::before {
            content: '';
            position: absolute;
            left: 16px;
            top: -3.4mm;
            width: 2px;
            height: 2.3mm;
            background: #FFD3B0;
            border-radius: 2px;
        }

        .num {
            width: 33px;
            height: 33px;
            flex-shrink: 0;
            border-radius: 50%;
            background: linear-gradient(135deg, #FF8A3D, #FF5C00);
            color: #fff;
            font-size: 18px;
            font-weight: 900;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 3px 8px rgba(255, 92, 0, .32);
        }

        .s-cn {
            font-size: 19px;
            font-weight: 700;
            line-height: 1.3;
        }

        .s-cn em {
            font-style: normal;
            color: var(--dp-deep);
            background: linear-gradient(transparent 60%, rgba(255, 102, 0, .28) 60%);
        }

        .s-kr {
            margin-top: 2px;
            font-size: 12.5px;
            font-weight: 500;
            color: var(--ink-sub);
        }

        /* 우측 · 리뷰 작성 팁 */
        .g-tips {
            flex: 1;
            background: var(--cream);
            border: 1px solid var(--cream-line);
            border-radius: 14px;
            padding: 4.5mm 5mm;
            display: flex;
            flex-direction: column;
        }

        .tips-h {
            font-size: 15px;
            font-weight: 900;
            color: var(--dp-deep);
            padding-bottom: 2.5mm;
            border-bottom: 1px solid var(--cream-line);
        }

        .tips-h span {
            font-size: 11.5px;
            font-weight: 500;
            color: var(--ink-sub);
            margin-left: 5px;
        }

        .cond {
            display: flex;
            flex-direction: column;
            gap: 1.8mm;
            margin-top: 3mm;
        }

        .cond b {
            background: #fff;
            border: 1px solid var(--cream-line);
            border-radius: 8px;
            padding: 1.8mm 2.5mm;
            font-size: 13px;
            font-weight: 700;
            color: var(--dp-deep);
        }

        .hints {
            margin-top: 3.4mm;
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 1.6mm;
        }

        .hints li {
            font-size: 12.5px;
            color: #5A5F66;
            line-height: 1.35;
            padding-left: 4.5mm;
            position: relative;
        }

        .hints li::before {
            content: '';
            position: absolute;
            left: 0;
            top: 5px;
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: var(--dp-orange);
        }

        /* ───── 매장별 · 하단 2단 (사은품 / QR) ───── */
        .bottom {
            margin-top: 5mm;
            display: flex;
            gap: 5mm;
            flex: 1;
            min-height: 0;
        }

        .panel {
            background: #fff;
            border-radius: 20px;
            box-shadow: 0 10px 26px rgba(150, 50, 0, .16);
            padding: 5mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            position: relative;
            flex: 1;
        }

        .tag {
            position: absolute;
            top: -10px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--dp-deep);
            color: #fff;
            font-size: 11.5px;
            font-weight: 900;
            letter-spacing: 1.5px;
            padding: 4px 14px;
            border-radius: 100px;
            white-space: nowrap;
        }

        .slot {
            width: 58mm;
            height: 58mm;
            flex-shrink: 0;
            border-radius: 14px;
            background: #fff;
            border: 1px solid #FFE0C0;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }

        .slot.gift img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .slot.qr img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            padding: 1.5mm;
        }

        .ph {
            font-size: 11.5px;
            font-weight: 700;
            color: #B0805C;
            line-height: 1.6;
            padding: 3mm;
        }

        .gift-name {
            margin-top: 3.5mm;
            font-size: 23px;
            font-weight: 900;
            color: var(--dp-deep);
            line-height: 1.2;
        }

        .gift-kr {
            margin-top: 2px;
            font-size: 14px;
            font-weight: 700;
        }

        .gift-sub {
            margin-top: 4px;
            font-size: 12px;
            color: var(--ink-sub);
        }

        .qr-cap {
            margin-top: 3.5mm;
            font-size: 12px;
            color: #4A4E55;
        }

        .qr-store {
            margin-top: 3px;
            font-size: 19px;
            font-weight: 900;
        }

        .qr-store-kr {
            margin-top: 1px;
            font-size: 12px;
            color: var(--ink-sub);
        }

        /* ───── 공통 · 푸터 ───── */
        .foot {
            flex-shrink: 0;
            margin-top: 5mm;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 6mm;
            color: #8A5A34;
            font-size: 11px;
            line-height: 1.6;
        }

        .foot-addr {
            font-weight: 700;
            color: #7A4A26;
        }

        .foot-note {
            text-align: right;
        }`;

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 전단에 들어가는 매장별 항목. AdminFlyerPage 의 폼과 1:1 로 대응한다. */
export const FLYER_FIELDS = [
  { k: 'nameCn', label: '중문 상호', ph: '带鱼庭院', hint: '따종 상인포털 등록명 그대로. 추론 금지' },
  { k: 'nameKr', label: '한글 상호', ph: '제주갈치정원 제주본점' },
  { k: 'addrCn', label: '주소 (중문)', ph: '济州市 1100路 3124 (老衡洞) · 距济州机场约 10 分钟' },
  { k: 'hoursCn', label: '영업시간 (중문)', ph: '营业时间 10:00 – 22:00' },
  { k: 'giftCn', label: '제공 내역 (중문)', ph: '手工济州艾草年糕 2 个' },
  { k: 'giftKr', label: '제공 내역 (한글)', ph: '제주 수제 오메기떡 2개' },
  { k: 'giftSubCn', label: '제공 내역 설명 (중문)', ph: '100% 韩国产糯米 + 济州艾草' },
  { k: 'leadCn', label: '헤드라인 아래 문구 (중문)', ph: '在大众点评完成打卡与带图点评，即可免费领取…', wide: true },
  { k: 'leadKr', label: '헤드라인 아래 문구 (한글)', ph: '따종디엔핑 포토리뷰 작성하고 …', wide: true },
];

/** 새 매장 시작값 — 1호(제주갈치정원) 값을 예시로 채워 형식을 안 깨뜨리게 한다. */
export const SAMPLE_STORE = {
  nameCn: '带鱼庭院',
  nameKr: '제주갈치정원 제주본점',
  addrCn: '济州市 1100路 3124 (老衡洞) · 距济州机场约 10 分钟',
  hoursCn: '营业时间 10:00 – 22:00',
  giftCn: '手工济州艾草年糕 2 个',
  giftKr: '제주 수제 오메기떡 2개',
  giftSubCn: '100% 韩国产糯米 + 济州艾草',
  leadCn: '在大众点评完成打卡与带图点评，即可免费领取济州传统艾草年糕 2 个',
  leadKr: '따종디엔핑 포토리뷰 작성하고 제주 수제 오메기떡 2개 받아가세요',
  hints: ['招牌炖带鱼的味道如何？', '烤带鱼的火候怎么样？', '小菜合口味吗？', '喜欢店里的氛围吗？'],
};

/**
 * @param {object} store 매장 정보 (FLYER_FIELDS 의 키 + hints[])
 * @param {object} img   { gift, qr, logo } — data URI 또는 빈 값
 * @returns {string} 완성된 단일 HTML (외부 리소스는 구글 폰트뿐)
 */
export function buildFlyerHtml(store = {}, img = {}) {
  const E = {};
  for (const f of FLYER_FIELDS) E[f.k] = esc(store[f.k]);

  const HINTS = (store.hints || [])
    .filter((h) => String(h).trim())
    .map((h) => `<li>${esc(h)}</li>`)
    .join('');

  const slot = (src, label) =>
    (src ? `<img src="${esc(src)}" alt="">` : `<div class="ph">${label}</div>`);

  const SLOT_GIFT = slot(img.gift, '사은품 사진 자리');
  const SLOT_QR = slot(img.qr, '따종 QR 자리');
  const LOGO = img.logo ? `<img src="${esc(img.logo)}" alt="">` : '';

  const body = `<div class="a4">
        <div class="glow glow-1"></div>
        <div class="glow glow-2"></div>
        <div class="wave"></div>

        <div class="layer">

            <!-- 공통 : 따종 로고 -->
            <div class="logo-chip">
                ${LOGO}
                <div>
                    <div class="logo-cn">大众点评</div>
                    <div class="logo-en">DIANPING</div>
                </div>
            </div>

            <!-- 공통 : 헤드라인 (아래 두 줄만 STORE 에서 온다) -->
            <div class="head">
                <div class="head-en">Write a Review, Get a Free Gift</div>
                <div class="head-cn">写点评 免费送</div>
                <div class="lead-cn" id="leadCn">${E.leadCn}</div>
                <div class="lead-kr" id="leadKr">${E.leadKr}</div>
            </div>

            <!-- 공통 : 참여 방법 3스텝 + 작성 팁 -->
            <div class="guide">
                <div class="g-steps">
                    <div class="step">
                        <div class="num">1</div>
                        <div>
                            <div class="s-cn">扫描右下方<em>二维码</em>，进入本店页面</div>
                            <div class="s-kr">오른쪽 아래 QR코드를 스캔하세요</div>
                        </div>
                    </div>
                    <div class="step">
                        <div class="num">2</div>
                        <div>
                            <div class="s-cn">完成<em>【打卡 + 收藏 + 评价】</em></div>
                            <div class="s-kr">체크인 · 저장 · 리뷰 3가지를 모두 완료</div>
                        </div>
                    </div>
                    <div class="step">
                        <div class="num">3</div>
                        <div>
                            <div class="s-cn">向店员出示点评页面，<em>当场领取</em></div>
                            <div class="s-kr">리뷰 화면을 직원에게 보여주시면 바로 드립니다</div>
                        </div>
                    </div>
                </div>

                <aside class="g-tips">
                    <div class="tips-h">点评小贴士 <span>리뷰 작성 안내</span></div>
                    <div class="cond">
                        <b>✍ 20 字以上的用餐感受</b>
                        <b>📸 3 张以上清晰照片或视频</b>
                    </div>
                    <ul class="hints">${HINTS}</ul>
                </aside>
            </div>

            <!-- 매장별 : 사은품 / QR -->
            <div class="bottom">
                <div class="panel">
                    <span class="tag">GIFT · 赠品</span>
                    <div class="slot gift">${SLOT_GIFT}</div>
                    <div class="gift-name" id="giftCn">${E.giftCn}</div>
                    <div class="gift-kr" id="giftKr">${E.giftKr}</div>
                    <div class="gift-sub" id="giftSubCn">${E.giftSubCn}</div>
                </div>

                <div class="panel">
                    <div class="slot qr">${SLOT_QR}</div>
                    <div class="qr-cap">上大众点评 / Use Dianping App</div>
                    <div class="qr-store" id="nameCn">${E.nameCn}</div>
                    <div class="qr-store-kr" id="nameKr">${E.nameKr}</div>
                </div>
            </div>

            <!-- 공통 : 유의사항 (주소·시간만 STORE 에서 온다) -->
            <div class="foot">
                <div class="foot-addr">
                    <span id="addrCn">${E.addrCn}</span><br>
                    <span id="hoursCn">${E.hoursCn}</span>
                </div>
                <div class="foot-note">
                    * 礼品详情咨询商家 &nbsp;|&nbsp; 每桌每次消费限领 1 次<br>
                    * 点评删除后不可重复参与 &nbsp;|&nbsp; 赠品数量有限，送完为止
                </div>
            </div>

        </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<title>${E.nameKr || '따종 리뷰이벤트'} 리뷰이벤트</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>${CSS}</style></head>
<body>${body}</body></html>`;
}
