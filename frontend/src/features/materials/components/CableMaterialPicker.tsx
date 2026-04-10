import { MaterialPicker, type MaterialPickerValue } from './MaterialPicker';
import { useRecentMaterialsStore } from '../stores/recentMaterialsStore';

interface CableMaterialPickerProps {
  value: { categoryId: string; specParams: Record<string, unknown> } | null;
  onChange: (value: MaterialPickerValue) => void;
}

/**
 * Cable-specific material picker wrapping MaterialPicker with categoryType='CABLE'.
 * Shows recent cable materials from localStorage.
 */
export function CableMaterialPicker({ value, onChange }: CableMaterialPickerProps) {
  const recentCables = useRecentMaterialsStore((s) => s.recentCables);

  return (
    <MaterialPicker
      categoryType="CABLE"
      value={value}
      onChange={onChange}
      recentItems={recentCables}
    />
  );
}
