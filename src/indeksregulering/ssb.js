import { INDEX_SERIES, SSB_FETCHES, seriesById } from './catalog.js';

const API = 'https://data.ssb.no/api/pxwebapi/v2/tables';

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((line) => line.some((value) => String(value).trim() !== ''));
}

/** Bred CSV fra PxWeb: kodekolonner først, deretter én kolonne per periode. */
export function parseSsbCsv(csv) {
  const table = parseCsv(csv);
  if (table.length < 2) return [];
  const header = table[0];
  const periodCols = [];
  const codeCols = [];
  header.forEach((cell, index) => {
    const match = String(cell).match(/(\d{4}M\d{2}|\d{4}K[1-4])/);
    if (match) periodCols.push({ index, period: match[1] });
    else codeCols.push(index);
  });
  return table.slice(1).map((line) => {
    const values = {};
    periodCols.forEach(({ index, period }) => {
      const raw = String(line[index] ?? '').trim().replace(/\s/g, '').replace(',', '.');
      if (!raw || raw === '.' || raw === '..') return;
      const value = Number(raw);
      if (Number.isFinite(value)) values[period] = value;
    });
    return {
      codes: codeCols.map((index) => String(line[index] ?? '').trim()).filter(Boolean),
      values,
    };
  }).filter((line) => Object.keys(line.values).length);
}

export function pointsFromValues(values) {
  return Object.entries(values)
    .map(([period, value]) => ({ period, value }))
    .sort((a, b) => (a.period < b.period ? -1 : 1));
}

export function latestPoint(points) {
  if (!points?.length) return null;
  return points[points.length - 1];
}

function fetchUrl(spec) {
  const params = new URLSearchParams();
  params.set('lang', 'no');
  params.set('outputFormat', 'csv');
  params.set('outputFormatParams', 'usecodes');
  spec.dims.forEach((dim) => params.append(`valueCodes[${dim}]`, '*'));
  params.append(`valueCodes[${spec.contentsDim}]`, spec.contents);
  params.append('valueCodes[Tid]', '*');
  return `${API}/${spec.table}/data?${params.toString()}`;
}

export async function fetchTable(spec, fetchImpl = fetch) {
  const response = await fetchImpl(fetchUrl(spec));
  if (!response.ok) {
    throw new Error(`SSB tabell ${spec.table} svarte ${response.status}.`);
  }
  const csv = await response.text();
  return parseSsbCsv(csv);
}

function sameCodes(left, right) {
  if (left.length !== right.length) return false;
  return left.every((code, index) => code === right[index]);
}

/**
 * Henter alle kontraktseriene i katalogen, med full historikk.
 * Delserier som ligger i samme tabell kommer i samme svar.
 */
export async function fetchAllIndices({ fetchImpl = fetch, onProgress } = {}) {
  const series = {};
  const errors = [];
  for (let i = 0; i < SSB_FETCHES.length; i += 1) {
    const spec = SSB_FETCHES[i];
    onProgress?.({ index: i + 1, total: SSB_FETCHES.length, table: spec.table });
    let rows = [];
    try {
      rows = await fetchTable(spec, fetchImpl);
    } catch (error) {
      errors.push(error?.message || `Kunne ikke hente tabell ${spec.table}.`);
      continue;
    }
    INDEX_SERIES.filter((item) => item.table === spec.table).forEach((item) => {
      const row = item.codes.length
        ? rows.find((candidate) => sameCodes(candidate.codes, item.codes))
        : rows[0];
      if (!row) return;
      const points = pointsFromValues(row.values);
      series[item.id] = {
        ...item,
        points,
        latest: latestPoint(points),
      };
    });
  }
  return {
    fetchedAt: new Date().toISOString(),
    series,
    errors,
  };
}

export function seriesReady(bundle, id) {
  const row = bundle?.series?.[id];
  return !!(row && row.points?.length);
}

export function describeSeries(id, bundle) {
  const meta = seriesById(id);
  const live = bundle?.series?.[id];
  if (!meta && !live) return null;
  return { ...meta, ...live };
}
