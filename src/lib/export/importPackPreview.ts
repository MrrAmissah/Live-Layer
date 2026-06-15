import { unzipSync, strFromU8 } from 'fflate';
import { templateRegistry } from '../../components/templates/registry';
import {
  LIVELAYER_PACK_VERSION,
  type LiveLayerAssetManifestEntry,
  type LiveLayerPackManifest,
  type LiveLayerPackType
} from '../../types/exportPack';

/**
 * Import-preview helpers (IE3). **Read-only**: this module parses, validates and
 * summarizes a `.livelayerpack` for display. It never writes localStorage, never
 * touches IndexedDB, never posts a realtime message, and never executes anything
 * from the pack. Safe import (IE4) writes; this does not.
 */

const PACK_MANIFEST_NAME = 'livelayer-pack.json';
const RECOGNIZED_PACK_TYPES: LiveLayerPackType[] = ['selected-rundown', 'full-backup'];
const SUPPORTED_PACK_TYPES: LiveLayerPackType[] = ['selected-rundown'];

/** Template ids this build can render — anything else is a warning, not a blocker. */
const KNOWN_TEMPLATE_IDS = new Set(templateRegistry.map((t) => t.id));

/** Defensive cap so a pathological pack string can't blow up the layout. */
const MAX_DISPLAY_LEN = 80;
const MAX_SAMPLE_TITLES = 6;
const MAX_SAMPLE_FILENAMES = 8;

export interface PackValidationIssue {
  code: string;
  message: string;
}

export interface PackValidationResult {
  ok: boolean;
  /** Present only when ok — the structurally-valid manifest (cast, soft fields still untrusted). */
  manifest?: LiveLayerPackManifest;
  errors: PackValidationIssue[];
  /** True when the only/leading problem is a newer-than-supported pack version. */
  blockedByVersion?: boolean;
}

export type ImportPackWarningCode =
  | 'unsupported-pack-type'
  | 'unsupported-template'
  | 'asset-missing-file'
  | 'empty-rundown'
  | 'url-assets-only'
  | 'export-warning';

export interface ImportPackWarning {
  code: ImportPackWarningCode;
  message: string;
}

export interface ImportPackSummary {
  packType: string;
  packTypeSupported: boolean;
  createdAt?: string;
  rundownCount: number;
  itemCount: number;
  peopleCount: number;
  assetCount: number;
  missingAssetCount: number;
  templateIds: string[];
  unsupportedTemplateIds: string[];
  rundownNames: string[];
  sampleItemTitles: string[];
  assetFilenames: string[];
  warnings: ImportPackWarning[];
}

export interface ImportPackPreviewResult {
  ok: boolean;
  /** The chosen file's name (for display). */
  filename: string;
  /** Blocker message when !ok. */
  error?: string;
  /** True when blocked specifically by a newer pack version. */
  blocked?: boolean;
  manifest?: LiveLayerPackManifest;
  summary?: ImportPackSummary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function clampStr(value: unknown): string {
  const s = typeof value === 'string' ? value : '';
  return s.length > MAX_DISPLAY_LEN ? `${s.slice(0, MAX_DISPLAY_LEN - 1)}…` : s;
}

/**
 * Structural validation of a parsed manifest object. Blockers only — soft issues
 * (unsupported pack type / templates, missing asset files, empty rundowns) are
 * surfaced as warnings by {@link summarizePackManifest}, never here. `summary`
 * is intentionally non-blocking: it is rebuilt on preview.
 */
export function validatePackManifest(input: unknown): PackValidationResult {
  const errors: PackValidationIssue[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: [{ code: 'invalid-format', message: 'This file is not a LiveLayer pack (no manifest object).' }] };
  }

  if (input.format !== 'livelayer-pack') {
    errors.push({ code: 'invalid-format', message: 'This file is not a LiveLayer pack (unexpected format tag).' });
    return { ok: false, errors };
  }

