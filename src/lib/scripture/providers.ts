import type { ScriptureProvider } from '../../types/scripture';
import { bibleApiProvider } from './bibleApiProvider';

export const scriptureProviders: ScriptureProvider[] = [bibleApiProvider];
export const defaultScriptureProvider = bibleApiProvider;
