interface Props {
  warnings: string[];
}

export function WarningList({ warnings }: Props) {
  if (!warnings.length) return null;
  return (
    <details className="card warnings">
      <summary>
        {warnings.length} warning{warnings.length === 1 ? '' : 's'}
      </summary>
      <ul>
        {warnings.slice(0, 200).map((w, i) => (
          <li key={i}>{w}</li>
        ))}
        {warnings.length > 200 && <li>…and {warnings.length - 200} more (see the JSON report)</li>}
      </ul>
    </details>
  );
}
