// The review page in a browser with a stand-in `window.claude`, shared by the Artifact and Families tab tests.
import { createRequire } from 'node:module';

const { canonical } = createRequire(import.meta.url)('../assets/review-store.js');

// The page served at a URL, so that a reload is a real one. `db` is this process's store: {path: document}, each kept
// with its keys sorted as the Artifact's db hands them back; `written` counts its sets. `claude: false` loads it with
// no runtime.
export const written = new WeakMap();
export async function open(browser, html, { db, owner = true, claude = true }) {
  const tab = await browser.newPage();
  await tab.route('http://review.test/', route => route.fulfill({ contentType: 'text/html', body: html }));
  if (claude) {
    await tab.exposeFunction('dbGet', path => (path in db ? db[path] : null));
    await tab.exposeFunction('dbSet', (path, data) => { db[path] = JSON.parse(canonical(data)); written.set(db, (written.get(db) || 0) + 1); });
    await tab.addInitScript(isOwner => {
      // As the Artifact's db does, a set takes only plain JSON data of this window: an object made in a catalog's
      // iframe is refused.
      const plain = v => v === null || ['string', 'number', 'boolean'].includes(typeof v)
        || (Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype && v.every(plain))
        || (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype && Object.values(v).every(plain));
      const set = async (path, data) => {
        if (!plain(data)) throw Object.assign(new Error('arguments must be plain JSON data'), { code: 'invalid_argument' });
        return window.dbSet(path, data);
      };
      const doc = path => ({ get: async () => { const d = await window.dbGet(path); return { exists: d !== null, data: () => d }; }, set: data => set(path, data) });
      window.claude = { use: async name => (name === 'db' ? { doc } : name === 'user' ? { isOwner: async () => isOwner } : null) };
    }, owner);
  }
  await tab.goto('http://review.test/', { waitUntil: 'load' });
  return tab;
}
export const status = tab => tab.evaluate(() => document.getElementById('status').textContent);
export async function catalog(tab, family) {
  for (const f of tab.frames()) if (f !== tab.mainFrame() && await (await f.frameElement()).getAttribute('data-family') === family) return f;
  throw new Error(`no ${family} catalog`);
}
export const checked = f => f.evaluate(() => [...document.querySelectorAll('.tp-cell')].filter(c => c.querySelector('input').checked).map(c => c.dataset.id));
