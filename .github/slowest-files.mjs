// node:test reporter: the ten slowest test files of a run as a Markdown table, appended to the job summary in CI
// ($GITHUB_STEP_SUMMARY) and written to the reporter's destination elsewhere.
import { appendFileSync } from 'node:fs';
import { relative } from 'node:path';

export default async function* slowestFiles(source) {
  const files = [];
  // One test:summary per file, timing the file's whole process; the run's own summary has no file.
  for await (const { type, data } of source) {
    if (type === 'test:summary' && data.file) files.push({ file: relative(process.cwd(), data.file), ms: data.duration_ms });
  }
  const rows = files.sort((a, b) => b.ms - a.ms).slice(0, 10).map(f => `| \`${f.file}\` | ${(f.ms / 1000).toFixed(1)}s |`);
  const table = `### Slowest test files (${rows.length} of ${files.length})\n\n| File | Time |\n| --- | ---: |\n${rows.join('\n')}\n`;
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table);
  else yield table;
}
