import { Request, Response, NextFunction } from 'express';
import { dwgImportService, type ImportMode } from '../services/dwgImport.service.js';
import { ValidationError } from '../utils/errors.js';

function parseLayers(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  if (Array.isArray(raw)) return raw.map((x) => String(x));
  if (typeof raw === 'string') {
    if (raw.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map((x) => String(x)) : undefined;
      } catch {
        return undefined;
      }
    }
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
}

function parseBool(raw: unknown, def = false): boolean {
  if (raw == null) return def;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

export const dwgImportController = {
  /**
   * POST /api/floors/:id/background/import
   * multipart/form-data:
   *   file: .dwg or .dxf
   *   mode: 'smart' | 'advanced'
   *   commit: 'true' | 'false'
   *   layers: comma-separated names or JSON array (advanced mode)
   *   includeOutline / includeLabels: bool (smart mode)
   *   scaleMmPerUnit: number (optional override)
   */
  async import(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id: floorId } = req.params;
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) throw new ValidationError('도면 파일이 필요합니다.');

      const mode = (req.body.mode as ImportMode) || 'smart';
      if (mode !== 'smart' && mode !== 'advanced') {
        throw new ValidationError(`알 수 없는 mode: ${mode}`);
      }

      const result = await dwgImportService.importToFloor(floorId, file.originalname, file.buffer, {
        mode,
        commit: parseBool(req.body.commit, false),
        layers: parseLayers(req.body.layers),
        includeOutline: req.body.includeOutline == null ? undefined : parseBool(req.body.includeOutline, true),
        includeLabels: req.body.includeLabels == null ? undefined : parseBool(req.body.includeLabels, true),
        scaleMmPerUnit: req.body.scaleMmPerUnit ? Number(req.body.scaleMmPerUnit) : undefined,
      });

      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/floors/:id/background — clear imported drawing
   */
  async clear(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await dwgImportService.clearBackground(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/floors/:id/background/opacity { opacity: 0..1 }
   */
  async setOpacity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { opacity } = req.body;
      if (typeof opacity !== 'number') throw new ValidationError('opacity는 숫자여야 합니다.');
      await dwgImportService.setOpacity(id, opacity);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
