/**
 * Produktsalg-listen: salg fra produktkatalogen, import og timelisten.
 * Siden viser hele registeret. scope «mine» begrenser til innlogget ansatt
 * og salg uten ansatt.
 */
import { normalizeSale, SALE_STATUSES } from './products.js';

export function saleStatusLabel(status) {
  return SALE_STATUSES.find((row) => row.id === status)?.label || 'Utkast';
}

export function productSalesForViewer(sales = [], employeeId = '', { scope = 'company' } = {}) {
  const id = String(employeeId || '').trim();
  return (sales || [])
    .map((row) => normalizeSale(row))
    .filter((row) => row.name)
    .filter((row) => scope !== 'mine' || !id || !row.employeeId || row.employeeId === id)
    .sort((a, b) => (
      String(b.date).localeCompare(String(a.date))
      || String(a.name).localeCompare(String(b.name), 'nb')
    ));
}

export function filterProductSales(rows = [], query = '', status = '') {
  const q = String(query || '').trim().toLowerCase();
  const statusId = String(status || '').trim();
  return rows.filter((row) => {
    if (statusId && row.status !== statusId) return false;
    if (!q) return true;
    const hay = [
      row.date,
      row.name,
      row.sku,
      row.customerName,
      row.customerNumber,
      row.projectName,
      row.projectNumber,
      row.employeeName,
      row.title,
      row.comment,
      row.activityName,
      row.department,
      row.productGroup,
      saleStatusLabel(row.status),
      String(row.quantity),
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}
