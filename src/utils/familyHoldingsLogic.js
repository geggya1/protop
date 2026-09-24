/**
 * Pure kjøretøy-hjelpere (uten Firebase).
 */

export const HOLDING_KINDS = [
  { id: 'vehicle', label: 'Kjøretøy', emoji: '🚗' },
  { id: 'item', label: 'Ting i boligen', emoji: '📦' },
];

export const VEHICLE_TYPES = [
  { id: 'car', label: 'Personbil', emoji: '🚗' },
  { id: 'van', label: 'Varebil', emoji: '🚐' },
  { id: 'motorcycle', label: 'Motorsykkel', emoji: '🏍️' },
  { id: 'moped', label: 'Moped', emoji: '🛵' },
  { id: 'bicycle', label: 'Sykkel', emoji: '🚲' },
  { id: 'escooter', label: 'El-sparkesykkel', emoji: '🛴' },
  { id: 'trailer', label: 'Tilhenger', emoji: '🚛' },
  { id: 'boat', label: 'Båt', emoji: '⛵' },
  { id: 'other', label: 'Annet', emoji: '🚗' },
];

export const VEHICLE_FUELS = [
  { id: 'petrol', label: 'Bensin' },
  { id: 'diesel', label: 'Diesel' },
  { id: 'electric', label: 'El' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'other', label: 'Annet' },
];

export const VEHICLE_LOG_KINDS = [
  { id: 'fuel', label: 'Drivstoff' },
  { id: 'cost', label: 'Kostnad' },
  { id: 'service', label: 'Service' },
];

/** Kvittering / kjøpsbevis / dokumentasjon knyttet til kjøretøy. */
export const HOLDING_DOC_KINDS = [
  { id: 'receipt', label: 'Kvittering', emoji: '🧾' },
  { id: 'purchase', label: 'Kjøpsbevis', emoji: '🛍️' },
  { id: 'proof', label: 'Eierskapsbevis', emoji: '📄' },
  { id: 'other', label: 'Dokumentasjon', emoji: '📎' },
];

const MOTOR_TYPES = new Set(['car', 'van', 'motorcycle', 'moped']);
const LIGHT_TYPES = new Set(['bicycle', 'escooter']);

export const HOLDINGS_HUB_BLURB =
  'Bil, sykkel, båt og mer. Åpne et kjøretøy for bilde og oversikt — pluss for service/kvittering, blyant for standard opplysninger.';

function typeMeta(type) {
  return VEHICLE_TYPES.find((t) => t.id === type) || VEHICLE_TYPES[0];
}

/** Hvilke felt som vises for valgt kjøretøytype. */
export function vehicleFormConfig(vehicleType) {
  const type = vehicleType || 'car';
  const meta = typeMeta(type);
  const motor = MOTOR_TYPES.has(type);
  const light = LIGHT_TYPES.has(type);
  const boat = type === 'boat';
  const trailer = type === 'trailer';
  const bicycle = type === 'bicycle';
  const escooter = type === 'escooter';
  const other = type === 'other';

  let fuels = [];
  if (motor || trailer || other) fuels = VEHICLE_FUELS;
  else if (escooter) fuels = VEHICLE_FUELS.filter((f) => f.id === 'electric' || f.id === 'other');
  else if (boat) fuels = VEHICLE_FUELS.filter((f) => f.id !== 'hybrid');

  const logKinds = (motor || boat || other)
    ? VEHICLE_LOG_KINDS
    : VEHICLE_LOG_KINDS.filter((k) => k.id !== 'fuel');

  let formHint = `Viser felt for ${meta.label.toLowerCase()}.`;
  if (motor) formHint = 'Drivstoff, skiltoppslag, kilometerstand og EU-kontroll for bil/MC.';
  else if (bicycle) formHint = 'Sykkel: rammenummer, kjøpsdato og dokumentasjon — ikke skilt, km, drivstoff eller EU.';
  else if (escooter) formHint = 'El-sparkesykkel: energi, merke og kjøpsdato — ikke EU-kontroll eller kilometerstand.';
  else if (boat) formHint = 'Båt: drivstoff, merking og motortimer — ikke EU-kontroll.';
  else if (trailer) formHint = 'Tilhenger: skilt, kilometerstand og EU-kontroll.';
  else if (other) formHint = 'Annet kjøretøy: drivstoff og frister er valgfritt.';

  return {
    type,
    typeLabel: meta.label,
    typeEmoji: meta.emoji,
    formHint,
    basicsLabel: bicycle
      ? 'Om sykkelen'
      : boat
        ? 'Om båten'
        : escooter
          ? 'Om sparkesykkelen'
          : trailer
            ? 'Om tilhengeren'
            : 'Om kjøretøyet',
    showRegLookup: motor || trailer,
    showRegField: true,
    regLabel: boat
      ? 'Registreringsnr / merking'
      : light
        ? 'Rammenummer (valgfritt)'
        : 'Registreringsnummer',
    regPlaceholder: boat
      ? 'F.eks. merking eller reg.nr'
      : light
        ? 'F.eks. rammenummer'
        : 'F.eks. EL12345',
    showFuel: fuels.length > 0,
    fuels,
    fuelLabel: boat || escooter ? 'Drivstoff / energi' : 'Drivstoff',
    showMileage: motor || trailer || boat,
    mileageLabel: boat ? 'Motortimer (valgfritt)' : 'Kilometerstand',
    mileagePlaceholder: boat ? 'F.eks. 420' : 'Kilometerstand',
    showEu: motor || trailer,
    showInsurance: true,
    showService: motor || boat || trailer || other || light,
    serviceNextLabel: light ? 'Neste service / sjekk (ÅÅÅÅ-MM-DD)' : 'Neste service (ÅÅÅÅ-MM-DD)',
    serviceLastLabel: light ? 'Siste service / sjekk (ÅÅÅÅ-MM-DD)' : 'Siste service (ÅÅÅÅ-MM-DD)',
    showTires: motor || light || trailer,
    tireLabel: light ? 'Hjul / dekk (størrelse)' : 'Dekk (sommer/vinter, dimensjon)',
    showPurchaseDate: light || boat || other,
    makePlaceholder: bicycle
      ? 'Merke (f.eks. Trek)'
      : boat
        ? 'Merke (f.eks. Jeanneau)'
        : escooter
          ? 'Merke (f.eks. Xiaomi)'
          : 'Merke',
    modelPlaceholder: bicycle ? 'Modell (f.eks. Marlin 7)' : 'Modell',
    yearPlaceholder: 'Årsmodell',
    logKinds,
    defaultLogKind: logKinds.some((k) => k.id === 'fuel') ? 'fuel' : 'cost',
    logSectionLabel: fuels.length > 0 ? 'Drivstoff og kostnader' : 'Kostnader og vedlikehold',
    titlePlaceholder: bicycle
      ? 'Kallenavn (f.eks. Vanessas sykkel)'
      : boat
        ? 'Kallenavn (f.eks. Sjøbussen)'
        : escooter
          ? 'Kallenavn (f.eks. Sparkesykkelen)'
          : trailer
            ? 'Kallenavn (f.eks. Tilhengeren)'
            : 'Kallenavn (f.eks. Familiebilen)',
    defaultTitle: bicycle
      ? 'Sykkel'
      : boat
        ? 'Båt'
        : escooter
          ? 'El-sparkesykkel'
          : trailer
            ? 'Tilhenger'
            : '',
    hubBlurb: HOLDINGS_HUB_BLURB,
  };
}

