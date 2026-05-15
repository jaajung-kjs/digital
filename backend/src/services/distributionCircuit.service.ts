import prisma from '../config/prisma.js';

export interface DistributionCircuitDetail {
  id: string;
  distributionEquipmentId: string;
  feederName: string;
  branchName: string;
  description: string | null;
  sortOrder: number;
}

class DistributionCircuitService {
  /** 분전반(DISTRIBUTION Equipment) 의 회로 목록. feeder → branch 순 정렬. */
  async getByDistributionId(distributionId: string): Promise<DistributionCircuitDetail[]> {
    const rows = await prisma.distributionCircuit.findMany({
      where: { distributionEquipmentId: distributionId },
      orderBy: [{ feederName: 'asc' }, { sortOrder: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      distributionEquipmentId: r.distributionEquipmentId,
      feederName: r.feederName,
      branchName: r.branchName,
      description: r.description,
      sortOrder: r.sortOrder,
    }));
  }
}

export const distributionCircuitService = new DistributionCircuitService();
