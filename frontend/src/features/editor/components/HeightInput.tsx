import { PropertyInput } from './PropertyInput';
import { useEditorStore } from '../stores/editorStore';
import {
  createPropertyUpdater as updateElementProperty,
  getPropertyValue,
  hasProperty,
} from '../../../utils/floorplan/elementSystem';

/**
 * Height/elevation inputs for 3D properties.
 * Shows when an element with height3d support is selected.
 */
export function HeightInput() {
  const selectedElement = useEditorStore(s => s.selectedElement);
  const setLocalElements = useEditorStore(s => s.setLocalElements);
  const setHasChanges = useEditorStore(s => s.setHasChanges);

  if (!selectedElement) return null;

  const supportsHeight3d = hasProperty(selectedElement, 'height3d');
  if (!supportsHeight3d) return null;

  return (
    <>
      <PropertyInput
        label="H3D"
        value={getPropertyValue(selectedElement, 'height3d', 0)}
        onChange={(v) => {
          setLocalElements(updateElementProperty(selectedElement.id, 'height3d', v as number));
          setHasChanges(true);
        }}
        suffix="px"
      />
      <PropertyInput
        label="E3D"
        value={getPropertyValue(selectedElement, 'elevation3d', 0)}
        onChange={(v) => {
          setLocalElements(updateElementProperty(selectedElement.id, 'elevation3d', v as number));
          setHasChanges(true);
        }}
        suffix="px"
      />
    </>
  );
}
