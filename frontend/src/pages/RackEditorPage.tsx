import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../utils/api';
import type { RackDetail } from '../types/rack';

// ==================== API 호출 함수 ====================

const fetchRackDetail = async (rackId: string): Promise<RackDetail> => {
  const response = await api.get(`/racks/${rackId}`);
  return response.data.data;
};

// 날짜 포맷팅 (짧은 형식)
function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 이미지 압축 함수
async function compressImage(file: File, maxWidth: number = 1200, quality: number = 0.8): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // 가로 기준으로 리사이즈
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              reject(new Error('Blob creation failed'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

// ==================== 컴포넌트 ====================

export function RackEditorPage() {
  const { rackId } = useParams<{ rackId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 상태
  const [viewMode, setViewMode] = useState<'front' | 'rear'>('front');
  const [error, setError] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<'front' | 'rear'>('front');

  // 전체화면 이미지 뷰어
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  // 데이터 조회
  const { data: rack, isLoading: isLoadingRack } = useQuery({
    queryKey: ['rack', rackId],
    queryFn: () => fetchRackDetail(rackId!),
    enabled: !!rackId,
  });

  // 이미지 업로드 mutation (압축 적용)
  const uploadImageMutation = useMutation({
    mutationFn: async ({ type, file }: { type: 'front' | 'rear'; file: File }) => {
      // 이미지 압축
      const compressedFile = await compressImage(file, 1200, 0.8);

      const formData = new FormData();
      formData.append('type', type);
      formData.append('file', compressedFile);
      return api.post(`/racks/${rackId}/images`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rack', rackId] });
      setError(null);
    },
    onError: (err) => {
      setError(getErrorMessage(err));
    },
  });

  // 이미지 삭제 mutation
  const deleteImageMutation = useMutation({
    mutationFn: (type: 'front' | 'rear') => api.delete(`/racks/${rackId}/images/${type}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rack', rackId] });
    },
    onError: (err) => {
      setError(getErrorMessage(err));
    },
  });

  // 이미지 업로드 핸들러
  const handleImageUpload = (type: 'front' | 'rear') => {
    setUploadType(type);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImageMutation.mutate({ type: uploadType, file });
    }
    e.target.value = '';
  };

  // 로딩
  if (isLoadingRack) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!rack) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-gray-500 mb-4">랙을 찾을 수 없습니다.</p>
        <button onClick={() => navigate(-1)} className="text-blue-600 hover:text-blue-700">
          돌아가기
        </button>
      </div>
    );
  }

  const currentImageUrl = viewMode === 'front' ? rack.frontImageUrl : rack.rearImageUrl;

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* 헤더 */}
      <header className="bg-white border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg"
            title="돌아가기"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-base font-semibold text-gray-900">
              {rack.name} {rack.code && <span className="text-gray-500 font-normal">({rack.code})</span>}
            </h1>
            <p className="text-xs text-gray-500">
              수정: {formatShortDate(rack.updatedAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setViewMode('front')}
              className={`px-3 py-1 text-sm ${viewMode === 'front' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              정면
            </button>
            <button
              onClick={() => setViewMode('rear')}
              className={`px-3 py-1 text-sm ${viewMode === 'rear' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              후면
            </button>
          </div>
        </div>
      </header>

      {/* 에러 */}
      {error && (
        <div className="mx-4 mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {/* 메인 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 랙 사진 영역 */}
        <div className="flex-1 overflow-hidden bg-gray-100 flex items-center justify-center p-4">
          <div
            className="relative group bg-gray-200 flex items-center justify-center overflow-hidden cursor-pointer w-full h-full max-w-3xl rounded-xl shadow-lg"
            onClick={() => {
              if (currentImageUrl) setFullscreenImage(currentImageUrl);
            }}
          >
            {currentImageUrl ? (
              <img
                src={currentImageUrl}
                alt={viewMode === 'front' ? '정면 사진' : '후면 사진'}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center text-gray-400">
                <svg className="w-12 h-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm">{viewMode === 'front' ? '정면' : '후면'} 사진 없음</span>
              </div>
            )}
            {/* 호버 오버레이 */}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); handleImageUpload(viewMode); }}
                className="p-2 bg-white rounded-full text-gray-700 hover:bg-gray-100"
                title="업로드"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </button>
              {currentImageUrl && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (currentImageUrl) setFullscreenImage(currentImageUrl);
                    }}
                    className="p-2 bg-white rounded-full text-gray-700 hover:bg-gray-100"
                    title="전체화면"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`${viewMode === 'front' ? '정면' : '후면'} 사진을 삭제하시겠습니까?`)) {
                        deleteImageMutation.mutate(viewMode);
                      }
                    }}
                    className="p-2 bg-white rounded-full text-red-600 hover:bg-red-50"
                    title="삭제"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </>
              )}
            </div>
            {uploadImageMutation.isPending && (
              <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-blue-600">업로드 중...</p>
            )}
            {/* 사진 수정일 표시 */}
            {currentImageUrl && (
              <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                수정: {formatShortDate(rack.updatedAt)}
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* 사이드 패널 - 랙 정보 */}
        <aside className="w-72 bg-white overflow-y-auto text-sm border-l">
          <div className="p-4">
            <h2 className="font-medium text-gray-900 mb-3">랙 정보</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">이름</span>
                <span className="text-gray-900">{rack.name}</span>
              </div>
              {rack.code && (
                <div className="flex justify-between">
                  <span className="text-gray-500">코드</span>
                  <span className="text-gray-900">{rack.code}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">총 U</span>
                <span className="text-gray-900">{rack.totalU}U</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">사용</span>
                <span className="text-gray-900">{rack.usedU}U</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">설비 수</span>
                <span className="text-gray-900">{rack.equipmentCount}개</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">수정일</span>
                <span className="text-gray-900">{formatShortDate(rack.updatedAt)}</span>
              </div>
              {rack.description && (
                <div className="pt-2 border-t">
                  <span className="text-gray-500 block mb-1">설명</span>
                  <p className="text-gray-900">{rack.description}</p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* 전체화면 이미지 뷰어 */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center"
          onClick={() => setFullscreenImage(null)}
        >
          <button
            onClick={() => setFullscreenImage(null)}
            className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={fullscreenImage}
            alt="전체화면"
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
