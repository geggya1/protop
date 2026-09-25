import { applyChildAppRestrictions, filterChildDashboardApps, isChildAppAllowed } from '../utils/childApps.js';
import {
  applyGrandparentAppRestrictions,
} from '../utils/grandparentAccess.js';
import { childScheduleNavParams, lekserNavParams, klassenNavParams } from '../utils/childNav.js';
import { groupChildAppItems } from './childAppGroups.js';
import { groupParentAppItems } from './parentAppGroups.js';
import { applyProtopShellApps, applyProtopShellSections } from './protopShell.js';
import { isOrganizationType } from '../utils/groupTypes.js';

/**
 * Parent "Gjøremål" opens chore management for a child. Chores are child-only
 * in the shell (the chores tab redirects parents to Home), and ChoreSettings is
 * per-child, so we target the family's first active child — the same path the
 * chores/rewards screen uses. Returns null when there is no child to manage.
 */
export function parentChoresAction(familyId, firstKid) {
  if (!familyId || !firstKid) return null;
  return { type: 'nav', screen: 'ChoreSettings', params: { familyId, child: firstKid } };
}

/**
 * Full module catalog for shell drawer + Mer hub + child dashboard.
 * action: { type: 'tab', tab, subView? } | { type: 'nav', screen, params? } | { type: 'fn', id }
 *
 * asChild = true when viewing as child (own account or parent acting as child).
 * Parent-only modules are hidden in that case.
 */

