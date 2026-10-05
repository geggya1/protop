import assert from 'node:assert/strict';
import { agreementFilePath, safeAgreementFileName } from './contractFiles.js';

assert.equal(safeAgreementFileName('C1-H-03-001 Oppdragsavtale NS8403.pdf'), 'C1-H-03-001 Oppdragsavtale NS8403.pdf');
assert.match(safeAgreementFileName('weird/name?.pdf'), /weird_name_\.pdf|weird_name/);
const path = agreementFilePath('fam1', 'avtale.pdf');
assert.match(path, /^families\/fam1\/anbud\/contracts\/\d+-avtale\.pdf$/);

console.log('contractFiles ok');