  const version = input.version;
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    errors.push({ code: 'invalid-version', message: 'Pack version is missing or invalid.' });
  } else if (version > LIVELAYER_PACK_VERSION) {
    return {
      ok: false,
      blockedByVersion: true,
      errors: [{
        code: 'version-too-new',
        message: `This pack was made with a newer LiveLayer (pack v${version}; this app supports v${LIVELAYER_PACK_VERSION}). Update LiveLayer to import it.`
      }]
    };
  }

  if (typeof input.packType !== 'string' || input.packType.length === 0) {
    errors.push({ code: 'invalid-packtype', message: 'Pack type is missing.' });
  }

  if (!isRecord(input.contents)) {
    errors.push({ code: 'missing-contents', message: 'Pack contents are missing or malformed.' });
  } else {
    // Selected-rundown packs must carry a rundowns array.
    if (input.packType === 'selected-rundown' && !Array.isArray(input.contents.rundowns)) {
      errors.push({ code: 'missing-rundowns', message: 'This rundown pack has no rundowns array.' });
    }
    // Asset manifest, if present, must be an array (entries are validated softly later).
    if (input.contents.assets !== undefined && !Array.isArray(input.contents.assets)) {
      errors.push({ code: 'invalid-assets', message: 'The asset manifest is malformed.' });
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, manifest: input as unknown as LiveLayerPackManifest, errors: [] };
}

/** Asset entries that expect a bundled file whose path is absent from the zip. */
export function findMissingAssetFiles(manifest: LiveLayerPackManifest, zipEntries: string[]): string[] {
  const present = new Set(zipEntries);
  const missing: string[] = [];
  for (const raw of asArray(manifest.contents?.assets)) {
    if (!isRecord(raw)) continue;
    const entry = raw as Partial<LiveLayerAssetManifestEntry>;
    // URL-source assets carry no file and never count as missing.
    if (typeof entry.filename === 'string' && entry.filename.length > 0 && !present.has(entry.filename)) {
      missing.push(entry.filename);
    }
  }
  return missing;
}

/** Template ids referenced by the pack that this build cannot render. */
export function findUnsupportedTemplateIds(manifest: LiveLayerPackManifest): string[] {
  const unsupported = new Set<string>();
  for (const rundown of asArray(manifest.contents?.rundowns)) {
    if (!isRecord(rundown)) continue;
    for (const item of asArray(rundown.items)) {
      if (!isRecord(item) || !isRecord(item.graphic)) continue;
      const id = item.graphic.templateId;
      if (typeof id === 'string' && id.length > 0 && !KNOWN_TEMPLATE_IDS.has(id)) unsupported.add(id);
    }
  }
  return [...unsupported];
}

/**
 * Build the operator-facing preview. Total over any structurally-valid manifest:
 * odd-but-parseable contents degrade to warnings, never a thrown error.
 */
