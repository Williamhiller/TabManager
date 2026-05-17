import { RiArrowDownSLine } from '@remixicon/react';

type DashboardDropdownOption = {
  label: string;
  value: string;
};

type DashboardDropdownProps = {
  ariaLabel: string;
  className?: string;
  onChange: (value: string) => void;
  options: DashboardDropdownOption[];
  value: string;
};

export function DashboardDropdown({
  ariaLabel,
  className,
  onChange,
  options,
  value
}: DashboardDropdownProps) {
  const activeOption = options.find((option) => option.value === value) ?? options[0];

  return (
    <label className={className}>
      <span className="tm-dashboard-language-trigger" aria-hidden="true">
        <span>{activeOption?.label ?? ''}</span>
        <RiArrowDownSLine className="tm-dashboard-language-chevron" size={16} />
      </span>
      <select
        aria-label={ariaLabel}
        className="tm-dashboard-native-select"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
