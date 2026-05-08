import { api } from '../utils/api';
import type { DwgImportResult } from '../types/floorPlan';

/**
 * DWG-A 이후: backend 는 도면 안의 모든 layer 를 import 한다 (BgLayer.isVisible 로
 * frozen/off layer 만 표시). 가시성 토글은 클라이언트의 hiddenBgLayers (Phase C) 가
 * 담당. 따라서 import 옵션은 'smart' | 'advanced' (layer 화이트리스트) 두 가지만
 * 의미가 있고, 새 UI 는 기본적으로 'smart' 만 사용한다.
 *
 * CM-B: scaleMmPerUnit 옵션 폐기 — 캔버스 1 unit = 1 cm 통일 후 의미 없음.
 * (backend 는 mm 좌표를 ÷10 으로 cm 변환하여 실측 보존.)
 *
 * Staged-DWG 전환 이후: backend 는 항상 parse-only 로 동작한다. 실제 적용
 * (clear / opacity / replace) 은 PUT /floors/:id/plan 의 backgroundDrawing /
 * backgroundOpacity 필드로 처리된다 — 따라서 setOpacity / clearBackground 같은
 * 즉시반영 메서드는 더 이상 존재하지 않는다.
 */
export interface ImportOptions {
  mode: 'smart' | 'advanced';
  /** advanced 모드에서만 사용 — 화이트리스트할 레이어 이름들. */
  layers?: string[];
}

export const dwgImportApi = {
  /** 도면 파일 파싱 — 결과는 staging 으로 들어가고 저장 시점에 커밋된다. */
  async importToFloor(
    floorId: string,
    file: File,
    options: ImportOptions,
  ): Promise<DwgImportResult> {
    const form = new FormData();
    form.append('file', file);
    form.append('mode', options.mode);
    if (options.layers && options.layers.length > 0) {
      form.append('layers', JSON.stringify(options.layers));
    }

    const { data } = await api.post<{ data: DwgImportResult }>(
      `/floors/${floorId}/background/import`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data.data;
  },
};
