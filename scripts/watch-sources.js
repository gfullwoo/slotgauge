// Weekly official-source watcher. Prints a report; writes data/source-state.json, data/source-text/*.txt
// and data/source-changes.md (only when something needs a human). Exit 0 always; the workflow reads the md.
import { watchAll } from '../src/sources.js';
const { report, markdown } = await watchAll({ log: console.log, dryRun: process.argv.includes('--dry-run') });
console.log(`\nchecked ${report.checked.length}, changed ${report.changed.length}, failed ${report.failed.length}, annual review due ${report.annualDue.length}`);
if (markdown) console.log('\n' + markdown);
