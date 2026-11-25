interface Props {
  onRefresh: () => void;
  refreshing: boolean;
}

export function Header({ onRefresh, refreshing }: Props) {
  return (
    <header className="header">
      <div className="logo" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="2" y="2" width="16" height="16" rx="4" fill="currentColor" opacity=".15" />
          <path d="M6 10h8M10 6v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      <div className="header-text">
        <h1>Omni Export</h1>
        <p>Export to PSD, Illustrator and HTML — fully local</p>
      </div>
      <button
        className="icon-btn"
        onClick={onRefresh}
        aria-label="Refresh selection"
        title="Refresh selection"
        disabled={refreshing}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className={refreshing ? 'spin' : ''}
        >
          <path
            d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </header>
  );
}
