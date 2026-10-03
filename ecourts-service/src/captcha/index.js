import { CaptchaError } from '../errors.js';
import { logger } from '../logger.js';

/* eCourts puts a text CAPTCHA on every CNR search. Solving it is the crux of any
   real integration. This module keeps that concern pluggable so you can start
   with `manual` for a demo and switch to a paid solver for production by changing
   one env var — no other code changes. */

export function getCaptchaSolver(cfg) {
  switch ((cfg.captchaStrategy || 'none').toLowerCase()) {
    case 'manual': return manualSolver();
    case 'twocaptcha': return twoCaptchaSolver(cfg.twoCaptchaKey);
    case 'none':
    default: return noneSolver();
  }
}

function noneSolver() {
  return {
    name: 'none',
    async solve() {
      throw new CaptchaError('CAPTCHA_STRATEGY=none — configure "manual" or "twocaptcha" to run live scrapes');
    }
  };
}

/* Local/demo: print a data-URL of the captcha image and read the answer from
   stdin. Fine for a viva demo, useless at scale. */
function manualSolver() {
  return {
    name: 'manual',
    async solve(imageBase64) {
      process.stderr.write(`\n[captcha] open this data URL and type the text:\n data:image/png;base64,${imageBase64}\n> `);
      return await new Promise(resolve => {
        const onData = d => { process.stdin.off('data', onData); process.stdin.pause(); resolve(String(d).trim()); };
        process.stdin.resume();
        process.stdin.once('data', onData);
      });
    }
  };
}

/* Production: hand the image to 2Captcha's human/OCR solving API. Real endpoints;
   needs a funded TWOCAPTCHA_API_KEY. ~₹0.10–0.50 per solve. */
function twoCaptchaSolver(apiKey) {
  if (!apiKey) logger.warn('CAPTCHA_STRATEGY=twocaptcha but TWOCAPTCHA_API_KEY is empty');
  return {
    name: 'twocaptcha',
    async solve(imageBase64) {
      if (!apiKey) throw new CaptchaError('TWOCAPTCHA_API_KEY not set');
      const inRes = await fetch('https://2captcha.com/in.php', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ key: apiKey, method: 'base64', body: imageBase64, json: '1' })
      }).then(r => r.json());
      if (inRes.status !== 1) throw new CaptchaError('2captcha submit failed', inRes.request);
      const id = inRes.request;
      for (let i = 0; i < 24; i++) { // poll up to ~2 min
        await new Promise(r => setTimeout(r, 5000));
        const res = await fetch(`https://2captcha.com/res.php?key=${apiKey}&action=get&id=${id}&json=1`).then(r => r.json());
        if (res.status === 1) return res.request;
        if (res.request !== 'CAPCHA_NOT_READY') throw new CaptchaError('2captcha solve failed', res.request);
      }
      throw new CaptchaError('2captcha timed out');
    }
  };
}
