interface Props {
  label: string;
  disabled: boolean;
  busy: boolean;
  hint?: string;
  onClick: () => void;
}

export function ExportButton({ label, disabled, busy, hint, onClick }: Props) {
  return (
    <div className="export-bar">
      {hint && (
        <p className="muted" role="status">
          {hint}
        </p>
      )}
      <button
        className="btn primary"
        disabled={disabled || busy}
        onClick={onClick}
        aria-busy={busy}
      >
        {busy ? <span className="spinner" aria-hidden="true" /> : null}
        {busy ? 'Exporting…' : label}
      </button>
    </div>
  );
}
