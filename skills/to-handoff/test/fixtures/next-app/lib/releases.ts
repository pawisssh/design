export type Release = { version: string; date: string; summary: string };

export const mockReleases: Release[] = [
  { version: '2.4.0', date: '2026-09-30', summary: 'Shared views and faster search.' },
  { version: '2.3.1', date: '2026-09-12', summary: 'Fixes for exports.' },
];

export async function getReleases(): Promise<Release[]> {
  await new Promise(resolve => setTimeout(resolve, 300));
  return mockReleases;
}
