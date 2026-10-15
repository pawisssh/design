// Runs the generated package against a mock figma to get the CHECK values the live run must return.
import { readFileSync } from 'node:fs';
const code = readFileSync(new URL('./gen/build-components.mcp.js', import.meta.url), 'utf8');
const pages = [];
const figma = { root: { children: pages }, createPage() { const p = { id: 'mock', name: '' }; pages.push(p); return p; } };
const AsyncFunction = (async () => {}).constructor;
console.log(JSON.stringify(await new AsyncFunction('figma', code)(figma)));
