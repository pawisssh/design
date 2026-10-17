import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getReleases } from '@/lib/releases';

export default async function ReleasesPage() {
  const releases = await getReleases();
  return (
    <main className="page">
      <h1 className="title">Release notes</h1>
      {releases.map(r => (
        <article key={r.version} className="release">
          <h2 className="version">{r.version}</h2>
          <p className="summary">{r.summary}</p>
        </article>
      ))}
      <Button asChild size="sm">
        <Link href="/subscribe">Get updates</Link>
      </Button>
    </main>
  );
}
