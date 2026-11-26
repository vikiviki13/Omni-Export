import type { PsdOptions } from '../types/export-types';

interface Props {
  options: PsdOptions;
  multi: boolean;
  onChange: (o: PsdOptions) => void;
}

export function PsdExportPanel({ options: o, multi, onChange }: Props) {
  const set = (p: Partial<PsdOptions>) => onChange({ ...o, ...p });
  return (
    <div className="panel" role="tabpanel" id="panel-psd" aria-labelledby="tab-psd">
      <fieldset>
        <legend>Mode</legend>
        <label className="radio">
          <input
            type="radio"
            name="psd-mode"
            checked={o.mode === 'fidelity'}
            onChange={() => set({ mode: 'fidelity' })}
          />
          <span>
            <b>High fidelity</b> — preserves rendered appearance in named layers
          </span>
        </label>
        <label className="radio">
          <input
            type="radio"
            name="psd-mode"
            checked={o.mode === 'editable'}
            onChange={() => set({ mode: 'editable' })}
          />
          <span>
            <b>Editable layers</b> — text, linear fills, rectangle and ellipse shapes with solid strokes, and drop shadows; complex artwork stays as pixels
          </span>
        </label>
      </fieldset>
      <div className="grid2">
        <label className="field">
          Scale
          <select
            value={o.scale}
            onChange={(e) => set({ scale: Number(e.target.value) as 1 | 2 | 3 })}
          >
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={3}>3×</option>
          </select>
        </label>
        <label className="field">
          Background
          <select
            value={o.background}
            onChange={(e) => set({ background: e.target.value as PsdOptions['background'] })}
          >
            <option value="frame">Frame background</option>
            <option value="transparent">Transparent</option>
          </select>
        </label>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={o.preserveGroups}
          onChange={(e) => set({ preserveGroups: e.target.checked })}
        />
        Preserve layer groups
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={o.flattenInstances}
          onChange={(e) => set({ flattenInstances: e.target.checked })}
        />
        Flatten component instances
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={o.separateFrames}
          onChange={(e) => set({ separateFrames: e.target.checked })}
        />
        Export each frame separately
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={o.zip}
          disabled={!multi || !o.separateFrames}
          onChange={(e) => set({ zip: e.target.checked })}
        />
        ZIP multiple files
      </label>
      <label className="field">
        File-name pattern
        <input
          type="text"
          value={o.fileNamePattern}
          onChange={(e) => set({ fileNamePattern: e.target.value })}
          spellCheck={false}
        />
        <small>
          Tokens: {'{name} {width} {height} {page} {scale} {index}'} → e.g. Home-Desktop-1440.psd
        </small>
      </label>
    </div>
  );
}