export function summarizePackManifest(manifest: LiveLayerPackManifest, zipEntries: string[]): ImportPackSummary {
  const packType = typeof manifest.packType === 'string' ? manifest.packType : 'unknown';
  const packTypeSupported = (SUPPORTED_PACK_TYPES as string[]).includes(packType);

  const rundowns = asArray(manifest.contents?.rundowns).filter(isRecord);
  const people = asArray(manifest.contents?.people).filter(isRecord);
  const assets = asArray(manifest.contents?.assets).filter(isRecord);

  const templateIds = new Set<string>();
  const sampleItemTitles: string[] = [];
  const rundownNames: string[] = [];
  let itemCount = 0;
  let hasEmptyRundown = false;

  for (const rundown of rundowns) {
    rundownNames.push(clampStr(rundown.name) || 'Untitled rundown');
    const items = asArray(rundown.items).filter(isRecord);
    if (items.length === 0) hasEmptyRundown = true;
    itemCount += items.length;
    for (const item of items) {
      const graphic = isRecord(item.graphic) ? item.graphic : undefined;
      const id = graphic && typeof graphic.templateId === 'string' ? graphic.templateId : '';
      if (id) templateIds.add(id);
      if (sampleItemTitles.length < MAX_SAMPLE_TITLES) {
        sampleItemTitles.push(clampStr(item.title) || '(untitled item)');
      }
    }
  }

  const assetFilenames: string[] = [];
  let urlAssetCount = 0;
  for (const raw of assets) {
    const entry = raw as Partial<LiveLayerAssetManifestEntry>;
    if (typeof entry.url === 'string' && !entry.filename) urlAssetCount += 1;
    const display = entry.filename || entry.label;
    if (display && assetFilenames.length < MAX_SAMPLE_FILENAMES) assetFilenames.push(clampStr(display));
  }

  const unsupportedTemplateIds = findUnsupportedTemplateIds(manifest);
  const missingAssetFiles = findMissingAssetFiles(manifest, zipEntries);

  const warnings: ImportPackWarning[] = [];
  if (!packTypeSupported) {
    const label = (RECOGNIZED_PACK_TYPES as string[]).includes(packType)
      ? `“${packType}” packs are recognised but not importable yet (Selected Rundown ships first).`
      : `“${packType}” is not a pack type this app supports yet.`;
    warnings.push({ code: 'unsupported-pack-type', message: label });
  }
  if (unsupportedTemplateIds.length) {
    warnings.push({
      code: 'unsupported-template',
      message: `${unsupportedTemplateIds.length} template${unsupportedTemplateIds.length === 1 ? '' : 's'} not in this build (${unsupportedTemplateIds.map(clampStr).join(', ')}). Those items would show nothing until the template exists.`
    });
  }
  if (missingAssetFiles.length) {
    warnings.push({
      code: 'asset-missing-file',
      message: `${missingAssetFiles.length} referenced image${missingAssetFiles.length === 1 ? '' : 's'} not bundled in this pack — they would fall back to a placeholder.`
    });
  }
  if (hasEmptyRundown) {
    warnings.push({ code: 'empty-rundown', message: 'This pack contains a rundown with no items.' });
  }
  if (assets.length > 0 && urlAssetCount === assets.length) {
    warnings.push({ code: 'url-assets-only', message: 'All assets are external URLs — no images are bundled in this pack.' });
  }
  // Surface any warnings the exporter itself recorded (e.g. missing blob at export time).
  for (const raw of asArray(manifest.warnings)) {
    if (isRecord(raw) && typeof raw.message === 'string') {
      warnings.push({ code: 'export-warning', message: clampStr(raw.message) });
    }
  }

  return {
    packType,
    packTypeSupported,
    createdAt: typeof manifest.createdAt === 'string' ? manifest.createdAt : undefined,
    rundownCount: rundowns.length,
    itemCount,
    peopleCount: people.length,
    assetCount: assets.length,
    missingAssetCount: missingAssetFiles.length,
    templateIds: [...templateIds],
    unsupportedTemplateIds,
    rundownNames,
    sampleItemTitles,
    assetFilenames,
    warnings
  };
}

/**
 * Read a `.livelayerpack` File, validate it, and produce a preview summary.
 * **No storage is touched and nothing is imported.** Errors are returned, never
 * thrown, so the UI can render a clean message for every failure mode.
 */
export async function parseLiveLayerPackFile(file: File): Promise<ImportPackPreviewResult> {
  const filename = file.name;

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, filename, error: 'Could not read that file.' };
  }

  // Unzip while collecting every entry name; only the manifest is decompressed.
  const zipEntries: string[] = [];
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes, {
      filter: (info) => {
        zipEntries.push(info.name);
        return info.name === PACK_MANIFEST_NAME;
      }
    });
  } catch {
    return { ok: false, filename, error: 'This is not a valid .livelayerpack (could not unzip it).' };
  }

  const manifestBytes = unzipped[PACK_MANIFEST_NAME];
  if (!manifestBytes) {
    return { ok: false, filename, error: 'This zip has no livelayer-pack.json — it is not a LiveLayer pack.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(manifestBytes));
  } catch {
    return { ok: false, filename, error: 'The pack manifest is not valid JSON.' };
  }

  const validation = validatePackManifest(parsed);
  if (!validation.ok || !validation.manifest) {
    return {
      ok: false,
      filename,
      blocked: validation.blockedByVersion,
      error: validation.errors[0]?.message ?? 'This pack is not valid.'
    };
  }

  const summary = summarizePackManifest(validation.manifest, zipEntries);
  return { ok: true, filename, manifest: validation.manifest, summary };
}
