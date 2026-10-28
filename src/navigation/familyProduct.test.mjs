import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FAMILY_PRODUCT_ENABLED,
  FAMILY_PRODUCT_MORE_VIEWS,
  FAMILY_PRODUCT_ROUTES,
  blockedFamilyProductRoute,
  childLoginAllowed,
  groupInviteAllowed,
  guardFamilyProductState,
  isFamilyProductMoreView,
  isFamilyProductRoute,
} from './familyProduct.js';

const root = new URL('../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');

test('ProTop-bygget har familieproduktet av (protop.no setter ikke flagget)', () => {
  assert.equal(FAMILY_PRODUCT_ENABLED, false);
  assert.doesNotMatch(read('.github/workflows/deploy-hosting.yml'), /EXPO_PUBLIC_FAMILY_PRODUCT/);
});

test('familieskjermene stenges, ProTop-skjermene ikke', () => {
  for (const name of ['AddChild', 'AddMember', 'ChildDashboard', 'Leksehjelp', 'ClassroomHome', 'TeamJoin', 'FamilyGames', 'LocationSettings']) {
    assert.equal(isFamilyProductRoute(name, false), true, name);
    assert.equal(isFamilyProductRoute(name, true), false, `${name} i familiebygget`);
  }
  for (const name of ['Home', 'Register', 'Login', 'VerifyEmail', 'FamilyInviteRespond', 'FriendsHub', 'FamilyOverview', 'CreateCompany', 'GroupSettings', 'ProfileSettings']) {
    assert.equal(isFamilyProductRoute(name, false), false, name);
  }
  assert.equal(isFamilyProductMoreView('games', false), true);
  assert.equal(isFamilyProductMoreView('location', false), true);
  assert.equal(isFamilyProductMoreView('settings', false), false);
  assert.equal(isFamilyProductMoreView('friends', false), false);
});

test('lenker til familieskjermer (også nøstede og /hjem/apper/…) går til Hjem', () => {
  const addChild = { routes: [{ name: 'Home' }, { name: 'AddChild', params: { familyId: 'f1' } }] };
  assert.equal(blockedFamilyProductRoute(addChild, false), 'AddChild');
  assert.deepEqual(guardFamilyProductState(addChild, false), { routes: [{ name: 'Home' }] });
  const games = { routes: [{ name: 'Home', params: { openShell: { tab: 'more', subView: 'games' } } }] };
  assert.deepEqual(guardFamilyProductState(games, false), { routes: [{ name: 'Home' }] });
  const nested = { routes: [{ name: 'Home', state: { routes: [{ name: 'Lekser' }] } }] };
  assert.equal(blockedFamilyProductRoute(nested, false), 'Lekser');
  const settings = { routes: [{ name: 'Home', params: { openShell: { tab: 'more', subView: 'settings' } } }] };
  assert.equal(guardFamilyProductState(settings, false), settings);
  const invite = { routes: [{ name: 'Home' }, { name: 'FamilyInviteRespond', params: { familyId: 'c', inviteId: 'i' } }] };
  assert.equal(guardFamilyProductState(invite, false), invite);
  assert.equal(guardFamilyProductState(addChild, true), addChild);
  assert.equal(blockedFamilyProductRoute(undefined, false), null);
});

test('bare bedriftsinvitasjoner, og ingen barnekontoer', () => {
  assert.equal(groupInviteAllowed('organization', false), true);
  assert.equal(groupInviteAllowed('company', false), true);
  for (const type of ['family', 'team', 'class', 'classroom', '', undefined]) {
    assert.equal(groupInviteAllowed(type, false), false, String(type));
    assert.equal(groupInviteAllowed(type, true), true);
  }
  assert.equal(childLoginAllowed(false), false);
  assert.equal(childLoginAllowed(true), true);
});

test('listene peker på skjermer og sider som finnes (ingen skrivefeil)', () => {
  const app = read('App.jsx');
  for (const name of FAMILY_PRODUCT_ROUTES) {
    assert.match(app, new RegExp(`Stack\\.Screen name="${name}"`), name);
  }
  const more = read('screens/v2/MoreHubScreen.jsx');
  const subScreens = more.slice(more.indexOf('const SUB_SCREENS'), more.indexOf('export default function MoreHubScreen'));
  for (const view of FAMILY_PRODUCT_MORE_VIEWS) {
    assert.match(subScreens, new RegExp(`\\b${view}:`), view);
  }
});

test('adressen /hjem/apper/<familieside> åpner Hjem', async () => {
  const { parseShellPath } = await import('./shellPaths.js');
  assert.deepEqual(parseShellPath('/hjem/apper/games'), { tab: 'home', subView: null });
  assert.deepEqual(parseShellPath('/hjem/apper/location'), { tab: 'home', subView: null });
  assert.deepEqual(parseShellPath('/hjem/apper/settings'), { tab: 'more', subView: 'settings' });
  assert.deepEqual(parseShellPath('/hjem/timeliste'), { tab: 'timeliste', subView: null });
});

test('vaktene er koblet inn der familieproduktet kunne nås', () => {
  assert.match(read('src/navigation/linking.js'), /guardFamilyProductState\(linking\.resolveStateFromPath/);
  assert.match(read('App.jsx'), /onStateChange=\{\(state\) => \{\s*if \(blockedFamilyProductRoute\(state\)/);
  assert.match(read('App.jsx'), /isChildEmail\(u\.email\) && !childLoginAllowed\(\)/);
  assert.match(read('screens/LoginScreen.jsx'), /isChildEmail\(loginEmail\) && !childLoginAllowed\(\)/);
  assert.match(read('screens/v2/MoreHubScreen.jsx'), /!isFamilyProductMoreView\(subView\)/);
  assert.match(read('components/InviteRespondOverlay.jsx'), /groupInviteAllowed\(inv\?\.groupType\)/);
  assert.match(read('screens/FamilyInviteRespondScreen.jsx'), /!groupInviteAllowed\(invite\.groupType\)/);
  assert.match(read('components/AppShell.jsx'), /if \(!FAMILY_PRODUCT_ENABLED\) return false;/);
  assert.match(read('components/AppShell.jsx'), /if \(tab === 'more' && isFamilyProductMoreView\(moreSubView\)\) \{\s*setTab\('home'\)/);
  assert.match(read('components/AppShell.jsx'), /kitchenMode \|\| familyViewBlocked/);
});