export function isVehicleHolding(h) {
  if (!h || h.kind === 'home' || h.kind === 'item') return false;
  if (h.kind === 'vehicle') return true;
  return !!(h.regNumber || h.make || h.model);
}

export function isHomeItemHolding(h) {
  if (!h || h.kind === 'home' || h.kind === 'vehicle') return false;
  if (h.kind === 'item') return true;
  return !h.regNumber && !h.make && !h.model;
}

export function vehicleTypeMeta(h) {
  return VEHICLE_TYPES.find((t) => t.id === h?.vehicleType) || VEHICLE_TYPES[0];
}

export function dueTone(dateKey, todayKey = new Date().toISOString().slice(0, 10)) {
  if (!dateKey) return null;
  if (dateKey < todayKey) return 'overdue';
  const soon = new Date(`${todayKey}T12:00:00`);
  soon.setDate(soon.getDate() + 45);
  if (dateKey <= soon.toISOString().slice(0, 10)) return 'soon';
  return 'ok';
}

export function vehicleDeadlines(h, todayKey = new Date().toISOString().slice(0, 10)) {
  const cfg = vehicleFormConfig(h?.vehicleType);
  const rows = [];
  if (cfg.showEu) rows.push({ id: 'eu', label: 'EU-kontroll', dateKey: h?.euControlKey || null });
  if (cfg.showInsurance) rows.push({ id: 'insurance', label: 'Forsikring', dateKey: h?.insuranceKey || null });
  if (cfg.showService) rows.push({ id: 'service', label: 'Service', dateKey: h?.nextServiceKey || null });
  return rows
    .filter((d) => d.dateKey)
    .map((d) => ({ ...d, tone: dueTone(d.dateKey, todayKey) }))
    .sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));
}

export function cleanVehicleLogs(logs) {
  if (!Array.isArray(logs)) return [];
  return logs
    .map((l) => ({
      id: String(l?.id || '').trim() || `log_${Math.random().toString(36).slice(2, 8)}`,
      kind: VEHICLE_LOG_KINDS.some((k) => k.id === l?.kind) ? l.kind : 'cost',
      dateKey: String(l?.dateKey || '').trim() || null,
      amount: l?.amount != null && l.amount !== '' ? Number(l.amount) : null,
      liters: l?.liters != null && l.liters !== '' ? Number(l.liters) : null,
      km: l?.km != null && l.km !== '' ? Number(l.km) : null,
      note: String(l?.note || '').trim(),
    }))
    .filter((l) => l.dateKey || l.amount != null || l.note);
}

export function cleanHoldingDocuments(docs) {
  if (!Array.isArray(docs)) return [];
  return docs
    .map((d) => ({
      id: String(d?.id || '').trim() || `doc_${Math.random().toString(36).slice(2, 8)}`,
      kind: HOLDING_DOC_KINDS.some((k) => k.id === d?.kind) ? d.kind : 'other',
      name: String(d?.name || '').trim() || 'Dokument',
      mimeType: String(d?.mimeType || '').trim() || null,
      size: d?.size != null && d.size !== '' ? Number(d.size) : null,
      storagePath: String(d?.storagePath || '').trim() || null,
      downloadUrl: String(d?.downloadUrl || d?.url || '').trim() || null,
      uploadedBy: d?.uploadedBy || null,
      uploadedAt: d?.uploadedAt || null,
    }))
    .filter((d) => d.downloadUrl || d.storagePath);
}

export function vehicleLogTotal(logs, kind = null) {
  return (logs || [])
    .filter((l) => !kind || l.kind === kind)
    .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
}

export function vehicleSummaryLine(h) {
  const type = vehicleTypeMeta(h);
  const parts = [
    type.id !== 'car' ? type.label : null,
    [h.make, h.model].filter(Boolean).join(' '),
    h.year,
    h.regNumber,
  ].filter(Boolean);
  return parts.join(' · ');
}
