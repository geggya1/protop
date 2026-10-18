/** E-postvarsel når et indeksbrev skal sendes til kunden. */

function text(value) {
  return String(value || '').trim();
}

export function indexLetterMessage({
  to = '',
  name = '',
  companyName = '',
  letterPlain = '',
  period = '',
} = {}) {
  const who = text(name);
  const company = text(companyName);
  const body = text(letterPlain);
  const subject = `Varsel om indeksregulering${text(period) ? ` ${text(period)}` : ''}`;
  const lines = [
    who ? `Hei ${who},` : 'Hei,',
    '',
    'Vi varsler om indeksregulering etter inngått avtale. Beregningen og grunnlaget står i brevet under.',
    '',
    body,
    '',
    'Med vennlig hilsen',
    company,
  ].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== ''));
  return {
    to: text(to),
    name: who,
    subject,
    text: lines.join('\n').trim(),
  };
}
