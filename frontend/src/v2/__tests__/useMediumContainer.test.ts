import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMediumContainer } from '../useMediumContainer';
import type { V2Asset, V2Assembly } from '../types';

const asset = (id: string, name: string, parentAssetId: string | null = null): V2Asset =>
  ({ id, name, parentAssetId, assemblyId: null }) as unknown as V2Asset;

/** 설비 둘, 그리고 그중 하나(OFD) 안에 든 부품 하나. */
const OFD = asset('ofd', '판암 OFD');
const SGC = asset('sgc', '판암 송광치');
const SLOT = asset('slot', '슬롯 1', 'ofd');
const ALL = [OFD, SGC, SLOT];
const CONTAINERS = [OFD, SGC];
const assemblies = new Map<string, V2Assembly>();

const pick = (selectedAssetId: string | null, containerId: string | null = null, onPickContainer = vi.fn()) =>
  renderHook(() =>
    useMediumContainer(CONTAINERS, assemblies, { assets: ALL, selectedAssetId, containerId, onPickContainer }),
  ).result.current;

describe('useMediumContainer — 「지금 보는 설비」는 하나다', () => {
  it('고른 자산이 설비면 그 설비를 본다 — 현황에서 고른 것이 따라온다', () => {
    /* 예전에는 뷰마다 제 상태를 들고 있어서, 현황에서 송광치를 골라도 선번장은 OFD 를
       가리켰다 — 한 화면이 두 설비를 동시에 「지금 것」이라 말한 셈이다. */
    expect(pick('sgc').activeKey).toBe('sgc');
  });

  it('고른 것이 부품이면 그것을 품은 설비를 본다', () => {
    expect(pick('slot').activeKey).toBe('ofd');
  });

  it('고른 것이 이 표에 없으면 주소에 적힌 설비로 물러선다', () => {
    expect(pick('없는-자산', 'sgc').activeKey).toBe('sgc');
  });

  it('둘 다 없으면 첫 번째 — 빈 화면을 보여 주는 것보다 낫다', () => {
    expect(pick(null, null).activeKey).toBe('ofd');
    /* 지워졌거나 다른 변전소의 것이면 주소 값도 버린다. */
    expect(pick(null, '사라진-설비').activeKey).toBe('ofd');
  });

  it('고른 자산이 이기고 주소 값은 뒤로 물러난다', () => {
    expect(pick('sgc', 'ofd').activeKey).toBe('sgc');
  });

  it('드롭다운은 주소에 적는다 — 지역 상태를 따로 두지 않는다', () => {
    const onPick = vi.fn();
    pick(null, null, onPick).setActiveKey('sgc');
    expect(onPick).toHaveBeenCalledWith('sgc');
  });
});
