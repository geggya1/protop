/** Norwegian grocery chains — weekly flyers via eTilbudsavis (store /tilbudsavis paths 404). */

export const ETILBUD_ORIGIN = 'https://etilbudsavis.no';

export const GROCERY_STORES = [
  {
    id: 'rema1000',
    name: 'Rema 1000',
    shortName: 'Rema',
    color: '#003087',
    accent: '#e30613',
    emoji: '🔵',
    flyerUrl: `${ETILBUD_ORIGIN}/rema-1000`,
    website: 'https://www.rema.no',
  },
  {
    id: 'kiwi',
    name: 'Kiwi',
    shortName: 'Kiwi',
    color: '#00843d',
    accent: '#76bc21',
    emoji: '🟢',
    flyerUrl: `${ETILBUD_ORIGIN}/Kiwi`,
    website: 'https://kiwi.no',
  },
  {
    id: 'coop',
    name: 'Coop Prix',
    shortName: 'Prix',
    color: '#00643b',
    accent: '#00a651',
    emoji: '🟩',
    flyerUrl: `${ETILBUD_ORIGIN}/coop-prix`,
    website: 'https://coop.no',
  },
  {
    id: 'meny',
    name: 'Meny',
    shortName: 'Meny',
    color: '#c8102e',
    accent: '#e85d75',
    emoji: '🔴',
    flyerUrl: `${ETILBUD_ORIGIN}/MENY`,
    website: 'https://meny.no',
  },
  {
    id: 'spar',
    name: 'Spar',
    shortName: 'Spar',
    color: '#007a3d',
    accent: '#5cb85c',
    emoji: '🌿',
    flyerUrl: `${ETILBUD_ORIGIN}/SPAR`,
    website: 'https://spar.no',
  },
  {
    id: 'extra',
    name: 'Extra',
    shortName: 'Extra',
    color: '#ffd100',
    accent: '#333',
    emoji: '🟡',
    flyerUrl: `${ETILBUD_ORIGIN}/Extra`,
    website: 'https://coop.no/extra',
  },
  {
    id: 'joker',
    name: 'Joker',
    shortName: 'Joker',
    color: '#6b7280',
    accent: '#374151',
    emoji: '🃏',
    flyerUrl: `${ETILBUD_ORIGIN}/Joker`,
    website: 'https://joker.no',
  },
  {
    id: 'oda',
    name: 'Oda',
    shortName: 'Oda',
    color: '#ff5c00',
    accent: '#ff8c42',
    emoji: '📦',
    flyerUrl: 'https://oda.com/no/',
    website: 'https://oda.com/no/',
  },
];

export function storeById(id) {
  return GROCERY_STORES.find((s) => s.id === id) || null;
}

/** Current weekly flyer for a chain, or the eTilbudsavis front page. */
export function flyerUrlForStore(storeOrId) {
  const store = typeof storeOrId === 'string' ? storeById(storeOrId) : storeOrId;
  return store?.flyerUrl || `${ETILBUD_ORIGIN}/`;
}
