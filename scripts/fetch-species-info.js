#!/usr/bin/env node
// Ingest Wikipedia summaries for every species in every state's regulations into data/species-info.json.
//   npm run species-info            # fetch missing / stale (90 days)
//   npm run species-info -- --all   # refetch everything
import { buildAllRegs } from '../src/regs.js';
import { refreshSpeciesInfo, saveSpeciesInfo, loadSpeciesInfo } from '../src/wiki.js';

const all = process.argv.includes('--all');
const regs = buildAllRegs();
const info = loadSpeciesInfo();
const r = await refreshSpeciesInfo(regs, { info, maxAgeDays: all ? -1 : 90, log: (l) => console.log(l) });
saveSpeciesInfo(r.info);
const have = Object.values(r.info).filter((x) => !x.missing).length;
console.log(`species-info: ${r.wanted} titles wanted, ${r.fetched} fetched (${r.ok} ok, ${r.miss} missing), ${have} with summaries on file`);
