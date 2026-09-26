import assert from 'node:assert/strict';
import {
  allowedCatalogUrl,
  interestUrlFromDocs,
  parseMercellCatalog,
  readPortalCatalog,
} from './portalCatalog.js';

const html = `
<td id="ctl00_main_rpFiles_ctl01_tdWantToDownload">
  <a href="javascript:__doPostBack('x','')">Tegninger - UNN Narvik Sykehus.zip</a></td>
  <td class="right">24,72 MB</td>
<td id="ctl00_main_rpFiles_ctl02_tdWantToDownload">
  <a href="javascript:__doPostBack('y','')">HMS egenerklæring.doc</a></td>
  <td class="right">52 KB</td>
<td id="ctl00_main_rDynamicDocuments_ctl01_tdWantToDownload">
  <a href="javascript:__doPostBack('z','')">Regler for konkurransegjennomføring</a></td>
`;

const parsed = parseMercellCatalog(html, 'https://permalink.mercell.com/289669037.aspx');
assert.equal(parsed.files.length, 3);
assert.equal(parsed.files[0].name, 'Tegninger - UNN Narvik Sykehus.zip');
assert.equal(parsed.files[0].size, '24,72 MB');
assert.equal(parsed.files[0].access, 'portal');
assert.equal(parsed.files[2].name, 'Regler for konkurransegjennomføring');
assert.match(parsed.interestUrl, /^https:\/\/my\.mercell\.com\/nb-no\/m\/logon\/\?ReturnUrl=/);
assert.match(decodeURIComponent(parsed.interestUrl), /Tender\.aspx\?id=289669037/);
assert.equal(interestUrlFromDocs('https://example.test/1'), '');
assert.equal(allowedCatalogUrl('https://permalink.mercell.com/289669037.aspx'), true);
assert.equal(allowedCatalogUrl('https://evil.example/mercell.com/1'), false);
assert.equal(allowedCatalogUrl('http://permalink.mercell.com/1.aspx'), false);

const live = await readPortalCatalog('https://permalink.mercell.com/289669037.aspx');
assert.equal(live.ok, true);
assert.ok(live.files.some((file) => /Narvik Sykehus\.zip/.test(file.name)), 'forventet filnavn fra den offentlige Mercell-siden');
assert.match(live.interestUrl, /289669037/);
console.log(`Mercell ${live.tenderId}: ${live.files.length} filer, først ${live.files[0].name}`);
