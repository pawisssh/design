// #94: does validate() accept a top-level `drafted` map, and does adding one void the Button approval?
// usage (from the repo root): node <this file>
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const { validate, contentHash } = await import(resolve('skills/contract/scripts/contract.mjs'));
const F = JSON.parse(readFileSync('design-systems/carbon/carbon.foundations.json', 'utf8'));
const c = JSON.parse(readFileSync('design-systems/carbon/contracts/button.component.json', 'utf8'));
const show = (label, r) => console.log(label, JSON.stringify(r).slice(0, 400));
show('as is:', validate(c, F));
const d = structuredClone(c);
d.drafted = { 'icons.default': { by: 'agent', evidence: ['docs example'], fingerprint: 'sha256:0' } };
show('with drafted:', validate(d, F));
console.log('hash before', contentHash(c), '\nhash after ', contentHash(d));
