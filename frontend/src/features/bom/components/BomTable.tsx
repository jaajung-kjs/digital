import type { BomItem } from '../hooks/useBom';

interface BomTableProps {
  items: BomItem[];
}

function groupByType(items: BomItem[]) {
  const cables: BomItem[] = [];
  const equipment: BomItem[] = [];
  const accessories: BomItem[] = [];

  for (const item of items) {
    switch (item.categoryType) {
      case 'CABLE':
        cables.push(item);
        break;
      case 'EQUIPMENT':
        equipment.push(item);
        break;
      case 'ACCESSORY':
        accessories.push(item);
        break;
    }
  }

  return { cables, equipment, accessories };
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  if (count === 0) return null;
  return (
    <tr className="bg-gray-100">
      <td colSpan={5} className="px-3 py-1.5 text-xs font-semibold text-gray-700">
        {title} ({count})
      </td>
    </tr>
  );
}

function ItemRows({ items }: { items: BomItem[] }) {
  if (items.length === 0) return null;
  return (
    <>
      {items.map((item) => (
        <tr key={item.materialCategoryId} className="border-t border-gray-100 hover:bg-gray-50">
          <td className="px-3 py-1.5 text-xs text-gray-500 font-mono">{item.code}</td>
          <td className="px-3 py-1.5 text-xs text-gray-800">{item.name}</td>
          <td className="px-3 py-1.5 text-xs text-gray-500">{item.specDescription || '-'}</td>
          <td className="px-3 py-1.5 text-xs text-right font-mono text-gray-800">{item.quantity}</td>
          <td className="px-3 py-1.5 text-xs text-gray-500">{item.unit}</td>
        </tr>
      ))}
    </>
  );
}

export function BomTable({ items }: BomTableProps) {
  const { cables, equipment, accessories } = groupByType(items);
  const totalCount = items.length;

  if (totalCount === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-gray-400">
        배치된 자재가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-auto flex-1">
      <table className="w-full text-left">
        <thead className="sticky top-0 bg-white border-b border-gray-200">
          <tr>
            <th className="px-3 py-2 text-xs font-medium text-gray-500 w-28">코드</th>
            <th className="px-3 py-2 text-xs font-medium text-gray-500">자재명</th>
            <th className="px-3 py-2 text-xs font-medium text-gray-500 w-32">규격</th>
            <th className="px-3 py-2 text-xs font-medium text-gray-500 w-16 text-right">수량</th>
            <th className="px-3 py-2 text-xs font-medium text-gray-500 w-12">단위</th>
          </tr>
        </thead>
        <tbody>
          <SectionHeader title="케이블 (CABLE)" count={cables.length} />
          <ItemRows items={cables} />
          <SectionHeader title="설비 (EQUIPMENT)" count={equipment.length} />
          <ItemRows items={equipment} />
          <SectionHeader title="부속자재 (ACCESSORY)" count={accessories.length} />
          <ItemRows items={accessories} />
        </tbody>
      </table>
      <div className="px-3 py-2 border-t border-gray-200 text-xs text-gray-500">
        총 {totalCount}개 항목
      </div>
    </div>
  );
}
