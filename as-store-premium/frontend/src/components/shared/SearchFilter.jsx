import { Search } from 'lucide-react';

export default function SearchFilter({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = '',
}) {
  return (
    <div className={`searchbox ${className}`.trim()}>
      <Search size={18} />
      <input
        aria-label={ariaLabel || placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value, event)}
      />
    </div>
  );
}
