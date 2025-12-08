import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../utils/api';
import { useIsAdmin } from '../stores/authStore';
import { SubstationModal } from '../components/SubstationModal';
import type {
  SubstationListItem,
  CreateSubstationRequest,
  UpdateSubstationRequest,
} from '../types';

export function SubstationsPage() {
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubstation, setEditingSubstation] = useState<SubstationListItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // 변전소 목록 조회
  const { data, isLoading, error } = useQuery({
    queryKey: ['substations'],
    queryFn: async () => {
      const response = await api.get<{ data: SubstationListItem[] }>('/substations');
      return response.data.data;
    },
  });

  // 변전소 생성
  const createMutation = useMutation({
    mutationFn: (data: CreateSubstationRequest) =>
      api.post('/substations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['substations'] });
      setIsModalOpen(false);
    },
  });

  // 변전소 수정
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSubstationRequest }) =>
      api.put(`/substations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['substations'] });
      setEditingSubstation(null);
    },
  });

  // 변전소 삭제
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/substations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['substations'] });
      setDeleteConfirm(null);
    },
  });

  const handleCreate = (data: CreateSubstationRequest) => {
    createMutation.mutate(data);
  };

  const handleUpdate = (data: UpdateSubstationRequest) => {
    if (editingSubstation) {
      updateMutation.mutate({ id: editingSubstation.id, data });
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">{getErrorMessage(error)}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">변전소 목록</h1>
        {isAdmin && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            변전소 추가
          </button>
        )}
      </div>

      {data && data.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">변전소가 없습니다</h3>
          <p className="mt-1 text-sm text-gray-500">새 변전소를 추가해 주세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data?.map((substation) => (
            <div
              key={substation.id}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow"
            >
              <Link to={`/substations/${substation.id}/floors`} className="block p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 bg-blue-100 rounded-lg p-3">
                      <svg
                        className="h-6 w-6 text-blue-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-medium text-gray-900">{substation.name}</h3>
                      <p className="text-sm text-gray-500">{substation.code}</p>
                    </div>
                  </div>
                  {!substation.isActive && (
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                      비활성
                    </span>
                  )}
                </div>
                <div className="mt-4 flex items-center text-sm text-gray-500">
                  <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  ICT실: {substation.floorCount}개
                </div>
                {substation.address && (
                  <p className="mt-2 text-sm text-gray-500 truncate">{substation.address}</p>
                )}
              </Link>

              {isAdmin && (
                <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setEditingSubstation(substation);
                    }}
                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
                  >
                    편집
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setDeleteConfirm(substation.id);
                    }}
                    className="px-3 py-1 text-sm text-red-600 hover:text-red-900 hover:bg-red-100 rounded transition-colors"
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 생성 모달 */}
      {isModalOpen && (
        <SubstationModal
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleCreate}
          isLoading={createMutation.isPending}
          error={createMutation.error ? getErrorMessage(createMutation.error) : null}
        />
      )}

      {/* 편집 모달 */}
      {editingSubstation && (
        <SubstationModal
          substation={editingSubstation}
          onClose={() => setEditingSubstation(null)}
          onSubmit={handleUpdate}
          isLoading={updateMutation.isPending}
          error={updateMutation.error ? getErrorMessage(updateMutation.error) : null}
        />
      )}

      {/* 삭제 확인 모달 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">변전소 삭제</h3>
            <p className="text-gray-500 mb-6">
              이 변전소를 삭제하시겠습니까?
              {deleteMutation.error && (
                <span className="block mt-2 text-red-600 text-sm">
                  {getErrorMessage(deleteMutation.error)}
                </span>
              )}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
