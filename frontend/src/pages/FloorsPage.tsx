import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../utils/api';
import { useIsAdmin } from '../stores/authStore';
import { FloorModal } from '../components/FloorModal';
import type {
  SubstationDetail,
  FloorListItem,
  CreateFloorRequest,
  UpdateFloorRequest,
} from '../types';

export function FloorsPage() {
  const { substationId } = useParams<{ substationId: string }>();
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFloor, setEditingFloor] = useState<FloorListItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // 변전소 상세 조회
  const { data: substation, isLoading: substationLoading } = useQuery({
    queryKey: ['substation', substationId],
    queryFn: async () => {
      const response = await api.get<{ data: SubstationDetail }>(`/substations/${substationId}`);
      return response.data.data;
    },
    enabled: !!substationId,
  });

  // 층 목록 조회
  const { data: floors, isLoading: floorsLoading, error } = useQuery({
    queryKey: ['floors', substationId],
    queryFn: async () => {
      const response = await api.get<{ data: FloorListItem[] }>(`/substations/${substationId}/floors`);
      return response.data.data;
    },
    enabled: !!substationId,
  });

  // 층 생성
  const createMutation = useMutation({
    mutationFn: (data: CreateFloorRequest) =>
      api.post(`/substations/${substationId}/floors`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['floors', substationId] });
      queryClient.invalidateQueries({ queryKey: ['substations'] });
      setIsModalOpen(false);
    },
  });

  // 층 수정
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateFloorRequest }) =>
      api.put(`/floors/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['floors', substationId] });
      setEditingFloor(null);
    },
  });

  // 층 삭제
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/floors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['floors', substationId] });
      queryClient.invalidateQueries({ queryKey: ['substations'] });
      setDeleteConfirm(null);
    },
  });

  const handleCreate = (data: CreateFloorRequest) => {
    createMutation.mutate(data);
  };

  const handleUpdate = (data: UpdateFloorRequest) => {
    if (editingFloor) {
      updateMutation.mutate({ id: editingFloor.id, data });
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const isLoading = substationLoading || floorsLoading;

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
      {/* 헤더 */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          to="/substations"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{substation?.name}</h1>
          <p className="text-sm text-gray-500">{substation?.code}</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            층 추가
          </button>
        )}
      </div>

      {/* 층 목록 */}
      {floors && floors.length === 0 ? (
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
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">층이 없습니다</h3>
          <p className="mt-1 text-sm text-gray-500">새 층을 추가해 주세요.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {floors?.map((floor) => (
            <div
              key={floor.id}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow"
            >
              <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 bg-green-100 rounded-lg p-3">
                    <svg
                      className="h-6 w-6 text-green-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">{floor.name}</h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      {floor.floorNumber && <span>{floor.floorNumber}</span>}
                      {floor.description && <span>{floor.description}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right text-sm text-gray-500">
                    <div>랙: {floor.rackCount}개</div>
                    {floor.hasFloorPlan && (
                      <span className="text-green-600">평면도 있음</span>
                    )}
                  </div>

                  {!floor.isActive && (
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                      비활성
                    </span>
                  )}

                  <Link
                    to={`/floors/${floor.id}/plan`}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    평면도 보기
                  </Link>

                  {isAdmin && (
                    <>
                      <button
                        onClick={() => setEditingFloor(floor)}
                        className="px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        편집
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(floor.id)}
                        className="px-3 py-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        삭제
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 생성 모달 */}
      {isModalOpen && (
        <FloorModal
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleCreate}
          isLoading={createMutation.isPending}
          error={createMutation.error ? getErrorMessage(createMutation.error) : null}
        />
      )}

      {/* 편집 모달 */}
      {editingFloor && (
        <FloorModal
          floor={editingFloor}
          onClose={() => setEditingFloor(null)}
          onSubmit={handleUpdate}
          isLoading={updateMutation.isPending}
          error={updateMutation.error ? getErrorMessage(updateMutation.error) : null}
        />
      )}

      {/* 삭제 확인 모달 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">층 삭제</h3>
            <p className="text-gray-500 mb-6">
              이 층을 삭제하시겠습니까?
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