export function buildShellModules({
  t,
  asChild,
  asParent,
  isSuperAdmin,
  familyId,
  family = null,
  canImport,
  hasKids,
  childForSchedule,
  aiEnabled = true,
  allowedApps = null,
  showChildRestrictions = false,
  firstKid = null,
  isGrandparent = false,
  grandparentModules = null,
}) {
  const sections = [];

  const mainItems = [
    { id: 'home', icon: 'home', label: t('tabs.home'), action: { type: 'tab', tab: 'home' } },
    { id: 'chat', icon: 'chatbubbles', label: t('tabs.chat'), action: { type: 'tab', tab: 'chat' } },
  ];
  // Venner blant hurtigvalg i Hoved. ProTop viser modulen uten familiekobling.
  mainItems.push({
    id: 'friends', icon: 'people', label: t('apps.friends'),
    action: { type: 'tab', tab: 'more', subView: 'friends' },
  });
  mainItems.push(
    { id: 'plan', icon: 'calendar', label: t('tabs.plan'), action: { type: 'tab', tab: 'plan' } },
  );
  mainItems.push({
    id: 'mail', icon: 'mail', label: t('tabs.mail'),
    action: { type: 'tab', tab: 'mail' },
  });
  mainItems.push(
    { id: 'stars', icon: 'checkbox', label: t('tabs.tasks'), action: { type: 'tab', tab: 'stars' } },
  );
  // Barn: Gjøremål blant hurtigvalg i Hoved (ikke under Familien).
  if (asChild) {
    mainItems.push({
      id: 'chores', icon: 'star', label: t('tabs.chores'),
      action: { type: 'tab', tab: 'chores' },
    });
  }
  mainItems.push(
    { id: 'notes', icon: 'document-text', label: t('tabs.notes'), action: { type: 'tab', tab: 'notes' } },
  );
  const onCompany = isOrganizationType(family?.type);
  if (onCompany) {
    mainItems.push(
      { id: 'members', icon: 'people', label: 'Medlemmer', action: { type: 'nav', screen: 'GroupSettings' } },
      { id: 'anbud', icon: 'megaphone', label: 'Anbud', action: { type: 'tab', tab: 'anbud' } },
      { id: 'projects', icon: 'business', label: 'Prosjekt', action: { type: 'tab', tab: 'projects' } },
    );
  }

  sections.push({
    id: 'main',
    title: t('shell.main'),
    items: mainItems,
  });

  const tools = [];

  tools.push(
    { id: 'books', icon: 'library', label: t('tabs.books'), action: { type: 'tab', tab: 'more', subView: 'books' } },
  );

  if (asParent && !isGrandparent) {
    tools.push({
      id: 'matcoach', icon: 'nutrition', label: t('apps.matcoach'),
      action: { type: 'tab', tab: 'more', subView: 'matcoach' },
    });
    tools.push({
      id: 'shop', icon: 'cart', label: t('tabs.shop'),
      action: { type: 'tab', tab: 'more', subView: 'shop' },
    });
    tools.push({
      id: 'meals', icon: 'restaurant', label: t('apps.meals'),
      action: { type: 'tab', tab: 'more', subView: 'meals' },
    });
    tools.push({
      id: 'recipes', icon: 'book', label: t('apps.recipes'),
      action: { type: 'tab', tab: 'more', subView: 'recipes' },
    });
    tools.push({
      id: 'pantry', icon: 'cube', label: t('apps.pantry'),
      action: { type: 'tab', tab: 'more', subView: 'pantry' },
    });
  }

  tools.push({
    id: 'wishes', icon: 'gift', label: t('tabs.wishes'),
    action: { type: 'tab', tab: 'more', subView: 'wishes' },
  });

  if (familyId) {
    tools.push({
      id: 'games', icon: 'game-controller', label: t('apps.games'),
      action: { type: 'tab', tab: 'more', subView: 'games' },
    });
    tools.push({
      id: 'scratchMap', icon: 'earth', label: t('apps.scratchMap'),
      action: { type: 'tab', tab: 'more', subView: 'scratchMap' },
    });
    tools.push({
      id: 'reiseplanlegger', icon: 'airplane', label: t('apps.reiseplanlegger'),
      action: { type: 'tab', tab: 'more', subView: 'reiseplanlegger' },
    });
    tools.push({
      id: 'familyTree', icon: 'git-network', label: t('apps.familyTree'),
      action: { type: 'tab', tab: 'more', subView: 'familyTree' },
    });
    tools.push({
      id: 'rememberDates', icon: 'alarm', label: t('apps.rememberDates'),
      action: { type: 'tab', tab: 'more', subView: 'rememberDates' },
    });
    tools.push({
      id: 'activities', icon: 'fitness', label: t('tabs.activities'),
      action: { type: 'tab', tab: 'more', subView: 'activities' },
    });
    tools.push({
      id: 'location', icon: 'navigate', label: t('apps.location'),
      action: { type: 'tab', tab: 'more', subView: 'location' },
    });
    tools.push({
      id: 'documents', icon: 'folder-open', label: t('apps.documents'),
      action: { type: 'tab', tab: 'more', subView: 'documents' },
    });
    tools.push({
      id: 'albums', icon: 'images', label: t('apps.albums'),
      action: { type: 'tab', tab: 'more', subView: 'albums' },
    });
    tools.push({
      id: 'wall', icon: 'newspaper', label: t('apps.wall'),
      action: { type: 'tab', tab: 'more', subView: 'wall' },
    });
    tools.push({
      id: 'childDrawings', icon: 'color-palette', label: t('apps.childDrawings'),
      action: { type: 'tab', tab: 'more', subView: 'childDrawings' },
    });
    tools.push({
      id: 'holdings', icon: 'car', label: t('apps.holdings'),
      action: { type: 'tab', tab: 'more', subView: 'holdings' },
    });
    tools.push({
      id: 'boligmappa', icon: 'home-outline', label: t('apps.boligmappa'),
      action: { type: 'tab', tab: 'more', subView: 'boligmappa' },
    });
  }

  if (asParent && familyId && !isGrandparent) {
    tools.push({
      id: 'hospitality', icon: 'key', label: t('apps.hospitality'),
      action: { type: 'tab', tab: 'more', subView: 'hospitality' },
    });
  }

  // AI-assistenten åpnes via Chat («Chat med AI»), ikke som egen app i menyen.

  if (asParent && hasKids && !isGrandparent) {
    tools.push({
      id: 'progress', icon: 'stats-chart', label: t('apps.progress'),
      action: { type: 'tab', tab: 'more', subView: 'progress' },
    });
  }

  if (asParent) {
    sections.push(...groupParentAppItems(tools, t));
  } else if (asChild) {
    sections.push(...groupChildAppItems(tools, t));
  } else {
    sections.push({ id: 'tools', title: t('shell.apps'), items: tools });
  }

  if (asChild && childForSchedule) {
    const skoleItems = buildChildSkoleApps({
      t,
      familyId,
      child: childForSchedule,
      aiEnabled,
      allowedApps,
      canEdit: true,
    }).map(({ id, icon, label, action }) => ({ id, icon, label, action }));

    if (skoleItems.length > 0) {
      // Sett Skole rett etter Hoved, før app-mappene.
      const insertAt = Math.max(1, sections.findIndex((s) => s.id === 'main') + 1);
      sections.splice(insertAt, 0, {
        id: 'skole',
        title: t('shell.school'),
        items: skoleItems,
      });
    }
  }

  const accountItems = [];

  if (showChildRestrictions && childForSchedule) {
    accountItems.push({
      id: 'restrictions',
      icon: 'lock-closed',
      label: t('settings.appsAndAccess'),
      highlight: true,
      action: {
        type: 'nav',
        screen: 'ChildSettings',
        params: { familyId, child: childForSchedule, focus: 'restrictions' },
      },
    });
  }

  accountItems.push({
    id: 'settings', icon: 'settings', label: t('tabs.settings'),
    action: asChild && childForSchedule
      ? { type: 'nav', screen: 'ChildSettings', params: { familyId, child: childForSchedule } }
      : { type: 'tab', tab: 'more', subView: 'settings' },
  });

  accountItems.push({
    id: 'help',
    icon: 'help-circle',
    label: t('help.title'),
    action: { type: 'tab', tab: 'more', subView: 'help' },
  });

  if (asParent && !isGrandparent) {
    accountItems.push({
      id: 'moduleAccess',
      icon: 'apps-outline',
      label: t('apps.moduleAccess'),
      action: { type: 'tab', tab: 'more', subView: 'moduleAccess' },
    });
    accountItems.push({
      id: 'legal', icon: 'shield-checkmark', label: t('apps.privacy'),
      action: { type: 'tab', tab: 'more', subView: 'legal' },
    });
    if (isSuperAdmin) {
      accountItems.push({
        id: 'subscription', icon: 'card', label: t('group.subscription'),
        action: { type: 'tab', tab: 'more', subView: 'subscription' },
      });
    }
  } else if (asParent && isGrandparent) {
    accountItems.push({
      id: 'legal', icon: 'shield-checkmark', label: t('apps.privacy'),
      action: { type: 'tab', tab: 'more', subView: 'legal' },
    });
  }

  sections.push({ id: 'account', title: t('shell.account'), items: accountItems });

  const visible = asChild
    ? applyChildAppRestrictions(sections, allowedApps)
    : isGrandparent
      ? applyGrandparentAppRestrictions(sections, grandparentModules)
      : sections;
  return applyProtopShellSections(visible, onCompany ? ['anbud', 'projects'] : []);
}

