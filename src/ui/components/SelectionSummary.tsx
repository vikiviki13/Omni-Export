import type { SelectionScope, SerializedDocument } from '../../shared/types';

interface Props {
  doc: SerializedDocument | null;
  loading: boolean;
  scope: SelectionScope;
  includeHidden: boolean;
  estimate: string;
  onScope: (s: SelectionScope) => void;
  onHidden: (v: boolean) => void;
}

export function SelectionSummary({
  doc,
  loading,
  scope,
  includeHidden,
  estimate,
  onScope,
  onHidden,
}: Props) {
  const s = doc?.stats;
  const empty = !loading && (!s || s.rootCount === 0);
  return (
    <section className="card" aria-labelledby="sel-title">
      <div className="row between">
        <h2 id="sel-title">Selection</h2>
        <label className="inline">
          <span className="sr-only">Scope</span>
          <select
            value={scope}
            onChange={(e) => onScope(e.target.value as SelectionScope)}
            aria-label="Export scope"
          >
            <option value="selection">Current selection</option>
            <option value="page">Current page</option>
            <option value="all-pages">All pages</option>
          </select>
        </label>
      </div>
      {empty ? (
        <div className="empty" role="status">
          <p>Select at least one frame or layer</p>
          {scope === 'selection' && (
            <button className="btn secondary" onClick={() => onScope('page')}>
              Use current page
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="names" title={s?.selectedNames.join(', ')}>
            {loading && !s ? 'Reading…' : summaryNames(s?.selectedNames ?? [])}
          </p>
          <dl className="stats">
            <div>
              <dt>Nodes</dt>
              <dd>{s?.rootCount ?? '–'}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{s ? `${s.totalWidth} × ${s.totalHeight}` : '–'}</dd>
            </div>
            <div>
              <dt>Text</dt>
              <dd>{s?.textCount ?? '–'}</dd>
            </div>
            <div>
              <dt>Vectors</dt>
              <dd>{s?.vectorCount ?? '–'}</dd>
            </div>
            <div>
              <dt>Images</dt>
              <dd>{s?.imageCount ?? '–'}</dd>
            </div>
            <div>
              <dt>Unsupported fx</dt>
              <dd>{s?.unsupportedEffects ?? '–'}</dd>
            </div>
            <div className="wide">
              <dt>Estimated output</dt>
              <dd>{estimate}</dd>
            </div>
          </dl>
        </>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={includeHidden}
          onChange={(e) => onHidden(e.target.checked)}
        />
        Include hidden layers
      </label>
    </section>
  );
}

function summaryNames(names: string[]): string {
  if (!names.length) return '';
  const shown = names.slice(0, 3).join(', ');
  return names.length > 3 ? `${shown} +${names.length - 3} more` : shown;
}
