import { useEffect, useRef, useState } from 'react';
import type { HtmlResult } from '../exporters/html-exporter';
import { copyText } from '../utilities/download';

type View = 'preview' | 'html' | 'css' | 'js';
const DEVICES = [
  { id: 'desktop', label: 'Desktop', width: 1440 },
  { id: 'tablet', label: 'Tablet', width: 768 },
  { id: 'mobile', label: 'Mobile', width: 390 },
] as const;

interface Props {
  result: HtmlResult;
  warnings: string[];
  onClose: () => void;
  onRefresh: () => void;
  onDownload: () => void;
}

const shorten = (s: string) => s.replace(/(data:[a-z/+.-]+;base64,)[A-Za-z0-9+/=]{40,}/g, '$1…');

export function PreviewModal({ result, warnings, onClose, onRefresh, onDownload }: Props) {
  const [view, setView] = useState<View>('preview');
  const [device, setDevice] = useState<(typeof DEVICES)[number]>(DEVICES[0]);
  const [copied, setCopied] = useState('');
  const [boxWidth, setBoxWidth] = useState(380);
  const box = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    dialog.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth));
    ro.observe(el);
    setBoxWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [view]);

  const scale = Math.min(1, boxWidth / device.width);
  const code =
    view === 'html'
      ? shorten(result.html)
      : view === 'css'
        ? result.css
        : result.js || '// No JavaScript was needed for this design.';
  const doCopy = async () => {
    const ok = await copyText(
      view === 'html' ? result.html : view === 'css' ? result.css : result.js,
    );
    setCopied(ok ? 'Copied' : 'Copy failed');
    setTimeout(() => setCopied(''), 1500);
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="HTML preview"
        tabIndex={-1}
        ref={dialog}
      >
        <div className="row between">
          <div className="tabs small" role="tablist" aria-label="Preview views">
            {(['preview', 'html', 'css', 'js'] as View[]).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                className={`tab${view === v ? ' active' : ''}`}
                onClick={() => setView(v)}
              >
                {v === 'preview' ? 'Preview' : v.toUpperCase()}
              </button>
            ))}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close preview (Escape)">
            ✕
          </button>
        </div>
        {warnings.length > 0 && (
          <p className="muted">
            {warnings.length} conversion warning(s) — see the list below the export button.
          </p>
        )}
        {view === 'preview' ? (
          <>
            <div className="row">
              {DEVICES.map((d) => (
                <button
                  key={d.id}
                  className={`chip${device.id === d.id ? ' active' : ''}`}
                  onClick={() => setDevice(d)}
                >
                  {d.label} {d.width}
                </button>
              ))}
            </div>
            <div className="preview-box" ref={box}>
              <div style={{ width: device.width * scale, height: 520 * scale, overflow: 'hidden' }}>
                <iframe
                  title="Generated HTML preview"
                  sandbox="allow-scripts"
                  srcDoc={result.html}
                  style={{
                    width: device.width,
                    height: 520,
                    transform: `scale(${scale})`,
                    transformOrigin: '0 0',
                    border: 0,
                    background: '#fff',
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="code-wrap">
            <pre className="code" tabIndex={0}>
              {code}
            </pre>
            <button className="btn secondary copy" onClick={doCopy}>
              {copied || 'Copy'}
            </button>
          </div>
        )}
        <div className="row between">
          <button className="btn secondary" onClick={onRefresh}>
            Refresh
          </button>
          <button className="btn primary" onClick={onDownload}>
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
