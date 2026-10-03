/* Typed errors so the HTTP layer can map failures to the right status code and
   decide what to log/alert on. */

export class SourceUnavailableError extends Error {
  constructor(message, detail) { super(message); this.name = 'SourceUnavailableError'; this.detail = detail; }
}
export class CaptchaError extends Error {
  constructor(message, detail) { super(message); this.name = 'CaptchaError'; this.detail = detail; }
}
export class ValidationError extends Error {
  constructor(message, detail) { super(message); this.name = 'ValidationError'; this.detail = detail; }
}
export { ParseError } from './sources/parser.js';
