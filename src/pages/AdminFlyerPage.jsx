import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildFlyerHtml, FLYER_FIELDS, SAMPLE_STORE } from '../lib/flyerTemplate';
import {
  dataUrlBytes, fileToDataUrl, prepareQr, squareCrop, urlToDataUrl,
} from '../lib/imagePrep';
import './AdminFlyerPage.css';

/**
 * 따종디엔핑 리뷰이벤트 전단 생성기.
 *
 * 매장 정보를 치고 사진 2장(사은품·QR)을 올리면 A4 전단이 나온다.
 * **서버를 쓰지 않는다** — 이미지는 data URI 로 HTML 안에 박히고, 출력은 브라우저 인쇄다.
 * 그래서 새 API 엔드포인트가 없고, 인증·CORS 를 새로 뚫을 일도 없다.
 *
 * 미리보기·인쇄는 iframe(srcDoc) 안에서 한다. 전단은 A4 `@page` 와 mm 단위를 쓰는데
 * 그걸 admin 화면에 그대로 풀면 관리자 레이아웃과 인쇄 CSS 가 서로를 망친다.
 */

const DRAFT_KEY = 'tk.flyer.draft.v1';
const STORES_KEY = 'tk.flyer.stores.v1';
const LOGO_URL = '/images/dp_logo.png';

