import type { PersonProfile } from '../../types/people';

/**
 * The NCC robing chart for PPC '26 — every choir and singing band, grouped by
 * the SERVICE they sing at.
 *
 * Same reasoning as the gospel bands next door: shipped in the build because
 * People are stored per browser and nothing syncs them, so a roster typed in at
 * the desk would not exist for the operator working over the relay. Seeded with
 * fixed ids through `importPeople`, which never overwrites — so a name the
 * operator corrects, or deletes, stays corrected or deleted.
 *
 * ## Grouped by service, because that is how the operator works
 *
 * Asked for in those words: all the dawn groups under one group, afternoon
 * under one, evening under one. The chart is laid out by DAY, but nobody runs a
 * day — they run a service, and at 5am the only names that matter are the ones
 * singing at dawn.
 *
 * The day is in the note rather than the group, so both axes still work: typing
 * "dawn" narrows to the service, typing "24" narrows to the Monday.
 *
 * ## The chart's shorthand is expanded, and the original kept
 *
 * `ch` and `S/b` are how the chart abbreviates "choir" and "singing band". They
 * are not part of anybody's name, and "Effiakuma ch" over a live camera would
 * be a mistake. `displayName` expands them; the chart's exact token stays in the
 * note, so it remains searchable and anyone can check a name against the paper.
 */

export const NCC_CHOIR_SERVICES = ['Dawn', 'Afternoon', 'Evening'] as const;
export type NccService = (typeof NCC_CHOIR_SERVICES)[number];

/** Prefix on every group label, so "choir" alone finds the whole roster. */
export const NCC_GROUP_PREFIX = 'Choir';

interface ChartDay {
  date: string;
  /** The chart's weekday spelling, for the note. */
  day: string;
  dawn?: string[];
  afternoon?: string[];
  evening?: string[];
}

/**
 * THE CHART, TRANSCRIBED AS IT IS WRITTEN.
 *
 * Slots holding a programme item rather than a singing group — ARRIVAL /
 * Registration, SPORTS AND GAMES, DIVINE HEALING, TOWN CLEANING, FINAL
 * REHEARSALS, and the three MUSIC COMP parts — are deliberately absent. They
 * belong to the service plan, not to a roster of names to put on a lower third,
 * and seeding them would put "DIVINE HEALING" in a picker whose whole job is
 * answering "who is singing".
 *
 * `21-06-2026` on the paper for the Friday is a typo for August; the date here
 * is the one the convention actually runs on.
 */
export const NCC_ROBING_CHART: ReadonlyArray<ChartDay> = [
  {
    date: '2026-08-19',
    day: 'Wed 19/8',
    evening: ['G.Esikuma-ch', 'G.Achiase ch', 'G.Mankesim ch', 'G. Beseadze ch']
  },
  {
    date: '2026-08-20',
    day: 'Thu 20/8',
    dawn: ['K. Adwer ch', 'Dominase ch', 'Gyaman ch', 'A.Nsuaem ch', 'Owane ch'],
    afternoon: ['Mando ch', 'Nsawam ch', 'Dahom ch', 'Mozano ch', 'Ekwamkrom ch'],
    evening: ['Kasoa N3 ch', 'Kojokrom ch', 'Mankron Jun ch', 'Aakra S/b', 'Winneba S/b']
  },
  {
    date: '2026-08-21',
    day: 'Fri 21/8',
    dawn: ['Kweikrom ch', 'Ebiram ch', 'Kasoa N2 ch', 'Betsenase S/b', 'A.Edubiase Sb'],
    afternoon: ['Potsin ch', 'Mankesim GH', 'Subriso ch', 'Osedze ch', 'Aj.Besease ch'],
    evening: ['A.Achiase ch', 'Anomabo ch', 'Odoben ch', 'Sampa S/b', 'Abeye S/b']
  },
  {
    date: '2026-08-22',
    day: 'Sat 22/8',
    dawn: ['Edubiase ch', 'Brakwa ch', 'Otwereso ch', 'Half Assine S/b', 'Akwatia S/b', 'Gh Camp S/b'],
    afternoon: ['Esiam ch', 'Pramkese ch', 'Akim Oda', 'A.Swedru ch', 'Asamankese ch'],
    evening: ['Kasapin ch', 'Nyamekrom ch', 'Goaso ch', 'As,Akropong Sb', 'Aj. Abeadze Sb']
  },
  {
    date: '2026-08-23',
    day: 'Sun 23/8',
    dawn: ['Effiakuma ch', 'Akonfudi ch', 'Efutu ch', 'Akenkasu ch', 'Apam ch'],
    afternoon: ['Akroso ch', 'Abodom ch', 'Cape Coast ch', 'Darkoman ch'],
    evening: ['W.Amoanda ch', 'Endwa S/b', 'Kyeremase ch', 'Sankore ch', 'Jukwa ch']
  },
  {
    date: '2026-08-24',
    day: 'Mon 24/8',
    dawn: ['Boso ch', 'Otaakrom ch', 'Sisikor ch', 'G. Assin ch', 'Mempom S/b', 'Wawase S/b'],
    afternoon: ['Komenda ch', 'Asafo ch', 'Ankamu ch', 'Mallam ch', 'Senya ch'],
    evening: ['Aboso choir', 'Anyinasu ch', 'G.Obir ch', 'Osenase S/b', 'IVCG-Ghana']
  },
  {
    date: '2026-08-25',
    day: 'Tue 25/8',
    dawn: ['Bedum ch', 'G.Kumasi ch', 'Dompim S/b', 'Santase ch', 'W.Asikuma Sb'],
    afternoon: ['Ataabadze ch', 'Imuna ch', 'Dawurampon', 'Otuam ch', 'Apam Area ch'],
    evening: ['Tiankama Nk ch', 'A.Harmonius ch', 'Mfantseman ch', 'Saltpond ch', 'Ahafo Kokofu Sb']
  },
  {
    date: '2026-08-26',
    day: 'Wed 26/8',
    dawn: ['Tarkwa choir', 'Afranse choir', 'Towoboase S/B', 'Kamaboi Sb', 'Denkyira ch', 'Nyamebekyre Sb'],
    /* Afternoon is SPORTS AND GAMES — no singing group on the chart. */
    evening: ['W.Darman ch', 'Buduatta ch', 'Juaso S/b', 'Anyinase S/b', 'Gyadem/Danso Sb', 'Ampiajumako ch']
  },
  {
    date: '2026-08-27',
    day: 'Thu 27/8',
    dawn: ['Bankoman ch', 'Mumford ch', 'Nkontompo ch', 'Abrehyia ch', 'Samreboi S/b'],
    afternoon: ['Takorase ch', 'Kissi ch', 'Odorkor ch', 'Mankrong ch', 'Nyankumasi ch'],
    evening: ['Central Voices', 'Ohiamatuo ch', 'Konongo FT ch', 'Asuom ch', 'Yamoransa ch']
  },
  /* Fri 28/8 is Divine Healing and Music Competition Part I; Sat 29/8 is town
     cleaning, rehearsals and Parts II and III. No named groups on either. */
  {
    date: '2026-08-30',
    day: 'Sun 30/8',
    dawn: ['Mozano ch', 'Sekondi ch', 'Kade ch'],
    afternoon: ['Abeka ch', 'Takoradi ch', 'Chorkor ch'],
    evening: ['Bogoso ch', 'Kwesimintsim', 'W. Fortes']
  }
];

