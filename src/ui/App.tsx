import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ConversionReport,
  ProgressData,
  SelectionScope,
  SerializedDocument,
} from '../shared/types';
import { Bridge } from './bridge';
import { ExportButton } from './components/ExportButton';
import { ExportTabs } from './components/ExportTabs';
import { Header } from './components/Header';
import { HtmlExportPanel } from './components/HtmlExportPanel';
import { IllustratorExportPanel } from './components/IllustratorExportPanel';
import { PreviewModal } from './components/PreviewModal';
import { ProgressPanel, formatBytes } from './components/ProgressPanel';
import { PsdExportPanel } from './components/PsdExportPanel';
import { SelectionSummary } from './components/SelectionSummary';
import { WarningList } from './components/WarningList';
import { generateHtml, type HtmlResult } from './exporters/html-exporter';
import { readDocument, runExport, selectionOptions } from './export-runner';
import type { ExportContext, Settings } from './types/export-types';
import { downloadFile } from './utilities/download';
import { logger } from './utilities/logger';
import { CancelledError, CancelToken } from './utilities/queue';
import { DEFAULT_SETTINGS, validateSettings } from './utilities/settings';

function estimateSize(doc: SerializedDocument | null, s: Settings): string {
  if (!doc || !doc.stats.rootCount) return '–';
  const st = doc.stats;
  let bytes: number;
  if (s.tab === 'psd') bytes = st.leafPixelArea * s.psd.scale * s.psd.scale * 4 * 0.4;
  else if (s.tab === 'illustrator')
    bytes =
      s.illustrator.format === 'pdf'
        ? st.nodeCount * 300 + st.imageCount * 150_000
        : st.nodeCount * 450 + st.imageCount * 200_000;
  else bytes = st.nodeCount * 750 + st.imageCount * 250_000;
  return `~${formatBytes(Math.round(bytes))}`;
}

