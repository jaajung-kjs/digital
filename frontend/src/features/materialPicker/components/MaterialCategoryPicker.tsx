import type { MaterialCategory } from '../../../types/materialCategory';
import { useMaterialPicker } from '../hooks/useMaterialPicker';
import { SpecParamForm } from './SpecParamForm';

export interface MaterialCategoryPickerProps {
  categoryType: 'CABLE' | 'EQUIPMENT' | 'ACCESSORY';
  onSelect: (category: MaterialCategory, specValues: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function MaterialCategoryPicker({
  categoryType,
  onSelect,
  onCancel,
}: MaterialCategoryPickerProps) {
  const {
    step,
    parentCategories,
    childCategories,
    selectedParent,
    selectedCategory,
    specValues,
    selectParent,
    selectCategory,
    updateSpecValues,
    goBack,
    confirm,
    isLoading,
    error,
  } = useMaterialPicker({ categoryType, onSelect });

  const typeLabel =
    categoryType === 'CABLE' ? '케이블' : categoryType === 'EQUIPMENT' ? '설비' : '부속자재';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            {(selectedParent || step === 'spec') && (
              <button
                onClick={goBack}
                className="text-gray-400 hover:text-gray-600 mr-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}
            <h2 className="text-lg font-medium text-gray-900">
              {step === 'spec'
                ? '사양 입력'
                : selectedParent
                  ? selectedParent.name
                  : `${typeLabel} 종류 선택`}
            </h2>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {/* 로딩 */}
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <svg
                className="animate-spin h-5 w-5 mr-2"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              불러오는 중...
            </div>
          )}

          {/* 에러 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              카테고리를 불러오지 못했습니다. 다시 시도해 주세요.
            </div>
          )}

          {/* Step 1: 카테고리 선택 */}
          {!isLoading && !error && step === 'category' && (
            <>
              {!selectedParent ? (
                /* 부모 카테고리 목록 */
                <div className="space-y-2">
                  {parentCategories.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-8">
                      등록된 카테고리가 없습니다.
                    </p>
                  ) : (
                    parentCategories.map((parent) => (
                      <button
                        key={parent.id}
                        onClick={() => selectParent(parent)}
                        className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3">
                          {parent.displayColor && (
                            <span
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: parent.displayColor }}
                            />
                          )}
                          <div>
                            <span className="font-medium text-gray-900">{parent.name}</span>
                            <span className="text-gray-400 text-sm ml-2">{parent.code}</span>
                          </div>
                        </div>
                        <svg
                          className="w-4 h-4 text-gray-400 group-hover:text-blue-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                /* 자식 카테고리 목록 */
                <div className="space-y-2">
                  {childCategories.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-8">
                      하위 항목이 없습니다.
                    </p>
                  ) : (
                    childCategories.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => selectCategory(child)}
                        className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                          selectedCategory?.id === child.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {child.displayColor && (
                            <span
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: child.displayColor }}
                            />
                          )}
                          <div>
                            <span className="font-medium text-gray-900">{child.name}</span>
                            <span className="text-gray-400 text-sm ml-2">{child.code}</span>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}

          {/* Step 2: 사양 파라미터 폼 */}
          {!isLoading && !error && step === 'spec' && selectedCategory?.specTemplate && (
            <SpecParamForm
              specTemplate={selectedCategory.specTemplate}
              values={specValues}
              onChange={updateSpecValues}
            />
          )}
        </div>

        {/* 하단 버튼 */}
        {selectedCategory && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={confirm}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              선택 완료
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
