export interface FieldDef { key: string; label: string; type: string; options?: string[] }

interface Props {
  fields: FieldDef[];
  attributes: Record<string, unknown> | null;
  readOnly: boolean;
  onChange?: (key: string, value: string) => void;
}

const inputType = (t: string) => (t === 'number' ? 'number' : t === 'date' ? 'date' : t === 'month' ? 'month' : 'text');

export function AssetAttributesView({ fields, attributes, readOnly, onChange }: Props) {
  if (!fields?.length) return null;
  return (
    <div className="space-y-0.5">
      {fields.map((f) => {
        const val = attributes?.[f.key] != null ? String(attributes[f.key]) : '';
        if (readOnly) {
          return (
            <div key={f.key} className="flex items-center gap-2 text-sm py-0.5">
              <span className="w-24 shrink-0 text-gray-500 text-xs">{f.label}</span>
              <span className="flex-1">{val || '-'}</span>
            </div>
          );
        }
        return (
          <label key={f.key} className="flex items-center gap-2 text-sm py-0.5">
            <span className="w-24 shrink-0 text-gray-500 text-xs">{f.label}</span>
            {f.type === 'select' && f.options ? (
              <select
                aria-label={f.label}
                value={val}
                onChange={(e) => onChange?.(f.key, e.target.value)}
                className="flex-1 px-1 py-0.5 border border-gray-200 rounded text-sm">
                <option value=""></option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                aria-label={f.label}
                type={inputType(f.type)}
                defaultValue={val}
                onBlur={(e) => { if (e.target.value !== val) onChange?.(f.key, e.target.value); }}
                className="flex-1 px-1 py-0.5 border border-gray-200 rounded text-sm"
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
