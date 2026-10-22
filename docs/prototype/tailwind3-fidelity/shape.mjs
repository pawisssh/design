// Compile a few classes with Tailwind 3.4.17 (the Base44 sample's config, read as data) and Tailwind 4.3.3, and print both.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [deps3, tools4, sample] = process.argv.slice(2);
const req = createRequire(join(deps3, 'package.json'));
const postcss = req('postcss'), tw3 = req('tailwindcss');
const config = (await import(pathToFileURL(join(sample, 'tailwind.config.js')).href)).default;
const classes = 'bg-background bg-primary/50 rounded-md p-4 shadow-sm text-sm font-medium hover:bg-primary/90 ring ring-ring border';
const out3 = await postcss([tw3({ ...config, content: [{ raw: classes }] })]).process('@tailwind base;@tailwind components;@tailwind utilities;', { from: undefined });
const u3 = out3.css.slice(out3.css.indexOf('.bg-background'));
console.log('--- v3 utilities\n' + u3);
console.log('--- v3 has @layer:', /@layer/.test(out3.css), ' total bytes', out3.css.length);
const { compile } = await import(pathToFileURL(join(tools4, 'tailwindcss@4.3.3/package/dist/lib.mjs')).href);
const twdir = join(tools4, 'tailwindcss@4.3.3/package');
const c = await compile('@import "tailwindcss";', { base: twdir, loadStylesheet: async (id, base) => { const p = join(twdir, id === 'tailwindcss' ? 'index.css' : id.replace('tailwindcss/','')); return { path: p, base: twdir, content: readFileSync(p, 'utf8') }; } });
const css4 = c.build(classes.split(' '));
console.log('--- v4 utilities\n' + css4.slice(css4.indexOf('@layer utilities')).slice(0, 2500));
