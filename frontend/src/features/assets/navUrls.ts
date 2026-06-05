export const floorPlanUrl = (floorId: string, assetId: string) =>
  `/floors/${floorId}/plan?equipmentId=${assetId}`;
export const registerUrl = (substationId: string, assetId: string) =>
  `/substations/${substationId}/assets?assetId=${assetId}`;
