#!/usr/bin/env node
// Drafted-value fingerprints of a Carbon Contract (#144): the one place SKILL.md §2 step 13's facts are computed,
// so the agent writing a draft and the tests checking it hash the same thing (ADR 0010).
//   node skills/adapter-carbon/scripts/fingerprints.mjs <contract.json> --nodes <nodes.json> [--check | --write] [--dir <dir>]
// runs the shared command line (skills/contract/scripts/fingerprints-cli.mjs). The source files are read from the
// sources dir and checked against the Contract's `source.files` pins (`sources.mjs` fetches them).
//
// The node map names each anatomy layer the drafts key by its element's classes, without `cds--`, its own class
// first, and an optional :<version> ("text-input__field-wrapper", "text-input-wrapper form-item",
// "form-requirement:invalid"), or, for a layer with no element of its own, the layer whose element draws it:
// {"of": "Box"}. A family's map is kept at skills/adapter-carbon/nodes/<family>.nodes.json.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { draftedFingerprints, sha256 } from '../../contract/scripts/contract.mjs';
import { fingerprintsCli } from '../../contract/scripts/fingerprints-cli.mjs';
import { DEFAULT_DIR } from './sources.mjs';

const PREFIX = 'cds';
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A nested selector list resolved against its parent's: `&` takes the parent, any other selector descends from it. */
const resolve = (parent, selector) => parent.split(',').flatMap(p => selector.split(',')
  .map(s => s.includes('&') ? s.replaceAll('&', p.trim()).trim() : `${p.trim()} ${s.trim()}`)).join(', ');

/**
 * Every `selector { body }` block of an SCSS text, at any depth, as {text, resolved, ancestors}. `text` is
 * `<selector> { <body> }` with the selector as written, comments stripped, whitespace collapsed to one space,
 * strings, url() and interpolations as written, and nested blocks kept in the body. `resolved` is the selector
 * the block applies to: an at-rule (`@if`, `@include`, `@media`) takes its parent's.
 */
function scssBlocks(text, path) {
  const kept = [];
  const keep = s => `\u0000${kept.push(s) - 1}\u0000`;
  let src = '';
  for (let i = 0; i < text.length;) {
    const two = text.slice(i, i + 2);
    if (two === '/*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 2; }
    else if (two === '//') { const end = text.indexOf('\n', i); i = end < 0 ? text.length : end; }
    else if (text[i] === '"' || text[i] === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== text[i]) j += text[j] === '\\' ? 2 : 1;
      src += keep(text.slice(i, j + 1));
      i = j + 1;
    } else if (two === '#{' || /^url\(/i.test(text.slice(i, i + 4))) {
      const [opens, closes] = two === '#{' ? ['{', '}'] : ['(', ')'];
      let depth = 0, j = text.indexOf(opens, i);
      do { if (text[j] === opens) depth++; else if (text[j] === closes) depth--; j++; } while (depth && j < text.length);
      src += keep(text.slice(i, j));
      i = j;
    } else src += text[i++];
  }
  const squash = s => s.replace(/\s+/g, ' ').trim();
  const back = s => squash(s).replace(/\u0000(\d+)\u0000/g, (_, n) => kept[n]);
  const out = [];
  const open = [];
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '{') {
      const raw = squash(src.slice(start, i));
      const parent = open.at(-1)?.block;
      const within = parent ? parent.raw : '';
      const block = { raw: raw.startsWith('@') ? within : within ? resolve(within, raw) : raw, ancestors: parent ? [...parent.ancestors, parent] : [] };
      block.selector = back(raw);
      block.resolved = back(block.raw);
      out.push(block);
      open.push({ block, at: i });
      start = i + 1;
    } else if (src[i] === '}') {
      const o = open.pop();
      if (!o) throw new Error(`${path}: unbalanced \`}\` in the SCSS`);
      o.block.text = `${o.block.selector} { ${back(src.slice(o.at + 1, i))} }`;
      start = i + 1;
    } else if (src[i] === ';') start = i + 1;
  }
  if (open.length) throw new Error(`${path}: unclosed \`{\` in the SCSS after "${open[0].block.selector}"`);
  return out;
}

