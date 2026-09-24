import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  emptyBilag,
  filterDocumentFiles,
  formatBilagAmount,
  isReceiptFile,
  sortFilesForDocumentList,
} from './documentBilag.js';

describe('documentBilag', () => {
  it('formats NOK amounts', () => {
    const s = formatBilagAmount(64, 'NOK');
    assert.match(s, /64/);
    assert.equal(formatBilagAmount(null), '—');
  });

  it('filters by supplier and amount tokens', () => {
    const files = [
      { id: '1', name: 'a', kind: 'receipt', bilag: { supplier: 'Kiwi', amount: 129.9, date: '2026-09-01' } },
      { id: '2', name: 'b', kind: 'receipt', bilag: { supplier: 'Shell', amount: 640, date: '2026-09-02' } },
      { id: '3', name: 'pdf.pdf', kind: 'file', bilag: null },
    ];
    assert.equal(filterDocumentFiles(files, 'kiwi').length, 1);
    assert.equal(filterDocumentFiles(files, '640').length, 1);
    assert.equal(filterDocumentFiles(files, 'shell 2026').length, 1);
    assert.equal(filterDocumentFiles(files, '').length, 3);
  });

  it('sorts receipts by date desc then amount', () => {
    const files = [
      { id: '1', bilag: { supplier: 'A', amount: 10, date: '2026-09-01' }, kind: 'receipt', updatedAt: 1 },
      { id: '2', bilag: { supplier: 'B', amount: 50, date: '2026-09-03' }, kind: 'receipt', updatedAt: 2 },
      { id: '3', bilag: { supplier: 'C', amount: 20, date: '2026-09-03' }, kind: 'receipt', updatedAt: 3 },
    ];
    const sorted = sortFilesForDocumentList(files);
    assert.equal(sorted[0].id, '2');
    assert.equal(sorted[1].id, '3');
    assert.equal(sorted[2].id, '1');
  });

  it('detects receipt files', () => {
    assert.equal(isReceiptFile({ kind: 'receipt' }), true);
    assert.equal(isReceiptFile({ bilag: { supplier: 'X' } }), true);
    assert.equal(isReceiptFile({ name: 'x.pdf' }), false);
    assert.deepEqual(emptyBilag({ supplier: 'Test' }).supplier, 'Test');
  });
});
