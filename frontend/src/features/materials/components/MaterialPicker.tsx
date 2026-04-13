import { useState, useMemo, useCallback, useEffect } from 'react';
import { useMaterialCategories } from '../hooks/useMaterialCategories';
import { buildSpecificationString } from '../../../types/material';
import type { MaterialCategoryType, SpecParam } from '../../../types/material';
import type { RecentMaterial } from '../stores/recentMaterialsStore';

export interface MaterialPickerValue {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  specParams: Record<string, unknown>;
  specification: string;
}

interface MaterialPickerProps {
  categoryType: MaterialCategoryType;
  filterParentCode?: string; // ACCESSORY 하위 필터: 'ACC-PIPE', 'ACC-TRAY', 'ACC-BOX' 등
  value: { categoryId: string; specParams: Record<string, unknown> } | null;
  onChange: (value: MaterialPickerValue) => void;
  recentItems?: RecentMaterial[];
}

export function MaterialPicker({
  categoryType,
  filterParentCode,
  value,
  onChange,
  recentItems,
}: MaterialPickerProps) {
  const { data: allCategories, isLoading } = useMaterialCategories(categoryType);

  // filterParentCode가 있으면 해당 parent의 children만 표시
  const categories = useMemo(() => {
    if (!allCategories || !filterParentCode) return allCategories;
    const parent = allCategories.find((c) => c.code === filterParentCode);
    if (parent?.children && parent.children.length > 0) return parent.children;
    // parent 자체가 leaf인 경우 (ACC-BOX처럼 하위 없는 경우)
    if (parent) return [parent];
    return allCategories;
  }, [allCategories, filterParentCode]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    value?.categoryId ?? null,
  );
  const [specParams, setSpecParams] = useState<Record<string, unknown>>(
    value?.specParams ?? {},
  );

  const selectedCategory = useMemo(
    () => categories?.find((c) => c.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  );

  // Auto-select if category has no spec params (single option)
  useEffect(() => {
    if (selectedCategory?.specTemplate) {
      const { params, format } = selectedCategory.specTemplate;
      const allSingleOption = params.every(
        (p) =>
          p.inputType === 'select' &&
          p.options &&
          p.options.length === 1,
      );
      if (allSingleOption && params.length > 0) {
        const autoParams: Record<string, unknown> = {};
        for (const p of params) {
          autoParams[p.key] = p.options![0];
        }
        const spec = buildSpecificationString(format, autoParams);
        setSpecParams(autoParams);
        onChange({
          categoryId: selectedCategory.id,
          categoryCode: selectedCategory.code,
          categoryName: selectedCategory.name,
          specParams: autoParams,
          specification: spec,
        });
      }
    }
  }, [selectedCategoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCategoryChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      setSelectedCategoryId(id || null);
      setSpecParams({});
    },
    [],
  );

  const handleParamChange = useCallback(
    (key: string, val: unknown) => {
      if (!selectedCategory?.specTemplate) return;
      const next = { ...specParams, [key]: val };
      setSpecParams(next);

      // Check if all required params are filled
      const { params, format } = selectedCategory.specTemplate;
      const allFilled = params.every((p) => {
        if (p.required === false) return true;
        return next[p.key] != null && next[p.key] !== '';
      });

      if (allFilled) {
        const spec = buildSpecificationString(format, next);
        onChange({
          categoryId: selectedCategory.id,
          categoryCode: selectedCategory.code,
          categoryName: selectedCategory.name,
          specParams: next,
          specification: spec,
        });
      }
    },
    [selectedCategory, specParams, onChange],
  );

  const handleRecentSelect = useCallback(
    (item: RecentMaterial) => {
      setSelectedCategoryId(item.categoryId);
      setSpecParams(item.specParams);
      onChange({
        categoryId: item.categoryId,
        categoryCode: item.categoryCode,
        categoryName: item.categoryName,
        specParams: item.specParams,
        specification: item.specification,
      });
    },
    [onChange],
  );

  if (isLoading) {
    return (
      <div className="text-sm text-gray-400 py-2">자재 목록 로딩중...</div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Recent items */}
      {recentItems && recentItems.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">
            ★ 최근 사용
          </p>
          <div className="space-y-1">
            {recentItems.slice(0, 5).map((item) => (
              <button
                key={item.specification}
                type="button"
                onClick={() => handleRecentSelect(item)}
                className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-blue-50 transition-colors text-gray-700 border border-gray-100"
              >
                <span className="font-medium">{item.categoryName}</span>
                <span className="text-gray-400 ml-1">{item.specification}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-gray-100 my-2" />
        </div>
      )}

      {/* Category dropdown */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          종류
        </label>
        <select
          value={selectedCategoryId ?? ''}
          onChange={handleCategoryChange}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        >
          <option value="">선택하세요</option>
          {categories?.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Spec params form */}
      {selectedCategory?.specTemplate && (
        <SpecParamsForm
          params={selectedCategory.specTemplate.params}
          values={specParams}
          onChange={handleParamChange}
        />
      )}
    </div>
  );
}

// ── Spec params dynamic form ──

function SpecParamsForm({
  params,
  values,
  onChange,
}: {
  params: SpecParam[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-2">
      {params.map((param) => (
        <div key={param.key}>
          <label className="block text-xs font-medium text-gray-600 mb-0.5">
            {param.label}
            {param.unit && (
              <span className="text-gray-400 ml-1">({param.unit})</span>
            )}
          </label>
          {param.inputType === 'select' && param.options ? (
            <select
              value={String(values[param.key] ?? '')}
              onChange={(e) => onChange(param.key, e.target.value)}
              className="w-full px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">선택</option>
              {param.options.map((opt) => (
                <option key={String(opt)} value={String(opt)}>
                  {String(opt)}
                </option>
              ))}
            </select>
          ) : param.inputType === 'number' ? (
            <input
              type="number"
              value={values[param.key] != null ? String(values[param.key]) : ''}
              onChange={(e) =>
                onChange(
                  param.key,
                  e.target.value ? Number(e.target.value) : '',
                )
              }
              min={param.min}
              max={param.max}
              className="w-full px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          ) : (
            <input
              type="text"
              value={String(values[param.key] ?? '')}
              onChange={(e) => onChange(param.key, e.target.value)}
              className="w-full px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          )}
        </div>
      ))}
    </div>
  );
}
