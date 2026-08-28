/**
 * 전단에 넣을 이미지 손질 — 전부 브라우저 캔버스에서 처리한다.
 *
 * 업로드 서버가 없다. 파일은 data URI 로 바뀌어 전단 HTML 안에 그대로 박힌다.
 * 그래서 원본 크기를 반드시 줄여야 한다 — 폰 사진 4MB 를 그대로 넣으면
 * 미리보기 iframe 이 눈에 띄게 느려지고 저장한 HTML 이 수십 MB 가 된다.
 *
 * 여기 있는 두 가지 손질은 1호 전단(제주갈치정원)을 만들며 손으로 했던 작업이다:
 *   - 사은품 사진: 정사각 중앙 크롭 (접시 여백이 넓으면 58mm 칸에서 사은품이 손톱만 해진다)
 *   - QR: 흰 여백과 하단 캡션을 잘라낸다 (전단에 같은 문구가 이미 있고,
 *         잘라낸 만큼 코드가 커져 테이블 거리에서 스캔이 쉬워진다)
 */

const MAX_GIFT = 1200;   // px — 58mm 인쇄에 충분하고도 남는다
const MAX_QR = 900;

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('파일을 읽지 못했습니다'));
    fr.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('이미지를 열지 못했습니다'));
    im.src = dataUrl;
  });
}

/**
 * 정사각 중앙 크롭.
 * @param {number} zoom 1 = 짧은 변 전체, 1.25 = 80% 만 남기고 당김
 * @param {number} offsetY -1~1, 세로 중심 이동 (접시 사진은 살짝 위가 보기 좋다)
 */
export async function squareCrop(dataUrl, zoom = 1, offsetY = 0) {
  const im = await loadImage(dataUrl);
  const side = Math.min(im.width, im.height) / Math.max(zoom, 1);
  const cx = im.width / 2;
  const cy = im.height / 2 + (im.height / 2 - side / 2) * offsetY;

  const out = Math.min(Math.round(side), MAX_GIFT);
  const cv = document.createElement('canvas');
  cv.width = out;
  cv.height = out;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out, out);
  ctx.drawImage(im, cx - side / 2, cy - side / 2, side, side, 0, 0, out, out);
  return cv.toDataURL('image/jpeg', 0.88);
}

/**
 * QR 손질 — 하단 캡션을 잘라내고, 남은 흰 여백을 없앤 뒤 정사각 + 조용지대 8%.
 * @param {boolean} cutCaption 포털 QR 아래 '上大众点评/Use Dianping App' 글자를 자를지
 */
export async function prepareQr(dataUrl, cutCaption = true) {
  const im = await loadImage(dataUrl);

  // 1) 캡션 영역을 먼저 떼어낸다. 코드보다 아래에 있으므로 하단 10% 면 충분하다.
  const srcH = cutCaption ? Math.round(im.height * 0.9) : im.height;

  const work = document.createElement('canvas');
  work.width = im.width;
  work.height = srcH;
  const wctx = work.getContext('2d');
  wctx.fillStyle = '#fff';
  wctx.fillRect(0, 0, im.width, srcH);
  wctx.drawImage(im, 0, 0);

  // 2) 어두운 픽셀의 경계 상자를 찾아 흰 여백을 없앤다.
  let box;
  try {
    const d = wctx.getImageData(0, 0, im.width, srcH).data;
    let top = srcH, bot = -1, left = im.width, right = -1;
    for (let y = 0; y < srcH; y++) {
      for (let x = 0; x < im.width; x++) {
        const i = (y * im.width + x) * 4;
        if (d[i] < 200 && d[i + 1] < 200 && d[i + 2] < 200) {
          if (y < top) top = y;
          if (y > bot) bot = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    if (bot > top && right > left) box = { top, bot, left, right };
  } catch {
    // 캔버스가 오염된 경우 등 — 자르지 않고 원본을 쓴다
  }
  if (!box) box = { top: 0, bot: srcH - 1, left: 0, right: im.width - 1 };

  const w = box.right - box.left + 1;
  const h = box.bot - box.top + 1;
  const side = Math.max(w, h);
  const pad = Math.round(side * 0.08);          // 조용지대 — 없으면 스캔이 잘 안 붙는다
  const full = Math.min(side + pad * 2, MAX_QR);

  const cv = document.createElement('canvas');
  cv.width = full;
  cv.height = full;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, full, full);
  const scale = (full - pad * 2 * (full / (side + pad * 2))) / side;
  const dw = w * scale;
  const dh = h * scale;
  ctx.imageSmoothingEnabled = false;            // QR 은 뭉개지면 안 된다
  ctx.drawImage(work, box.left, box.top, w, h,
    (full - dw) / 2, (full - dh) / 2, dw, dh);
  return cv.toDataURL('image/png');
}

/** URL 의 이미지를 data URI 로. 전단을 자기완결 HTML 로 만들기 위해 로고에 쓴다. */
export async function urlToDataUrl(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`로고를 불러오지 못했습니다 (${resp.status})`);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('로고 변환 실패'));
    fr.readAsDataURL(blob);
  });
}

/** data URI 의 대략적인 바이트 수 — 용량 경고에 쓴다. */
export function dataUrlBytes(d) {
  if (!d) return 0;
  const i = d.indexOf(',');
  return i < 0 ? 0 : Math.round((d.length - i - 1) * 0.75);
}
