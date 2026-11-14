"use client";

type Suggestion = Readonly<{ email: string; name: string; source: string }>;

export function CohostSuggestions({
  options,
  onSelect
}: Readonly<{ options: readonly Suggestion[]; onSelect: (email: string) => void }>) {
  return (
    <ul className="series-cohost-suggestions" aria-label="Sugerencias de cohosts">
      {options.map((option) => (
        <li key={option.email}>
          <button type="button" onClick={() => onSelect(option.email)} className="series-cohost-suggestion">
            <span>
              <strong>{option.name}</strong>
              <br />
              <small>{option.email}</small>
            </span>
            <small>{option.source}</small>
          </button>
        </li>
      ))}
    </ul>
  );
}
