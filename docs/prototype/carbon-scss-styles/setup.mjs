// PROTOTYPE (#312), throwaway. Adds a state harness to a scratch copy of health-check-management-main:
// one DrilldownItem per Prototype state, on its own page (proto.html), built by its own Vite config.
// The owner's original is never touched: run it on .scratch/carbon-scss-styles/app only.
//
//   node docs/prototype/carbon-scss-styles/setup.mjs .scratch/carbon-scss-styles/app
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const app = resolve(process.argv[2] || '.scratch/carbon-scss-styles/app');
if (!app.includes('/.scratch/')) throw new Error(`refusing to edit ${app}: not a scratch copy`);

// DrilldownItem is module-private in App.jsx. Export it in the copy only.
const appJsx = join(app, 'src/App.jsx');
if (!readFileSync(appJsx, 'utf8').includes('export { DrilldownItem }')) appendFileSync(appJsx, '\nexport { DrilldownItem }; // PROTOTYPE #312\n');

mkdirSync(join(app, 'src/__proto'), { recursive: true });
// The states DrilldownItem can render (App.jsx:41-74, props built at App.jsx:242-252), named by the
// 706:7182 Status they stand for. New has no spinner in code; its nearest props are In Progress's.
// `--` and Type (Pending/Permanent) have no Prototype code, so they are not rendered.
writeFileSync(join(app, 'src/__proto/States.jsx'), `// PROTOTYPE #312
import { DrilldownItem } from '../App.jsx';

export const STATES = [
  { state: 'None', props: { isReady: false, isActive: false, isOverdue: false } },
  { state: 'In Progress', props: { isReady: false, isActive: true, isOverdue: false } },
  { state: 'Ready to Report', props: { isReady: true, isActive: false, isOverdue: false } },
  { state: 'Overdue', props: { isReady: true, isActive: false, isOverdue: true } },
];

// The drilldown's own wrappers (App.jsx:240-241), at the reference variant's width (288).
export default function States() {
  return (
    <div className="phc-drilldown-content" style={{ width: 288 }}>
      <div className="phc-drilldown-list">
        {STATES.map(s => (
          <div key={s.state} data-state={s.state}>
            <DrilldownItem name="Robert Brown" type="Mutual Fund" {...s.props} />
          </div>
        ))}
      </div>
    </div>
  );
}
`);
writeFileSync(join(app, 'src/__proto/main.jsx'), `// PROTOTYPE #312
import { createRoot } from 'react-dom/client';
import '../App.scss';
import States from './States.jsx';

createRoot(document.getElementById('root')).render(<States />);
`);
// index.html's head, with the harness entry.
const index = readFileSync(join(app, 'index.html'), 'utf8');
writeFileSync(join(app, 'proto.html'), index.replace('/src/main.jsx', '/src/__proto/main.jsx'));
writeFileSync(join(app, 'proto.vite.config.js'), `// PROTOTYPE #312
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// vite.config.js's plugins, with the harness page as the only input.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist-proto', rollupOptions: { input: 'proto.html' } },
});
`);
console.log(`harness written into ${app}`);
