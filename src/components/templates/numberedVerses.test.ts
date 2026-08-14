import { describe, expect, it } from 'vitest';
import { splitNumberedVerses } from './ScriptureCard';

const NBSP = ' ';

/**
 * Verse numbers, the way a printed Bible sets them.
 *
 * The provider marks each verse with its number and a NON-BREAKING SPACE. That
 * character is the whole design: `values` is a flat `Record<string, string>` all
 * the way to the renderer and the operator edits this text in a textarea, so the
 * marker has to survive a round trip through a plain string AND be invisible.
 * It also has to be something nobody types, which is what stops "40 days and 40
 * nights" being sliced into a new verse.
 */
describe('finding the verse numbers', () => {
  it('splits a passage into its numbered verses', () => {
    const parts = splitNumberedVerses(`4${NBSP}Charity suffereth long. 5${NBSP}Doth not behave itself.`);
    expect(parts).toEqual([
      { n: '4', text: 'Charity suffereth long.' },
      { n: '5', text: 'Doth not behave itself.' }
    ]);
  });

  it('leaves an ordinary number in the text alone', () => {
    // THE RULE THAT MAKES THIS SAFE. A plain space would have made this "verse
    // 40", and the passage would have been cut in half on air.
    const parts = splitNumberedVerses(`2${NBSP}He fasted 40 days and 40 nights.`);
    expect(parts).toEqual([{ n: '2', text: 'He fasted 40 days and 40 nights.' }]);
  });

  it('returns hand-typed text as one unnumbered run', () => {
    // Every verse an operator typed themselves, and every passage saved before
    // the provider started marking them.
    expect(splitNumberedVerses('Yahweh is my shepherd: I shall lack nothing.')).toEqual([
      { text: 'Yahweh is my shepherd: I shall lack nothing.' }
    ]);
    expect(splitNumberedVerses('')).toEqual([{ text: '' }]);
  });

  it('keeps text that precedes the first marker', () => {
    // Nothing should be able to fall out of the passage silently.
    const parts = splitNumberedVerses(`A heading. 1${NBSP}In the beginning.`);
    expect(parts).toEqual([{ text: 'A heading.' }, { n: '1', text: 'In the beginning.' }]);
  });

  it('never loses a word of the passage', () => {
    const source = `4${NBSP}Charity suffereth long, and is kind. 5${NBSP}Doth not behave itself unseemly. 6${NBSP}Rejoiceth in the truth.`;
    const rebuilt = splitNumberedVerses(source)
      .map((part) => part.text)
      .join(' ');
    const expected = source.replace(/\d+ /g, '').replace(/\s+/g, ' ').trim();
    expect(rebuilt).toBe(expected);
  });

  it('handles a three-digit verse, because Psalm 119 exists', () => {
    const parts = splitNumberedVerses(`176${NBSP}I have gone astray like a lost sheep.`);
    expect(parts).toEqual([{ n: '176', text: 'I have gone astray like a lost sheep.' }]);
  });
});
