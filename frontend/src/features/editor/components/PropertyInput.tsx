import { useState, useEffect } from 'react';

interface PropertyInputProps {
  label: string;
  value: string | number;
  onChange?: (value: number | string) => void;
  type?: 'number' | 'text';
  suffix?: string;
  readOnly?: boolean;
  width?: string;
  defaultValue?: number;
}

export function PropertyInput({
  label,
  value,
  onChange,
  type = 'number',
  suffix = '',
  readOnly = false,
  width = 'w-16',
  defaultValue = 0,
}: PropertyInputProps) {
  const [localValue, setLocalValue] = useState<string>(String(value));

  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!onChange) return;
      if (type === 'number') {
        const num = parseFloat(localValue);
        onChange(isNaN(num) ? defaultValue : num);
      } else {
        onChange(localValue || '');
      }
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setLocalValue(String(value));
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleBlur = () => {
    if (!onChange) return;
    if (type === 'number') {
      const num = parseFloat(localValue);
      onChange(isNaN(num) ? defaultValue : num);
    } else {
      onChange(localValue || '');
    }
  };

  return (
    <div className="flex items-center gap-1">
      <span className="text-gray-500 text-xs font-medium min-w-[24px]">{label}</span>
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        readOnly={readOnly}
        className={`${width} px-1.5 py-0.5 rounded border border-gray-200 text-gray-700 font-mono text-sm text-center focus:border-blue-400 focus:outline-none ${readOnly ? 'bg-gray-100 cursor-default' : 'bg-white'}`}
      />
      {suffix && <span className="text-gray-400 text-xs">{suffix}</span>}
    </div>
  );
}
