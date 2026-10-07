/**
 * PhotoCard — 상세 패널 사진 카드 테스트
 *
 * 실제 컴포넌트 + 실제 새 스토어(workingCopyStore)를 구동한다. 목킹하는 것은 없다 — **사진은 서버에 들르지 않는다**. 고른 파일은
 * 브라우저가 들고 있다가 저장할 때 함께 간다(`pendingPhotos` + `putCommit`).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { workingCopyStore as store } from '../model/store/workingCopy';
import { PhotoCard } from '../components/detail/PhotoCard';
import { pendingPhotoFiles, pendingPhotoUrl } from '../store/pendingPhotos';
import type { EquipmentPhoto } from '../model/types';

function photo(id: string, equipmentId: string, extra: Partial<EquipmentPhoto> = {}): EquipmentPhoto {
  return { id, equipmentId, filePath: `equipment/${id}.png`, caption: null, updatedAt: '2026-07-27T00:00:00.000Z', ...extra };
}

function setStore(photos: EquipmentPhoto[]) {
  store.getState().reset();
  store.setState({ saved: { ...store.getState().saved, photos } });
}

function selectFile(): File {
  return new File(['fake-bytes'], 'a.png', { type: 'image/png' });
}

describe('PhotoCard', () => {
  beforeEach(() => {
    setStore([]);
  });

  it('파일을 고르면 **서버에 들르지 않고** 워킹 카피에 담긴다 — 파일은 저장이 실어 간다', async () => {
    render(<PhotoCard equipmentId="a-1" />);

    const input = screen.getByTestId('photo-upload-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [selectFile()] } });

    await screen.findByAltText('설비 사진');

    const created = Object.values(store.getState().overlays.photos.creates);
    expect(created).toHaveLength(1);
    /* 경로는 비어 있다 — 서버가 지어 준다(`putCommit`). */
    expect(created[0]).toMatchObject({ equipmentId: 'a-1', filePath: '' });

    /* 저장이 실어 갈 파일이 그 사진 id 로 들려 있다. */
    const id = (created[0] as { id: string }).id;
    expect(pendingPhotoFiles().get(id)?.name).toBe('a.png');
    /* 저장 전에도 보인다 — 미리보기는 브라우저 안의 것이다. */
    expect(pendingPhotoUrl(id)).toBeTruthy();
  });

  it('삭제 버튼 → overlays.photos.deletes 에 id 적재', () => {
    setStore([photo('ph-1', 'a-1')]);
    render(<PhotoCard equipmentId="a-1" />);

    fireEvent.click(screen.getByRole('button', { name: '사진 삭제' }));

    expect(store.getState().overlays.photos.deletes).toEqual(['ph-1']);
  });

  it('캡션 입력 blur → overlays.photos.updates 에 caption 반영', () => {
    setStore([photo('ph-1', 'a-1', { caption: null })]);
    render(<PhotoCard equipmentId="a-1" />);

    /* 설명도 **누를 때** 상자가 된다 — 표 칸과 같은 어법(`InlineEditCell`). */
    fireEvent.click(screen.getByRole('button', { name: '설명 수정' }));
    const captionInput = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(captionInput, { target: { value: '정면 사진' } });
    fireEvent.blur(captionInput);

    expect(store.getState().overlays.photos.updates['ph-1']).toEqual({ caption: '정면 사진' });
  });

  it('썸네일 클릭 → 원본 이미지가 dialog 안에 렌더', () => {
    setStore([photo('ph-1', 'a-1', { caption: '정면' })]);
    render(<PhotoCard equipmentId="a-1" />);

    fireEvent.click(screen.getByAltText('정면'));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByAltText('정면')).toBeTruthy();
  });

  it('담아 둔 사진을 지우면 들고 있던 파일도 놓는다 — 저장이 실어 갈 것이 남지 않는다', async () => {
    render(<PhotoCard equipmentId="a-1" />);
    fireEvent.change(screen.getByTestId('photo-upload-input'), { target: { files: [selectFile()] } });
    await screen.findByAltText('설비 사진');
    expect(pendingPhotoFiles().size).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: '사진 삭제' }));

    expect(pendingPhotoFiles().size).toBe(0);
  });

});