const EMPTY = {
  nameCn: '', nameKr: '', addrCn: '', hoursCn: '',
  giftCn: '', giftKr: '', giftSubCn: '', leadCn: '', leadKr: '',
  hints: ['', '', '', ''],
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export default function AdminFlyerPage() {
  const [store, setStore] = useState(() => readJson(DRAFT_KEY, null)?.store || SAMPLE_STORE);
  const [images, setImages] = useState(() => readJson(DRAFT_KEY, null)?.images || {});
  const [logo, setLogo] = useState('');
  const [giftZoom, setGiftZoom] = useState(1.25);
  const [giftRaw, setGiftRaw] = useState(() => readJson(DRAFT_KEY, null)?.giftRaw || '');
  const [cutCaption, setCutCaption] = useState(true);
  const [qrRaw, setQrRaw] = useState(() => readJson(DRAFT_KEY, null)?.qrRaw || '');
  const [saved, setSaved] = useState(() => readJson(STORES_KEY, []));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const frameRef = useRef(null);
  const boxRef = useRef(null);
  const [scale, setScale] = useState(0.5);
  const [overflowPx, setOverflowPx] = useState(0);
  /* 인쇄 축소 배율 — 아래 숫자는 전부 Owner 아이폰 실측이다.
       iOS 는 `@page { margin: 0 }` 을 무시하고 여백 약 24mm 를 늘 강제한다.
       A4(297mm)    -> 인쇄 가능 약 273mm : 92% 부터 1페이지
       Letter(279mm)-> 인쇄 가능 약 255mm : 88%(261mm) 는 2페이지
     아이폰 인쇄창의 용지가 US Letter 로 되돌아가는 일이 잦으므로,
     어느 용지에서도 들어가는 80%(238mm)를 모바일 기본으로 둔다.
     85%(252mm)도 Letter 에 들어가지만 여유가 3mm 뿐이라 기본으로 쓰지 않는다. */
  const [printScale, setPrintScale] = useState(
    () => (/iPhone|iPad|Android/i.test(navigator.userAgent) ? 0.8 : 1),
  );

  // 로고는 전단이 자기완결 HTML 이 되도록 data URI 로 바꿔 둔다.
  useEffect(() => {
    let alive = true;
    urlToDataUrl(LOGO_URL)
      .then((d) => { if (alive) setLogo(d); })
      .catch(() => { if (alive) setLogo(''); });   // 실패해도 전단은 로고 없이 나온다
    return () => { alive = false; };
  }, []);

  // 미리보기 축소율 — A4 폭 794px(96dpi) 기준
  useEffect(() => {
    const fit = () => {
      const w = boxRef.current?.clientWidth || 0;
      if (w) setScale(Math.min(1, w / 842));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const html = useMemo(
    () => buildFlyerHtml(store, { ...images, logo }, { printScale }),
    [store, images, logo, printScale],
  );

  // 작업 중인 내용을 이 브라우저에 남긴다. 용량을 넘으면 이미지를 빼고 글자만 남긴다.
  useEffect(() => {
    const payload = { store, images, giftRaw, qrRaw };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ store }));
      } catch { /* 저장 못 해도 화면은 그대로 쓴다 */ }
    }
  }, [store, images, giftRaw, qrRaw]);

  const set = (k, v) => setStore((s) => ({ ...s, [k]: v }));
  const setHint = (i, v) => setStore((s) => {
    const hints = [...(s.hints || [])];
    hints[i] = v;
    return { ...s, hints };
  });

  const note = useCallback((t) => {
    setMsg(t);
    window.setTimeout(() => setMsg(''), 4000);
  }, []);

  // ── 이미지 ──
  const onGift = async (file) => {
    if (!file) return;
    setBusy('사은품 사진 처리 중…');
    try {
      const raw = await fileToDataUrl(file);
      setGiftRaw(raw);
      setImages((im) => ({ ...im, gift: null }));
      const cropped = await squareCrop(raw, giftZoom);
      setImages((im) => ({ ...im, gift: cropped }));
    } catch (e) {
      note(e.message);
    } finally {
      setBusy('');
    }
  };

  // 확대 슬라이더를 움직이면 원본에서 다시 자른다 (재업로드 불필요)
  useEffect(() => {
    if (!giftRaw) return undefined;
    let alive = true;
    const t = window.setTimeout(() => {
      squareCrop(giftRaw, giftZoom)
        .then((d) => { if (alive) setImages((im) => ({ ...im, gift: d })); })
        .catch(() => {});
    }, 180);
    return () => { alive = false; window.clearTimeout(t); };
  }, [giftRaw, giftZoom]);

  const onQr = async (file) => {
    if (!file) return;
    setBusy('QR 손질 중…');
    try {
      const raw = await fileToDataUrl(file);
      setQrRaw(raw);
      const done = await prepareQr(raw, cutCaption);
      setImages((im) => ({ ...im, qr: done }));
    } catch (e) {
      note(e.message);
    } finally {
      setBusy('');
    }
  };

  useEffect(() => {
    if (!qrRaw) return undefined;
    let alive = true;
    prepareQr(qrRaw, cutCaption)
      .then((d) => { if (alive) setImages((im) => ({ ...im, qr: d })); })
      .catch(() => {});
    return () => { alive = false; };
  }, [qrRaw, cutCaption]);

  /**
   * 내용이 A4 한 장을 넘는지 잰다.
   *
   * 인쇄 CSS 가 `.a4 { height: 297mm; overflow: hidden }` 으로 못을 박아 두어서
   * 페이지가 넘어가는 대신 **넘친 부분이 조용히 잘린다.** 잘린 걸 눈치채지 못하고
   * 인쇄하는 게 더 나쁘므로 여기서 미리 알려 준다.
   */
  const measureFit = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    const layer = doc?.querySelector('.layer');
    if (!layer) return;
    const over = Math.max(0, layer.scrollHeight - layer.clientHeight);
    setOverflowPx(over);
  }, []);

  // 폰트가 늦게 붙으면 높이가 바뀐다. 폰트 로딩까지 기다렸다가 잰다.
  const onFrameLoad = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    measureFit();
    doc?.fonts?.ready?.then(measureFit).catch(() => {});
    window.setTimeout(measureFit, 600);
  }, [measureFit]);

  // ── 출력 ──
  /**
   * 새 창에서 인쇄한다.
   *
   * iframe 을 그대로 print() 하면 일부 모바일 브라우저가 iframe 이 아니라
   * **부모 화면(관리자 페이지)** 을 인쇄한다. 전단만 담긴 창을 따로 열어
   * 그 창을 인쇄하면 그 문제가 생기지 않는다.
   * 팝업이 막히면 예전 방식(iframe 인쇄)으로 되돌아간다.
   */
  const print = (debug = false) => {
    measureFit();
    // 전단 창이 스스로 '준비 완료 후' 인쇄하게 한다.
    // 부모에서 print() 를 부르면 폰트·이미지가 아직인 상태로 인쇄돼
    // iOS 에서 '로드를 완료하지 않았습니다' 가 뜨고 사진·QR 이 빈 칸으로 나갔다.
    const printable = buildFlyerHtml(
      store, { ...images, logo }, { printScale, autoPrint: true, debug },
    );
    const blob = new Blob([printable], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) {
      note('팝업이 막혀 창을 열지 못했습니다 — 팝업 차단을 풀고 다시 눌러주세요');
      URL.revokeObjectURL(url);
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  };

  const download = () => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `리뷰이벤트_${store.nameKr || store.nameCn || '전단'}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ── 매장 저장 (글자만. 이미지는 용량 때문에 안 담는다) ──
  const saveStore = () => {
    const name = (store.nameKr || store.nameCn || '').trim();
    if (!name) { note('상호를 먼저 입력하세요'); return; }
    const next = [{ name, at: Date.now(), store }, ...saved.filter((s) => s.name !== name)].slice(0, 20);
    try {
      localStorage.setItem(STORES_KEY, JSON.stringify(next));
      setSaved(next);
      note(`'${name}' 저장했습니다 — 사진과 QR 은 저장되지 않습니다`);
    } catch {
      note('저장 공간이 부족합니다');
    }
  };

  const loadStore = (name) => {
    const hit = saved.find((s) => s.name === name);
    if (!hit) return;
    setStore({ ...EMPTY, ...hit.store });
    note(`'${name}' 불러왔습니다 — 사진과 QR 은 다시 올려야 합니다`);
  };

  const removeStore = (name) => {
    const next = saved.filter((s) => s.name !== name);
    try { localStorage.setItem(STORES_KEY, JSON.stringify(next)); } catch { /* 무시 */ }
    setSaved(next);
  };

  const giftKb = Math.round(dataUrlBytes(images.gift) / 1024);
  const qrKb = Math.round(dataUrlBytes(images.qr) / 1024);
  const ready = Boolean(images.gift && images.qr && store.nameCn && store.giftCn);

  return (
    <div className="afl">
      <div className="afl-bar">
        <div className="afl-bar-l">
          <button type="button" className="afl-btn pri" onClick={() => print(false)}>
            인쇄 · PDF 저장
          </button>
          <button type="button" className="afl-btn" onClick={download}>
            HTML 내려받기
          </button>
          <button
            type="button"
            className="afl-btn"
            title="인쇄면 왼쪽 위에 실제 계산값을 찍어 보여준다. 페이지가 안 맞을 때 화면을 캡처해 보내면 원인을 특정할 수 있다."
            onClick={() => print(true)}
          >
            인쇄 점검
          </button>
          <label className="afl-scale">
            출력 배율
            <select
              value={printScale}
              onChange={(e) => setPrintScale(Number(e.target.value))}
            >
              <option value={1}>100% — PC · PDF 저장</option>
              <option value={0.9}>90% — A4 전용</option>
              <option value={0.85}>85% — A4·Letter (여유 적음)</option>
              <option value={0.8}>80% — 아이폰 권장</option>
              <option value={0.75}>75%</option>
              <option value={0.7}>70%</option>
              <option value={0.6}>60% — 진단용</option>
            </select>
            <b className="afl-mm">
              {Math.round(210 * printScale)}×{Math.round(297 * printScale)}mm
            </b>
          </label>
          {!ready && (
            <span className="afl-warn">
              상호 · 제공내역 · 사진 2장이 다 채워져야 완성입니다
            </span>
          )}
          <span className="afl-hint2">
            누르면 새 창이 열리고 <b>사진·글꼴이 다 준비된 뒤 인쇄창이 저절로</b> 뜹니다.
            아이폰은 인쇄창 용지가 <b>US Letter 로 되돌아가는 일이 잦아</b>
            어느 용지든 들어가는 <b>80%</b> 를 기본으로 씁니다.
            인쇄창의 「크기 조절」은 <b>100% 그대로</b> 두세요. PC 는 100% 배율로 1페이지입니다.
          </span>
          {overflowPx > 0 && (
            <span className="afl-over">
              내용이 A4 한 장을 약 {Math.round(overflowPx)}px 넘습니다 — 넘친 부분은 인쇄에서 잘립니다.
              질문 수나 문구 길이를 줄이세요.
            </span>
          )}
          {busy && <span className="afl-busy">{busy}</span>}
          {msg && <span className="afl-msg">{msg}</span>}
        </div>
        <div className="afl-bar-r">
          <button type="button" className="afl-btn" onClick={saveStore}>매장 저장</button>
          <select
            className="afl-sel"
            value=""
            onChange={(e) => { if (e.target.value) loadStore(e.target.value); }}
          >
            <option value="">저장된 매장 불러오기…</option>
            {saved.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
          <button
            type="button"
            className="afl-btn"
            onClick={() => { setStore({ ...EMPTY }); setImages({}); setGiftRaw(''); setQrRaw(''); }}
          >
            새로 시작
          </button>
        </div>
      </div>

      <div className="afl-body">
        {/* ── 입력 ── */}
        <div className="afl-form">
          <section className="afl-sec">
            <h3>사진 <small>매장별로 반드시 교체</small></h3>

            <div className="afl-drop">
              <div className="afl-drop-h">
                사은품 사진
                {images.gift && <em>{giftKb}KB</em>}
              </div>
              <input type="file" accept="image/*" onChange={(e) => onGift(e.target.files?.[0])} />
              {images.gift && (
                <>
                  <img className="afl-thumb" src={images.gift} alt="" />
                  <label className="afl-zoom">
                    당김 {Math.round(giftZoom * 100)}%
                    <input
                      type="range" min="100" max="180" step="5"
                      value={Math.round(giftZoom * 100)}
                      onChange={(e) => setGiftZoom(Number(e.target.value) / 100)}
                    />
                  </label>
                  <p className="afl-tip">접시 여백이 넓으면 당겨 잘라야 인쇄에서 사은품이 보입니다.</p>
                </>
              )}
            </div>

            <div className="afl-drop">
              <div className="afl-drop-h">
                따종 QR
                {images.qr && <em>{qrKb}KB</em>}
              </div>
              <input type="file" accept="image/*" onChange={(e) => onQr(e.target.files?.[0])} />
              {images.qr && <img className="afl-thumb qr" src={images.qr} alt="" />}
              <label className="afl-chk">
                <input
                  type="checkbox"
                  checked={cutCaption}
                  onChange={(e) => setCutCaption(e.target.checked)}
                />
                하단 <b>上大众点评/Use Dianping App</b> 글자 잘라내기
              </label>
              <p className="afl-tip">
                전단에 같은 문구가 이미 있습니다. 잘라내면 코드가 커져 스캔이 쉬워집니다.
              </p>
              <p className="afl-tip alert">
                인쇄 전에 <b>직접 스캔해 어느 화면이 뜨는지 확인</b>하세요.
                포털 QR 이 점평 페이지가 아니라 체크인 활동 페이지로 가는 경우가 있습니다.
              </p>
            </div>
          </section>

          <section className="afl-sec">
            <h3>매장 정보 <small>중문 상호는 포털 등록명 그대로</small></h3>
            {FLYER_FIELDS.map((f) => (
              <label key={f.k} className={`afl-f${f.wide ? ' wide' : ''}`}>
                <span>{f.label}</span>
                <input
                  type="text"
                  value={store[f.k] || ''}
                  placeholder={f.ph}
                  onChange={(e) => set(f.k, e.target.value)}
                />
                {f.hint && <em>{f.hint}</em>}
              </label>
            ))}
          </section>

          <section className="afl-sec">
            <h3>리뷰 유도 질문 <small>그 매장 대표 메뉴로. 4개까지</small></h3>
            {[0, 1, 2, 3].map((i) => (
              <label key={i} className="afl-f wide">
                <span>질문 {i + 1}</span>
                <input
                  type="text"
                  value={(store.hints || [])[i] || ''}
                  placeholder={i === 0 ? '招牌炖带鱼的味道如何？' : ''}
                  onChange={(e) => setHint(i, e.target.value)}
                />
              </label>
            ))}
          </section>

          {saved.length > 0 && (
            <section className="afl-sec">
              <h3>저장된 매장 <small>글자만 저장됩니다</small></h3>
              <ul className="afl-saved">
                {saved.map((s) => (
                  <li key={s.name}>
                    <button type="button" onClick={() => loadStore(s.name)}>{s.name}</button>
                    <button type="button" className="x" onClick={() => removeStore(s.name)}>삭제</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ── 미리보기 ── */}
        <div className="afl-prev" ref={boxRef}>
          <div className="afl-prev-h">
            미리보기 · A4 1페이지
            <b className={overflowPx > 0 ? 'bad' : 'ok'}>
              {overflowPx > 0 ? '한 장을 넘침' : '한 장에 들어감'}
            </b>
          </div>
          <div className="afl-stage" style={{ height: 1190 * scale + 24 }}>
            <iframe
              ref={frameRef}
              title="전단 미리보기"
              srcDoc={html}
              onLoad={onFrameLoad}
              style={{ transform: `scale(${scale})` }}
            />
          </div>
          <p className="afl-tip">
            인쇄창에서 <b>여백 ‘없음’</b>, <b>배경 그래픽 켜기</b>를 확인하세요.
          </p>
        </div>
      </div>
    </div>
  );
}
