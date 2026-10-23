import assert from 'node:assert/strict';
import {
  COMPANY_MODULE_IDS,
  activeCompanyModuleCount,
  companyModuleForRoute,
  isCompanyModuleActive,
  lockCompanyNav,
  lockedCompanyModule,
  moduleContactNote,
  moduleLockedLabel,
  normalizeCompanyModules,
  setCompanyModuleActive,
} from './companyModules.js';
import { companyMenuItems, companyNavItems } from '../navigation/shellModules.js';

// Alt er aktivt til administrator slår noe av.
assert.deepEqual(normalizeCompanyModules(undefined), { disabled: [] });
assert.equal(activeCompanyModuleCount(null), COMPANY_MODULE_IDS.length);
assert.deepEqual(normalizeCompanyModules({ disabled: ['iso', 'ukjent', 'hr'] }), { disabled: ['hr', 'iso'] });

let state = setCompanyModuleActive(null, 'utstyr', false);
assert.equal(isCompanyModuleActive(state, 'utstyr'), false);
assert.equal(isCompanyModuleActive(state, 'hr'), true);
state = setCompanyModuleActive(state, 'utstyr', true);
assert.deepEqual(state, { disabled: [] });

// Ruter finner riktig modul. Innstillingssidene hører ikke til noen modul.
assert.equal(companyModuleForRoute('arbeid', 'fravaer')?.id, 'fravaer');
assert.equal(companyModuleForRoute('arbeid', null)?.id, 'arbeid');
assert.equal(companyModuleForRoute('arbeid', 'produktivitet')?.id, 'produktivitet');
assert.equal(companyModuleForRoute('arbeid', 'utlegg')?.id, 'okonomi');
assert.equal(companyModuleForRoute('okonomi', 'kunder')?.id, 'inntjening');
assert.equal(companyModuleForRoute('okonomi', 'kjorebok')?.id, 'kjorebok');
assert.equal(companyModuleForRoute('okonomi', null)?.id, 'okonomi');
assert.equal(companyModuleForRoute('selskap', 'fridager')?.id, 'fravaer');
assert.equal(companyModuleForRoute('selskap', 'moduler'), null);
assert.equal(companyModuleForRoute('selskap', 'tilgang'), null);
assert.equal(companyModuleForRoute('ansatte', null)?.id, 'ansatte');
assert.equal(companyModuleForRoute('selskap', null)?.id, 'selskap');
assert.equal(companyModuleForRoute('selskap', 'underenheter')?.id, 'underenheter');
assert.equal(companyModuleForRoute('selskap', 'innstillinger'), null);

const off = { disabled: ['utstyr', 'okonomi'] };
assert.equal(lockedCompanyModule(off, 'utstyr', null)?.id, 'utstyr');
assert.equal(lockedCompanyModule(off, 'okonomi', 'faktura')?.id, 'okonomi');
assert.equal(lockedCompanyModule(off, 'okonomi', 'kjorebok'), null);
assert.equal(lockedCompanyModule(off, 'projects', null), null);

// Låste punkter blir stående, og undersider låses med.
const locked = lockCompanyNav(companyNavItems(), off, 'Ikke aktivert · kontakt Kari');
const utstyr = locked.find((row) => row.id === 'utstyr');
assert.equal(utstyr.locked, true);
assert.equal(utstyr.lockedNote, 'Ikke aktivert · kontakt Kari');
const okonomi = locked.find((row) => row.id === 'okonomi');
assert.ok(okonomi.children.every((row) => row.locked));
assert.equal(locked.find((row) => row.id === 'projects').locked, undefined);
assert.equal(locked.find((row) => row.id === 'selskap').locked, undefined);

// Modulinnstillinger ligger rett over Tilgangsstyring, og bare for administrator.
const settingsKids = (items) => items.find((row) => row.id === 'selskapsinnstillinger').children.map((row) => row.id);
assert.deepEqual(
  settingsKids(companyMenuItems({ moduleAdmin: true })),
  ['selskapsinnstillinger-moduler', 'selskapsinnstillinger-tilgang'],
);
assert.deepEqual(settingsKids(companyMenuItems({ moduleAdmin: false })), ['selskapsinnstillinger-tilgang']);

assert.equal(moduleLockedLabel([]), 'Ikke aktivert · kontakt administrator');
assert.equal(moduleLockedLabel(['Kari Nordmann']), 'Ikke aktivert · kontakt Kari Nordmann');
assert.match(moduleContactNote(['Kari', 'Ola']), /Kari eller Ola/);

console.log('companyModules ok');
