import { useEffect, useRef, useState } from 'react';
import { RiCheckLine, RiExpandUpDownLine } from '@remixicon/react';

export type DropdownOption<T extends string> = {
  label: string;
  value: T;
};

interface DropdownProps<T extends string> {
  disabled?: boolean;
  onChange: (value: T) => void;
  options: Array<DropdownOption<T>>;
  placeholder?: string;
  rightAlign?: boolean;
  value: T | '';
}

export function Dropdown<T extends string>({
  disabled,
  onChange,
  options,
  placeholder = 'Select...',
  rightAlign,
  value
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeIndex = options.findIndex((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect && rect.bottom + 240 > window.innerHeight) {
      setFlip(true);
    } else {
      setFlip(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const next = Math.max(0, Math.min(options.length - 1, activeIndex + dir));
        if (options[next]) onChange(options[next].value);
      }
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, activeIndex, options, onChange]);

  const selected = options.find((o) => o.value === value);

  const rootClass = [
    'tm-dropdown',
    flip ? 'tm-dropdown-flip' : '',
    rightAlign ? 'tm-dropdown-right' : '',
    open ? 'tm-dropdown-open' : ''
  ].filter(Boolean).join(' ');

  return (
    <div ref={rootRef} className={rootClass}>
      <button
        className="tm-dropdown-trigger"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="tm-dropdown-trigger-text">
          {selected ? selected.label : placeholder}
        </span>
        <RiExpandUpDownLine size={14} className="tm-dropdown-chevron" />
      </button>

      <div className={`tm-dropdown-menu${open ? ' tm-dropdown-menu-open' : ''}`} role="listbox">
        {options.map((option) => {
          const isActive = option.value === value;
          return (
            <button
              key={option.value}
              className={`tm-dropdown-item${isActive ? ' tm-dropdown-item-active' : ''}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              role="option"
              aria-selected={isActive}
              type="button"
            >
              <span className="tm-dropdown-item-label">{option.label}</span>
              {isActive && <RiCheckLine size={14} className="tm-dropdown-item-check" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
