/* ============================================================================
   Reading evidence files in the browser — plain text, Word (.docx), PDFs (their text layer) and, for scanned
   pages and photos, OCR in English, Hindi and Marathi. Nothing is uploaded: the file is read here, and only the
   text that comes out is kept (in this browser's IndexedDB, see Extract.store).

   The heavy libraries are loaded only when a scanned page or a PDF has to be read:
     · pdf.js        (reads a PDF's text layer and draws a page for OCR)
     · tesseract.js  (OCR; its language files are 1–4 MB each)
   By default they come from the jsDelivr CDN at pinned versions. To run without the CDN, host them yourself and set,
   before this script loads:
     window.LEGALAI_LIBS = { pdfjs, pdfjsWorker, tesseract, tesseractWorker, tesseractCore, langPath }
   Only the file's *contents* stay on the machine either way; the CDN sees the request for the library, not the document.

   The pure helpers (what kind of file is this, decoding text, joining PDF text, language choice) are unit-tested in
   test/extract.test.js. The parts that need a browser — pdf.js, tesseract.js, IndexedDB — are exercised by the browser tests.
   ============================================================================ */
const TM = typeof TextMine !== 'undefined' ? TextMine : require('./textmine.js');        // the browser has it as a global script

const Extract = (() => {
  const VERSIONS = { pdfjs: '4.10.38', tesseract: '5.1.1' };
  const CDN = 'https://cdn.jsdelivr.net/npm';
  const libUrls = () => {
    const own = (typeof window !== 'undefined' && window.LEGALAI_LIBS && typeof window.LEGALAI_LIBS === 'object') ? window.LEGALAI_LIBS : {};
    const pick = (k, dflt) => (typeof own[k] === 'string' && own[k] ? own[k] : dflt);
    return {
      pdfjs: pick('pdfjs', `${CDN}/pdfjs-dist@${VERSIONS.pdfjs}/build/pdf.min.mjs`),
      pdfjsWorker: pick('pdfjsWorker', `${CDN}/pdfjs-dist@${VERSIONS.pdfjs}/build/pdf.worker.min.mjs`),
      tesseract: pick('tesseract', `${CDN}/tesseract.js@${VERSIONS.tesseract}/dist/tesseract.min.js`),
      tesseractWorker: pick('tesseractWorker', `${CDN}/tesseract.js@${VERSIONS.tesseract}/dist/worker.min.js`),
      tesseractCore: pick('tesseractCore', ''),          // empty: tesseract.js's own default (jsDelivr)
      langPath: pick('langPath', '')                     // empty: tesseract.js's own default (jsDelivr)
    };
  };

  const LANGS = { eng: 'English', hin: 'Hindi', mar: 'Marathi' };
  const MAX_FILE_BYTES = 80 * 1048576, MAX_CHARS = 1000000, MAX_PAGES = 400, MAX_OCR_PAGES = 40;
  const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'bmp', 'webp', 'gif'], TEXT_EXT = ['txt', 'text', 'md', 'csv', 'tsv', 'log'];

  /* ── pure helpers ───────────────────────────────────────────────────────── */
  const extOf = name => (String(name ?? '').split('.').pop() || '').toLowerCase();

  /* what we can do with a file: 'text' | 'docx' | 'pdf' | 'image' | 'unsupported' (with a reason the user can act on) */
  function kindOf(name, mime = '') {
    const ext = extOf(name), type = String(mime || '').toLowerCase();
    if (ext === 'pdf' || type === 'application/pdf') return { kind: 'pdf' };
    if (ext === 'docx' || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return { kind: 'docx' };
    if (TEXT_EXT.includes(ext) || type.startsWith('text/')) return { kind: 'text' };
    if (IMAGE_EXT.includes(ext) || /^image\/(png|jpe?g|bmp|webp|gif)$/.test(type)) return { kind: 'image' };
    if (ext === 'doc') return { kind: 'unsupported', reason: 'Old .doc files cannot be read here. Save the file as .docx or PDF and choose it again.' };
    if (['rtf', 'odt'].includes(ext)) return { kind: 'unsupported', reason: `.${ext} files cannot be read here. Save the file as .docx or PDF and choose it again.` };
    if (['tif', 'tiff', 'heic', 'heif'].includes(ext)) return { kind: 'unsupported', reason: `${ext.toUpperCase()} images cannot be read here. Save the image as PNG or JPG and choose it again.` };
    if (['zip', 'rar', '7z'].includes(ext)) return { kind: 'unsupported', reason: 'A bundle cannot be read as one document. Unpack it and add the files one by one.' };
    return { kind: 'unsupported', reason: 'This kind of file cannot be read here. Use a PDF, a Word (.docx) file, a text file or a photo (PNG or JPG).' };
  }

  /* the OCR languages to use: only known ones, always at least English, in a fixed order */
  function normalizeLangs(list) {
    const want = new Set((Array.isArray(list) ? list : String(list ?? '').split(/[+,\s]+/)).map(x => String(x).toLowerCase().trim()));
    const out = Object.keys(LANGS).filter(k => want.has(k));
    return out.length ? out : ['eng'];
  }
  const langLabel = langs => normalizeLangs(langs).map(k => LANGS[k]).join(' + ');

  /* a text file: honour a byte-order mark, read UTF-8, and fall back to Windows-1252 for old files */
  function decodeText(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return new TextDecoder('utf-8').decode(b.subarray(3));
    if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b.subarray(2));
    if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder('utf-16be').decode(b.subarray(2));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(b); }
    catch { return new TextDecoder('windows-1252').decode(b); }
  }

  /* pdf.js hands back small text pieces with positions; put them back into lines */
  function joinPdfItems(items) {
    let out = '', prev = null;
    for (const it of Array.isArray(items) ? items : []) {
      if (!it || typeof it.str !== 'string') continue;
      const t = Array.isArray(it.transform) ? it.transform : [], x = Number(t[4]) || 0, y = Number(t[5]) || 0;
      const h = Math.abs(Number(t[3])) || Number(it.height) || 10;
      if (prev) {
        if (Math.abs(y - prev.y) > h * 0.5) { if (!out.endsWith('\n')) out += '\n'; }
        else if (x - prev.end > h * 0.15 && !/\s$/.test(out) && !/^\s/.test(it.str)) out += ' ';
      }
      out += it.str;
      if (it.hasEOL && !out.endsWith('\n')) out += '\n';
      prev = { y, end: x + (Number(it.width) || 0) };
    }
    return out;
  }
  /* a page whose text layer is empty or nearly so is a scan: it has to be read by OCR */
  const looksScanned = pageText => (String(pageText ?? '').match(/[\p{L}\p{M}\p{N}]/gu) || []).length < 20;

  /* ── the text store ─────────────────────────────────────────────────────────
     The extracted text can be large, so it lives in IndexedDB, not localStorage. Where IndexedDB is not available
     (some private windows) it falls back to memory and says so, so the screen can tell the user it will not last. */
  const store = (() => {
    const mem = new Map();
    let dbp = null, persistent = true;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((resolve, reject) => {
        try {
          const req = indexedDB.open('legalai.texts', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('texts');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error || new Error('IndexedDB failed'));
          req.onblocked = () => reject(new Error('IndexedDB blocked'));
        } catch (e) { reject(e); }
      }).catch(() => { persistent = false; return null; });
      return dbp;
    }
    const run = async (mode, fn) => {
      const db = await open();
      if (!db) return fn(null);
      return new Promise((resolve, reject) => {
        const tx = db.transaction('texts', mode);
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('IndexedDB failed'));
        result = fn(tx.objectStore('texts'), v => { result = v; });
      });
    };
    const req = (r, done) => { r.onsuccess = () => done(r.result); };
    return {
      get persistent() { return persistent; },
      async get(key) { return run('readonly', (s, done) => (s ? req(s.get(key), done) : mem.get(key))); },
      async put(key, value) { if (!await run('readwrite', s => { if (s) s.put(value, key); else mem.set(key, value); return true; })) throw new Error('not stored'); },
      async del(key) { await run('readwrite', s => { if (s) s.delete(key); else mem.delete(key); }); },
      async keys(prefix = '') {
        return run('readonly', (s, done) => {
          if (!s) return [...mem.keys()].filter(k => k.startsWith(prefix));
          req(s.getAllKeys(prefix ? IDBKeyRange.bound(prefix, `${prefix}￿`) : undefined), done);
        });
      },
      async clear() { await run('readwrite', s => { if (s) s.clear(); else mem.clear(); }); }
    };
  })();

  /* ── loading the libraries, once ────────────────────────────────────────── */
  const loaded = {};
  const loadOnce = (name, fn) => (loaded[name] ||= fn().catch(e => { delete loaded[name]; throw e; }));
  const libError = (what, e) => Object.assign(new Error(`${what} could not be loaded (${e && e.message ? e.message : 'network error'}). Check your connection, or host the libraries yourself — see the README.`), { lib: true });

  const loadScript = url => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url; s.async = true;
    s.onload = () => resolve(); s.onerror = () => reject(new Error(`could not fetch ${url}`));
    document.head.appendChild(s);
  });

  const loadPdfjs = () => loadOnce('pdfjs', async () => {
    const u = libUrls();
    try {
      const lib = await import(u.pdfjs);
      /* a cross-origin worker script cannot be started directly; a tiny same-origin module that imports it can */
      let port = null;
      try { port = new Worker(URL.createObjectURL(new Blob([`import ${JSON.stringify(new URL(u.pdfjsWorker, location.href).href)};`], { type: 'text/javascript' })), { type: 'module' }); } catch { port = null; }
      if (port) lib.GlobalWorkerOptions.workerPort = port; else lib.GlobalWorkerOptions.workerSrc = u.pdfjsWorker;
      return lib;
    } catch (e) { throw libError('The PDF reader', e); }
  });

  const loadTesseract = () => loadOnce('tesseract', async () => {
    try { if (!window.Tesseract) await loadScript(libUrls().tesseract); if (!window.Tesseract) throw new Error('not available'); return window.Tesseract; }
    catch (e) { throw libError('The OCR engine', e); }
  });

  /* one OCR worker per language set, shared by the files of one batch; release() frees its memory */
  let ocr = null;
  const ocrState = { onProgress: null };
  async function ocrWorker(langs) {
    const key = normalizeLangs(langs).join('+');
    if (ocr && ocr.key === key) return ocr.worker;
    await release();
    const T = await loadTesseract(), u = libUrls();
    const opts = { workerPath: u.tesseractWorker, logger: m => ocrState.onProgress?.(m) };
    if (u.tesseractCore) opts.corePath = u.tesseractCore;
    if (u.langPath) opts.langPath = u.langPath;
    try {
      const worker = await T.createWorker(key, 1, opts);
      ocr = { key, worker };
      return worker;
    } catch (e) { throw libError('The OCR engine or its language data', e); }
  }
  async function release() {
    const o = ocr; ocr = null;
    if (o) { try { await o.worker.terminate(); } catch { /* already gone */ } }
  }

  async function ocrCanvas(canvas, langs, step) {
    const worker = await ocrWorker(langs);
    ocrState.onProgress = m => { if (m && m.status === 'recognizing text' && typeof m.progress === 'number') step(m.progress); };
    try {
      const { data } = await worker.recognize(canvas);
      return { text: data.text || '', confidence: Math.round(data.confidence || 0) };
    } finally { ocrState.onProgress = null; }
  }

  async function inflateRaw(raw) {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open compressed Word files. Use a current Chrome, Edge, Firefox or Safari.');
    const out = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(out).arrayBuffer());
  }

  const cancelled = signal => { if (signal && signal.cancelled) throw Object.assign(new Error('Stopped.'), { cancelled: true }); };
  const clip = (text, notes) => { if (text.length > MAX_CHARS) { notes.push(`Only the first ${MAX_CHARS.toLocaleString('en-IN')} characters are kept.`); return text.slice(0, MAX_CHARS); } return text; };

  async function imageToCanvas(file) {
    let bmp;
    try { bmp = await createImageBitmap(file); } catch { throw new Error('This browser could not open that image. Save it as PNG or JPG and try again.'); }
    const longest = Math.max(bmp.width, bmp.height), scale = longest > 4000 ? 4000 / longest : 1;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale));
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);          // a transparent PNG would otherwise be read as black
    g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return c;
  }

  /* ── reading one file ───────────────────────────────────────────────────────
     readFile(file, { langs, signal, onProgress }) → { text, method, pages, ocrPages, langs, confidence, notes }
     method: 'text' | 'docx' | 'pdf-text' | 'ocr' | 'pdf-ocr' | 'pdf-mixed'. `signal.cancelled = true` stops it between pages. */
  async function readFile(file, { langs = ['eng'], signal = null, onProgress = () => {} } = {}) {
    const k = kindOf(file.name, file.type);
    if (k.kind === 'unsupported') throw new Error(k.reason);
    if (file.size > MAX_FILE_BYTES) throw new Error(`This file is ${(file.size / 1048576).toFixed(0)} MB; the limit is ${MAX_FILE_BYTES / 1048576} MB.`);
    const ls = normalizeLangs(langs), notes = [], progress = (label, fraction) => onProgress({ label, fraction: Math.max(0, Math.min(1, fraction || 0)) });
    const result = (text, method, extra = {}) => {
      const t = TM.cleanText(clip(text, notes));
      return { text: t, method, pages: 0, ocrPages: 0, langs: ls, confidence: 0, ...extra, notes };
    };

    if (k.kind === 'text') { progress('Reading the file', 0.5); return result(decodeText(new Uint8Array(await file.arrayBuffer())), 'text'); }

    if (k.kind === 'docx') {
      progress('Reading the Word file', 0.3);
      return result(await TM.docxText(new Uint8Array(await file.arrayBuffer()), inflateRaw), 'docx');
    }

    if (k.kind === 'image') {
      progress('Preparing the image', 0.05);
      const canvas = await imageToCanvas(file);
      cancelled(signal);
      progress(`Loading OCR for ${langLabel(ls)}`, 0.1);
      const r = await ocrCanvas(canvas, ls, f => progress(`Reading the image (${langLabel(ls)})`, 0.2 + f * 0.8));
      if (!r.text.trim()) notes.push('No text could be made out in this image.');
      return result(r.text, 'ocr', { pages: 1, ocrPages: 1, confidence: r.confidence });
    }

    /* PDF */
    progress('Opening the PDF', 0.02);
    const pdfjs = await loadPdfjs();
    let pdf;
    try { pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; }
    catch (e) { throw new Error(e && e.name === 'PasswordException' ? 'This PDF is password-protected. Remove the password and try again.' : 'This PDF could not be opened. It may be damaged.'); }
    const total = Math.min(pdf.numPages, MAX_PAGES);
    if (pdf.numPages > MAX_PAGES) notes.push(`Only the first ${MAX_PAGES} of ${pdf.numPages} pages were read.`);
    const pages = [];
    let ocrPages = 0, ocrSkipped = 0, textPages = 0, confSum = 0;
    for (let p = 1; p <= total; p++) {
      cancelled(signal);
      progress(`Page ${p} of ${total}`, 0.05 + 0.9 * ((p - 1) / total));
      const page = await pdf.getPage(p);
      let text = joinPdfItems((await page.getTextContent()).items), ocrUsed = false;
      if (looksScanned(text)) {
        if (ocrPages >= MAX_OCR_PAGES) { ocrSkipped++; text = ''; }
        else {
          const vp0 = page.getViewport({ scale: 1 }), scale = Math.min(3, Math.max(1.5, 2200 / Math.max(vp0.width, vp0.height)));
          const vp = page.getViewport({ scale }), canvas = document.createElement('canvas');
          canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
          const g = canvas.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: g, viewport: vp }).promise;
          cancelled(signal);
          const base = 0.05 + 0.9 * ((p - 1) / total), span = 0.9 / total;
          const r = await ocrCanvas(canvas, ls, f => progress(`Page ${p} of ${total}: reading the scan (${langLabel(ls)})`, base + span * f));
          text = r.text; ocrUsed = true; ocrPages++; confSum += r.confidence;
          canvas.width = canvas.height = 0;
        }
      }
      if (text.trim() && !ocrUsed) textPages++;
      pages.push(text);
      page.cleanup?.();
    }
    try { await pdf.destroy(); } catch { /* ignore */ }
    if (ocrSkipped) notes.push(`${ocrSkipped} scanned page${ocrSkipped === 1 ? ' was' : 's were'} not read: scanned pages are limited to ${MAX_OCR_PAGES} per file.`);
    const body = pages.map(t => t.trim()).join('\n\n');
    if (!body.trim()) notes.push('No text could be made out in this PDF.');
    const method = ocrPages === 0 ? 'pdf-text' : textPages === 0 ? 'pdf-ocr' : 'pdf-mixed';
    return result(body, method, { pages: total, ocrPages, confidence: ocrPages ? Math.round(confSum / ocrPages) : 0 });
  }

  const METHODS = {
    text: 'text file', docx: 'Word file', 'pdf-text': 'PDF text', ocr: 'OCR', 'pdf-ocr': 'OCR of a scanned PDF', 'pdf-mixed': 'PDF text and OCR of scanned pages', pasted: 'pasted text'
  };

  return { VERSIONS, LANGS, MAX_FILE_BYTES, MAX_CHARS, MAX_OCR_PAGES, METHODS, libUrls, kindOf, normalizeLangs, langLabel, decodeText, joinPdfItems, looksScanned, store, readFile, release };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Extract;
