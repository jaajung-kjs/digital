import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma.js';

export const organizationController = {
  async reorder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { type, items } = req.body;

      await prisma.$transaction(
        items.map((item: { id: string; sortOrder: number }) => {
          switch (type) {
            case 'headquarters':
              return prisma.headquarters.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } });
            case 'branch':
              return prisma.branch.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } });
            case 'substation':
              return prisma.substation.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } });
            case 'floor':
              return prisma.floor.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } });
            case 'room':
              return prisma.room.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } });
            default:
              throw new Error(`Unknown type: ${type}`);
          }
        })
      );

      res.json({ message: '순서가 변경되었습니다.' });
    } catch (error) {
      next(error);
    }
  },
};
