import type { Asset } from '../../types/asset';
import type { GridColumn } from './columns';

function esc(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const cell = (a: Asset, _col: GridColumn): string => a.name;

/** 현재 표(컬럼) + 생애주기/메타를 CSV 문자열로. */
export function buildCsv(assets: Asset[], columns: GridColumn[]): string {
  const meta = ['설치일', '담당자', '상태', '교체예정', '하자보수기한'];
  const header = ['종류', ...columns.map((c) => c.label), ...meta].map(esc).join(',');
  const rows = assets.map((a) =>
    [
      a.assetType?.name ?? '',
      ...columns.map((c) => cell(a, c)),
      a.installDate ?? '', a.manager ?? '', a.status ?? '', a.replaceDue ?? '', a.warrantyUntil ?? '',
    ].map((v) => esc(String(v ?? ''))).join(','),
  );
  return [header, ...rows].join('\n');
}

/** CSV 를 UTF-8 BOM 파일로 다운로드(브라우저). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
