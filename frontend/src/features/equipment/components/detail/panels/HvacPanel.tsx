import { EditorInspectorPanel } from './EditorInspectorPanel';

interface PanelProps {
  equipmentId: string;
}

export function HvacPanel({ equipmentId }: PanelProps) {
  return <EditorInspectorPanel equipmentId={equipmentId} />;
}
