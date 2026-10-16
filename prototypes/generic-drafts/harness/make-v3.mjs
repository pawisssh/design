// PROTOTYPE (#65): a second simulated upgrade, ../library -> ../library-v3, written AFTER the --fine
// fingerprint rules, to test them on changes they were not tuned on.
//   card.tsx:   a new CardMedia part (data-slot="card-media") exported between CardHeader and CardFooter
//   card.tsx:   CardFooter flex row -> flex-col (layout.card-footer.direction must reopen)
//   card.tsx:   CardTitle text-base -> text-lg (no drafted value depends on it)
//   alert.tsx:  drop has-[>svg]:grid-cols-[auto_1fr] (the icon column; anatomy/layout of the root may move)
//   button.tsx: rename size value `xs` -> `xxs` (its label must be re-drafted, the old key vanishes)
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const from = join(HERE, '../library'), to = join(HERE, '../library-v3');
cpSync(from, to, { recursive: true });
const edit = (rel, a, b) => {
  const p = join(to, rel), s = readFileSync(p, 'utf8');
  if (!s.includes(a)) throw new Error(`${rel}: ${a} not found`);
  writeFileSync(p, s.replace(a, b));
};
const card = 'components/ui/card.tsx';
edit(card, 'function CardContent(', `function CardMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-media"
      className={cn("aspect-video w-full overflow-hidden", className)}
      {...props}
    />
  )
}

function CardContent(`);
edit(card, '  CardHeader,\n', '  CardHeader,\n  CardMedia,\n');
edit(card, '"flex items-center rounded-b-xl', '"flex flex-col items-center rounded-b-xl');
edit(card, 'font-heading text-base leading-snug', 'font-heading text-lg leading-snug');
edit('components/ui/alert.tsx', ' has-[>svg]:grid-cols-[auto_1fr]', '');
edit('components/ui/button.tsx', '        xs: ', '        xxs: ');
console.log('library-v3 written');