/**
 * Skole-apper for barnets Skole-mappe / -helside.
 */
export function buildChildSkoleApps({
  t,
  familyId,
  child,
  aiEnabled = true,
  allowedApps = null,
  canEdit = false,
}) {
  const skoleApps = [];

  if (familyId && child && isChildAppAllowed(allowedApps, 'week-plan')) {
    skoleApps.push({
      id: 'week-plan',
      icon: 'today',
      label: t('tabs.weekPlan'),
      sub: t('shellSub.overview'),
      action: {
        type: 'nav',
        screen: 'ChildSchedule',
        params: childScheduleNavParams({ familyId, child, canEdit: !!canEdit }),
      },
    });
  }

  if (familyId && child && isChildAppAllowed(allowedApps, 'lekser')) {
    skoleApps.push({
      id: 'lekser',
      icon: 'book',
      label: t('tabs.lekser'),
      sub: t('shellSub.weekHomework'),
      action: {
        type: 'nav',
        screen: 'Lekser',
        params: lekserNavParams({ familyId, child, canEdit: !!canEdit }),
      },
    });
  }

  if (isChildAppAllowed(allowedApps, 'mattehjelp')) {
    skoleApps.push({
      id: 'mattehjelp',
      icon: 'rocket',
      label: t('tabs.mattehjelp') || 'Lær skole',
      sub: t('shellSub.learningPlay') || 'Øv med spill og oppdrag',
      action: { type: 'nav', screen: 'Mattehjelp', params: child ? { child, familyId } : undefined },
    });
  }

  if (aiEnabled !== false && isChildAppAllowed(allowedApps, 'leksehjelp')) {
    skoleApps.push({
      id: 'leksehjelp',
      icon: 'school',
      label: t('tabs.leksehjelp'),
      sub: t('shellSub.stepByStep'),
      action: { type: 'nav', screen: 'Leksehjelp', params: child ? { child, familyId } : undefined },
    });
  }

  if (familyId && child && isChildAppAllowed(allowedApps, 'klassen')) {
    skoleApps.push({
      id: 'klassen',
      icon: 'people',
      label: t('tabs.klassen'),
      sub: t('shellSub.classInfo'),
      action: {
        type: 'nav',
        screen: 'Klassen',
        params: klassenNavParams({ familyId, child }),
      },
    });
  }

  return skoleApps;
}

