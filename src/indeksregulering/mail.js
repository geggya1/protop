/** E-postvarsel når et indeksbrev skal sendes til kunden. */

function text(value) {
  return String(value || '').trim();
}

export function indexLetterMessage({
  to = '',
  cc = [],
  name = '',
  companyName = '',
  letterPlain = '',
  period = '',
  subject = '',
} = {}) {
  const who = text(name);
  const company = text(companyName);
  const body = text(letterPlain);
  const copies = (Array.isArray(cc) ? cc : [cc]).map((row) => text(row)).filter(Boolean);
  const subjectLine = text(subject) || `Varsel om indeksregulering${text(period) ? ` ${text(period)}` : ''}`;
  const lines = [
    who ? `Hei ${who},` : 'Hei,',
    '',
    'Vi varsler om indeksregulering etter inngått avtale. Beregningen og grunnlaget står i brevet under.',
    '',
    body,
    '',
    copies.length ? `Kopi: ${copies.join(', ')}` : '',
    'Med vennlig hilsen',
    company,
  ].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== ''));
  return {
    to: text(to),
    cc: copies,
    name: who,
    subject: subjectLine,
    text: lines.join('\n').trim(),
  };
}
