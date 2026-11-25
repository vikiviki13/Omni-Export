import type { HtmlOptions } from '../types/export-types';
import type { HtmlImageInfo } from '../exporters/html-exporter';

interface Props {
  options: HtmlOptions;
  onChange: (o: HtmlOptions) => void;
  images: HtmlImageInfo[];
  alts: Record<string, string>;
  onAlt: (id: string, value: string) => void;
  onPreview: () => void;
  busy: boolean;
}

export function HtmlExportPanel({
  options: o,
  onChange,
  images,
  alts,
  onAlt,
  onPreview,
  busy,
}: Props) {
  const set = (p: Partial<HtmlOptions>) => onChange({ ...o, ...p });
  return (
    <div className="panel" role="tabpanel" id="panel-html" aria-labelledby="tab-html">
      <fieldset>
        <legend>Layout</legend>
        <label className="radio">
          <input
            type="radio"
            name="html-layout"
            checked={o.layout === 'pixel'}
            onChange={() => set({ layout: 'pixel' })}
          />
          <span>
            <b>Pixel-perfect</b> — absolute positioning, exact match
          </span>
        </label>
        <label className="radio">
          <input
            type="radio"
            name="html-layout"
            checked={o.layout === 'responsive'}
            onChange={() => set({ layout: 'responsive' })}
          />
          <span>
            <b>Responsive</b> — Auto Layout → Flexbox, breakpoints
          </span>
        </label>
      </fieldset>
      <label className="check">
        <input
          type="checkbox"
          checked={o.interactions}
          onChange={(e) => set({ interactions: e.target.checked })}
        />
        Convert prototype interactions to JavaScript
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={o.zipProject}
          onChange={(e) => set({ zipProject: e.target.checked })}
        />
        Export ZIP project (index.html, styles.css, script.js, assets/)
      </label>
      <p className="note">
        Default output is one standalone .html file with inline CSS and JavaScript, no internet
        needed.
      </p>
      <button className="btn secondary" onClick={onPreview} disabled={busy}>
        Preview &amp; inspect
      </button>
      {images.length > 0 && (
        <div className="alt-table">
          <h3>Image alt text</h3>
          <table>
            <thead>
              <tr>
                <th scope="col">Layer</th>
                <th scope="col">Alt text</th>
              </tr>
            </thead>
            <tbody>
              {images.map((im) => (
                <tr key={im.nodeId}>
                  <td title={im.name}>{im.name}</td>
                  <td>
                    <input
                      type="text"
                      aria-label={`Alt text for ${im.name}`}
                      value={alts[im.nodeId] ?? im.alt}
                      onChange={(e) => onAlt(im.nodeId, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <small>Edit, then press “Preview &amp; inspect” again to refresh.</small>
        </div>
      )}
    </div>
  );
}
