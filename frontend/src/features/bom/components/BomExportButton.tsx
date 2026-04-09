import { useCallback } from 'react';
import type { BomItem } from '../hooks/useBom';

interface BomExportButtonProps {
  items: BomItem[];
  roomName?: string;
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function generateCsv(items: BomItem[]): string {
  const headers = ['분류', '코드', '자재명', '규격', '수량', '단위'];
  const typeLabel: Record<string, string> = {
    CABLE: '케이블',
    EQUIPMENT: '설비',
    ACCESSORY: '부속자재',
  };

  const rows = items.map((item) => [
    typeLabel[item.categoryType] ?? item.categoryType,
    item.code,
    item.name,
    item.specDescription || '',
    String(item.quantity),
    item.unit,
  ]);

  const lines = [headers, ...rows].map((row) => row.map(escapeCsv).join(','));
  return '\uFEFF' + lines.join('\r\n');
}

export function BomExportButton({ items, roomName }: BomExportButtonProps) {
  const handleExport = useCallback(() => {
    if (items.length === 0) return;

    const csv = generateCsv(items);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const filename = `BOM_${roomName ?? 'export'}_${new Date().toISOString().slice(0, 10)}.csv`;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [items, roomName]);

  return (
    <button
      onClick={handleExport}
      disabled={items.length === 0}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      title="CSV 내보내기"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      CSV 내보내기
    </button>
  );
}
