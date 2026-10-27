import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { HELP_VIDEOS, listVideos, tx, videosForPage } from './helpVideos.js';
import { PROTOP_PAGES } from './protopPages.js';

test('støttevideoer: hver video i katalogen har fil, tekstspor og gyldige hjelpesider', () => {
  for (const v of HELP_VIDEOS) {
    assert.ok(existsSync(new URL(`../../public/help/video/${v.file}.mp4`, import.meta.url)), `${v.file}.mp4 mangler`);
    assert.ok(existsSync(new URL(`../../public/help/video/${v.file}.en.vtt`, import.meta.url)), `${v.file}.en.vtt mangler`);
    for (const key of v.pages) assert.ok(PROTOP_PAGES[key], `ukjent hjelpeside ${key}`);
  }
  assert.equal(new Set(HELP_VIDEOS.map((v) => v.id)).size, HELP_VIDEOS.length);
});

test('støttevideoer: per side, språk og adresse', () => {
  const catalog = [{ id: 'r', file: '02-report-deviation', seconds: 83, title: tx('Meld avvik', 'Report a deviation'), pitch: tx('', ''), pages: ['iso.avvik'] }];
  const en = videosForPage('iso.avvik', 'en', { catalog });
  assert.equal(en[0].title, 'Report a deviation');
  assert.equal(en[0].src, '/help/video/02-report-deviation.mp4');
  assert.equal(en[0].captions, '/help/video/02-report-deviation.en.vtt');
  assert.equal(en[0].minutes, 1);
  assert.equal(videosForPage('iso.avvik', 'da', { catalog })[0].title, 'Meld avvik', 'dansk og svensk faller tilbake til norsk');
  assert.deepEqual(videosForPage('home', 'nb', { catalog }), []);
  assert.ok(listVideos('en', { catalog, absolute: true })[0].src.startsWith('https://protop.no/help/video/'));
});
