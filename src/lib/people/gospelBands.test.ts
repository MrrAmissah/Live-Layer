import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GOSPEL_BAND_GROUP, GOSPEL_BAND_PEOPLE, GOSPEL_BAND_SCHEDULE } from './gospelBands';

/**
 * The roster is the chart, and the chart is the thing being trusted on air.
 * These cases exist so a typo in a band's name is a failing test rather than a
 * wrong name over a live camera.
 */
describe('the PPC ’26 gospel band roster', () => {
  it('carries every group on the chart, once each', () => {
    // Eight groups across twelve days — several play more than one day, and a
    // roster with a band listed twice would show the operator two identical
    // rows and no way to tell them apart.
    const names = GOSPEL_BAND_PEOPLE.map((person) => person.displayName);
    expect(new Set(names).size).toBe(names.length);
    expect(names.sort()).toEqual(
      [
        'Accra',
        'Akim Oda',
        'Asamankese',
        'Cape Coast',
        'Central Band',
        'Effia/Takoradi',
        'G. House Mk',
        'G. Mankesim Mozano'
      ].sort()
    );
  });

  it('covers all twelve days of the convention with no gaps', () => {
    // 19–30 August inclusive. A missing day is a night with no band on the
    // chart, which is a question the operator would have to answer live.
    expect(GOSPEL_BAND_SCHEDULE).toHaveLength(12);
    const days = GOSPEL_BAND_SCHEDULE.map((row) => row.date);
    expect(days[0]).toBe('2026-08-19');
    expect(days[days.length - 1]).toBe('2026-08-30');
    expect(new Set(days).size).toBe(12);
  });

  it('schedules only bands that exist in the roster', () => {
    // A schedule naming a band the roster does not hold is a row the search can
    // never find.
    const known = new Set(GOSPEL_BAND_PEOPLE.map((person) => person.displayName));
    for (const row of GOSPEL_BAND_SCHEDULE) {
      expect(known, row.date).toContain(row.band);
    }
  });

  it('opens with Central Band on the 19th', () => {
    // Stated explicitly when the chart was handed over: "first name is Central
    // band".
    expect(GOSPEL_BAND_SCHEDULE[0]).toEqual({ date: '2026-08-19', band: 'Central Band' });
  });

  it('puts each band’s performance days where the search can reach them', () => {
    /**
     * The operator's question mid-convention is "who is on tonight", and the
     * fast-swap box searches `notes`. Both bands that play twice must say so —
     * a note holding one of their two days would send the operator looking for
     * a different band on the other.
     */
    const byName = new Map(GOSPEL_BAND_PEOPLE.map((person) => [person.displayName, person]));
    expect(byName.get('Central Band')!.notes).toContain('19/8');
    expect(byName.get('Central Band')!.notes).toContain('29/8');
    expect(byName.get('Effia/Takoradi')!.notes).toContain('28/8');
    expect(byName.get('Effia/Takoradi')!.notes).toContain('30/8');
    expect(byName.get('Akim Oda')!.notes).toContain('25/8');
  });

  it('labels every one of them as the same group', () => {
    // "Group it as gospel band" — one label, spelled one way, or typing it
    // finds some of them.
    for (const person of GOSPEL_BAND_PEOPLE) {
      expect(person.group, person.displayName).toBe(GOSPEL_BAND_GROUP);
      expect(person.notes, person.displayName).toContain(GOSPEL_BAND_GROUP);
    }
  });

  it('fills the lines a performer lower third actually renders', () => {
    // `personFieldPatch` maps displayName -> name, title -> title,
    // churchName || subtitle -> subtitle. A band with no title leaves the
    // previous performer's title beside a new name.
    for (const person of GOSPEL_BAND_PEOPLE) {
      expect(person.displayName.trim(), person.id).not.toBe('');
      expect(person.title, person.id).toBeTruthy();
      expect(person.subtitle, person.id).toBeTruthy();
    }
  });

  it('uses stable ids and fixed timestamps, so re-seeding is a no-op', () => {
    /**
     * BOTH HALVES MATTER.
     *
     * `importPeople` skips ids it already holds, so a generated id would
     * re-seed a band the operator had deleted on the very next refresh — a
     * starting point that keeps coming back is not a starting point.
     *
     * And the timestamps are fixed rather than `new Date()`: these records are
     * meant to be identical on both machines, and a seed-time stamp would make
     * them sort differently and compare unequal in a backup.
     */
    // Comments stripped first: the file EXPLAINS why it does not call
    // `new Date()`, and a naive grep reads that explanation as a usage.
    const source = readFileSync('src/lib/people/gospelBands.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(source).not.toMatch(/new Date\(\)/);
    expect(source).not.toMatch(/Math\.random|crypto\.randomUUID/);
    for (const person of GOSPEL_BAND_PEOPLE) {
      expect(person.id, person.displayName).toMatch(/^ppc26-band-[a-z-]+$/);
      expect(person.createdAt).toBe(person.updatedAt);
    }
    expect(new Set(GOSPEL_BAND_PEOPLE.map((p) => p.id)).size).toBe(GOSPEL_BAND_PEOPLE.length);
  });
});