/**
 * Expand the chart's shorthand into a name that can go on air.
 *
 * Suffix only, and only these two — everything else is left exactly as written,
 * including the chart's own punctuation, because guessing at "As,Akropong" or
 * "Mankesim GH" would be inventing names rather than reading them.
 */
export function expandChartName(raw: string): string {
  const trimmed = raw.trim();
  const band = trimmed.match(/^(.*?)[\s-]*(S\/[bB]|Sb|S\/B)$/);
  if (band) return `${band[1].trim()} Singing Band`;
  const choir = trimmed.match(/^(.*?)[\s-]*(ch|choir|Choir)$/);
  if (choir) return `${choir[1].trim()} Choir`;
  return trimmed;
}

/** Stable, namespaced, and derived from the chart token rather than position. */
export function choirSlug(raw: string): string {
  return expandChartName(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Same fixed stamp as the bands, and for the same reason — see `gospelBands`. */
const SEEDED_AT = '2026-08-17T00:00:00.000Z';

interface Appearance {
  raw: string;
  service: NccService;
  day: string;
}

/** Every (group, service, day) the chart lists, flattened. */
export const NCC_APPEARANCES: ReadonlyArray<Appearance> = NCC_ROBING_CHART.flatMap((entry) =>
  ([
    ['Dawn', entry.dawn],
    ['Afternoon', entry.afternoon],
    ['Evening', entry.evening]
  ] as ReadonlyArray<[NccService, string[] | undefined]>).flatMap(([service, names]) =>
    (names ?? []).map((raw) => ({ raw, service, day: entry.day }))
  )
);

/**
 * ONE RECORD PER GROUP, not per appearance.
 *
 * A few groups appear more than once — Mozano sings on the Thursday afternoon
 * and again at dawn on the closing Sunday — and two identical rows in a picker
 * give the operator no way to tell them apart. So the services and days are
 * collected onto the single record, and because the search matches substrings,
 * a group in two services is still found by either one.
 */
export const NCC_CHOIR_PEOPLE: PersonProfile[] = (() => {
  const byName = new Map<string, { raw: string; services: NccService[]; days: string[] }>();
  for (const { raw, service, day } of NCC_APPEARANCES) {
    const name = expandChartName(raw);
    const entry = byName.get(name) ?? { raw, services: [], days: [] };
    if (!entry.services.includes(service)) entry.services.push(service);
    if (!entry.days.includes(day)) entry.days.push(day);
    byName.set(name, entry);
  }
  return [...byName.entries()].map(([displayName, entry]) => {
    const services = NCC_CHOIR_SERVICES.filter((service) => entry.services.includes(service));
    return {
      id: `ppc26-choir-${choirSlug(entry.raw)}`,
      displayName,
      title: 'Ministration in Songs',
      subtitle: "Annual PPC '26",
      group: `${NCC_GROUP_PREFIX} · ${services.join(' · ')}`,
      /* "morning" rides along ONLY on the dawn groups, because that is the word
         the operator used while the chart says dawn — both should find the 5am
         names. It was appended to every service, which produced the nonsense
         "Evening (morning)" and would have made a search for "morning" return
         the entire roster. The chart's own token is kept last so a name can be
         checked against the paper. */
      notes: `NCC robing chart · ${services.join(', ')}${
        services.includes('Dawn') ? ' (morning)' : ''
      } · ${entry.days.join(', ')} · "${entry.raw}"`,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT
    };
  });
})();
