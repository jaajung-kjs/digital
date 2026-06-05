import { describe, it, expect } from 'vitest';
import { buildCsv } from './exportCsv';
import type { GridColumn } from './columns';
import type { Asset } from '../../types/asset';

const cols: GridColumn[] = [
  { key: 'name', label: '이름', kind: 'name' },
  { key: 'model', label: '모델명', kind: 'attr' },
];
const assets = [
  { id: 'a1', name: '원주RTU', attributes: { model: 'CT-1000' }, installDate: '2023-12-01', manager: '김OO', status: '운영', warrantyUntil: null, replaceDue: null, assetType: { name: 'RTU' } } as unknown as Asset,
];

describe('buildCsv', () => {
  it('헤더에 종류·표시컬럼·설치일·담당자·상태·교체예정·하자보수기한', () => {
    const header = buildCsv(assets, cols).split('\n')[0];
    expect(header).toContain('종류');
    expect(header).toContain('이름');
    expect(header).toContain('모델명');
    expect(header).toContain('설치일');
    expect(header).toContain('하자보수기한');
  });
  it('값 행에 자산 데이터', () => {
    const row = buildCsv(assets, cols).split('\n')[1];
    expect(row).toContain('원주RTU');
    expect(row).toContain('CT-1000');
    expect(row).toContain('김OO');
  });
  it('쉼표/따옴표는 이스케이프', () => {
    const a = [{ ...assets[0], name: '랙,3"호' } as Asset];
    const row = buildCsv(a, cols).split('\n')[1];
    expect(row).toContain('"랙,3""호"');
  });
});
