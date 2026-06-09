import { EditorInspectorPanel } from './EditorInspectorPanel';

interface PanelProps {
  equipmentId: string;
}

export function GroundingPanel({ equipmentId }: PanelProps) {
  return <EditorInspectorPanel equipmentId={equipmentId} />;
}