export function App() {
  const bridge = useMemo(() => new Bridge(), []);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [doc, setDoc] = useState<SerializedDocument | null>(null);
  const [loadingSel, setLoadingSel] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [report, setReport] = useState<ConversionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [htmlResult, setHtmlResult] = useState<HtmlResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [alts, setAlts] = useState<Record<string, string>>({});
  const tokenRef = useRef<CancelToken | null>(null);
  const htmlDocRef = useRef<SerializedDocument | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const patch = useCallback((p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p })), []);

  // ---- bootstrap: settings + live selection pushes
  useEffect(() => {
    bridge.onSettings = (raw) => {
      if (raw) setSettings(validateSettings(raw));
      setLoaded(true);
    };
    bridge.onSelectionPush = (d) => {
      bridge.clearCache();
      htmlDocRef.current = null;
      setHtmlResult(null);
      setDoc(d);
      setLoadingSel(false);
    };
    bridge.onError = (e) => {
      logger.error(e.detail);
      setError(e.message);
      setLoadingSel(false);
    };
    bridge.post({ type: 'LOAD_SETTINGS' });
    const t = setTimeout(() => setLoaded(true), 1500); // storage unavailable → defaults
    return () => clearTimeout(t);
  }, [bridge]);

  const refresh = useCallback(async () => {
    setLoadingSel(true);
    try {
      const d = await bridge.requestSelection(selectionOptions(settingsRef.current, 'summary'));
      bridge.clearCache();
      htmlDocRef.current = null;
      setHtmlResult(null);
      setDoc(d);
      setError(null);
    } catch (e) {
      logger.error(e);
      setError('Could not read the selection.');
    } finally {
      setLoadingSel(false);
    }
  }, [bridge]);

  useEffect(() => {
    if (loaded) void refresh();
  }, [loaded, settings.scope, settings.includeHidden, refresh]);

  // option changes invalidate cached renders
  const optionKey = JSON.stringify({ ...settings, tab: 0 });
  useEffect(() => {
    bridge.clearCache();
  }, [bridge, optionKey]);

  // persist settings (never document content)
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => bridge.post({ type: 'SAVE_SETTINGS', payload: settings }), 300);
    return () => clearTimeout(t);
  }, [bridge, loaded, settings]);

  const makeCtx = (token: CancelToken, warns: string[]): ExportContext => ({
    bridge,
    token,
    concurrency: settingsRef.current.concurrency,
    progress: (stage, percent, layerName) =>
      setProgress({ stage, percent, layerName, warnings: warns.length }),
    warn: (m) => {
      if (!warns.includes(m)) {
        warns.push(m);
        setWarnings([...warns]);
      }
    },
  });

  const startExport = async () => {
    const s = settingsRef.current;
    const token = new CancelToken();
    tokenRef.current = token;
    const warns: string[] = [];
    const ctx = makeCtx(token, warns);
    setRunning(true);
    setError(null);
    setReport(null);
    setWarnings([]);
    try {
      ctx.progress('Reading selection', 2);
      const d = await readDocument(bridge, s, s.tab);
      d.stats.warnings.forEach(ctx.warn);
      if (s.tab === 'html') htmlDocRef.current = d;
      ctx.progress('Analysing layers', 8);
      const out = await runExport(s, d, ctx, alts);
      if (out.htmlResult) setHtmlResult(out.htmlResult);
      token.throwIfCancelled();
      ctx.progress('Preparing download', 96);
      for (const f of out.files) {
        downloadFile(f);
        await new Promise((r) => setTimeout(r, 250));
      }
      ctx.progress('Complete', 100);
      setReport(out.report);
      bridge.post({
        type: 'NOTIFY',
        payload: { message: `Omni Export: ${out.files.length} file(s) ready` },
      });
    } catch (e) {
      logger.error(e);
      if (e instanceof CancelledError || (e as Error)?.name === 'CancelledError')
        setError('Export cancelled.');
      else
        setError(
          e instanceof Error && e.message
            ? e.message
            : 'Export failed. Try a smaller selection or scale.',
        );
    } finally {
      setRunning(false);
      tokenRef.current = null;
    }
  };

  const cancel = () => tokenRef.current && bridge.cancel(tokenRef.current);

  const openPreview = async () => {
    const s = settingsRef.current;
    setRunning(true);
    setError(null);
    try {
      let d = htmlDocRef.current;
      if (!d) {
        d = await readDocument(bridge, s, 'html');
        htmlDocRef.current = d;
      }
      const res = generateHtml(
        d,
        { ...s.html, assetMode: 'inline', altOverrides: alts },
        s.includeHidden,
      );
      setHtmlResult(res);
      setWarnings([...d.stats.warnings, ...res.warnings]);
      setShowPreview(true);
    } catch (e) {
      logger.error(e);
      setError(e instanceof Error ? e.message : 'Preview failed.');
    } finally {
      setRunning(false);
    }
  };

  const count = doc?.stats.rootCount ?? 0;
  const label =
    settings.tab === 'psd'
      ? 'Export PSD'
      : settings.tab === 'html'
        ? 'Export HTML'
        : settings.illustrator.format === 'pdf'
          ? 'Export PDF for Illustrator'
          : 'Export SVG for Illustrator';

  // resizable window
  const onResizeStart = (e: React.PointerEvent) => {
    const startX = e.clientX,
      startY = e.clientY,
      w = window.innerWidth,
      h = window.innerHeight;
    const move = (ev: PointerEvent) =>
      bridge.post({
        type: 'RESIZE',
        payload: { width: w + ev.clientX - startX, height: h + ev.clientY - startY },
      });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="app">
      <Header onRefresh={() => void refresh()} refreshing={loadingSel} />
      <ExportTabs tab={settings.tab} onChange={(tab) => patch({ tab })} />
      <main className="content">
        <SelectionSummary
          doc={doc}
          loading={loadingSel}
          scope={settings.scope}
          includeHidden={settings.includeHidden}
          estimate={estimateSize(doc, settings)}
          onScope={(scope: SelectionScope) => patch({ scope })}
          onHidden={(includeHidden) => patch({ includeHidden })}
        />
        {settings.tab === 'psd' && (
          <PsdExportPanel
            options={settings.psd}
            multi={count > 1}
            onChange={(psd) => patch({ psd })}
          />
        )}
        {settings.tab === 'illustrator' && (
          <IllustratorExportPanel
            options={settings.illustrator}
            onChange={(illustrator) => patch({ illustrator })}
          />
        )}
        {settings.tab === 'html' && (
          <HtmlExportPanel
            options={settings.html}
            onChange={(html) => patch({ html })}
            images={htmlResult?.images ?? []}
            alts={alts}
            onAlt={(id, v) => setAlts((a) => ({ ...a, [id]: v }))}
            onPreview={() => void openPreview()}
            busy={running || count === 0}
          />
        )}
        <ProgressPanel
          progress={progress}
          running={running}
          report={report}
          error={error}
          onCancel={cancel}
        />
        <WarningList warnings={warnings.length ? warnings : (doc?.stats.warnings ?? [])} />
      </main>
      <ExportButton
        label={label}
        disabled={count === 0 || loadingSel}
        busy={running}
        hint={count === 0 && !loadingSel ? 'Select at least one frame or layer' : undefined}
        onClick={() => void startExport()}
      />
      <div className="resize" onPointerDown={onResizeStart} aria-hidden="true" />
      {showPreview && htmlResult && (
        <PreviewModal
          result={htmlResult}
          warnings={warnings}
          onClose={() => setShowPreview(false)}
          onRefresh={() => void openPreview()}
          onDownload={() => void startExport()}
        />
      )}
    </div>
  );
}