/**
 * Flat list / mapper for child dashboard grid (all child-facing modules).
 * Mapper har type: 'folder' og nested `apps` — åpnes som helside.
 */
export function buildChildDashboardApps({
  t,
  familyId,
  child,
  aiEnabled = true,
  taskMeta,
  eventCount = 0,
  allowedApps = null,
  canEdit = false,
}) {
  const skoleApps = buildChildSkoleApps({ t, familyId, child, aiEnabled, allowedApps, canEdit });

  const apps = [
    {
      id: 'stars',
      icon: 'checkbox',
      label: t('tabs.tasks'),
      sub: t('shellSub.deadline'),
      action: { type: 'tab', tab: 'stars' },
    },
    {
      id: 'chores',
      icon: 'star',
      label: t('tabs.chores'),
      sub: taskMeta || t('shellSub.today'),
      action: { type: 'tab', tab: 'chores' },
    },
    {
      id: 'skole',
      type: 'folder',
      icon: 'school',
      label: t('apps.school'),
      sub: skoleApps.map((a) => a.label).join(' · ') || t('shellSub.schoolApps'),
      apps: skoleApps,
      action: {
        type: 'nav',
        screen: 'SchoolFolder',
        params: { child, familyId },
      },
    },
    {
      id: 'plan',
      icon: 'calendar',
      label: t('tabs.plan'),
      sub: t('shellSub.nToday', { n: eventCount }),
      action: { type: 'tab', tab: 'plan' },
    },
  ];

  // Husk dato erstatter Chat på forsiden; FamilieSpill foran øvrige katalog-apper.
  if (familyId) {
    apps.push({
      id: 'rememberDates',
      icon: 'alarm',
      label: t('apps.rememberDates'),
      sub: t('shellSub.countdown'),
      action: { type: 'tab', tab: 'more', subView: 'rememberDates' },
    });
  }

  apps.push(
    {
      id: 'notes',
      icon: 'document-text',
      label: t('tabs.notes'),
      sub: t('shellSub.writeRecordAi'),
      action: { type: 'tab', tab: 'notes' },
    },
    {
      id: 'books',
      icon: 'library',
      label: t('tabs.books'),
      sub: t('shellSub.books'),
      action: { type: 'tab', tab: 'more', subView: 'books' },
    },
    {
      id: 'wishes',
      icon: 'gift',
      label: t('tabs.wishes'),
      sub: t('shellSub.gifts'),
      action: { type: 'tab', tab: 'more', subView: 'wishes' },
    },
  );

  if (familyId) {
    apps.push({
      id: 'games',
      icon: 'game-controller',
      label: t('apps.games'),
      sub: t('shellSub.playTogether'),
      action: { type: 'tab', tab: 'more', subView: 'games' },
    });
    apps.push({
      id: 'friends',
      icon: 'people',
      label: t('apps.friends'),
      sub: t('friend.friendLabel'),
      action: { type: 'tab', tab: 'more', subView: 'friends' },
    });
  }

  // Chat ligger i katalogen utenfor dashbordets 3×3. AI åpnes via Chat.

  apps.push({
    id: 'chat',
    icon: 'chatbubbles',
    label: t('tabs.chat'),
    sub: t('shellSub.messages'),
    action: { type: 'tab', tab: 'chat' },
  });

  if (familyId) {
    apps.push({
      id: 'scratchMap',
      icon: 'earth',
      label: t('apps.scratchMap'),
      sub: t('shellSub.travels'),
      action: { type: 'tab', tab: 'more', subView: 'scratchMap' },
    });
    apps.push({
      id: 'reiseplanlegger',
      icon: 'airplane',
      label: t('apps.reiseplanlegger'),
      sub: t('shellSub.holidays'),
      action: { type: 'tab', tab: 'more', subView: 'reiseplanlegger' },
    });
    apps.push({
      id: 'familyTree',
      icon: 'git-network',
      label: t('apps.familyTree'),
      sub: t('shellSub.relatives'),
      action: { type: 'tab', tab: 'more', subView: 'familyTree' },
    });
    apps.push({
      id: 'activities',
      icon: 'fitness',
      label: t('tabs.activities'),
      sub: t('shellSub.training'),
      action: { type: 'tab', tab: 'more', subView: 'activities' },
    });
    apps.push({
      id: 'location',
      icon: 'navigate',
      label: t('shellSub.position'),
      sub: t('shellSub.family'),
      action: { type: 'tab', tab: 'more', subView: 'location' },
    });
    apps.push({
      id: 'documents',
      icon: 'folder-open',
      label: t('apps.documents'),
      sub: t('shellSub.files'),
      action: { type: 'tab', tab: 'more', subView: 'documents' },
    });
  }

  return applyProtopShellApps(filterChildDashboardApps(apps, allowedApps));
}

