import type { FieldDef } from '@twin/core';
import type { V2AssetType, V2ContainerSpec } from './types';

export function deriveDetailSections(type: V2AssetType): {
  showPorts: boolean;
  containerSpecs: V2ContainerSpec[];
  fieldDefs: FieldDef[];
} {
  return {
    showPorts: type.portTemplates.length > 0,
    containerSpecs: type.containerSpecs,
    fieldDefs: type.fieldDefs,
  };
}
