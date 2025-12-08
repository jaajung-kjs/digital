import { describe, it, expect, vi, beforeEach } from 'vitest';
import { floorPlanService } from '../src/services/floorPlan.service.js';
import prisma from '../src/config/prisma.js';
import { NotFoundError, ConflictError } from '../src/utils/errors.js';

// Mock Prisma
vi.mock('../src/config/prisma.js', () => ({
  default: {
    floor: {
      findUnique: vi.fn(),
    },
    floorPlan: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    floorPlanElement: {
      deleteMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    rack: {
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

describe('FloorPlanService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getByFloorId', () => {
    const mockFloorId = 'floor-123';

    it('should return floor plan with elements and racks', async () => {
      const mockFloor = { id: mockFloorId, name: 'Floor 1' };
      const mockFloorPlan = {
        id: 'fp-123',
        floorId: mockFloorId,
        name: 'Floor 1 Plan',
        canvasWidth: 2000,
        canvasHeight: 1500,
        gridSize: 20,
        backgroundColor: '#FFFFFF',
        version: 1,
        updatedAt: new Date('2024-01-01'),
        elements: [
          {
            id: 'elem-1',
            elementType: 'wall',
            properties: { x1: 0, y1: 0, x2: 100, y2: 0 },
            zIndex: 0,
            isVisible: true,
          },
        ],
        racks: [
          {
            id: 'rack-1',
            name: 'Rack A1',
            code: 'RA1',
            positionX: 100,
            positionY: 100,
            width: 60,
            height: 100,
            rotation: 0,
            totalU: 12,
            frontImageUrl: null,
            rearImageUrl: null,
            description: 'Main rack',
            _count: { equipment: 5 },
          },
        ],
      };

      vi.mocked(prisma.floor.findUnique).mockResolvedValue(mockFloor as any);
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(mockFloorPlan as any);

      const result = await floorPlanService.getByFloorId(mockFloorId);

      expect(result).toBeDefined();
      expect(result?.id).toBe('fp-123');
      expect(result?.elements).toHaveLength(1);
      expect(result?.racks).toHaveLength(1);
      expect(result?.racks[0].equipmentCount).toBe(5);
    });

    it('should throw NotFoundError when floor does not exist', async () => {
      vi.mocked(prisma.floor.findUnique).mockResolvedValue(null);

      await expect(floorPlanService.getByFloorId('invalid-id')).rejects.toThrow(NotFoundError);
    });

    it('should return null when floor plan does not exist', async () => {
      const mockFloor = { id: mockFloorId, name: 'Floor 1' };

      vi.mocked(prisma.floor.findUnique).mockResolvedValue(mockFloor as any);
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(null);

      const result = await floorPlanService.getByFloorId(mockFloorId);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    const mockFloorId = 'floor-123';
    const mockUserId = 'user-123';

    it('should create a new floor plan with default values', async () => {
      const mockFloor = { id: mockFloorId, name: 'Floor 1' };
      const mockCreatedPlan = {
        id: 'fp-123',
        floorId: mockFloorId,
        name: 'New Floor Plan',
        canvasWidth: 2000,
        canvasHeight: 1500,
        gridSize: 20,
        backgroundColor: '#FFFFFF',
        version: 1,
        updatedAt: new Date('2024-01-01'),
        createdById: mockUserId,
        updatedById: mockUserId,
      };

      vi.mocked(prisma.floor.findUnique).mockResolvedValue(mockFloor as any);
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.floorPlan.create).mockResolvedValue(mockCreatedPlan as any);

      const result = await floorPlanService.create(mockFloorId, { name: 'New Floor Plan' }, mockUserId);

      expect(result.id).toBe('fp-123');
      expect(result.name).toBe('New Floor Plan');
      expect(result.canvasWidth).toBe(2000);
      expect(result.canvasHeight).toBe(1500);
      expect(result.gridSize).toBe(20);
      expect(result.elements).toHaveLength(0);
      expect(result.racks).toHaveLength(0);
    });

    it('should create floor plan with custom dimensions', async () => {
      const mockFloor = { id: mockFloorId, name: 'Floor 1' };
      const mockCreatedPlan = {
        id: 'fp-123',
        floorId: mockFloorId,
        name: 'Custom Plan',
        canvasWidth: 3000,
        canvasHeight: 2000,
        gridSize: 30,
        backgroundColor: '#FFFFFF',
        version: 1,
        updatedAt: new Date('2024-01-01'),
        createdById: mockUserId,
        updatedById: mockUserId,
      };

      vi.mocked(prisma.floor.findUnique).mockResolvedValue(mockFloor as any);
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.floorPlan.create).mockResolvedValue(mockCreatedPlan as any);

      const result = await floorPlanService.create(
        mockFloorId,
        {
          name: 'Custom Plan',
          canvasWidth: 3000,
          canvasHeight: 2000,
          gridSize: 30,
        },
        mockUserId
      );

      expect(result.canvasWidth).toBe(3000);
      expect(result.canvasHeight).toBe(2000);
      expect(result.gridSize).toBe(30);
    });

    it('should throw NotFoundError when floor does not exist', async () => {
      vi.mocked(prisma.floor.findUnique).mockResolvedValue(null);

      await expect(
        floorPlanService.create('invalid-id', { name: 'Test' }, mockUserId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ConflictError when floor plan already exists', async () => {
      const mockFloor = { id: mockFloorId, name: 'Floor 1' };
      const existingPlan = { id: 'fp-existing', floorId: mockFloorId };

      vi.mocked(prisma.floor.findUnique).mockResolvedValue(mockFloor as any);
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(existingPlan as any);

      await expect(
        floorPlanService.create(mockFloorId, { name: 'Test' }, mockUserId)
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('bulkUpdate', () => {
    const mockFloorPlanId = 'fp-123';
    const mockUserId = 'user-123';

    it('should update floor plan with new elements', async () => {
      const mockFloorPlan = { id: mockFloorPlanId, version: 1 };
      const mockUpdatedPlan = { id: mockFloorPlanId, version: 2 };

      vi.mocked(prisma.floorPlan.findUnique)
        .mockResolvedValueOnce(mockFloorPlan as any)
        .mockResolvedValueOnce(mockUpdatedPlan as any);

      const result = await floorPlanService.bulkUpdate(
        mockFloorPlanId,
        {
          elements: [
            {
              elementType: 'wall',
              properties: { x1: 0, y1: 0, x2: 100, y2: 0 },
              zIndex: 0,
            },
          ],
        },
        mockUserId
      );

      expect(result.id).toBe(mockFloorPlanId);
      expect(result.version).toBe(2);
      expect(result.message).toContain('저장되었습니다');
    });

    it('should update existing elements', async () => {
      const mockFloorPlan = { id: mockFloorPlanId, version: 1 };
      const mockUpdatedPlan = { id: mockFloorPlanId, version: 2 };

      vi.mocked(prisma.floorPlan.findUnique)
        .mockResolvedValueOnce(mockFloorPlan as any)
        .mockResolvedValueOnce(mockUpdatedPlan as any);

      const result = await floorPlanService.bulkUpdate(
        mockFloorPlanId,
        {
          elements: [
            {
              id: 'elem-1',
              elementType: 'wall',
              properties: { x1: 0, y1: 0, x2: 200, y2: 0 },
              zIndex: 1,
            },
          ],
        },
        mockUserId
      );

      expect(result.version).toBe(2);
      expect(prisma.floorPlanElement.update).toHaveBeenCalled();
    });

    it('should delete elements and racks', async () => {
      const mockFloorPlan = { id: mockFloorPlanId, version: 1 };
      const mockUpdatedPlan = { id: mockFloorPlanId, version: 2 };

      vi.mocked(prisma.floorPlan.findUnique)
        .mockResolvedValueOnce(mockFloorPlan as any)
        .mockResolvedValueOnce(mockUpdatedPlan as any);

      await floorPlanService.bulkUpdate(
        mockFloorPlanId,
        {
          deletedElementIds: ['elem-1', 'elem-2'],
          deletedRackIds: ['rack-1'],
        },
        mockUserId
      );

      expect(prisma.floorPlanElement.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['elem-1', 'elem-2'] },
          floorPlanId: mockFloorPlanId,
        },
      });
      expect(prisma.rack.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['rack-1'] },
          floorPlanId: mockFloorPlanId,
        },
      });
    });

    it('should throw NotFoundError when floor plan does not exist', async () => {
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(null);

      await expect(
        floorPlanService.bulkUpdate('invalid-id', {}, mockUserId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should handle concurrent rack creation with duplicate names', async () => {
      const mockFloorPlan = { id: mockFloorPlanId, version: 1 };

      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(mockFloorPlan as any);
      vi.mocked(prisma.rack.findFirst).mockResolvedValue({ id: 'existing', name: 'Rack A' } as any);

      await expect(
        floorPlanService.bulkUpdate(
          mockFloorPlanId,
          {
            racks: [
              {
                name: 'Rack A',
                positionX: 100,
                positionY: 100,
              },
            ],
          },
          mockUserId
        )
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('delete', () => {
    it('should delete floor plan successfully', async () => {
      const mockFloorPlan = { id: 'fp-123' };

      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(mockFloorPlan as any);
      vi.mocked(prisma.floorPlan.delete).mockResolvedValue(mockFloorPlan as any);

      await floorPlanService.delete('fp-123');

      expect(prisma.floorPlan.delete).toHaveBeenCalledWith({
        where: { id: 'fp-123' },
      });
    });

    it('should throw NotFoundError when floor plan does not exist', async () => {
      vi.mocked(prisma.floorPlan.findUnique).mockResolvedValue(null);

      await expect(floorPlanService.delete('invalid-id')).rejects.toThrow(NotFoundError);
    });
  });
});
