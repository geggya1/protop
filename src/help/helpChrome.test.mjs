/**
 * Lyspæren skal ligge øverst og kunne trykkes på alle sider, og hjelpen og
 * assistenten skal være koblet inn i skallet og chatten.
 * Kildesjekker (som moduleHero.test) — Playwright-boten i scripts/help-bot
 * måler det samme i nettleseren.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OLD_BRAND_PATTERN } from '../utils/legacyNames.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const header = read('components/ShellHeader.jsx');
const zOf = (name) => {
  const m = header.match(new RegExp(`\\n  ${name}: \\{[^}]*?zIndex: (\\d+)`, 's'));
  return m ? Number(m[1]) : 0;
};
assert.ok(zOf('chromeRow') > zOf('switchRow'), 'logo-raden (med lyspæren) ligger over Privat/Bedrift');
assert.ok(zOf('chromeRow') > 1, 'logo-raden ligger over modulbåndet (heroChrome zIndex 1)');
// EGEN-03: lyspæren står i raden på telefon også, og henger ikke over toppfeltet eller innholdet.
assert.doesNotMatch(header, /helpOnAvatar|hangingHelp|<HelpButton\s+floating/, 'ingen hengende lyspære');
assert.equal((header.match(/<HelpButton inline/g) || []).length, 3, 'lyspæren står i knapperaden i alle tre variantene');
assert.match(header, /<HelpButton inline compact color=\{colors\.ink\} borderColor=\{colors\.line\} \/>/, 'mobil: ved menyknappen');

const bulb = read('components/HelpButton.jsx');
assert.match(bulb, /HelpTarget id="helpBtn"/);
assert.match(bulb, /testID="help-bulb"/);
assert.match(bulb, /moduleIntro\.help'/, 'PC-varianten har teksten «Hjelp»');

const shell = read('components/AppShell.jsx');
assert.match(shell, /helpPageId\(tab, moreSubView\)/, 'hjelpen følger undersiden');

const overlay = read('components/HelpOverlay.jsx');
assert.match(overlay, /locateStepTarget/, 'rundturen markerer den ekte knappen');
assert.match(overlay, /onSpotlight/, 'trykk på via-knappen åpner den');
assert.match(overlay, /help-step-via/, 'via-hint i kortet');
assert.match(read('src/context/HelpContext.jsx'), /setTourCopy\(/, 'rundturen holder på sin side');
assert.match(overlay, /mode === 'process'/, 'arbeidsflyt på tvers av sider');
assert.match(overlay, /stopTogether: false/, 'stegets animasjon stopper ikke nedtoningen');
assert.match(overlay, /help-step-counter/);

const card = read('components/HelpModuleCard.jsx');
assert.match(card, /HelpPageCard/);
assert.match(card, /openAssistant/);

const dock = read('components/ChatDock.jsx');
assert.match(dock, /chat-open-assistant/, 'assistenten er festet øverst i chatvelgeren');
assert.match(dock, /AssistantDockWindow/);
assert.match(dock, /isAssistantThread\(activeWin\)/, 'mobil-skuffen viser assistenten');

const list = read('screens/v2/ChatListScreen.jsx');
assert.match(list, /openAssistant/);

const app = read('App.jsx');
assert.match(app, /name="ProtopAssistant"/, 'egen skjerm for assistenten i mobilappene');

const fn = read('functions/aiSupport.js');
assert.match(fn, /ProTop-assistenten/);
assert.match(fn, /Anbefal aldri andre programmer/);
assert.doesNotMatch(fn, /Skjetten/);
assert.doesNotMatch(fn, OLD_BRAND_PATTERN);
assert.match(fn, /LÅST FOR BRUKEREN/, 'AI-motoren følger sperrene i kunnskapen');
assert.match(fn, /Gi aldri steg for noe som er låst/);

// Hjelpen følger tilgangsnivået: rundtur, lyspærekort, hjelpesenter og assistent.
assert.match(overlay, /useHelpAccess\(\)/);
assert.match(overlay, /help-step-locked/, 'låst steg forklares i rundturen');
assert.match(read('components/HelpModuleCard.jsx'), /stepLocks/);
assert.match(read('screens/v2/HelpSupportScreen.jsx'), /help-article-locked/);
const assistantChat = read('components/assistant/AssistantChat.jsx');
assert.match(assistantChat, /useHelpAccess\(\)/);
assert.match(assistantChat, /access: accessRef\.current/, 'svarene følger tilgangen');
assert.match(assistantChat, /assistant-step-locked/);
assert.match(read('src/help/assistantService.js'), /knowledgeForServer\(question, \{[^}]*access/);

// Import av lister krever Admin på området.
for (const [file, resource] of [
  ['screens/customers/CustomersScreen.jsx', 'customers'],
  ['screens/economy/EconomyInvoices.jsx', 'economyInvoices'],
  ['screens/arbeid/ProductSalesScreen.jsx', 'productSales'],
  ['screens/economy/ProjectExpensesScreen.jsx', 'economyProjectExpenses'],
  ['screens/arbeid/AbsenceScreens.jsx', 'absenceReport'],
]) {
  assert.match(read(file), new RegExp(`canImportList\\((useCompanyAccess\\(\\)|access), '${resource}'\\)`), `${file}: import krever Admin`);
}
assert.match(read('screens/economy/EconomyHours.jsx'), /const canImport = rights === 'admin'/);
assert.match(read('screens/employees/EmployeesScreen.jsx'), /\.\.\.\(employeesAdmin \? \[\{ id: 'import'/);

console.log('helpChrome.test.mjs: ok');
