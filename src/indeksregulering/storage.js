import AsyncStorage from '@react-native-async-storage/async-storage';

const CASES = 'protop.indeksregulering.cases.v1';
const CACHE = 'protop.indeksregulering.ssb.v1';

export async function loadCases() {
  try {
    const raw = await AsyncStorage.getItem(CASES);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveCases(cases) {
  await AsyncStorage.setItem(CASES, JSON.stringify(cases.slice(0, 40)));
}

export async function loadIndexCache() {
  try {
    const raw = await AsyncStorage.getItem(CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.series) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveIndexCache(bundle) {
  const slim = {
    fetchedAt: bundle.fetchedAt,
    errors: bundle.errors || [],
    series: {},
  };
  Object.entries(bundle.series || {}).forEach(([id, series]) => {
    slim.series[id] = {
      id,
      name: series.name,
      table: series.table,
      basis: series.basis,
      frequency: series.frequency,
      source: series.source,
      url: series.url,
      group: series.group,
      points: series.points,
      latest: series.latest,
    };
  });
  await AsyncStorage.setItem(CACHE, JSON.stringify(slim));
}
