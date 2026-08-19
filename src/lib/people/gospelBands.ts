import type { PersonProfile } from '../../types/people';

/**
 * The PPC '26 gospel band roster, shipped as code rather than typed in.
 *
 * From "GOSPEL BANDS FOR PPC 2026 PERFORMANCE CHART" — twelve days, eight
 * groups, several of them on more than one day.
 *
 * ## Why it is in the build and not in the People library
 *
 * People are stored per browser. The desk runs LiveLayer on the graphics
 * machine and a second operator controls it from another one over the relay,
 * and NOTHING syncs a person between them — so a roster typed in at the desk
 * simply would not exist for the operator who most needs it, and the fix would
 * be to remember to restore a backup on every machine before every service.
 *
 * Shipping it means both machines have the same eight names the moment they
 * load the app, with no step to forget.
 *
 * ## Seeded, never imposed
 *
 * `importPeople` adds only ids it does not already hold and never overwrites,
 * so an operator who renames a band, adds a photo, or deletes one outright
 * keeps that decision through every reload and every new build. The ids are
 * stable and namespaced for exactly that reason — a generated id would
 * re-seed a deleted band on the next refresh, which is the difference between
 * a starting point and something that keeps coming back.
 */

/** Namespaced and fixed, so a re-seed recognises what it already added. */
const id = (slug: string) => `ppc26-band-${slug}`;

export const GOSPEL_BAND_GROUP = 'Gospel Band';

/**
 * The chart, in the chart's own words.
 *
 * Kept as the schedule rather than flattened into the profiles: two bands play
 * on two separate days each, and the operator's question mid-convention is
 * "who is on tonight", which a list of names cannot answer.
 */
export const GOSPEL_BAND_SCHEDULE: ReadonlyArray<{ date: string; band: string }> = [
  { date: '2026-08-19', band: 'Central Band' },
  { date: '2026-08-20', band: 'G. Mankesim Mozano' },
  { date: '2026-08-21', band: 'G. Mankesim Mozano' },
  { date: '2026-08-22', band: 'Accra' },
  { date: '2026-08-23', band: 'Accra' },
  { date: '2026-08-24', band: 'Asamankese' },
  { date: '2026-08-25', band: 'Akim Oda' },
  { date: '2026-08-26', band: 'G. House Mk' },
  { date: '2026-08-27', band: 'Cape Coast' },
  { date: '2026-08-28', band: 'Effia/Takoradi' },
  { date: '2026-08-29', band: 'Central Band' },
  { date: '2026-08-30', band: 'Effia/Takoradi' }
];

/** Day-and-month, as the chart writes them, for the note under each name. */
function daysFor(band: string): string {
  const days = GOSPEL_BAND_SCHEDULE.filter((row) => row.band === band).map((row) => {
    const [, month, day] = row.date.split('-');
    return `${Number(day)}/${Number(month)}`;
  });
  return days.join(', ');
}

/**
 * `createdAt`/`updatedAt` are FIXED, not `new Date()`.
 *
 * These records are the same on every machine, and a timestamp taken at seed
 * time would differ between them — which turns a shared roster into two
 * roster-shaped things that sort differently and compare unequal in a backup.
 */
const SEEDED_AT = '2026-08-17T00:00:00.000Z';

const BANDS = [
  { slug: 'central', name: 'Central Band' },
  { slug: 'mankesim-mozano', name: 'G. Mankesim Mozano' },
  { slug: 'accra', name: 'Accra' },
  { slug: 'asamankese', name: 'Asamankese' },
  { slug: 'akim-oda', name: 'Akim Oda' },
  { slug: 'house-mk', name: 'G. House Mk' },
  { slug: 'cape-coast', name: 'Cape Coast' },
  { slug: 'effia-takoradi', name: 'Effia/Takoradi' }
] as const;

export const GOSPEL_BAND_PEOPLE: PersonProfile[] = BANDS.map(({ slug, name }) => ({
  id: id(slug),
  displayName: name,
  /* What a performer lower third calls the middle line, and the wording this
     church already uses on that template in the PPC pack. */
  title: 'Ministration in Songs',
  subtitle: "Annual PPC '26",
  /* Searchable, and the answer to "who is on tonight" without leaving the box. */
  notes: `${GOSPEL_BAND_GROUP} · ${daysFor(name)}`,
  group: GOSPEL_BAND_GROUP,
  createdAt: SEEDED_AT,
  updatedAt: SEEDED_AT
}));
