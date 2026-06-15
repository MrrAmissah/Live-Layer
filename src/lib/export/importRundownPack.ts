import { strFromU8, unzipSync } from 'fflate';
import type { LocalAsset, AssetType } from '../../types/assets';
import type { GraphicInstance, TemplateTheme } from '../../types/graphics';
import type { PersonProfile } from '../../types/people';
import type { Rundown, RundownItem, RundownItemSource } from '../../types/rundown';
import {
  LIVELAYER_PACK_VERSION,
  LIVELAYER_SCHEMA_VERSION,
  type LiveLayerAssetManifestEntry,
  type LiveLayerPackManifest,
  type LiveLayerPackWarning
} from '../../types/exportPack';
import { deleteAsset, saveAsset } from '../assets/assetStore';
import { deletePerson, importPeople } from '../people/peopleStore';
import { deleteRundown, importRundown, MAX_ITEMS_PER_RUNDOWN } from '../rundown/rundownStore';
import { validatePackManifest } from './importPackPreview';

const PACK_MANIFEST_NAME = 'livelayer-pack.json';
const ASSET_TYPES: AssetType[] = ['logo', 'speaker-headshot', 'event-logo', 'background', 'generic'];

export interface ImportRundownResult {
  ok: boolean;
  rundownId?: string;
  rundownName?: string;
  peopleImported: number;
  assetsImported: number;
  missingAssets: number;
  warnings: LiveLayerPackWarning[];
  error?: string;
}

interface ParsedPack {
  manifest: LiveLayerPackManifest;
  files: Record<string, Uint8Array>;
}

interface PreparedImport {
  assets: Array<{ asset: LocalAsset; blob?: Blob }>;
  people: PersonProfile[];
  rundown: Rundown;
  missingAssets: number;
  warnings: LiveLayerPackWarning[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function now(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeAssetType(kind?: string): AssetType {
  return ASSET_TYPES.includes(kind as AssetType) ? (kind as AssetType) : 'generic';
}

function filenameLabel(filename?: string): string {
  if (!filename) return 'Imported asset';
  return filename.split('/').filter(Boolean).pop() || filename;
}

async function parsePack(file: File): Promise<ParsedPack> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const manifestBytes = files[PACK_MANIFEST_NAME];
  if (!manifestBytes) throw new Error('This zip has no livelayer-pack.json — it is not a LiveLayer pack.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new Error('The pack manifest is not valid JSON.');
  }

  const validation = validatePackManifest(parsed);
  if (!validation.ok || !validation.manifest) {
    throw new Error(validation.errors[0]?.message ?? 'This pack is not valid.');
  }

  const manifest = validation.manifest;
  if (manifest.version > LIVELAYER_PACK_VERSION) {
    throw new Error(`This pack was made with a newer LiveLayer (pack v${manifest.version}; this app supports v${LIVELAYER_PACK_VERSION}).`);
  }
  if ((manifest.app?.schemaVersion ?? 0) > LIVELAYER_SCHEMA_VERSION) {
    throw new Error(`This pack uses a newer LiveLayer data schema (schema v${manifest.app.schemaVersion}; this app supports v${LIVELAYER_SCHEMA_VERSION}).`);
  }
  if (manifest.packType !== 'selected-rundown') {
    throw new Error('Only Selected Rundown packs can be imported right now.');
  }

  return { manifest, files };
}

function remapAssetId(id: string | undefined, assetIdMap: Map<string, string>): string | undefined {
  if (!id) return undefined;
  return assetIdMap.get(id);
}

function remapValues(values: Record<string, string> | undefined, assetIdMap: Map<string, string>, personIdMap: Map<string, string>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    if (key === 'personId') {
      next[key] = personIdMap.get(value) ?? '';
    } else if (key.endsWith('AssetId')) {
      next[key] = assetIdMap.get(value) ?? '';
    } else {
      next[key] = value;
    }
  }
  return next;
}

function remapAssetRefs(refs: Record<string, string> | undefined, assetIdMap: Map<string, string>): Record<string, string> | undefined {
  if (!refs) return undefined;
  const next: Record<string, string> = {};
  for (const [slot, oldId] of Object.entries(refs)) {
    const mapped = assetIdMap.get(oldId);
    if (mapped) next[slot] = mapped;
  }
  return Object.keys(next).length ? next : undefined;
}

function remapTheme(theme: Partial<TemplateTheme> | undefined, assetIdMap: Map<string, string>): Partial<TemplateTheme> {
  const next = clone(theme ?? {});
  if (next.logoAssetId) {
    const mapped = assetIdMap.get(next.logoAssetId);
    if (mapped) next.logoAssetId = mapped;
    else delete next.logoAssetId;
  }
  return next;
}

function remapSource(source: RundownItemSource | undefined, personIdMap: Map<string, string>): RundownItemSource | undefined {
  if (!source || !isRecord(source) || typeof source.type !== 'string') return undefined;
  if (source.type === 'person') {
    const mapped = typeof source.personId === 'string' ? personIdMap.get(source.personId) : undefined;
    return mapped ? { type: 'person', personId: mapped } : undefined;
  }
  if (source.type === 'savedGraphic' && typeof source.presetId === 'string') return { type: 'savedGraphic', presetId: source.presetId };
  if (source.type === 'scripture' && typeof source.reference === 'string') return { type: 'scripture', reference: source.reference };
  if (source.type === 'draft') return { type: 'draft' };
  if (source.type === 'announcement') return { type: 'announcement' };
  if (source.type === 'manual') return { type: 'manual' };
  return undefined;
}

function remapGraphic(graphic: GraphicInstance, assetIdMap: Map<string, string>, personIdMap: Map<string, string>, ts: string): GraphicInstance {
  return {
    ...clone(graphic),
    id: createId('graphic'),
    values: remapValues(graphic.values, assetIdMap, personIdMap),
    theme: remapTheme(graphic.theme, assetIdMap),
    assetRefs: remapAssetRefs(graphic.assetRefs, assetIdMap),
    personId: remapAssetId(graphic.personId, personIdMap),
    createdAt: ts,
    updatedAt: ts
  };
}

function prepareAssets(
  entries: LiveLayerAssetManifestEntry[],
  files: Record<string, Uint8Array>,
  ts: string
): { assets: Array<{ asset: LocalAsset; blob?: Blob }>; assetIdMap: Map<string, string>; missingAssets: number; warnings: LiveLayerPackWarning[] } {
  const assets: Array<{ asset: LocalAsset; blob?: Blob }> = [];
  const assetIdMap = new Map<string, string>();
  const warnings: LiveLayerPackWarning[] = [];
  let missingAssets = 0;

  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id) continue;
    const newId = createId('asset');
    const type = normalizeAssetType(entry.kind);

