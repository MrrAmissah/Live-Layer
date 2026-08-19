import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NCC_APPEARANCES,
  NCC_CHOIR_PEOPLE,
  NCC_CHOIR_SERVICES,
  NCC_GROUP_PREFIX,
  NCC_ROBING_CHART,
  choirSlug,
  expandChartName
} from './nccChoirs';
import { GOSPEL_BAND_PEOPLE } from './gospelBands';

/**
 * 130 names off a paper chart, every one of which can end up over a live
 * camera. These cases are the difference between a transcription and a
 * transcription somebody checked.
 */
describe('the NCC robing chart', () => {
  it('covers the ten days that actually have singing groups', () => {
    /**
     * Twelve days of convention, but the 28th is Divine Healing and Music
     * Competition Part I, and the 29th is town cleaning, rehearsals and Parts
     * II and III — no named groups on either. Those are programme items, and
     * seeding them would put "DIVINE HEALING" in a picker whose only job is
     * answering "who is singing".
     */
    expect(NCC_ROBING_CHART).toHaveLength(10);
    const dates = NCC_ROBING_CHART.map((entry) => entry.date);
    expect(dates).not.toContain('2026-08-28');
    expect(dates).not.toContain('2026-08-29');
    expect(dates[0]).toBe('2026-08-19');
    expect(dates[dates.length - 1]).toBe('2026-08-30');
  });

  it('opens with the four evening groups and no dawn or afternoon slot', () => {
    // The 19th is arrival and registration until the evening service.
    const first = NCC_ROBING_CHART[0];
    expect(first.dawn).toBeUndefined();
    expect(first.afternoon).toBeUndefined();
    expect(first.evening).toHaveLength(4);
  });

  it('leaves the Wednesday afternoon empty, because it is sports and games', () => {
    const wed = NCC_ROBING_CHART.find((entry) => entry.date === '2026-08-26')!;
    expect(wed.dawn).toBeTruthy();
    expect(wed.evening).toBeTruthy();
    expect(wed.afternoon).toBeUndefined();
  });

  it('holds every appearance on the chart, and one record per group', () => {
    // 131 slots, 130 groups: exactly one sings twice.
    expect(NCC_APPEARANCES).toHaveLength(131);
    expect(NCC_CHOIR_PEOPLE).toHaveLength(130);
    const names = NCC_CHOIR_PEOPLE.map((person) => person.displayName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('collects a group that sings twice onto ONE record, not two rows', () => {
    /**
     * Mozano sings on the Thursday afternoon and again at dawn on the closing
     * Sunday. Two identical rows in a picker give the operator no way to tell
     * them apart — and because the search matches substrings, one record
     * carrying both services is still found by either word.
     */
    const mozano = NCC_CHOIR_PEOPLE.filter((person) => person.displayName.startsWith('Mozano'));
    expect(mozano).toHaveLength(1);
    expect(mozano[0].group).toContain('Dawn');
    expect(mozano[0].group).toContain('Afternoon');
    expect(mozano[0].notes).toContain('Thu 20/8');
    expect(mozano[0].notes).toContain('Sun 30/8');
  });
});

describe('grouping by service, which is how the operator works', () => {
  it('puts every group under the service it sings at', () => {
    // Asked for in those words: all the dawn groups under one group, afternoon
    // under one, evening under one. Nobody runs a day — they run a service.
    for (const person of NCC_CHOIR_PEOPLE) {
      expect(person.group, person.displayName).toMatch(
        new RegExp(`^${NCC_GROUP_PREFIX} · (Dawn|Afternoon|Evening)`)
      );
    }
  });

  it('lets one search find the whole roster and another find one service', () => {
    const all = NCC_CHOIR_PEOPLE.filter((p) => p.group!.toLowerCase().includes('choir'));
    expect(all).toHaveLength(130);
    for (const service of NCC_CHOIR_SERVICES) {
      const some = NCC_CHOIR_PEOPLE.filter((p) => p.group!.includes(service));
      expect(some.length, service).toBeGreaterThan(30);
      expect(some.length, service).toBeLessThan(NCC_CHOIR_PEOPLE.length);
    }
  });

  it('offers "morning" as a way in, and only for the dawn groups', () => {
    /**
     * The chart says DAWN; the operator said mornings. Both should find the 5am
     * names — but the hint was first appended to every service, which produced
     * the nonsense "Evening (morning)" and would have made a search for
     * "morning" return all 130.
     */
    const morning = NCC_CHOIR_PEOPLE.filter((p) => p.notes!.toLowerCase().includes('morning'));
    expect(morning.length).toBeGreaterThan(30);
    for (const person of morning) {
      expect(person.group, person.displayName).toContain('Dawn');
    }
  });

  it('keeps the day searchable, so both axes work', () => {
    // "dawn" narrows to the service; "24" narrows to the Monday.
    const monday = NCC_CHOIR_PEOPLE.filter((p) => p.notes!.includes('24/8'));
    expect(monday.length).toBe(16);
  });
});

describe('the chart’s shorthand, expanded for air', () => {
  it('turns the chart’s suffixes into words a congregation would read', () => {
    // "Effiakuma ch" over a live camera is a mistake; `ch` and `S/b` are how the
    // paper abbreviates, not what anybody is called.
    expect(expandChartName('Effiakuma ch')).toBe('Effiakuma Choir');
    expect(expandChartName('G.Esikuma-ch')).toBe('G.Esikuma Choir');
    expect(expandChartName('Aboso choir')).toBe('Aboso Choir');
    expect(expandChartName('Betsenase S/b')).toBe('Betsenase Singing Band');
    expect(expandChartName('A.Edubiase Sb')).toBe('A.Edubiase Singing Band');
    expect(expandChartName('Towoboase S/B')).toBe('Towoboase Singing Band');
  });

  it('leaves a name with no suffix exactly as written', () => {
    /**
     * Seven of them, and every one is left alone on purpose: guessing at
     * "Mankesim GH" or "As,Akropong" would be inventing names rather than
     * reading them. If any of these is wrong on the paper it is the paper that
     * needs correcting.
     */
    for (const raw of ['Mankesim GH', 'Akim Oda', 'IVCG-Ghana', 'Dawurampon', 'Central Voices', 'Kwesimintsim', 'W. Fortes']) {
      expect(expandChartName(raw)).toBe(raw);
    }
    const untouched = NCC_CHOIR_PEOPLE.filter((p) => !/(Choir|Singing Band)$/.test(p.displayName));
    expect(untouched).toHaveLength(7);
  });

  it('keeps the paper’s own token, so a name can be checked against it', () => {
    const effiakuma = NCC_CHOIR_PEOPLE.find((p) => p.displayName === 'Effiakuma Choir')!;
    expect(effiakuma.notes).toContain('"Effiakuma ch"');
  });
});

describe('seeding safely alongside everything else', () => {
  it('uses stable ids that cannot collide with the gospel bands', () => {
    /**
     * "Akim Oda", "Cape Coast" and "Asamankese" appear on BOTH charts — as a
     * gospel band and as a church choir. They are different entries for
     * different things, and the namespaces are what keep one from overwriting
     * the other when both rosters seed into the same library.
     */
    const choirIds = new Set(NCC_CHOIR_PEOPLE.map((p) => p.id));
    expect(choirIds.size).toBe(NCC_CHOIR_PEOPLE.length);
    for (const person of NCC_CHOIR_PEOPLE) expect(person.id).toMatch(/^ppc26-choir-[a-z0-9-]+$/);
    for (const band of GOSPEL_BAND_PEOPLE) expect(choirIds.has(band.id)).toBe(false);
  });

  it('re-seeds to nothing: no clocks, no randomness', () => {
    // `importPeople` skips ids it already holds, so a generated id would
    // resurrect a group the operator deleted on the very next refresh.
    const source = readFileSync('src/lib/people/nccChoirs.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(source).not.toMatch(/new Date\(\)/);
    expect(source).not.toMatch(/Math\.random|crypto\.randomUUID/);
    for (const person of NCC_CHOIR_PEOPLE) expect(person.createdAt).toBe(person.updatedAt);
  });

  it('fills the lines a performer lower third renders', () => {
    for (const person of NCC_CHOIR_PEOPLE) {
      expect(person.displayName.trim(), person.id).not.toBe('');
      expect(person.title, person.id).toBeTruthy();
      expect(person.subtitle, person.id).toBeTruthy();
    }
  });

  it('generates a usable slug for every name on the chart', () => {
    for (const { raw } of NCC_APPEARANCES) {
      expect(choirSlug(raw), raw).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
