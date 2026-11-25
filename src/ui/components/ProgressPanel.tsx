import { STAGES } from '../types/export-types';
import type { ConversionReport, ProgressData } from '../../shared/types';
import { downloadBlob } from '../utilities/download';

interface Props {
  progress: ProgressData | null;
  running: boolean;
  report: ConversionReport | null;
  error: string | null;
  onCancel: () => void;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function ProgressPanel({ progress, running, report, error, onCancel }: Props) {
  if (!running && !report && !error) return null;
  const stageIndex = progress ? STAGES.indexOf(progress.stage as (typeof STAGES)[number]) : -1;
  return (
    <section className="card" aria-live="polite" aria-label="Export status">
      {running && progress && (
        <>
          <div className="row between">
            <b>{progress.stage}</b>
            <span>{Math.round(progress.percent)}%</span>
          </div>
          <div
            className="bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.percent)}
          >
            <div className="bar-fill" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="muted ellipsis">{progress.layerName ?? '\u00a0'}</p>
          <ol className="stages">
            {STAGES.map((s, i) => (
              <li key={s} className={i < stageIndex ? 'done' : i === stageIndex ? 'current' : ''}>
                {s}
              </li>
            ))}
          </ol>
          <div className="row between">
            <span className="muted">{progress.warnings ?? 0} warning(s)</span>
            <button className="btn secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!running && report && (
        <div className="success" role="status">
          <b>Export complete</b>
          <p>
            {report.files.join(', ')} · {formatBytes(report.outputBytes)} ·{' '}
            {(report.durationMs / 1000).toFixed(1)}s
          </p>
          <p className="muted">
            {report.layersProcessed} layers · {report.layersPreserved} preserved ·{' '}
            {report.layersRasterized} rasterized · {report.warnings.length} warning(s)
          </p>
          <button
            className="btn secondary"
            onClick={() =>
              downloadBlob(
                `omni-export-report-${report.format.toLowerCase()}.json`,
                new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
              )
            }
          >
            Download report (JSON)
          </button>
        </div>
      )}
    </section>
  );
}
