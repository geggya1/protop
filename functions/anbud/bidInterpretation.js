/** Ren JSON-tolkning av AI-svar for tilbudsarbeid. */

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeList(rows, mapRow) {
  return (Array.isArray(rows) ? rows : []).map(mapRow).filter(Boolean).slice(0, 15);
}

export function interpretationFromGemini(parsed) {
  return {
    summary: text(parsed?.summary).slice(0, 4000),
    checklist: normalizeList(parsed?.checklist, (row, index) => {
      const title = text(row?.title || row?.label).slice(0, 200);
      if (!title) return null;
      return {
        id: `sjekk_${index + 1}`,
        title,
        detail: text(row?.detail || row?.summary).slice(0, 4000),
        done: false,
      };
    }).slice(0, 15),
    qualification: normalizeList(parsed?.qualification, (row, index) => {
      const title = text(row?.title || row?.label).slice(0, 200);
      if (!title) return null;
      return {
        id: `kval_${index + 1}`,
        title,
        summary: text(row?.summary).slice(0, 800),
        detail: text(row?.detail || row?.content).slice(0, 8000),
        weight: '',
      };
    }).slice(0, 10),
    awardCriteria: normalizeList(parsed?.awardCriteria, (row, index) => {
      const title = text(row?.title || row?.label).slice(0, 200);
      if (!title) return null;
      return {
        id: `tild_${index + 1}`,
        title,
        summary: text(row?.summary).slice(0, 800),
        detail: text(row?.detail || row?.content).slice(0, 8000),
        weight: text(row?.weight).slice(0, 40),
      };
    }).slice(0, 10),
    generatedAt: new Date().toISOString(),
    engine: 'gemini',
  };
}
