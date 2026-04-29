import { api } from '../utils/api';
import type { DwgImportResult } from '../types/floorPlan';

export interface ImportOptions {
  mode: 'smart' | 'advanced';
  commit: boolean;
  layers?: string[];
  includeOutline?: boolean;
  includeLabels?: boolean;
  scaleMmPerUnit?: number;
}

export const dwgImportApi = {
  /**
   * 도면 파일을 업로드 + 파싱 + (커밋 옵션) — preview 또는 commit 둘 다 처리
   */
  async importToFloor(floorId: string, file: File, options: ImportOptions): Promise<DwgImportResult> {
    const form = new FormData();
    form.append('file', file);
    form.append('mode', options.mode);
    form.append('commit', String(options.commit));
    if (options.layers && options.layers.length > 0) {
      form.append('layers', JSON.stringify(options.layers));
    }
    if (options.includeOutline != null) form.append('includeOutline', String(options.includeOutline));
    if (options.includeLabels != null) form.append('includeLabels', String(options.includeLabels));
    if (options.scaleMmPerUnit != null) form.append('scaleMmPerUnit', String(options.scaleMmPerUnit));

    const { data } = await api.post<{ data: DwgImportResult }>(
      `/floors/${floorId}/background/import`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data.data;
  },

  async clearBackground(floorId: string): Promise<void> {
    await api.delete(`/floors/${floorId}/background`);
  },

  async setOpacity(floorId: string, opacity: number): Promise<void> {
    await api.patch(`/floors/${floorId}/background/opacity`, { opacity });
  },
};
