import { assetAlert } from '../alerts';
import { toDateInputValue } from '../../../utils/date';

interface Props {
  asset: { warrantyUntil: string | null; replaceDue: string | null };
  today: Date;
  readOnly: boolean;
  onChange?: (patch: { warrantyUntil?: string | null; replaceDue?: string | null }) => void;
}

export function AssetLifecycleView({ asset, today, readOnly, onChange }: Props) {
  const alert = assetAlert(
    { warrantyUntil: asset.warrantyUntil, replaceDue: asset.replaceDue } as Parameters<typeof assetAlert>[0],
    today,
  );
  return (
    <div className="space-y-0.5">
      {alert && <div className="text-xs text-amber-700">⚠ {alert.label}</div>}
      <Row label="교체예정" value={asset.replaceDue} readOnly={readOnly} onChange={(v) => onChange?.({ replaceDue: v })} />
      <Row label="하자보수기한" value={asset.warrantyUntil} readOnly={readOnly} onChange={(v) => onChange?.({ warrantyUntil: v })} />
    </div>
  );
}

function Row({ label, value, readOnly, onChange }: {
  label: string; value: string | null; readOnly: boolean; onChange: (v: string | null) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm py-0.5">
      <span className="w-24 shrink-0 text-gray-500 text-xs">{label}</span>
      {readOnly ? (
        <span className="flex-1">{value ? toDateInputValue(value) : '-'}</span>
      ) : (
        <input aria-label={label} type="date" defaultValue={toDateInputValue(value)}
          onBlur={(e) => onChange(e.target.value || null)}
          className="flex-1 px-1 py-0.5 border border-gray-200 rounded text-sm" />
      )}
    </label>
  );
}
