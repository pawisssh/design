// The committed shadcn Button Contract is the Adapter's draft plus the owner's selection: their omit patch and
// approval. A fresh Adapter run from no prior Contract writes that draft, so these tests expect the committed file with
// the Adapter's own selection spliced back in, byte for byte.
import { readFileSync } from 'node:fs';
import { rewriteJson } from '../../contract/scripts/io.mjs';

const root = new URL('../../../', import.meta.url);
export const COMMITTED_PATH = 'design-systems/shadcn/contracts/button.component.json';
export const committedText = readFileSync(new URL(COMMITTED_PATH, root), 'utf8');
export const committed = JSON.parse(committedText);

// The Adapter's selection: its one twin-state omit rule, 2304 variants, a draft.
export const DRAFT_SELECTION = { status: 'draft', omit: committed.selection.omit.slice(0, 1), expectedCount: 2304, approval: null };
export const draft = { ...committed, selection: DRAFT_SELECTION };
export const draftText = rewriteJson(committedText, draft);
