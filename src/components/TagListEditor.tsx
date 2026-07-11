import { RiAddLine, RiCloseLine } from '@remixicon/react';
import type { KeyboardEvent } from 'react';
import { useState } from 'react';

type TagListEditorProps = {
  addLabel?: string;
  ariaLabel: string;
  disabled?: boolean;
  layout?: 'inline' | 'separated';
  onChange: (entries: string[]) => void;
  placeholder: string;
  removeLabel: string;
  value: string[];
};

function normalizeTagEntry(entry: string): string {
  return entry.trim();
}

function parseTagEntries(value: string): string[] {
  return value
    .split(/[\s,|]+/g)
    .map(normalizeTagEntry)
    .filter(Boolean);
}

function mergeTagEntries(current: string[], draft: string): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const entry of [...current, ...parseTagEntries(draft)]) {
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(entry);
  }

  return next;
}

export function TagListEditor({
  addLabel,
  ariaLabel,
  disabled = false,
  layout = 'inline',
  onChange,
  placeholder,
  removeLabel,
  value
}: TagListEditorProps) {
  const [draft, setDraft] = useState('');

  const commitDraft = () => {
    if (disabled) {
      setDraft('');
      return;
    }

    const next = mergeTagEntries(value, draft);
    if (next.length !== value.length || next.some((entry, index) => entry !== value[index])) {
      onChange(next);
    }
    setDraft('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' && event.key !== ',' && event.key !== '|' && (layout === 'separated' || event.key !== ' ')) return;
    event.preventDefault();
    commitDraft();
  };

  const removeEntry = (entry: string) => {
    if (disabled) return;
    onChange(value.filter((item) => item !== entry));
  };

  if (layout === 'separated') {
    return (
      <div className="tm-tag-editor tm-tag-editor-separated" data-disabled={disabled}>
        <div className="tm-tag-add-row">
          <input
            aria-label={ariaLabel}
            className="tm-tag-add-input"
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            value={draft}
          />
          <button
            className="tm-tag-add-button"
            disabled={disabled || !draft.trim()}
            onClick={commitDraft}
            type="button"
          >
            <RiAddLine size={14} />
            <span>{addLabel ?? ariaLabel}</span>
          </button>
        </div>
        <div className="tm-tag-list tm-tag-list-separated" data-empty={value.length === 0 ? 'true' : 'false'}>
          {value.map((entry) => (
            <span className="tm-tag-chip" key={entry}>
              <span>{entry}</span>
              <button
                aria-label={`${removeLabel}: ${entry}`}
                className="tm-tag-remove"
                disabled={disabled}
                onClick={() => removeEntry(entry)}
                type="button"
              >
                <RiCloseLine size={12} />
              </button>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="tm-tag-editor" data-disabled={disabled}>
      <div className="tm-tag-list">
        {value.map((entry) => (
          <span className="tm-tag-chip" key={entry}>
            <span>{entry}</span>
            <button
              aria-label={`${removeLabel}: ${entry}`}
              className="tm-tag-remove"
              disabled={disabled}
              onClick={() => removeEntry(entry)}
              type="button"
            >
              <RiCloseLine size={12} />
            </button>
          </span>
        ))}
        <input
          aria-label={ariaLabel}
          className="tm-tag-input"
          disabled={disabled}
          onBlur={commitDraft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          value={draft}
        />
      </div>
    </div>
  );
}
