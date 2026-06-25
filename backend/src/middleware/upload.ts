import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';

// 파일 필터 (이미지만 허용)
const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('이미지 파일만 업로드할 수 있습니다. (jpg, png, gif, webp)'));
  }
};

// ==================== 자산 이미지 업로드 ====================

const assetUploadDir = 'uploads/assets';
if (!fs.existsSync(assetUploadDir)) {
  fs.mkdirSync(assetUploadDir, { recursive: true });
}

const assetStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, assetUploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuid()}${ext}`;
    cb(null, filename);
  },
});

export const uploadAssetImage = multer({
  storage: assetStorage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});
