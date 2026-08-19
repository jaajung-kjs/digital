/**
 * PhotoCard — InfoTab 사진 카드 테스트
 *
 * 실제 컴포넌트 + 실제 스토어(v2WorkingCopyStore.setState 로 직접 시딩, FiberRegisterView.test.tsx
 * 관례)를 구동한다. `api.uploadPhoto` 만 목킹 — 그 외 api 함수(photoUrl 등)는 실물을 쓴다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { v2WorkingCopyStore } from '../store/workingCopyStore';
import { emptyOverlay } from '../store/overlay';
import { PhotoCard } from '../components/detail/PhotoCard';
import type { V2Asset, V2AssetPhoto } from '../types';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, uploadPhoto: vi.fn() };
});
import { uploadPhoto } from '../api';

const mockedUploadPhoto = vi.mocked(uploadPhoto);

function asset(id: string, name: string, extra: Partial<V2Asset> = {}): V2Asset {
  return {
    id, name, typeId: 't-1', substationId: 'sub-1', status: 'normal',
    floorId: null, x: null, y: null, width: null, height: null,
    parentAssetId: null, containerKey: null, col: null, row: null, colSpan: null, rowSpan: null,
    fieldValues: {}, updatedAt: '2026-07-27T00:00:00.000Z', ports: [],
    ...extra,
  };
}

function photo(id: string, assetId: string, extra: Partial<V2AssetPhoto> = {}): V2AssetPhoto {
  return { id, assetId, filePath: `assets/${id}.png`, caption: null, updatedAt: '2026-07-27T00:00:00.000Z', ...extra };
}

function setStore(photos: V2AssetPhoto[]) {
  v2WorkingCopyStore.setState({
    substationId: 'sub-1',
    saved: { substation: null, floors: [], assets: [asset('a-1', '자산1')], maintenanceLogs: [], inspectionLogs: [], cables: [], photos },
    overlays: { assets: emptyOverlay(), maintenance: emptyOverlay(), inspections: emptyOverlay(), cables: emptyOverlay(), photos: emptyOverlay() },
    baseVersions: {},
  });
}

function selectFile(): File {
  return new File(['fake-bytes'], 'a.png', { type: 'image/png' });
}

describe('PhotoCard', () => {
  beforeEach(() => {
    mockedUploadPhoto.mockReset();
    setStore([]);
  });

  it('파일 선택 → uploadPhoto 호출 → overlays.photos.creates 에 스테이징(assetId·filePath 일치)', async () => {
    mockedUploadPhoto.mockResolvedValue({ filePath: 'assets/new-uuid.png' });
    render(<PhotoCard assetId="a-1" />);

    const input = screen.getByTestId('photo-upload-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [selectFile()] } });

    await screen.findByAltText('자산 사진');

    expect(mockedUploadPhoto).toHaveBeenCalledTimes(1);
    const created = Object.values(v2WorkingCopyStore.getState().overlays.photos.creates);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ assetId: 'a-1', filePath: 'assets/new-uuid.png' });
  });

  it('삭제 버튼 → overlays.photos.deletes 에 id 적재', () => {
    setStore([photo('ph-1', 'a-1')]);
    render(<PhotoCard assetId="a-1" />);

    fireEvent.click(screen.getByRole('button', { name: '사진 삭제' }));

    expect(v2WorkingCopyStore.getState().overlays.photos.deletes).toEqual(['ph-1']);
  });

  it('캡션 입력 blur → overlays.photos.updates 에 caption 반영', () => {
    setStore([photo('ph-1', 'a-1', { caption: null })]);
    render(<PhotoCard assetId="a-1" />);

    /* 설명도 **누를 때** 상자가 된다 — 표 칸과 같은 어법(`InlineEditCell`). */
    fireEvent.click(screen.getByRole('button', { name: '설명 고치기' }));
    const captionInput = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(captionInput, { target: { value: '정면 사진' } });
    fireEvent.blur(captionInput);

    expect(v2WorkingCopyStore.getState().overlays.photos.updates['ph-1']).toEqual({ caption: '정면 사진' });
  });

  it('썸네일 클릭 → 원본 이미지가 dialog 안에 렌더', () => {
    setStore([photo('ph-1', 'a-1', { caption: '정면' })]);
    render(<PhotoCard assetId="a-1" />);

    fireEvent.click(screen.getByAltText('정면'));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByAltText('정면')).toBeTruthy();
  });

  it('업로드 실패(reject) → 한글 에러 문구 표시, 스테이징 없음', async () => {
    mockedUploadPhoto.mockRejectedValue(new Error('network fail'));
    render(<PhotoCard assetId="a-1" />);

    const input = screen.getByTestId('photo-upload-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [selectFile()] } });

    await screen.findByText('사진 업로드에 실패했습니다');

    expect(Object.keys(v2WorkingCopyStore.getState().overlays.photos.creates)).toHaveLength(0);
  });
});
