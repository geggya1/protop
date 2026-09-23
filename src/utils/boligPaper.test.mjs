import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addMonthsToDateKey,
  cleanBoligEntries,
  formatBoligPaperLine,
  suggestBoligPaperFromBilag,
} from './boligPaper.js';

describe('boligPaper', () => {
  it('preserves file fields when cleaning entries', () => {
    const cleaned = cleanBoligEntries([{
      id: 'e1',
      kind: 'receipt',
      title: 'Kvittering bad',
      downloadUrl: 'https://example.com/a.pdf',
      storagePath: 'families/f1/bolig-files/b1/a.pdf',
      mimeType: 'application/pdf',
      fileName: 'a.pdf',
      size: 1234,
      warrantyUntil: '2028-01-01',
      warrantyMonths: 24,
      warrantyText: '2 års garanti',
      supplier: 'Byggmakker',
      amount: 1999,
      currency: 'NOK',
      notes: 'Fliser',
      dateKey: '2026-01-15',
    }]);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].downloadUrl, 'https://example.com/a.pdf');
    assert.equal(cleaned[0].storagePath, 'families/f1/bolig-files/b1/a.pdf');
    assert.equal(cleaned[0].mimeType, 'application/pdf');
    assert.equal(cleaned[0].fileName, 'a.pdf');
    assert.equal(cleaned[0].size, 1234);
    assert.equal(cleaned[0].warrantyUntil, '2028-01-01');
    assert.equal(cleaned[0].warrantyMonths, 24);
    assert.equal(cleaned[0].supplier, 'Byggmakker');
    assert.equal(cleaned[0].amount, 1999);
  });

  it('keeps file-only entries without manual title', () => {
    const cleaned = cleanBoligEntries([{
      kind: 'receipt',
      downloadUrl: 'https://example.com/x.jpg',
      storagePath: 'path/x.jpg',
      fileName: 'kvittering.jpg',
    }]);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].title, 'kvittering.jpg');
    assert.ok(cleaned[0].downloadUrl);
  });

  it('suggests title, notes and warranty from OCR bilag', () => {
    const s = suggestBoligPaperFromBilag({
      supplier: 'Elkjøp',
      category: 'hvitevarer',
      date: '2026-03-01',
      amount: 4990,
      currency: 'NOK',
      lineItems: [{ description: 'Oppvaskmaskin' }],
      warrantyMonths: 24,
      warrantyText: '2 års garanti',
      notes: 'Kjøpt i butikk',
    });
    assert.match(s.title, /Elkjøp/);
    assert.match(s.notes, /Oppvaskmaskin/);
    assert.equal(s.warrantyMonths, 24);
    assert.equal(s.warrantyUntil, '2028-03-01');
    assert.equal(s.dateKey, '2026-03-01');
  });

  it('formats paper line with file and warranty', () => {
    const line = formatBoligPaperLine({
      kind: 'receipt',
      title: 'Bad',
      downloadUrl: 'https://x',
      warrantyUntil: '2027-01-01',
      amount: 100,
      currency: 'NOK',
    });
    assert.match(line, /Bad/);
    assert.match(line, /fil/);
    assert.match(line, /garanti til 2027-01-01/);
  });

  it('adds months to date key', () => {
    assert.equal(addMonthsToDateKey('2026-01-15', 1), '2026-02-15');
    assert.equal(addMonthsToDateKey('2026-03-01', 24), '2028-03-01');
    assert.equal(addMonthsToDateKey('bad', 12), '');
  });
});
