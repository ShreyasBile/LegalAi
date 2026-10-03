import { config } from './config.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

/* Structured JSON-line logging to stdout/stderr. In production you'd ship these
   to a log aggregator; the `alert` helper is where a real deploy would page you. */
function emit(level, msg, fields) {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const logger = {
  debug: (msg, fields = {}) => emit('debug', msg, fields),
  info: (msg, fields = {}) => emit('info', msg, fields),
  warn: (msg, fields = {}) => emit('warn', msg, fields),
  error: (msg, fields = {}) => emit('error', msg, fields),
  /* Explicit "a human should look at this" signal. Wired to logs here; swap for
     PagerDuty/Slack/email in production. Used for markup drift + shape failures. */
  alert: (msg, fields = {}) => emit('error', `ALERT: ${msg}`, { alert: true, ...fields })
};
