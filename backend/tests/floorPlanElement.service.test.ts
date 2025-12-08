import { describe, it, expect, vi, beforeEach } from 'vitest';
import { floorPlanElementService } from '../src/services/floorPlanElement.service.js';
import prisma from '../src/config/prisma.js';
import { NotFoundError } from '../src/utils/errors.js';

// Mock Prisma
vi.mock('../src/config/prisma.js', () => ({
  default: {
    floorPlan: {
      findUnique: vi.fn(),
    },
    floorPlanElement: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe('FloorPlanElementService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getByFloorPlanId', () => {
    const mockFloorPlanId = 'fp-123';

    it('should return all elements for a floor plan', async () => {
      const mockFloorPlan = { id: mockFloorPlanId };
      const mockElements = [
        {
          id: 'elem-1',
          floorPlanId: mockFloorPlanId,
          elementType: 'wall',
          properties: { x1: 0, y1: 0, x2: 100, y2: 0 },
          zIndex: 0,
          isVisible: true,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
        {
          id: 'elem-2',
          floorPlanId: mockFloorPlanId,
          elementType: 'door',
          properties: { x: 50, y: 0, width: 10 },
          zIndex: 1,
          isVisible: true,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(mockFloorPlan as any);
      vi.mocked(prisma.floorPlanElement.findMany).mockResolvedValue(mockElements as any);

      const result = await floorPlanElementService.getByFloorPlanId(mockFloorPlanId);

      expect(result).toHaveLength(2);
      expect(result[0].elementType).toBe('wall');
      expect(result[1].elementType).toBe('door');
    });

    it('should return elements ordered by zIndex', async () => {
      const mockFloorPlan = { id: mockFloorPlanId };

      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(mockFloorPlan as any);
      vi.mocked(prisma.floorPlanElement.findMany).mockResolvedValue([] as any);

      await floorPlanElementService.getByFloorPlanId(mockFloorPlanId);

      expect(prisma.floorPlanElement.findMany).toHaveBeenCalledWith({
        where: { floorPlanId: mockFloorPlanId },
        orderBy: { zIndex: 'asc' },
      });
    });

    it('should throw NotFoundError when floor plan does not exist', async () => {
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(null);

      await expect(
        floorPlanElementService.getByFloorPlanId('invalid-id')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('create', () => {
    const mockFloorPlanId = 'fp-123';

    it('should create an element with default values', async () => {
      const mockFloorPlan = { id: mockFloorPlanId };
      const mockCreatedElement = {
        id: 'elem-1',
        floorPlanId: mockFloorPlanId,
        elementType: 'wall',
        properties: { x1: 0, y1: 0, x2: 100, y2: 0 },
        zIndex: 0,
        isVisible: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(mockFloorPlan as any);
      vi.mocked(prisma.floorPlanElement.create).mockResolvedValue(mockCreatedElement as any);

      const result = await floorPlanElementService.create(mockFloorPlanId, {
        elementType: 'wall',
        properties: { x1: 0, y1: 0, x2: 100, y2: 0 },
      });

      expect(result.id).toBe('elem-1');
      expect(result.elementType).toBe('wall');
      expect(result.zIndex).toBe(0);
      expect(result.isVisible).toBe(true);
    });

    it('should create element with custom zIndex and visibility', async () => {
      const mockFloorPlan = { id: mockFloorPlanId };
      const mockCreatedElement = {
        id: 'elem-2',
        floorPlanId: mockFloorPlanId,
        elementType: 'door',
        properties: { x: 50, y: 0, width: 10 },
        zIndex: 5,
        isVisible: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(mockFloorPlan as any);
      vi.mocked(prisma.floorPlanElement.create).mockResolvedValue(mockCreatedElement as any);

      const result = await floorPlanElementService.create(mockFloorPlanId, {
        elementType: 'door',
        properties: { x: 50, y: 0, width: 10 },
        zIndex: 5,
        isVisible: false,
      });

      expect(result.zIndex).toBe(5);
      expect(result.isVisible).toBe(false);
    });

    it('should throw NotFoundError when floor plan does not exist', async () => {
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(null);

      await expect(
        floorPlanElementService.create('invalid-id', {
          elementType: 'wall',
          properties: {},
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('update', () => {
    it('should update an existing element', async () => {
      const mockExisting = {
        id: 'elem-1',
        floorPlanId: 'fp-123',
        elementType: 'wall',
        properties: { x1: 0, y1: 0, x2: 100, y2: 0 },
        zIndex: 0,
        isVisible: true,
      };

      const mockUpdated = {
        ...mockExisting,
        properties: { x1: 0, y1: 0, x2: 200, y2: 0 },
        zIndex: 1,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      vi.mocked(prisma.floorPlanElement.findUnique).mockResolvedValue(mockExisting as any);
      vi.mocked(prisma.floorPlanElement.update).mockResolvedValue(mockUpdated as any);

      const result = await floorPlanElementService.update('elem-1', {
        properties: { x1: 0, y1: 0, x2: 200, y2: 0 },
        zIndex: 1,
      });

      expect(result.properties).toEqual({ x1: 0, y1: 0, x2: 200, y2: 0 });
      expect(result.zIndex).toBe(1);
    });

    it('should update element visibility', async () => {
      const mockExisting = {
        id: 'elem-1',
        floorPlanId: 'fp-123',
        elementType: 'wall',
        isVisible: true,
      };

      const mockUpdated = {
        ...mockExisting,
        isVisible: false,
        properties: {},
        zIndex: 0,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      vi.mocked(prisma.floorPlanElement.findUnique).mockResolvedValue(mockExisting as any);
      vi.mocked(prisma.floorPlanElement.update).mockResolvedValue(mockUpdated as any);

      const result = await floorPlanElementService.update('elem-1', {
        isVisible: false,
      });

      expect(result.isVisible).toBe(false);
    });

    it('should throw NotFoundError when element does not exist', async () => {
      vi.mocked(prisma.floorPlanElement.findUnique).mockResolvedValue(null);

      await expect(
        floorPlanElementService.update('invalid-id', { zIndex: 1 })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('should delete an element successfully', async () => {
      const mockElement = {
        id: 'elem-1',
        floorPlanId: 'fp-123',
        elementType: 'wall',
      };

      vi.mocked(prisma.floorPlanElement.findUnique).mockResolvedValue(mockElement as any);
      vi.mocked(prisma.floorPlanElement.delete).mockResolvedValue(mockElement as any);

      await floorPlanElementService.delete('elem-1');

      expect(prisma.floorPlanElement.delete).toHaveBeenCalledWith({
        where: { id: 'elem-1' },
      });
    });

    it('should throw NotFoundError when element does not exist', async () => {
      vi.mocked(prisma.floorPlanElement.findUnique).mockResolvedValue(null);

      await expect(floorPlanElementService.delete('invalid-id')).rejects.toThrow(NotFoundError);
    });
  });
});
