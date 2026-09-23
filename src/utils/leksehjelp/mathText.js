/**
 * Lettvekts math-tekstparser for Leksehjelpen (uten KaTeX).
 * Støtter ^eksponent, _{indeks}, Unicode-opphøyd og enkle brøker.
 */

const SUP_MAP = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', n: 'ⁿ',
};

const SUB_MAP = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
};

/** Token types: text | sup | sub | frac */
export function tokenizeMath(input) {
  const s = String(input || '');
  if (!s) return [];
  const tokens = [];
  let i = 0;
  let buf = '';

  const flush = () => {
    if (buf) {
      tokens.push({ type: 'text', value: buf });
      buf = '';
    }
  };

  while (i < s.length) {
    const ch = s[i];

    if (ch === '^') {
      flush();
      i += 1;
      if (s[i] === '{') {
        const end = s.indexOf('}', i + 1);
        if (end !== -1) {
          tokens.push({ type: 'sup', value: s.slice(i + 1, end) });
          i = end + 1;
          continue;
        }
      }
      if (s[i]) {
        tokens.push({ type: 'sup', value: s[i] });
        i += 1;
        continue;
      }
    }

    if (ch === '_') {
      flush();
      i += 1;
      if (s[i] === '{') {
        const end = s.indexOf('}', i + 1);
        if (end !== -1) {
          tokens.push({ type: 'sub', value: s.slice(i + 1, end) });
          i = end + 1;
          continue;
        }
      }
      if (s[i] && /[0-9a-zA-Z]/.test(s[i])) {
        tokens.push({ type: 'sub', value: s[i] });
        i += 1;
        continue;
      }
    }

    if (ch === '/' && /\d/.test(s[i - 1] || '') && /\d/.test(s[i + 1] || '')) {
      let start = i - 1;
      while (start > 0 && /\d/.test(s[start - 1])) start -= 1;
      let end = i + 1;
      while (end + 1 < s.length && /\d/.test(s[end + 1])) end += 1;
      const beforeOk = start === 0 || /[\s(=+\-−×*·]/.test(s[start - 1]);
      const afterOk = end === s.length - 1 || /[\s)=+\-−×*·,.]/.test(s[end + 1]);
      if (beforeOk && afterOk) {
        const num = s.slice(start, i);
        if (buf.endsWith(num)) buf = buf.slice(0, -num.length);
        flush();
        tokens.push({ type: 'frac', num, den: s.slice(i + 1, end + 1) });
        i = end + 1;
        continue;
      }
    }

    buf += ch;
    i += 1;
  }
  flush();
  return tokens;
}

export function mathToPlain(input) {
  return tokenizeMath(input).map((t) => {
    if (t.type === 'text') return t.value;
    if (t.type === 'sup') {
      return [...String(t.value)].map((c) => SUP_MAP[c] || `^${c}`).join('');
    }
    if (t.type === 'sub') {
      return [...String(t.value)].map((c) => SUB_MAP[c] || `_${c}`).join('');
    }
    if (t.type === 'frac') return `${t.num}/${t.den}`;
    return '';
  }).join('');
}

/**
 * Del prosa og matte. Gjenkjenner `…`, $…$, og enkle regnestykker / potenser.
 */
export function splitProseAndMath(text) {
  const s = String(text || '');
  if (!s) return [];
  const parts = [];
  const re = /(`[^`]+`|\$[^$]+\$|\b[A-Za-z0-9]+(?:\^\{[^}]+\}|\^[0-9n]|[²³¹⁰⁴⁵⁶⁷⁸⁹])\b|\d+\s*[×*·+\-−÷/∶:]\s*\d+(?:\s*=\s*[−\-]?\d+(?:\.\d+)?)?)/g;
  let last = 0;
  let m = re.exec(s);
  while (m) {
    if (m.index > last) {
      parts.push({ kind: 'prose', text: s.slice(last, m.index) });
    }
    let raw = m[0];
    if ((raw.startsWith('`') && raw.endsWith('`')) || (raw.startsWith('$') && raw.endsWith('$'))) {
      raw = raw.slice(1, -1);
    }
    parts.push({ kind: 'math', text: raw });
    last = m.index + m[0].length;
    m = re.exec(s);
  }
  if (last < s.length) parts.push({ kind: 'prose', text: s.slice(last) });
  return parts.length ? parts : [{ kind: 'prose', text: s }];
}

export function prettyMathOps(s) {
  return String(s || '')
    .replace(/(\d)\s*\*\s*(\d)/g, '$1 × $2')
    .replace(/\bx\b/gi, '×');
}
