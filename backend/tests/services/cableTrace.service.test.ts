import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cableTraceService } from '../../src/services/cableTrace.service.js';
import prisma from '../../src/config/prisma.js';
import { NotFoundError } from '../../src/utils/errors.js';

// Mock Prisma
vi.mock('../../src/config/prisma.js', () => ({
  default: {
    cable: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    equipment: {
      findUnique: vi.fn(),
    },
    fiberPath: {
      findMany: vi.fn(),
    },
  },
}));

// ==================== Test Helpers ====================

function makeEquipment(id: string, name: string, category = 'SERVER', substationName = '변전소A') {
  return {
    id,
    name,
    category,
    roomId: `room-${id}`,
    room: {
      floor: {
        substation: { id: `sub-${id}`, name: substationName },
      },
    },
    rack: null,
  };
}

function makeCable(
  id: string,
  sourceId: string,
  targetId: string,
  cableType: string,
  opts: { label?: string; length?: number; fiberPathId?: string; fiberPortNumber?: number } = {},
) {
  return {
    id,
    sourceEquipmentId: sourceId,
    targetEquipmentId: targetId,
    cableType,
    label: opts.label ?? null,
    length: opts.length ?? null,
    fiberPathId: opts.fiberPathId ?? null,
    fiberPortNumber: opts.fiberPortNumber ?? null,
    sourceEquipment: makeEquipment(sourceId, `Equip-${sourceId}`),
    targetEquipment: makeEquipment(targetId, `Equip-${targetId}`),
  };
}

// ==================== Tests ====================

describe('CableTraceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('trace', () => {
    it('should throw NotFoundError when cable does not exist', async () => {
      vi.mocked(prisma.cable.findUnique).mockResolvedValue(null);

      await expect(cableTraceService.trace('nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('should trace a simple two-node AC cable', async () => {
      const cable = makeCable('cable-1', 'eq-a', 'eq-b', 'AC');

      vi.mocked(prisma.cable.findUnique).mockResolvedValue(cable as any);
      // Single upfront query returns all cables of this cableType
      vi.mocked(prisma.cable.findMany).mockResolvedValue([cable as any]);

      const result = await cableTraceService.trace('cable-1');

      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].type).toBe('cable');
      expect(result.edges[0].cableType).toBe('AC');

      // Check source/target flags
      const sourceNode = result.nodes.find((n) => n.equipmentId === 'eq-a');
      const targetNode = result.nodes.find((n) => n.equipmentId === 'eq-b');
      expect(sourceNode?.isSource).toBe(true);
      expect(sourceNode?.isTarget).toBe(false);
      expect(targetNode?.isSource).toBe(false);
      expect(targetNode?.isTarget).toBe(true);
    });

    it('should trace a chain of three nodes via LAN cables', async () => {
      const cable1 = makeCable('cable-1', 'eq-a', 'eq-b', 'LAN');
      const cable2 = makeCable('cable-2', 'eq-b', 'eq-c', 'LAN');

      vi.mocked(prisma.cable.findUnique).mockResolvedValue(cable1 as any);

      // Single upfront query returns all LAN cables
      vi.mocked(prisma.cable.findMany).mockResolvedValue([cable1 as any, cable2 as any]);

      const result = await cableTraceService.trace('cable-1');

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);
    });

    it('should detect a ring in a triangle topology', async () => {
      const cable1 = makeCable('cable-1', 'eq-a', 'eq-b', 'DC');
      const cable2 = makeCable('cable-2', 'eq-b', 'eq-c', 'DC');
      const cable3 = makeCable('cable-3', 'eq-c', 'eq-a', 'DC');

      vi.mocked(prisma.cable.findUnique).mockResolvedValue(cable1 as any);

      // Single upfront query returns all DC cables
      vi.mocked(prisma.cable.findMany).mockResolvedValue([
        cable1 as any,
        cable2 as any,
        cable3 as any,
      ]);

      const result = await cableTraceService.trace('cable-1');

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(3);
      expect(result.rings.length).toBeGreaterThanOrEqual(1);
      expect(result.rings[0].nodeIds.length).toBeGreaterThanOrEqual(3);
    });

    it('should traverse FiberPaths for FIBER cables at OFD equipment', async () => {
      const ofdA = makeEquipment('ofd-a', 'OFD-A', 'OFD', '춘천');
      const ofdB = makeEquipment('ofd-b', 'OFD-B', 'OFD', '화천');
      const serverA = makeEquipment('srv-a', 'Server-A', 'SERVER', '춘천');

      const fiberCable = {
        ...makeCable('cable-f1', 'srv-a', 'ofd-a', 'FIBER'),
        sourceEquipment: serverA,
        targetEquipment: ofdA,
      };

      const fiberPath = {
        id: 'fp-1',
        ofdAId: 'ofd-a',
        ofdBId: 'ofd-b',
        portCount: 24,
        ofdA,
        ofdB: ofdB,
      };

      vi.mocked(prisma.cable.findUnique).mockResolvedValue(fiberCable as any);

      // Single upfront query returns all FIBER cables
      vi.mocked(prisma.cable.findMany).mockResolvedValue([fiberCable as any]);

      // FiberPath query when visiting ofd-a, then ofd-b
      vi.mocked(prisma.fiberPath.findMany)
        .mockResolvedValueOnce([fiberPath as any])  // ofd-a
        .mockResolvedValueOnce([fiberPath as any]); // ofd-b (already visited edge)

      const result = await cableTraceService.trace('cable-f1');

      expect(result.nodes).toHaveLength(3); // srv-a, ofd-a, ofd-b
      expect(result.edges).toHaveLength(2); // cable + fiberPath

      const fpEdge = result.edges.find((e) => e.type === 'fiberPath');
      expect(fpEdge).toBeDefined();
      expect(fpEdge!.fiberPathId).toBe('fp-1');
      expect(fpEdge!.portCount).toBe(24);
      expect(fpEdge!.cableType).toBe('FIBER');
      expect(fpEdge!.id).toBe('fp:fp-1');
    });
  });
});
