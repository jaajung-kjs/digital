import type { SpecTemplate } from '../../../types/materialCategory';

interface SpecParamFormProps {
  specTemplate: SpecTemplate;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

export function SpecParamForm({ specTemplate, values, onChange }: SpecParamFormProps) {
  const handleChange = (key: string, value: unknown) => {
    onChange({ [key]: value });
  };

  return (
    <div className="space-y-4">
      {specTemplate.params.map((param) => {
        const currentValue = values[param.key] ?? '';

        return (
          <div key={param.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {param.label}
              {param.required && <span className="text-red-500 ml-0.5">*</span>}
              {param.unit && (
                <span className="text-gray-400 font-normal ml-1">({param.unit})</span>
              )}
            </label>

            {param.inputType === 'select' && param.options ? (
              <select
                value={String(currentValue)}
                onChange={(e) => handleChange(param.key, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">선택</option>
                {param.options.map((opt) => (
                  <option key={String(opt)} value={String(opt)}>
                    {String(opt)}
                  </option>
                ))}
              </select>
            ) : param.inputType === 'number' ? (
              <input
                type="number"
                value={currentValue === '' ? '' : Number(currentValue)}
                onChange={(e) =>
                  handleChange(param.key, e.target.value === '' ? '' : Number(e.target.value))
                }
                min={param.min}
                max={param.max}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={
                  param.min !== undefined && param.max !== undefined
                    ? `${param.min} ~ ${param.max}`
                    : undefined
                }
              />
            ) : (
              <input
                type="text"
                value={String(currentValue)}
                onChange={(e) => handleChange(param.key, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