/**
 * fingerprints({contract, nodes, files, keys}) -> {facts: {key: facts}, fingerprints: {key: "sha256:…"}}.
 * `files` is {path: text} of the Contract's source files; `keys` defaults to the agent entries of `drafted`.
 * Throws on a layer the node map lacks and on a key with no fingerprint kind.
 */
export function fingerprints({ contract, nodes, files, keys }) {
  const family = contract.family.key;
  const react = Object.entries(files).filter(([p]) => /\.[jt]sx?$/.test(p)).map(([, t]) => t).join('\n');
  const parts = [...new Set([...react.matchAll(new RegExp(`\\$\\{prefix\\}--${escapeRe(family)}__([\\w-]+)`, 'g'))].map(m => m[1]))].sort();
  const blocks = Object.entries(files).filter(([p]) => p.endsWith('.scss')).flatMap(([p, t]) => scssBlocks(t, p));

  // A block counts when its resolved selector names one of the node's classes, or a --modifier of one, and no
  // block around it counts already (its text is inside that block's).
  const nodeFacts = (layer, seen = []) => {
    const spec = nodes[layer];
    if (spec === undefined) throw new Error(`no node for layer "${layer}" in the node map`);
    if (seen.includes(layer)) throw new Error(`\`of\` cycle: ${[...seen, layer].join(' → ')}`);
    if (typeof spec === 'object') {
      const drawer = nodeFacts(spec.of, [...seen, layer]);
      return { node: layer, element: drawer.element, rules: drawer.rules, of: drawer.node };
    }
    const [classes, version] = spec.split(':');
    const [cls, ...more] = classes.split(' ');
    const key = cls.startsWith(`${family}__`) ? cls.slice(family.length + 2) : cls;
    const names = new RegExp(`#\\{\\$prefix\\}--(${[cls, ...more].map(escapeRe).join('|')})(--[\\w-]+)?(?![\\w-])`);
    const counts = new Set(blocks.filter(b => names.test(b.resolved)));
    return { node: version ? `${key}:${version}` : key, element: [cls, ...more].map(c => `${PREFIX}--${c}`).join(' '),
      rules: [...counts].filter(b => !b.ancestors.some(a => counts.has(a))).map(b => b.text).sort() };
  };
  return draftedFingerprints(contract, { nodeFacts, parts, keys });
}

/** True when every file the Contract pins is in the sources dir (readContractSources checks their hashes). */
export function hasContractSources(contract, dir = DEFAULT_DIR) {
  return Object.keys(contract.source.files).every(p => existsSync(join(dir, 'carbon', p)));
}

/** {path: text} of the Contract's source files; throws on a missing file or one whose sha256 is not the pin. */
export function readContractSources(contract, dir = DEFAULT_DIR) {
  const out = {};
  for (const [path, pin] of Object.entries(contract.source.files)) {
    const file = join(dir, 'carbon', path);
    if (!existsSync(file)) throw new Error(`${path} missing in ${dir}; run: node skills/adapter-carbon/scripts/sources.mjs`);
    const text = readFileSync(file, 'utf8');
    if (`sha256:${sha256(text)}` !== pin) throw new Error(`${path}: sha256 does not match the Contract's pin ${pin}`);
    out[path] = text;
  }
  return out;
}

// Carbon writes its classes as `#{$prefix}--…` in Sass and `${prefix}--…` in TSX; evidence names them as `cds--…`.
const normalise = text => text.replace(/#\{\$prefix\}|\$\{prefix\}/g, PREFIX);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  fingerprintsCli({ fingerprints, readContractSources, normalise, dir: DEFAULT_DIR });
