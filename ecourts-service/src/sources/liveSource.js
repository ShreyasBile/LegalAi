import { parseCaseStatus } from './parser.js';
import { getCaptchaSolver } from '../captcha/index.js';
import { SourceUnavailableError } from '../errors.js';
import { logger } from '../logger.js';

/* Live eCourts scraper. Isolated behind the same fetchCase(cnr) interface as the
   fixture source, and it hands the scraped HTML to the SAME parser — so the
   fixture tests validate this path's parsing too. Playwright is imported lazily
   so the service and its whole test suite run with zero dependencies unless you
   actually opt into live mode (ECOURTS_SOURCE=live + `npm i playwright`).

   NOTE: the CSS selectors below target eCourts Services v6. When eCourts ships a
   "Phase" upgrade these are what you update — and the fixture drift test + the
   /health/source check are what tell you it's time. */

export function createLiveSource(cfg) {
  const captcha = getCaptchaSolver(cfg);
  let browserPromise = null;

  async function getBrowser() {
    if (!browserPromise) {
      browserPromise = (async () => {
        let chromium;
        try { ({ chromium } = await import('playwright')); }
        catch { throw new SourceUnavailableError('playwright not installed — run `npm i playwright` to use live mode'); }
        return chromium.launch({ headless: cfg.headless });
      })();
    }
    return browserPromise;
  }

  async function fetchCase(cnr) {
    const browser = await getBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(cfg.timeoutMs);
    try {
      await page.goto(`${cfg.baseUrl}/?p=cnr_status/index`, { waitUntil: 'domcontentloaded' });
      await page.fill('#cino', cnr);

      // read the captcha image and solve it
      const imgBase64 = await page.$eval('#captcha_image', img => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        return c.toDataURL('image/png').split(',')[1];
      }).catch(() => { throw new SourceUnavailableError('captcha image not found — page markup may have changed'); });

      const answer = await captcha.solve(imgBase64);
      await page.fill('#fcaptcha_code', answer);
      await page.click('#searchbtn');

      await page.waitForSelector('.case_details_table, .alert-danger-cust, #history_cnr', { timeout: cfg.timeoutMs })
        .catch(() => { throw new SourceUnavailableError('no result panel after search (timeout / captcha rejected)'); });

      const html = await page.content();
      return parseCaseStatus(html); // shared parser: found / not-found / ParseError(drift)
    } catch (err) {
      if (err instanceof SourceUnavailableError) throw err;
      if (err?.name === 'TimeoutError') throw new SourceUnavailableError('eCourts timed out', { cnr });
      throw err;
    } finally {
      await context.close().catch(() => {});
    }
  }

  async function selfCheck() {
    // Verify the browser can launch; parsing correctness is covered by the
    // shared fixture self-test, so we don't hammer eCourts on every healthcheck.
    try { await getBrowser(); return true; }
    catch (e) { logger.error('live selfCheck failed', { err: e.message }); throw e; }
  }

  async function close() {
    if (browserPromise) { const b = await browserPromise.catch(() => null); await b?.close?.(); browserPromise = null; }
  }

  return { name: 'live', fetchCase, selfCheck, close, captchaStrategy: captcha.name };
}