    if (entry.filename) {
      const bytes = files[entry.filename];
      if (!bytes) {
        missingAssets += 1;
        warnings.push({
          code: 'asset-blob-missing',
          message: `Image for “${entry.label || filenameLabel(entry.filename)}” is missing; imported graphics will use a fallback.`,
          refId: entry.id
        });
        continue;
      }

      const blob = new Blob([bytes.slice()], { type: entry.mimeType || 'application/octet-stream' });
      const asset: LocalAsset = {
        id: newId,
        type,
        name: entry.label?.trim() || filenameLabel(entry.filename),
        mimeType: entry.mimeType,
        sizeBytes: entry.sizeBytes ?? blob.size,
        createdAt: ts,
        updatedAt: ts,
        source: 'uploaded',
        blobKey: newId
      };
      assetIdMap.set(entry.id, newId);
      assets.push({ asset, blob });
      continue;
    }

    if (entry.url) {
      const asset: LocalAsset = {
        id: newId,
        type,
        name: entry.label?.trim() || entry.url,
        mimeType: entry.mimeType,
        sizeBytes: entry.sizeBytes,
        createdAt: ts,
        updatedAt: ts,
        source: 'url',
        url: entry.url
      };
      assetIdMap.set(entry.id, newId);
      assets.push({ asset });
      continue;
    }

    missingAssets += 1;
    warnings.push({
      code: 'asset-blob-missing',
      message: `Asset “${entry.label || entry.id}” has no bundled file or URL; imported graphics will use a fallback.`,
      refId: entry.id
    });
  }

  return { assets, assetIdMap, missingAssets, warnings };
}

function preparePeople(people: PersonProfile[], assetIdMap: Map<string, string>, ts: string): { people: PersonProfile[]; personIdMap: Map<string, string> } {
  const personIdMap = new Map<string, string>();
  const importedPeople: PersonProfile[] = [];

  for (const person of people) {
    if (!person || typeof person.id !== 'string') continue;
    const newId = createId('person');
    personIdMap.set(person.id, newId);
    importedPeople.push({
      ...clone(person),
      id: newId,
      displayName: person.displayName?.trim() || 'Imported person',
      headshotAssetId: remapAssetId(person.headshotAssetId, assetIdMap),
      logoAssetId: remapAssetId(person.logoAssetId, assetIdMap),
      lastUsedAt: undefined,
      createdAt: ts,
      updatedAt: ts
    });
  }

  return { people: importedPeople, personIdMap };
}

