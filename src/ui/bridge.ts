import { CACHE_MAX_BYTES } from '../shared/constants';
import type {
  ErrorData,
  NodeExportKind,
  NodeExportRequest,
  NodeExportResult,
  PluginToUIMessage,
  ProgressData,
  SelectionOptions,
  SerializedDocument,
  UIToPluginMessage,
} from '../shared/types';
import { CancelledError, type CancelToken } from './utilities/queue';

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };
type ExportParams = Omit<NodeExportRequest, 'requestId' | 'sessionId'>;

export class Bridge {
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private cache = new Map<string, NodeExportResult>();
  private cacheBytes = 0;
  onSelectionPush: (doc: SerializedDocument) => void = () => {};
  onSettings: (raw: unknown) => void = () => {};
  onError: (e: ErrorData) => void = () => {};
  onProgress: (p: ProgressData) => void = () => {};

  constructor() {
    window.addEventListener('message', (ev: MessageEvent) =>
      this.handle(ev.data?.pluginMessage as PluginToUIMessage | undefined),
    );
  }

  post(msg: UIToPluginMessage): void {
    parent.postMessage({ pluginMessage: msg }, '*');
  }

  private handle(msg: PluginToUIMessage | undefined) {
    if (!msg) return;
    switch (msg.type) {
      case 'SELECTION_DATA': {
        const p = this.pending.get(msg.requestId);
        if (p) {
          this.pending.delete(msg.requestId);
          p.resolve(msg.payload);
        } else this.onSelectionPush(msg.payload);
        break;
      }
      case 'NODE_EXPORT_RESULT': {
        const p = this.pending.get(msg.payload.requestId);
        if (p) {
          this.pending.delete(msg.payload.requestId);
          p.resolve(msg.payload);
        }
        break;
      }
      case 'EXPORT_ERROR': {
        const id = msg.payload.requestId;
        const p = id !== undefined ? this.pending.get(id) : undefined;
        if (p && id !== undefined) {
          this.pending.delete(id);
          p.reject(
            msg.payload.message === 'cancelled'
              ? new CancelledError()
              : new Error(msg.payload.message),
          );
        } else this.onError(msg.payload);
        break;
      }
      case 'EXPORT_PROGRESS':
        this.onProgress(msg.payload);
        break;
      case 'SETTINGS_LOADED':
        this.onSettings(msg.payload);
        break;
    }
  }

  private request<T>(send: (id: number) => void): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      send(id);
    });
  }

  requestSelection(payload: SelectionOptions): Promise<SerializedDocument> {
    return this.request((requestId) =>
      this.post({ type: 'REQUEST_SELECTION', payload, requestId }),
    );
  }

  /** Cached, cancellable export of a single node as PNG / SVG / PDF. */
  async exportNode(
    kind: NodeExportKind,
    params: ExportParams,
    token?: CancelToken,
  ): Promise<NodeExportResult> {
    token?.throwIfCancelled();
    const key = `${kind}|${JSON.stringify(params)}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const result = await this.request<NodeExportResult>((requestId) => {
      const payload: NodeExportRequest = { ...params, requestId, sessionId: token?.sessionId ?? 0 };
      const type =
        kind === 'png'
          ? 'REQUEST_NODE_PNG'
          : kind === 'svg'
            ? 'REQUEST_NODE_SVG'
            : 'REQUEST_NODE_PDF';
      this.post({ type, payload } as UIToPluginMessage);
    });
    token?.throwIfCancelled();
    this.remember(key, result);
    return result;
  }

  private remember(key: string, r: NodeExportResult) {
    const size = (r.bytes?.byteLength ?? 0) + (r.svg?.length ?? 0);
    if (size > CACHE_MAX_BYTES / 4) return; // don't cache giant results
    while (this.cacheBytes + size > CACHE_MAX_BYTES && this.cache.size) {
      const first = this.cache.keys().next().value as string;
      const v = this.cache.get(first)!;
      this.cacheBytes -= (v.bytes?.byteLength ?? 0) + (v.svg?.length ?? 0);
      this.cache.delete(first);
    }
    this.cache.set(key, r);
    this.cacheBytes += size;
  }

  /** Called on selection / document / scale / option changes. */
  clearCache(): void {
    this.cache.clear();
    this.cacheBytes = 0;
  }

  cancel(token: CancelToken): void {
    token.cancel();
    this.post({ type: 'CANCEL_EXPORT', payload: { sessionId: token.sessionId } });
    for (const [id, p] of this.pending) {
      p.reject(new CancelledError());
      this.pending.delete(id);
    }
  }
}
