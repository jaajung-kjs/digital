import { useState, useRef } from 'react';
import { useUploadPhoto } from '../hooks/useEquipmentPhotos';

interface PhotoUploaderProps {
  equipmentId: string;
  onSuccess?: () => void;
}

export function PhotoUploader({ equipmentId, onSuccess }: PhotoUploaderProps) {
  const uploadPhoto = useUploadPhoto(equipmentId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [side, setSide] = useState<'front' | 'rear'>('front');
  const [description, setDescription] = useState('');
  const [takenAt, setTakenAt] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFileSelect(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('side', side);
    if (description) formData.append('description', description);
    if (takenAt) formData.append('takenAt', takenAt);

    await uploadPhoto.mutateAsync(formData);
    setPreview(null);
    setSelectedFile(null);
    setDescription('');
    setTakenAt('');
    onSuccess?.();
  };

  const handleReset = () => {
    setPreview(null);
    setSelectedFile(null);
    setDescription('');
    setTakenAt('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-3">
      {/* Drop zone / Preview */}
      {preview ? (
        <div className="relative mb-2">
          <img
            src={preview}
            alt="미리보기"
            className="h-40 w-full rounded object-cover"
          />
          <button
            onClick={handleReset}
            className="absolute right-1 top-1 rounded bg-white px-1.5 py-0.5 text-xs shadow"
          >
            X
          </button>
        </div>
      ) : (
        <div
          className={`mb-2 flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed p-6 ${
            isDragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 hover:border-blue-300'
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <p className="text-sm text-gray-500">
            클릭 또는 드래그하여 이미지 업로드
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Side selector */}
      <div className="mb-2 flex gap-2">
        <button
          onClick={() => setSide('front')}
          className={`flex-1 rounded py-1 text-sm ${
            side === 'front'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          앞면
        </button>
        <button
          onClick={() => setSide('rear')}
          className={`flex-1 rounded py-1 text-sm ${
            side === 'rear'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-600'
          }`}
        >
          뒷면
        </button>
      </div>

      {/* Description */}
      <input
        type="text"
        placeholder="설명 (선택)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
      />

      {/* Date */}
      <input
        type="date"
        value={takenAt}
        onChange={(e) => setTakenAt(e.target.value)}
        className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
      />

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!selectedFile || uploadPhoto.isPending}
        className="w-full rounded bg-blue-500 py-1.5 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {uploadPhoto.isPending ? '업로드 중...' : '업로드'}
      </button>
    </div>
  );
}
