import { useRef } from 'react';
import type { ExportFormat } from '../../shared/types';

const TABS: Array<{ id: ExportFormat; label: string }> = [
  { id: 'psd', label: 'PSD' },
  { id: 'illustrator', label: 'Illustrator' },
  { id: 'html', label: 'HTML' },
];

interface Props {
  tab: ExportFormat;
  onChange: (t: ExportFormat) => void;
}

export function ExportTabs({ tab, onChange }: Props) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: React.KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i + TABS.length - 1) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(TABS[next].id);
      refs.current[TABS[next].id]?.focus();
    }
  };
  return (
    <div className="tabs" role="tablist" aria-label="Export format">
      {TABS.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => (refs.current[t.id] = el)}
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls={`panel-${t.id}`}
          tabIndex={tab === t.id ? 0 : -1}
          className={`tab${tab === t.id ? ' active' : ''}`}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
