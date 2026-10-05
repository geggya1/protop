import assert from 'node:assert/strict';
import { agreementFilePath, safeAgreementFileName } from './contractFiles.js';

assert.equal(safeAgreementFileName('C1-H-03-001 Oppdragsavtale NS8403.pdf'), 'C1-H-03-001 Oppdragsavtale NS8403.pdf');
assert.match(safeAgreementFileName('weird/name?.pdf'), /weird_name_\.pdf|weird_name/);
const path = agreementFilePath('fam1', 'avtale.pdf', '1-a');
assert.equal(path, 'families/fam1/anbud/contracts/1-a-avtale.pdf');
const a = agreementFilePath('fam1', 'a.pdf', 'batch-0');
const b = agreementFilePath('fam1', 'b.pdf', 'batch-1');
assert.notEqual(a, b);

console.log('contractFiles ok');
