import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../server.js';
import { buildRegs } from '../src/regs.js';
import { makePages, speciesSlugs, todaySummary, sizeText } from '../src/pages.js';

const regs = buildRegs();
const pages = makePages(regs);

test('every species gets a unique slug; duplicate names keep saltwater plain', () => {
  const slugs = speciesSlugs(regs.species);
  assert.equal(new Set(slugs.values()).size, regs.species.length);
  assert.equal(slugs.get(203), 'striped-bass');
  assert.equal(slugs.get(55), 'striped-bass-freshwater');
});

test('species page carries title, table, FAQ schema and DNREC source', () => {
  const html = pages.speciesPage('striped-bass', new Date(2026, 8, 20));
  assert.match(html, /<title>Striped Bass Size Limit, Season &amp; Daily Limit in Delaware \(\d{4}\)<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/slotgauge\.com\/delaware\/striped-bass\/"/);
  assert.match(html, /28–31 inch slot/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /FishSpecies\.aspx\?habitat=2&amp;species=203/);
  assert.match(html, /href="\/\?q=Striped%20Bass"/);
  assert.match(html, /Often confused with/); // look-alike links
  assert.equal(pages.speciesPage('no-such-fish'), null);
});

test('today summary reflects season, size and closures', () => {
  const sb = regs.species.find((s) => s.id === 203);
  assert.match(todaySummary(sb, new Date(2026, 8, 20)), /between 28 and 31 inches, with a daily limit of 1/);
  const bsb = regs.species.find((s) => s.id === 93);
  assert.match(todaySummary(bsb, new Date(2026, 1, 1)), /season is closed today/i);
  const sturgeon = regs.species.find((s) => s.name === 'Atlantic Sturgeon');
  assert.match(todaySummary(sturgeon), /closed to harvest/);
  assert.equal(sizeText({ size: [] }), 'No size limit');
});

test('routes: state, hubs, species, redirects, sitemap, robots, verification', async () => {
  process.env.GOOGLE_SITE_VERIFICATION = 'googleTEST123.html';
  const app = createApp();
  delete process.env.GOOGLE_SITE_VERIFICATION;
  assert.equal((await request(app).get('/delaware')).status, 301);
  assert.equal((await request(app).get('/delaware/striped-bass')).headers.location, '/delaware/striped-bass/');
  const state = await request(app).get('/delaware/');
  assert.equal(state.status, 200); assert.match(state.text, /Delaware fishing regulations/);
  const hub = await request(app).get('/delaware/saltwater/');
  assert.equal(hub.status, 200); assert.match(hub.text, /Summer Flounder/);
  assert.equal((await request(app).get('/delaware/tautog/')).status, 200);
  assert.equal((await request(app).get('/delaware/nope/')).status, 404);
  assert.equal((await request(app).get('/new-jersey/')).status, 404);
  const sm = await request(app).get('/sitemap.xml');
  assert.equal(sm.status, 200); assert.equal((sm.text.match(/<url>/g) || []).length, regs.species.length + 5);
  assert.match((await request(app).get('/robots.txt')).text, /Sitemap: https:\/\/slotgauge\.com\/sitemap\.xml/);
  const v = await request(app).get('/googleTEST123.html');
  assert.equal(v.status, 200); assert.equal(v.text, 'google-site-verification: googleTEST123.html');
});