function prepareRundown(rundown: Rundown, assetIdMap: Map<string, string>, personIdMap: Map<string, string>, ts: string): Rundown {
  const itemIdMap = new Map<string, string>();
  for (const item of rundown.items ?? []) {
    if (item?.id) itemIdMap.set(item.id, createId('rditem'));
  }

  const items: RundownItem[] = (rundown.items ?? []).map((item) => {
    const id = itemIdMap.get(item.id) ?? createId('rditem');
    return {
      ...clone(item),
      id,
      title: item.title?.trim() || item.graphic?.templateId || 'Imported item',
      graphic: remapGraphic(item.graphic, assetIdMap, personIdMap, ts),
      source: remapSource(item.source, personIdMap),
      done: Boolean(item.done),
      createdAt: ts,
      updatedAt: ts
    };
  });

  return {
    ...clone(rundown),
    id: createId('rundown'),
    name: `${rundown.name?.trim() || 'Untitled rundown'} (Imported)`,
    items,
    activeItemId: undefined,
    selectedItemId: items[0]?.id,
    createdAt: ts,
    updatedAt: ts
  };
}

function validateImportableRundown(rundown: Rundown): void {
  if (!Array.isArray(rundown.items)) {
    throw new Error('This Selected Rundown pack has a malformed item list.');
  }
  const badIndex = rundown.items.findIndex((item) =>
    !item ||
    typeof item.id !== 'string' ||
    !item.graphic ||
    typeof item.graphic !== 'object' ||
    typeof item.graphic.templateId !== 'string' ||
    !item.graphic.templateId
  );
  if (badIndex >= 0) {
    throw new Error(`Item ${badIndex + 1} in this rundown is malformed and cannot be imported safely.`);
  }
}

function prepareImport(manifest: LiveLayerPackManifest, files: Record<string, Uint8Array>): PreparedImport {
  const rundowns = manifest.contents.rundowns ?? [];
  if (rundowns.length !== 1) {
    throw new Error(`Selected Rundown packs must contain exactly one rundown; this pack contains ${rundowns.length}.`);
  }
  const rundown = rundowns[0];
  validateImportableRundown(rundown);
  if ((rundown.items?.length ?? 0) > MAX_ITEMS_PER_RUNDOWN) {
    throw new Error(`This rundown has more than ${MAX_ITEMS_PER_RUNDOWN} items and cannot be imported yet.`);
  }

  const ts = now();
  const assetPrep = prepareAssets(manifest.contents.assets ?? [], files, ts);
  const peoplePrep = preparePeople(manifest.contents.people ?? [], assetPrep.assetIdMap, ts);
  const importedRundown = prepareRundown(rundown, assetPrep.assetIdMap, peoplePrep.personIdMap, ts);

  return {
    assets: assetPrep.assets,
    people: peoplePrep.people,
    rundown: importedRundown,
    missingAssets: assetPrep.missingAssets,
    warnings: [...(manifest.warnings ?? []), ...assetPrep.warnings]
  };
}

/**
 * IE4 safe import for Selected Rundown packs only.
 * Non-destructive: every asset/person/rundown/item/graphic id is regenerated,
 * Saved Graphics are not imported as standalone entries, and no realtime message
 * is posted. `/output` changes only after the operator later presses Take.
 */
export async function importSelectedRundownPack(file: File): Promise<ImportRundownResult> {
  let prepared: PreparedImport | undefined;
  const writtenAssetIds: string[] = [];
  const writtenPersonIds: string[] = [];
  let writtenRundownId: string | undefined;

  try {
    const { manifest, files } = await parsePack(file);
    prepared = prepareImport(manifest, files);

    for (const item of prepared.assets) {
      await saveAsset(item.asset, item.blob);
      writtenAssetIds.push(item.asset.id);
    }

    const importedPeople = await importPeople(prepared.people);
    writtenPersonIds.push(...importedPeople.map((person) => person.id));

    const rundown = importRundown(prepared.rundown, true);
    if (!rundown) throw new Error('Unable to save imported rundown. Storage may be full, or the rundown limit has been reached.');
    writtenRundownId = rundown.id;

    return {
      ok: true,
      rundownId: rundown.id,
      rundownName: rundown.name,
      peopleImported: importedPeople.length,
      assetsImported: writtenAssetIds.length,
      missingAssets: prepared.missingAssets,
      warnings: prepared.warnings
    };
  } catch (error) {
    if (writtenRundownId) deleteRundown(writtenRundownId);
    await Promise.allSettled(writtenPersonIds.map((id) => deletePerson(id)));
    await Promise.allSettled(writtenAssetIds.map((id) => deleteAsset(id)));
    return {
      ok: false,
      peopleImported: 0,
      assetsImported: 0,
      missingAssets: prepared?.missingAssets ?? 0,
      warnings: prepared?.warnings ?? [],
      error: error instanceof Error ? error.message : 'Import failed.'
    };
  }
}
