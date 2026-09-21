// AI-assisted extraction: npm run extract -- NJ   (after npm run watch-sources has cached the source text)
import { extractState } from '../src/extract.js';
import { loadSources } from '../src/sources.js';
const code = (process.argv[2] || '').toUpperCase();
if (!code) { console.error('usage: npm run extract -- <STATE CODE>'); process.exit(1); }
await extractState(code, { sources: loadSources() });
