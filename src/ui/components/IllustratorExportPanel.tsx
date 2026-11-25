import type { IllustratorOptions } from '../types/export-types';

interface Props {
  options: IllustratorOptions;
  onChange: (o: IllustratorOptions) => void;
}

export function IllustratorExportPanel({ options: o, onChange }: Props) {
  const set = (p: Partial<IllustratorOptions>) => onChange({ ...o, ...p });
  const isSvg = o.format === 'svg';
  return (
    <div className="panel" role="tabpanel" id="panel-illustrator" aria-labelledby="tab-illustrator">
      <fieldset>
        <legend>Format</legend>
        <label className="radio">
          <input
            type="radio"
            name="ai-format"
            checked={isSvg}
            onChange={() => set({ format: 'svg' })}
          />
          <span>
            <b>SVG for Illustrator</b>
          </span>
        </label>
        <label className="radio">
          <input
            type="radio"
            name="ai-format"
            checked={!isSvg}
            onChange={() =>
              set({ format: 'pdf', output: o.output === 'combined' ? 'zip' : o.output })
            }
          />
          <span>
            <b>PDF for Illustrator</b>
          </span>
        </label>
        <p className="note">
          SVG provides better vector editability in Illustrator. PDF usually provides better visual
          fidelity. No native .ai file is generated.
        </p>
      </fieldset>
      <label className="field">
        Output
        <select
          value={o.output}
          onChange={(e) => set({ output: e.target.value as IllustratorOptions['output'] })}
        >
          <option value="files">One file per frame</option>
          <option value="zip">ZIP package (one artboard per file)</option>
          {isSvg && <option value="combined">Single SVG with all artboards</option>}
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={o.includeBackground}
          onChange={(e) => set({ includeBackground: e.target.checked })}
        />
        Include frame background
      </label>
      {isSvg && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={o.outlineText}
              onChange={(e) => set({ outlineText: e.target.checked })}
            />
            Outline text (otherwise text stays editable)
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={o.layerIds}
              onChange={(e) => set({ layerIds: e.target.checked })}
            />
            Keep layer names as group IDs
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={o.optimize}
              onChange={(e) => set({ optimize: e.target.checked })}
            />
            Optimize SVG
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={o.rasterizeUnsupported}
              onChange={(e) => set({ rasterizeUnsupported: e.target.checked })}
            />
            Rasterize frames with unsupported effects
          </label>
        </>
      )}
      <label className="field">
        File-name pattern
        <input
          type="text"
          value={o.fileNamePattern}
          onChange={(e) => set({ fileNamePattern: e.target.value })}
          spellCheck={false}
        />
      </label>
      <p className="note">
        Figma components and Auto Layout do not stay functional in Illustrator.
      </p>
    </div>
  );
}
