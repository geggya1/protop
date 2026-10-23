/**
 * Testrapport for GitHub Actions: feil blir annotasjoner (::error), og en
 * oppsummering (::notice), så resultatet kan leses uten å laste ned loggen.
 */
const esc = (s) => String(s ?? '').replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A').slice(0, 1800);

export default async function* ghReporter(source) {
  let pass = 0;
  let fail = 0;
  const failed = [];
  for await (const event of source) {
    if (event.type === 'test:pass' && event.data.details?.type !== 'suite') pass += 1;
    if (event.type === 'test:fail' && event.data.details?.type !== 'suite') {
      fail += 1;
      const err = event.data.details?.error;
      const cause = err?.cause || err;
      const msg = [cause?.message || String(cause || ''), cause?.code ? `(${cause.code})` : ''].join(' ');
      failed.push(event.data.name);
      yield `::error title=${esc(event.data.name)}::${esc(msg)}\n`;
    }
    if (event.type === 'test:diagnostic') yield `${event.data.message}\n`;
  }
  yield `::notice title=Firestore-regler::${pass} bestått, ${fail} feilet${failed.length ? ` – ${esc(failed.join(' | '))}` : ''}\n`;
}