/** Foreldre-dashboard — samme stilrene grid som barn (uten «Mer»). */
export function buildParentDashboardApps({
  t,
  familyId,
  eventCount = 0,
  hasKids = false,
  firstKid = null,
}) {
  const apps = [
    {
      id: 'plan',
      icon: 'calendar',
      label: t('tabs.plan'),
      sub: t('shellSub.nToday', { n: eventCount }),
      action: { type: 'tab', tab: 'plan' },
    },
    {
      id: 'mail',
      icon: 'mail',
      label: t('tabs.mail'),
      sub: t('shellSub.outlook'),
      action: { type: 'tab', tab: 'mail' },
    },
    {
      id: 'stars',
      icon: 'checkbox',
      label: t('tabs.tasks'),
      sub: t('shellSub.deadline'),
      action: { type: 'tab', tab: 'stars' },
    },
  ];

  // Husk dato / FamilieSpill foran Chat i katalogen (AI åpnes via Chat).
  if (familyId) {
    apps.push(
      {
        id: 'rememberDates',
        icon: 'alarm',
        label: t('apps.rememberDates'),
        sub: t('shellSub.countdown'),
        action: { type: 'tab', tab: 'more', subView: 'rememberDates' },
      },
      {
        id: 'games',
        icon: 'game-controller',
        label: t('apps.games'),
        sub: t('shellSub.playTogether'),
        action: { type: 'tab', tab: 'more', subView: 'games' },
      },
      {
        id: 'friends',
        icon: 'people',
        label: t('apps.friends'),
        sub: t('friend.friendLabel'),
        action: { type: 'tab', tab: 'more', subView: 'friends' },
      },
    );
  }

  apps.push(
    {
      id: 'notes',
      icon: 'document-text',
      label: t('tabs.notes'),
      sub: t('shellSub.family'),
      action: { type: 'tab', tab: 'notes' },
    },
    {
      id: 'shop',
      icon: 'cart',
      label: t('tabs.shop'),
      sub: t('shellSub.shopping'),
      action: { type: 'tab', tab: 'more', subView: 'shop' },
    },
    {
      id: 'matcoach',
      icon: 'nutrition',
      label: t('apps.matcoach'),
      sub: t('shellSub.weekPlanAi'),
      action: { type: 'tab', tab: 'more', subView: 'matcoach' },
    },
    {
      id: 'meals',
      icon: 'restaurant',
      label: t('apps.meals'),
      sub: t('shellSub.weekPlan'),
      action: { type: 'tab', tab: 'more', subView: 'meals' },
    },
    {
      id: 'recipes',
      icon: 'book',
      label: t('apps.recipes'),
      sub: t('shellSub.dishes'),
      action: { type: 'tab', tab: 'more', subView: 'recipes' },
    },
    {
      id: 'pantry',
      icon: 'cube',
      label: t('apps.pantry'),
      sub: t('shellSub.pantry'),
      action: { type: 'tab', tab: 'more', subView: 'pantry' },
    },
    {
      id: 'wishes',
      icon: 'gift',
      label: t('tabs.wishes'),
      sub: t('shellSub.gifts'),
      action: { type: 'tab', tab: 'more', subView: 'wishes' },
    },
    {
      id: 'books',
      icon: 'library',
      label: t('tabs.books'),
      sub: t('shellSub.books'),
      action: { type: 'tab', tab: 'more', subView: 'books' },
    },
    {
      id: 'chat',
      icon: 'chatbubbles',
      label: t('tabs.chat'),
      sub: t('shellSub.messages'),
      action: { type: 'tab', tab: 'chat' },
    },
  );

  if (familyId) {
    apps.push({
      id: 'scratchMap',
      icon: 'earth',
      label: t('apps.scratchMap'),
      sub: t('shellSub.travels'),
      action: { type: 'tab', tab: 'more', subView: 'scratchMap' },
    });
    apps.push({
      id: 'reiseplanlegger',
      icon: 'airplane',
      label: t('apps.reiseplanlegger'),
      sub: t('shellSub.holidays'),
      action: { type: 'tab', tab: 'more', subView: 'reiseplanlegger' },
    });
    apps.push({
      id: 'familyTree',
      icon: 'git-network',
      label: t('apps.familyTree'),
      sub: t('shellSub.relatives'),
      action: { type: 'tab', tab: 'more', subView: 'familyTree' },
    });
    apps.push({
      id: 'activities',
      icon: 'fitness',
      label: t('tabs.activities'),
      sub: t('shellSub.training'),
      action: { type: 'tab', tab: 'more', subView: 'activities' },
    });
    apps.push({
      id: 'location',
      icon: 'navigate',
      label: t('shellSub.position'),
      sub: t('shellSub.family'),
      action: { type: 'tab', tab: 'more', subView: 'location' },
    });
    apps.push({
      id: 'documents',
      icon: 'folder-open',
      label: t('apps.documents'),
      sub: t('shellSub.files'),
      action: { type: 'tab', tab: 'more', subView: 'documents' },
    });
  }

  if (hasKids) {
    apps.push({
      id: 'progress',
      icon: 'stats-chart',
      label: t('shellSub.progressShort'),
      sub: t('shellSub.theKids'),
      action: { type: 'tab', tab: 'more', subView: 'progress' },
    });
  }

  return applyProtopShellApps(apps);
}
