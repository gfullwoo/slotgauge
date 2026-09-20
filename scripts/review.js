// Lists species whose DNREC wording no longer matches the reviewed overlay, and prints the
// updated rawHash to paste once the overlay entry has been re-checked.
import { buildRegs, rawHash, loadJson } from '../src/regs.js';
const regs = buildRegs();
const raw = new Map(loadJson('dnrec_raw.json').species.map((s) => [s.id, s]));
const items = regs.species.filter((s) => s.needsReview);
if (!items.length) { console.log('Nothing to review.'); process.exit(0); }
for (const s of items) {
  console.log(`\n# ${s.name} [${s.habitat} #${s.id}] ${s.reviewed ? 'reviewed ' + s.reviewed : 'NO OVERLAY'}\n  season: ${s.raw.season}\n  size:   ${s.raw.size}\n  limit:  ${s.raw.limit}\n  new rawHash: ${rawHash(raw.get(s.id))}\n  ${s.url}`);
}
process.exit(1);
