export const GAP = '[____]';

export interface ParaSplitResult {
  numbered: boolean;
  paragraphs: Array<{ n: number; text: string }>;
}

const MARKER = /^\s*(?:para(?:graph)?\.?\s*)?(?:\((\d{1,3})\)|(\d{1,3})\s*[.):\-])\s+(?=\S)/i;

export function splitParagraphs(text?: string): ParaSplitResult {
  const raw = String(text ?? '').replace(/\r\n?/g, '\n').slice(0, 200000);
  const found: Array<{ n: number; text: string }> = [];
  let cur: { n: number; text: string } | null = null;
  let last = 0;

  for (const line of raw.split('\n')) {
    const m = MARKER.exec(line);
    const n = m ? Number(m[1] || m[2]) : 0;
    if (m && (cur ? n > last && n <= last + 3 : n >= 1 && n <= 3)) {
      cur = { n, text: line.slice(m[0].length).trim() };
      found.push(cur);
      last = n;
    } else if (cur && line.trim()) {
      cur.text += ` ${line.trim()}`;
    }
  }

  const clip = (ps: Array<{ n: number; text: string }>) =>
    ps.slice(0, 300).map((p) => ({ n: p.n, text: p.text.slice(0, 4000) }));

  if (found.length >= 2) return { numbered: true, paragraphs: clip(found) };

  const blocks = raw
    .split(/\n\s*\n/)
    .map((b) => b.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);

  return { numbered: false, paragraphs: clip(blocks.map((t, i) => ({ n: i + 1, text: t }))) };
}

const cap1 = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export interface ParaReplyRow {
  n: number;
  stance: 'admitted' | 'denied' | 'partly' | 'unknown' | 'legal';
  note?: string;
}

export function paraReplyLine(
  row: ParaReplyRow,
  { doc = 'document', as = 'the Respondent', other = 'the other side' } = {}
): string {
  const n = row.n;
  const note = String(row.note || '').trim();
  const tail = note ? ` ${note}` : '';
  const of = `paragraph ${n} of the ${doc}`;

  switch (row.stance) {
    case 'admitted':
      return `The contents of ${of} are admitted.${tail}`;
    case 'denied':
      return `The contents of ${of} are denied.${tail}`;
    case 'partly':
      return `The contents of ${of} are admitted only to the extent that ${note || GAP}. The rest is denied.`;
    case 'unknown':
      return `The contents of ${of} are not within the knowledge of ${as} and are therefore denied. ${cap1(other)} is put to strict proof thereof.${tail}`;
    case 'legal':
      return `${cap1(of)} contains legal submissions and calls for no reply. To the extent a reply is required, it is denied.${tail}`;
    default:
      return `${cap1(of)}: ${GAP}`;
  }
}

export const paraReplies = (
  rows: ParaReplyRow[],
  opts?: { doc?: string; as?: string; other?: string }
): string => rows.map((r) => paraReplyLine(r, opts)).join('\n\n');

export const tokens = (t?: string): string[] =>
  String(t ?? '').match(/\n|[^\S\n]+|[^\s\p{P}]+|\p{P}/gu) || [];

export interface DiffOp {
  t: 'eq' | 'del' | 'ins';
  text: string;
}

const MAX_CELLS = 6000000;

export function diffText(a?: string, b?: string): DiffOp[] {
  const x = tokens(a);
  const y = tokens(b);
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  let ex = x.length;
  let ey = y.length;
  while (ex > i && ey > i && x[ex - 1] === y[ey - 1]) {
    ex--;
    ey--;
  }

  const A = x.slice(i, ex);
  const B = y.slice(i, ey);
  const ops: DiffOp[] = [];

  const push = (t: 'eq' | 'del' | 'ins', text: string) => {
    if (!text) return;
    const last = ops[ops.length - 1];
    if (last && last.t === t) last.text += text;
    else ops.push({ t, text });
  };

  push('eq', x.slice(0, i).join(''));

  if (A.length && B.length && A.length * B.length <= MAX_CELLS) {
    const w = B.length + 1;
    const L = new Uint16Array((A.length + 1) * w);
    for (let p = A.length - 1; p >= 0; p--) {
      for (let q = B.length - 1; q >= 0; q--) {
        L[p * w + q] =
          A[p] === B[q]
            ? L[(p + 1) * w + q + 1] + 1
            : Math.max(L[(p + 1) * w + q], L[p * w + q + 1]);
      }
    }
    let p = 0;
    let q = 0;
    while (p < A.length && q < B.length) {
      if (A[p] === B[q]) {
        push('eq', A[p]);
        p++;
        q++;
      } else if (L[(p + 1) * w + q] >= L[p * w + q + 1]) {
        push('del', A[p++]);
      } else {
        push('ins', B[q++]);
      }
    }
    while (p < A.length) push('del', A[p++]);
    while (q < B.length) push('ins', B[q++]);
  } else {
    push('del', A.join(''));
    push('ins', B.join(''));
  }

  push('eq', x.slice(ex).join(''));
  return ops;
}
