import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./companyWall.js', import.meta.url), 'utf8');
assert.match(src, /companyWallPosts/);
assert.match(src, /listenCompanyWall/);
assert.match(src, /createCompanyWallPost/);
assert.match(src, /softDeleteCompanyWallPost/);
assert.match(src, /normalizeWallLinkUrl/);

const wallUi = readFileSync(new URL('../../components/project/CompanyNewsWall.jsx', import.meta.url), 'utf8');
assert.match(wallUi, /company-news-wall/);
assert.match(wallUi, /Publiser/);
assert.match(wallUi, /companyProfile/);
assert.match(wallUi, /useCroppedUpload/);
assert.match(wallUi, /Beskjær nyhetsbilde/);
assert.match(src, /clipWallTitle/);
assert.match(src, /normalizeWallCategory/);

const landing = readFileSync(new URL('../../screens/project/CompanyLanding.jsx', import.meta.url), 'utf8');
assert.match(landing, /requestShellTab\?\.\('selskap', 'innstillinger'\)/);

const shell = readFileSync(new URL('../../components/AppShell.jsx', import.meta.url), 'utf8');
assert.match(shell, /moreSubView === 'innstillinger'/);
assert.match(shell, /tab === 'selskap'\) return <CompanyLanding/);
assert.equal(/isOrganizationType\(family\?\.type\)[\s\S]{0,80}tab === 'home'/.test(shell), false);

console.log('companyWall.test.mjs: ok');
