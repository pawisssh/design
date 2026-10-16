// PROTOTYPE (#88): a To-preview renderer for the shadcn/ui Button, shaped like an Adapter's preview.mjs
// (previewRenderer(contract) -> {render, stylesheet, modeClass}). Throwaway; it lives on prototype/slot-styling only.
//
// What it shows: a Slot axis needs nothing from To-preview but the rule the renderer follows here. A node
// renders when the tuple's resolved layout does not set `visible: false` on it. So the svg child exists
// only where the Slot axis is filled, and shadcn's own has-[>svg]:px-* rule picks the padding.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from '../../skills/contract/scripts/contract.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const PREVIEW_DIR = join(REPO_ROOT, '.scratch/prototype-slot-styling');
const VENDOR = fileURLToPath(new URL('./vendor/button.tsx', import.meta.url));

// The new-york-v4 neutral theme, as the registry's theme for a new app (hex of the oklch values).
const THEME = `
:root { --radius: 0.625rem; --background: #ffffff; --foreground: #0a0a0a; --primary: #171717; --primary-foreground: #fafafa;
  --accent: #f5f5f5; --accent-foreground: #171717; --border: #e5e5e5; --input: #e5e5e5; --ring: #a3a3a3; --destructive: #e7000b; }
.dark { --background: #0a0a0a; --foreground: #fafafa; --primary: #e5e5e5; --primary-foreground: #171717;
  --accent: #262626; --accent-foreground: #fafafa; --border: #ffffff1a; --input: #ffffff26; --ring: #737373; --destructive: #ff6467; }
@theme inline { --color-background: var(--background); --color-foreground: var(--foreground); --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground); --color-accent: var(--accent); --color-accent-foreground: var(--accent-foreground);
  --color-border: var(--border); --color-input: var(--input); --color-ring: var(--ring); --color-destructive: var(--destructive);
  --radius-md: calc(var(--radius) - 2px); }
`;

export function previewRenderer(contract, { dir = PREVIEW_DIR } = {}) {
  if (!existsSync(join(dir, 'node_modules/tailwindcss')))
    throw new Error(`prototype packages missing in ${dir}; run: node prototypes/slot-styling/run.mjs`);
  const build = join(dir, 'build');
  mkdirSync(build, { recursive: true });

  // button.tsx as the registry ships it; `cn` and radix-ui's Slot are replaced by local stand-ins.
  writeFileSync(join(build, 'cn.js'), 'const { clsx } = require("clsx"); const { twMerge } = require("tailwind-merge");\nexports.cn = (...a) => twMerge(clsx(a));\n');
  writeFileSync(join(build, 'radix-ui.js'), 'exports.Slot = { Root: "span" };\n');
  const require = createRequire(join(dir, 'package.json'));
  require('esbuild').buildSync({
    entryPoints: [VENDOR], bundle: true, format: 'cjs', platform: 'node', outfile: join(build, 'button.cjs'),
    external: ['react', 'react/jsx-runtime'], nodePaths: [join(dir, 'node_modules')], jsx: 'automatic', logLevel: 'error',
    alias: { cn: join(build, 'cn.js'), 'radix-ui': join(build, 'radix-ui.js') },
  });

  // Tailwind over button.tsx only, without preflight (it would restyle the catalog page); a scoped reset instead.
  writeFileSync(join(build, 'input.css'), `@layer theme, base, utilities;\n@import "tailwindcss/theme.css" layer(theme);\n@import "tailwindcss/utilities.css" layer(utilities) source(none);\n@source "${VENDOR}";\n@custom-variant dark (&:is(.dark *));\n${THEME}\n@layer base { .tp-specimen button { margin: 0; padding: 0; border: 0 solid; background: transparent; font: inherit; color: inherit; } .tp-specimen svg { display: block; } }\n`);
  execFileSync(process.execPath, [join(dir, 'node_modules/@tailwindcss/cli/dist/index.mjs'), '-i', join(build, 'input.css'), '-o', join(build, 'button.css')], { cwd: dir, stdio: 'pipe' });

  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const icons = require('lucide-react');
  const { Button } = require(join(build, 'button.cjs'));
  const iconExport = key => key.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  const Icon = icons[iconExport(contract.icons.default)];
  if (!Icon) throw new Error(`lucide-react has no icon ${iconExport(contract.icons.default)}`);
  const label = contract.properties.find(p => p.type === 'TEXT').default;

  return {
    stylesheet: require('node:fs').readFileSync(join(build, 'button.css'), 'utf8'),
    modeClass: mode => (mode === 'dark' ? 'dark' : 'light'),
    render(tuple) {
      const props = {};
      for (const axis of contract.axes) Object.assign(props, axis.values.find(v => v.key === tuple[axis.key]).code || {});
      const shown = node => (resolve(contract, tuple).layout[node] || {}).visible !== false;
      const children = contract.anatomy.children.filter(n => shown(n.name))
        .map(n => (n.type === 'INSTANCE' ? React.createElement(Icon, { key: n.name }) : label));
      return renderToStaticMarkup(React.createElement(Button, props, ...children));
    },
  };
}
