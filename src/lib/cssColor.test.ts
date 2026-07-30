import { describe, expect, it } from 'vitest';
import { comparableColor, normalizeCssColorToHex } from './cssColor';

describe('normalizeCssColorToHex', () => {
  it('expands shorthand hex, lowercased as a picker emits it', () => {
    expect(normalizeCssColorToHex('#fff')).toBe('#ffffff');
    expect(normalizeCssColorToHex('#0F0')).toBe('#00ff00');
  });

  it('passes six-digit hex through, normalized for comparison', () => {
    expect(normalizeCssColorToHex('#AbCdEf')).toBe('#abcdef');
  });

  it('drops alpha rather than refusing the colour', () => {
    expect(normalizeCssColorToHex('#11223344')).toBe('#112233');
    expect(normalizeCssColorToHex('#1234')).toBe('#112233');
    expect(normalizeCssColorToHex('rgba(255, 0, 0, 0.5)')).toBe('#ff0000');
  });

  it('reads rgb() in both legacy and space-separated forms', () => {
    expect(normalizeCssColorToHex('rgb(255, 0, 0)')).toBe('#ff0000');
    expect(normalizeCssColorToHex('rgb(255 0 0)')).toBe('#ff0000');
    expect(normalizeCssColorToHex('rgb(255 0 0 / 40%)')).toBe('#ff0000');
    expect(normalizeCssColorToHex('rgb(100%, 0%, 0%)')).toBe('#ff0000');
  });

  it('clamps out-of-range channels the way CSS does', () => {
    expect(normalizeCssColorToHex('rgb(300, -20, 0)')).toBe('#ff0000');
  });

  it('converts hsl()', () => {
    expect(normalizeCssColorToHex('hsl(0, 100%, 50%)')).toBe('#ff0000');
    expect(normalizeCssColorToHex('hsl(120 100% 50%)')).toBe('#00ff00');
    expect(normalizeCssColorToHex('hsl(240deg 100% 50%)')).toBe('#0000ff');
    expect(normalizeCssColorToHex('hsl(0, 0%, 100%)')).toBe('#ffffff');
    expect(normalizeCssColorToHex('hsla(180, 100%, 25%, 0.5)')).toBe('#008080');
  });

  it('knows the basic named colours', () => {
    expect(normalizeCssColorToHex('red')).toBe('#ff0000');
    expect(normalizeCssColorToHex('WHITE')).toBe('#ffffff');
    expect(normalizeCssColorToHex('navy')).toBe('#000080');
    expect(normalizeCssColorToHex('grey')).toBe('#808080');
  });

  it('yields nothing for what a picker cannot stand in for', () => {
    expect(normalizeCssColorToHex('transparent')).toBeUndefined();
    expect(normalizeCssColorToHex('currentColor')).toBeUndefined();
    expect(normalizeCssColorToHex('rebeccapurple')).toBeUndefined();
    expect(normalizeCssColorToHex('not-a-colour')).toBeUndefined();
    expect(normalizeCssColorToHex('#12345')).toBeUndefined();
    expect(normalizeCssColorToHex('')).toBeUndefined();
    expect(normalizeCssColorToHex(undefined)).toBeUndefined();
  });
});

describe('comparableColor — alpha is a visible difference', () => {
  it('keeps alpha, so translucent red is not opaque red', () => {
    expect(comparableColor('rgba(255, 0, 0, 0.5)')).toBe('#ff000080');
    expect(comparableColor('#ff000080')).toBe('#ff000080');
    expect(comparableColor('rgba(255, 0, 0, 0.5)')).not.toBe(comparableColor('#ff0000'));
  });

  it('reads alpha from every notation that carries one', () => {
    expect(comparableColor('rgb(255 0 0 / 50%)')).toBe('#ff000080');
    expect(comparableColor('hsla(0, 100%, 50%, 0.5)')).toBe('#ff000080');
    expect(comparableColor('#f008')).toBe(comparableColor('#ff000088'));
  });

  it('leaves opaque colours in the plain six-digit form', () => {
    expect(comparableColor('rgba(255, 0, 0, 1)')).toBe('#ff0000');
    expect(comparableColor('#ff0000ff')).toBe('#ff0000');
    expect(comparableColor('red')).toBe('#ff0000');
  });

  it('still hands the picker an opaque hex for a translucent colour', () => {
    expect(normalizeCssColorToHex('rgba(255, 0, 0, 0.5)')).toBe('#ff0000');
  });
});

describe('comparableColor', () => {
  it('makes two spellings of one colour compare equal', () => {
    expect(comparableColor('red')).toBe(comparableColor('#FF0000'));
    expect(comparableColor('rgb(255,0,0)')).toBe(comparableColor('#ff0000'));
    expect(comparableColor('#fff')).toBe(comparableColor('#FFFFFF'));
  });

  it('keeps an unrepresentable colour as itself rather than as a fallback', () => {
    expect(comparableColor('rebeccapurple')).toBe('rebeccapurple');
    expect(comparableColor('rebeccapurple')).not.toBe(comparableColor('#0e7c86'));
  });

  it('treats absent and empty alike', () => {
    expect(comparableColor(undefined)).toBe('');
    expect(comparableColor('   ')).toBe('');
  });
});
