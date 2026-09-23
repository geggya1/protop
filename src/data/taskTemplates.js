// icon: emoji shown on web (no-CORS fallback) and as placeholder on native
// file: catalog PNG when present; missing files fall back to emoji
export const TASK_TEMPLATES = [
  // —— Daglige vaner ——
  { title: 'Pusse tenner',           file: 'brush-teeth.png',     icon: '🦷', points: 5,  type: 'daily' },
  { title: 'Vaske hender',           file: 'wash-hands.png',      icon: '🧼', points: 3,  type: 'daily' },
  { title: 'Dusje',                  file: 'shower.png',          icon: '🚿', points: 5,  type: 'daily' },
  { title: 'Kle på seg',             file: 'dress.png',           icon: '👕', points: 3,  type: 'daily' },
  { title: 'Re opp sengen',          file: 'make-bed.png',        icon: '🛏️', points: 3,  type: 'daily' },
  { title: 'Leggetid',               file: 'bedtime.png',         icon: '🌙', points: 5,  type: 'daily' },
  { title: 'Gjøre lekser',           file: 'do-homework.png',     icon: '📚', points: 8,  type: 'daily' },
  { title: 'Lese en bok',            file: 'read-book.png',       icon: '📖', points: 6,  type: 'daily' },
  { title: 'Pakke sekken',           file: 'pack-schoolbag.png',  icon: '🎒', points: 5,  type: 'daily' },
  { title: 'Rydde ut av sekken',     file: 'unpack-schoolbag.png',icon: '🎒', points: 4,  type: 'daily' },
  { title: 'Gå til skolen',          file: 'go-to-school.png',    icon: '🏫', points: 6,  type: 'daily' },
  { title: 'Lage matpakke',          file: 'pack-lunch.png',      icon: '🥪', points: 5,  type: 'daily' },

  // —— Rydding og hus ——
  { title: 'Rydde rommet',           file: 'tidy-room.png',       icon: '🧹', points: 8,  type: 'daily' },
  { title: 'Rydde etter lek',        file: 'pack-toys.png',       icon: '🧸', points: 5,  type: 'daily' },
  { title: 'Rydde kjøkkenbenken',    file: 'clear-counter.png',   icon: '🧽', points: 5,  type: 'daily' },
  { title: 'Støvsuge',               file: 'vacuum.png',          icon: '🧹', points: 10, type: 'weekly', daysOfWeek: [6] },
  { title: 'Vaske gulvet',           file: 'mop-floor.png',       icon: '🧹', points: 10, type: 'weekly', daysOfWeek: [6] },
  { title: 'Tørke støv',             file: 'dust.png',            icon: '🪶', points: 6,  type: 'weekly', daysOfWeek: [6] },
  { title: 'Vaske badet',            file: 'clean-bathroom.png',  icon: '🛁', points: 10, type: 'weekly', daysOfWeek: [6] },
  { title: 'Vaske vinduer',          file: 'clean-windows.png',   icon: '🪟', points: 12, type: 'once' },
  { title: 'Gå ut med søpla',        file: 'take-out-trash.png',  icon: '🗑️', points: 5,  type: 'weekly', daysOfWeek: [2, 5] },
  { title: 'Tømme søppelkassen',     file: 'empty-trash.png',     icon: '♻️', points: 4,  type: 'weekly', daysOfWeek: [2, 5] },
  { title: 'Vanne blomster',         file: 'water-plants.png',    icon: '🌱', points: 5,  type: 'weekly', daysOfWeek: [2, 6] },

  // —— Kjøkken ——
  { title: 'Dekke bordet',           file: 'set-table.png',       icon: '🍴', points: 4,  type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5, 6, 0] },
  { title: 'Rydde av bordet',        file: 'clear-table.png',     icon: '🍽️', points: 4,  type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5, 6, 0] },
  { title: 'Lage frokost',           file: 'make-breakfast.png',  icon: '🥣', points: 6,  type: 'weekly', daysOfWeek: [6, 0] },
  { title: 'Lage middag',            file: 'cook-dinner.png',     icon: '🍳', points: 10, type: 'weekly', daysOfWeek: [6] },
  { title: 'Hjelpe til med matlaging', file: 'prepare-food.png',  icon: '🥗', points: 7,  type: 'weekly', daysOfWeek: [6] },
  { title: 'Fylle oppvaskmaskinen',  file: 'load-dishwasher.png', icon: '🍽️', points: 5,  type: 'daily' },
  { title: 'Tømme oppvaskmaskinen',  file: 'unload-dishwasher.png', icon: '🍽️', points: 5, type: 'daily' },
  { title: 'Vaske opp',              file: 'wash-dishes.png',     icon: '🫧', points: 6,  type: 'daily' },

  // —— Klær ——
  { title: 'Legge sammen klær',      file: 'fold-clothes.png',    icon: '👔', points: 6,  type: 'weekly', daysOfWeek: [6] },
  { title: 'Henge opp klær',         file: 'hang-clothes.png',    icon: '🧺', points: 6,  type: 'weekly', daysOfWeek: [6] },
  { title: 'Vaske klær',             file: 'do-laundry.png',      icon: '👕', points: 8,  type: 'weekly', daysOfWeek: [6] },
  { title: 'Sortere skittentøy',     file: 'sort-laundry.png',    icon: '🧺', points: 4,  type: 'weekly', daysOfWeek: [6] },

  // —— Kjæledyr og ute ——
  { title: 'Mate kjæledyr',          file: 'feed-pet.png',        icon: '🐾', points: 4,  type: 'daily' },
  { title: 'Gå tur med hunden',      file: 'walk-dog.png',        icon: '🐕', points: 8,  type: 'daily' },
  { title: 'Hente posten',           file: 'collect-mail.png',    icon: '📬', points: 4,  type: 'weekly', daysOfWeek: [1, 3, 5] },
  { title: 'Hjelpe med handling',    file: 'shopping.png',        icon: '🛒', points: 8,  type: 'once' },
  { title: 'Vaske bilen',            file: 'wash-car.png',        icon: '🚗', points: 12, type: 'once' },
  { title: 'Feie uteplassen',        file: 'sweep-outside.png',   icon: '🧹', points: 6,  type: 'weekly', daysOfWeek: [6] },

  // —— Familie, aktivitet og ansvar ——
  { title: 'Passe søsken',           file: 'care-siblings.png',   icon: '🤝', points: 8,  type: 'weekly', daysOfWeek: [6, 0] },
  { title: 'Barnevakt',              file: 'baby-sitting.png',    icon: '👶', points: 10, type: 'once' },
  { title: 'Lese høyt sammen',       file: 'read-together.png',   icon: '📕', points: 6,  type: 'weekly', daysOfWeek: [0] },
  { title: 'Trene',                  file: 'exercise.png',        icon: '🏃', points: 8,  type: 'weekly', daysOfWeek: [1, 3, 5] },
  { title: 'Øve på instrument',      file: 'practice-instrument.png', icon: '🎸', points: 6, type: 'daily' },
  { title: 'Ringe besteforeldre',    file: 'call-grandparents.png', icon: '📞', points: 5, type: 'weekly', daysOfWeek: [0] },
  { title: 'Skjermfri stund',        file: 'screen-free.png',     icon: '📵', points: 5,  type: 'daily' },
  { title: 'Hjelpe en i familien',   file: 'help-family.png',     icon: '💛', points: 6,  type: 'weekly', daysOfWeek: [6] },
  { title: 'Rydde skoene',           file: 'tidy-shoes.png',      icon: '👟', points: 3,  type: 'daily' },
  { title: 'Spille ute',             file: 'play-outside.png',    icon: '⚽', points: 5,  type: 'daily' },
  { title: 'Lage smoothie',          file: 'make-smoothie.png',   icon: '🥤', points: 5,  type: 'weekly', daysOfWeek: [6, 0] },
  { title: 'Vaske frukt og grønnsaker', file: 'wash-produce.png', icon: '🥕', points: 3,  type: 'weekly', daysOfWeek: [1, 3, 5] },
  { title: 'Putte leker i kasser',   file: 'toys-in-bins.png',    icon: '📦', points: 4,  type: 'daily' },
  { title: 'Skru av lys',            file: 'turn-off-lights.png', icon: '💡', points: 2,  type: 'daily' },
];
