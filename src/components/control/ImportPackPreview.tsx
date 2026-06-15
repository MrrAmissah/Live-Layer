import { useRef, useState } from 'react';
import { parseLiveLayerPackFile, type ImportPackPreviewResult } from '../../lib/export/importPackPreview';
import { importSelectedRundownPack, type ImportRundownResult } from '../../lib/export/importRundownPack';

type PreviewStatus = 'idle' | 'reading' | 'ready' | 'importing' | 'imported' | 'error';

/** Format an ISO timestamp for display; fall back to the raw string. */
function formatCreatedAt(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return date.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

/**
 * Import preview + confirm (IE3/IE4). Choosing a pack is read-only; clicking
 * confirm calls the safe importer, which writes only local control data and never
 * posts realtime messages or touches `/output`.
 */
export default function ImportPackPreview() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<PreviewStatus>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportPackPreviewResult | null>(null);
  const [importResult, setImportResult] = useState<ImportRundownResult | null>(null);

  const onChoose = () => inputRef.current?.click();

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow re-picking the same file later (input won't re-fire onChange otherwise).
    event.target.value = '';
    if (!file) return;
    setStatus('reading');
    setFile(file);
    setResult(null);
    setImportResult(null);
    const res = await parseLiveLayerPackFile(file);
    setResult(res);
    setStatus(res.ok ? 'ready' : 'error');
  };

  const onReset = () => {
    setFile(null);
    setResult(null);
    setImportResult(null);
    setStatus('idle');
  };

  const onImport = async () => {
    if (!file || !result?.ok || result.summary?.packType !== 'selected-rundown' || !result.summary.packTypeSupported) return;
    setStatus('importing');
    setImportResult(null);
    const imported = await importSelectedRundownPack(file);
    setImportResult(imported);
    setStatus(imported.ok ? 'imported' : 'ready');
  };

  const summary = result?.summary;
  const canImport = Boolean(file && result?.ok && summary?.packType === 'selected-rundown' && summary.packTypeSupported);

  return (
    <div className="import-pack">
      <input
        ref={inputRef}
        type="file"
        accept=".livelayerpack,application/zip"
        className="import-pack__file"
        onChange={onFile}
      />

      {status === 'idle' ? (
        <div className="empty-state">
          <p className="empty-state__title">Preview an import pack</p>
          <p className="empty-state__hint">
            Choose a <code>.livelayerpack</code> to see what it contains. This is read-only —
            you confirm before LiveLayer writes anything.
          </p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onChoose}>
            Choose LiveLayer pack…
          </button>
        </div>
      ) : null}

      {status === 'reading' ? <p className="field__hint" role="status" aria-live="polite">Reading pack…</p> : null}
      {status === 'importing' ? <p className="field__hint" role="status" aria-live="polite">Importing pack…</p> : null}

      {status === 'error' && result ? (
        <div className="import-pack__error" role="alert">
          <p className="field__hint field__hint--error">
            {result.blocked ? '⛔ ' : '⚠ '}{result.error}
          </p>
          <p className="import-pack__file-name">{result.filename}</p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onChoose}>Choose another pack</button>
        </div>
      ) : null}

      {status === 'imported' && importResult?.ok ? (
        <div className="import-pack__summary" role="status" aria-live="polite">
          <div className="import-pack__head">
            <div className="import-pack__title">
              <span className="ll-kicker">Imported successfully</span>
              <span className="import-pack__file-name" title={result?.filename}>{result?.filename}</span>
            </div>
            <button type="button" className="btn btn--ghost btn--xs" onClick={onChoose}>Import another</button>
          </div>
          <p className="import-pack__line">
            <span className="rd-queue__lbl">Rundown</span> {importResult.rundownName ?? 'Imported rundown'}
          </p>
          <p className="field__hint">
            This rundown is now active. Its first item is selected, and nothing was sent to the live output.
          </p>
          <p className="field__hint">
            Next: open the Live tab, verify the imported item preview, then press Take selected when you are ready.
          </p>
          <ul className="import-pack__stats">
            <li><span className="import-pack__stat-n">{importResult.peopleImported}</span> {importResult.peopleImported === 1 ? 'person' : 'people'}</li>
            <li><span className="import-pack__stat-n">{importResult.assetsImported}</span> asset{importResult.assetsImported === 1 ? '' : 's'}</li>
            {importResult.missingAssets > 0 ? (
              <li className="import-pack__stat--warn"><span className="import-pack__stat-n">{importResult.missingAssets}</span> missing</li>
            ) : null}
          </ul>
          {importResult.warnings.length ? (
            <ul className="import-pack__warnings">
              {importResult.warnings.map((warning, i) => (
                <li key={i} className="import-pack__warn">⚠ {warning.message}</li>
              ))}
            </ul>
          ) : null}
          <div className="import-pack__actions">
            <button type="button" className="btn btn--secondary btn--sm" onClick={onReset}>Done</button>
          </div>
        </div>
      ) : null}

      {(status === 'ready' || (status === 'importing' && summary)) && summary ? (
        <div className="import-pack__summary">
          <div className="import-pack__head">
            <div className="import-pack__title">
              <span className="ll-kicker">Import preview</span>
              <span className="import-pack__file-name" title={result?.filename}>{result?.filename}</span>
            </div>
            <button type="button" className="btn btn--ghost btn--xs" onClick={onChoose}>Change</button>
          </div>

          <div className="import-pack__type">
            <span className="rd-queue__lbl">Pack type</span> {summary.packType}
            {summary.packTypeSupported ? null : <span className="import-pack__badge">not importable yet</span>}
          </div>
          <p className="import-pack__created"><span className="rd-queue__lbl">Created</span> {formatCreatedAt(summary.createdAt)}</p>

          <ul className="import-pack__stats">
            <li><span className="import-pack__stat-n">{summary.rundownCount}</span> rundown{summary.rundownCount === 1 ? '' : 's'}</li>
            <li><span className="import-pack__stat-n">{summary.itemCount}</span> item{summary.itemCount === 1 ? '' : 's'}</li>
            <li><span className="import-pack__stat-n">{summary.peopleCount}</span> {summary.peopleCount === 1 ? 'person' : 'people'}</li>
            <li><span className="import-pack__stat-n">{summary.assetCount}</span> asset{summary.assetCount === 1 ? '' : 's'}</li>
            {summary.missingAssetCount > 0 ? (
              <li className="import-pack__stat--warn"><span className="import-pack__stat-n">{summary.missingAssetCount}</span> missing</li>
            ) : null}
          </ul>

          {summary.rundownNames.length ? (
            <p className="import-pack__line"><span className="rd-queue__lbl">Rundown</span> {summary.rundownNames.join(', ')}</p>
          ) : null}

          {summary.sampleItemTitles.length ? (
            <div className="import-pack__list-block">
              <span className="rd-queue__lbl">Items</span>
              <ul className="import-pack__mini-list">
                {summary.sampleItemTitles.map((title, i) => <li key={i}>{title}</li>)}
                {summary.itemCount > summary.sampleItemTitles.length ? (
                  <li className="import-pack__more">+{summary.itemCount - summary.sampleItemTitles.length} more…</li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {summary.assetFilenames.length ? (
            <p className="import-pack__line">
              <span className="rd-queue__lbl">Assets</span> {summary.assetFilenames.join(', ')}
              {summary.assetCount > summary.assetFilenames.length ? ` +${summary.assetCount - summary.assetFilenames.length} more` : ''}
            </p>
          ) : null}

          {summary.templateIds.length ? (
            <p className="import-pack__line"><span className="rd-queue__lbl">Templates</span> {summary.templateIds.join(', ')}</p>
          ) : null}

          {summary.warnings.length ? (
            <ul className="import-pack__warnings">
              {summary.warnings.map((warning, i) => (
                <li key={i} className="import-pack__warn">⚠ {warning.message}</li>
              ))}
            </ul>
          ) : (
            <p className="field__hint">No warnings — this pack looks complete.</p>
          )}

          {importResult && !importResult.ok ? (
            <p className="field__hint field__hint--error" role="alert">
              Import failed: {importResult.error ?? 'unknown error'}
            </p>
          ) : null}

          <div className="import-pack__actions">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={!canImport || status === 'importing'}
              onClick={onImport}
              title={canImport ? 'Import as a new rundown' : 'Only valid Selected Rundown packs can be imported'}
            >
              {status === 'importing' ? 'Importing…' : 'Import as new rundown'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onReset}>Done</button>
          </div>
          <p className="field__hint">
            This will add a new rundown and restore referenced assets. Existing data will not be overwritten.
          </p>
        </div>
      ) : null}
    </div>
  );
}
