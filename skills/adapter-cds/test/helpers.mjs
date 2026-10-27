import { readFileSync } from 'node:fs';

// What a CDS test says when it skips: the fetch that installs what it needs.
export const SOURCES_MISSING = 'CDS sources missing: run node skills/adapter-cds/scripts/sources.mjs';
export const PREVIEW_MISSING = 'CDS preview packages missing: run node skills/adapter-cds/scripts/sources.mjs';

// The fixture families of #470, one keyed by a lowercase static class (tag) and one by a Linaria literal (checkbox):
// each one's Contract and node map, its TSX under sources/cds/, and its compiled stylesheet under esm/.
export const ANCHORS = new URL('fixtures/anchors/', import.meta.url).pathname;
export const anchorFamily = key => {
  const path = `${ANCHORS}${key}.component.json`, nodesPath = `${ANCHORS}${key}.nodes.json`;
  return { path, nodesPath, contract: JSON.parse(readFileSync(path, 'utf8')), nodes: JSON.parse(readFileSync(nodesPath, 'utf8')) };
};
