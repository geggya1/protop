import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCompetitionUrl } from './competitionUrl.js';

assert.equal(normalizeCompetitionUrl('https://app.artifik.no/procurements/7808'), 'https://app.artifik.no/procurements/7808');
// Ekte Doffin-verdier som ble avvist før.
assert.equal(normalizeCompetitionUrl('http://permalink.mercell.com/290423823.aspx'), 'https://permalink.mercell.com/290423823.aspx');
assert.equal(
  normalizeCompetitionUrl('http://eu.eu-supply.com/app/rfq/rwlentrance_s.asp?PID=364369&B=VEGVESEN'),
  'https://eu.eu-supply.com/app/rfq/rwlentrance_s.asp?PID=364369&B=VEGVESEN',
);
assert.equal(normalizeCompetitionUrl('Innherred Anskaffelser -'), '');
assert.equal(normalizeCompetitionUrl('  https://tendsign.com/doc.aspx?MeFormsNoticeId=102198 '), 'https://tendsign.com/doc.aspx?MeFormsNoticeId=102198');
assert.equal(normalizeCompetitionUrl('Dokumentene finnes på www.mercell.com/m/tender/1.aspx.'), 'https://www.mercell.com/m/tender/1.aspx');
assert.equal(normalizeCompetitionUrl({ nor: 'https://hyyr.no/k/1' }), 'https://hyyr.no/k/1');
assert.equal(normalizeCompetitionUrl(['', 'https://hyyr.no/k/2']), 'https://hyyr.no/k/2');
assert.equal(normalizeCompetitionUrl(''), '');
assert.equal(normalizeCompetitionUrl(null), '');
assert.equal(normalizeCompetitionUrl('mailto:post@example.no'), '');

const deployed = readFileSync(new URL('../../functions/anbud/competitionUrl.js', import.meta.url), 'utf8');
const source = readFileSync(new URL('./competitionUrl.js', import.meta.url), 'utf8');
assert.equal(deployed, source);

console.log('competitionUrl.test.mjs ok');
