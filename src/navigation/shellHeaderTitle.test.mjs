import assert from 'node:assert/strict';
import {
  moreSubviewTitle,
  moreSubviewTitleMap,
  resolveShellHeaderTitle,
} from './shellHeaderTitle.js';

const LABELS = {
  'tabs.more': 'Mer',
  'tabs.home': 'Hjem',
  'tabs.chat': 'Chat',
  'tabs.plan': 'Kalender',
  'tabs.mail': 'E-post',
  'tabs.chores': 'Gjøremål',
  'tabs.tasks': 'Oppgaver',
  'tabs.notes': 'Notat',
  'tabs.shop': 'Handleliste',
  'tabs.wishes': 'Gaveønsker',
  'tabs.books': 'Bokhylla',
  'tabs.lekser': 'Lekser',
  'tabs.settings': 'Innstillinger',
  'settings.dashboardSetup': 'Tilpass hjem',
  'tabs.activities': 'Aktiviteter',
  'tabs.ai': 'Chat med AI',
  'tabs.klassen': 'Klassen',
  'more.legal': 'Personvern og vilkår',
  'group.subscription': 'Abonnement og betaling',
  'help.title': 'Hjelp & support',
  'moreHub.modulesTitle': 'Moduler',
  'apps.members': 'Medlemmer',
  'apps.friends': 'Venner',
  'apps.addMember': 'Legg til person',
  'apps.groupSettings': 'Familieinnstillinger',
  'apps.location': 'Familieposisjon',
  'apps.documents': 'Dokumenter',
  'apps.meals': 'Måltidsplanlegger',
  'apps.recipes': 'Oppskrift',
  'apps.pantry': 'Lager',
  'apps.matcoach': 'AI Matcoach',
  'apps.albums': 'Familiealbum',
  'apps.wall': 'Familievegg',
  'apps.childDrawings': 'Barnetegninger',
  'apps.holdings': 'Kjøretøy',
  'apps.boligmappa': 'Boligen',
  'apps.progress': 'Barnas progresjon',
  'apps.games': 'FamilieSpill',
  'apps.quiz': 'Familiequiz',
  'apps.scratchMap': 'Våre reiser',
  'apps.reiseplanlegger': 'Reiseplanlegger',
  'apps.familyTree': 'Familietreet',
  'apps.rememberDates': 'Husk dato',
  'apps.hospitality': 'Utleie',
  'apps.childApps': 'Barnas apper',
  'apps.moduleAccess': 'Aktiverte moduler',
};
const t = (k) => LABELS[k] || k;

{
  assert.equal(moreSubviewTitle(null, t), 'Mer');
  assert.equal(moreSubviewTitle(undefined, t), 'Mer');
  assert.equal(
    resolveShellHeaderTitle({ tab: 'more', moreSubView: null, t }),
    'Mer',
  );
  assert.equal(
    resolveShellHeaderTitle({ tab: 'more', moreSubView: null, t, modulesHub: true }),
    'Moduler',
  );
  assert.equal(
    resolveShellHeaderTitle({ tab: 'more', moreSubView: 'shop', t, modulesHub: true }),
    'Handleliste',
  );
}

{
  assert.equal(moreSubviewTitle('recipes', t), 'Oppskrift');
  assert.equal(moreSubviewTitle('familyTree', t), 'Familietreet');
  assert.equal(moreSubviewTitle('matcoach', t), 'AI Matcoach');
  assert.equal(moreSubviewTitle('rememberDates', t), 'Husk dato');
  assert.equal(moreSubviewTitle('klassen', t), 'Klassen');
  assert.equal(moreSubviewTitle('dashboardSetup', t), 'Tilpass hjem');
  assert.equal(
    resolveShellHeaderTitle({ tab: 'more', moreSubView: 'recipes', t }),
    'Oppskrift',
  );
  assert.equal(
    resolveShellHeaderTitle({ tab: 'more', moreSubView: 'familyTree', t }),
    'Familietreet',
  );
  assert.equal(
    resolveShellHeaderTitle({ tab: 'more', moreSubView: 'childDrawings', t }),
    'Barnetegninger',
  );
  assert.equal(
    resolveShellHeaderTitle({ tab: 'more', moreSubView: 'albums', t }),
    'Familiealbum',
  );
}

{
  const titles = moreSubviewTitleMap(t);
  assert.equal(titles.recipes, 'Oppskrift');
  for (const [id, title] of Object.entries(titles)) {
    assert.notEqual(title, 'Mer', `${id} must not use the generic Mer label`);
    assert.equal(moreSubviewTitle(id, t), title);
  }
}

{
  assert.equal(moreSubviewTitle('unknownModule', t), 'unknownModule');
  assert.notEqual(moreSubviewTitle('unknownModule', t), 'Mer');
  assert.equal(
    resolveShellHeaderTitle({ tab: 'more', moreSubView: 'unknownModule', t }),
    'unknownModule',
  );
}

{
  assert.equal(resolveShellHeaderTitle({ tab: 'home', t }), 'Hjem');
  assert.equal(resolveShellHeaderTitle({ tab: 'plan', t }), 'Kalender');
}

console.log('shellHeaderTitle.test.mjs: ok');
