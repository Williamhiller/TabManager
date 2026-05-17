import { useEffect, useRef } from 'react';
import type { RemixiconComponentType } from '@remixicon/react';

export type SegmentedSwitchOption<T extends string> = {
  disabled?: boolean;
  icon?: RemixiconComponentType;
  label: string;
  meta?: string | number;
  value: T;
};

type SegmentedSwitchProps<T extends string> = {
  ariaLabel: string;
  className?: string;
  onChange: (value: T) => void;
  optionClassName?: string;
  options: Array<SegmentedSwitchOption<T>>;
  value: T;
};

export function SegmentedSwitch<T extends string>({
  ariaLabel,
  className,
  onChange,
  optionClassName,
  options,
  value
}: SegmentedSwitchProps<T>) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const syncIndicator = () => {
      const activeButton = root.querySelector<HTMLButtonElement>('[data-active="true"]');
      if (!activeButton) return;

      root.style.setProperty('--tm-segmented-indicator-x', `${activeButton.offsetLeft}px`);
      root.style.setProperty('--tm-segmented-indicator-width', `${activeButton.offsetWidth}px`);
    };

    const frameId = window.requestAnimationFrame(syncIndicator);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncIndicator) : null;
    resizeObserver?.observe(root);
    Array.from(root.children).forEach((child) => {
      if (child instanceof HTMLElement) resizeObserver?.observe(child);
    });
    window.addEventListener('resize', syncIndicator);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', syncIndicator);
    };
  }, [options, value]);

  return (
    <div
      ref={rootRef}
      className={['tm-segmented-switch', className].filter(Boolean).join(' ')}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            aria-selected={active}
            className={['tm-segmented-switch-option', optionClassName].filter(Boolean).join(' ')}
            data-active={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            role="tab"
            type="button"
          >
            {Icon ? <Icon aria-hidden="true" size={14} /> : null}
            <strong>{option.label}</strong>
            {option.meta == null ? null : <span>{option.meta}</span>}
          </button>
        );
      })}
    </div>
  );
}
