/**
 * Shell chrome title (the compact label above the family name).
 * More-hub subviews must use the module name — never the generic "Mer" tab label.
 */

export function moreSubviewTitleMap(t) {
  return {
    shop: t('tabs.shop'),
    wishes: t('tabs.wishes'),
    books: t('tabs.books'),
    lekser: t('tabs.lekser'),
    chat: t('tabs.chat'),
    settings: t('tabs.settings'),
    dashboardSetup: t('settings.dashboardSetup'),
    plan: t('tabs.plan'),
    activities: t('tabs.activities'),
    members: t('apps.members'),
    friends: t('apps.friends'),
    addMember: t('apps.addMember'),
    groupSettings: t('apps.groupSettings'),
    location: t('apps.location'),
    documents: t('apps.documents'),
    voiceNotes: t('tabs.notes'),
    ai: t('tabs.ai') || 'Chat med AI',
    meals: t('apps.meals'),
    recipes: t('apps.recipes'),
    pantry: t('apps.pantry'),
    matcoach: t('apps.matcoach'),
    albums: t('apps.albums'),
    wall: t('apps.wall'),
    childDrawings: t('apps.childDrawings'),
    holdings: t('apps.holdings'),
    boligmappa: t('apps.boligmappa'),
    progress: t('apps.progress'),
    games: t('apps.games'),
    quiz: t('apps.quiz'),
    scratchMap: t('apps.scratchMap'),
    reiseplanlegger: t('apps.reiseplanlegger'),
    familyTree: t('apps.familyTree'),
    rememberDates: t('apps.rememberDates'),
    hospitality: t('apps.hospitality'),
    klassen: t('tabs.klassen'),
    mail: t('tabs.mail'),
    childApps: t('apps.childApps'),
    moduleAccess: t('apps.moduleAccess'),
    legal: t('more.legal'),
    subscription: t('group.subscription'),
    help: t('help.title'),
  };
}

/** Title for a Mer-hub module. Only the hub itself (no subview) is "Mer". */
export function moreSubviewTitle(moreSubView, t) {
  if (!moreSubView) return t('tabs.more');
  const titles = moreSubviewTitleMap(t);
  if (titles[moreSubView]) return titles[moreSubView];
  return moreSubView;
}

export function resolveShellHeaderTitle({
  tab,
  moreSubView = null,
  t,
  asChildView = false,
  childHomeTitle = null,
  modulesHub = false,
} = {}) {
  if (tab === 'home' && asChildView) return childHomeTitle;
  if (tab === 'home') return t('tabs.home');
  if (tab === 'chat') return t('tabs.chat');
  if (tab === 'plan') return t('tabs.plan');
  if (tab === 'mail') return t('tabs.mail');
  if (tab === 'chores') return t('tabs.chores');
  if (tab === 'stars') return t('tabs.tasks');
  if (tab === 'notes') return t('tabs.notes');
  if (tab === 'more') {
    if (!moreSubView && modulesHub) return t('moreHub.modulesTitle');
    return moreSubviewTitle(moreSubView, t);
  }
  return t('tabs.home');
}
