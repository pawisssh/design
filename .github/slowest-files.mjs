// node:test reporter: the slowest test files of a run as a Markdown table, written to the reporter's destination and,
// in CI, appended to the job summary ($GITHUB_STEP_SUMMARY).
import { appendFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const SHOWN = 10;

export default async function* slowestFiles(source) {
  const files = [];
  // Each file runs as a test named by its path: its test:complete times the file's whole process, imports included,
  // and still comes when the file crashes. test:summary would time its tests only, and skip a crashed file.
  for await (const { type, data } of source) {
    if (type === 'test:complete' && data.file && resolve(data.name) === data.file) {
      files.push({ file: relative(process.cwd(), data.file), ms: data.details.duration_ms, failed: !data.details.passed });
    }
  }
  const rows = files.sort((a, b) => b.ms - a.ms).slice(0, SHOWN)
    .map(f => `| \`${f.file}\` | ${(f.ms / 1000).toFixed(1)}s${f.failed ? ', failed' : ''} |`);
  const table = `### Slowest test files (${rows.length} of ${files.length})\n\n| File | Time |\n| --- | ---: |\n${rows.join('\n')}\n`;
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table);
  yield table;
}
