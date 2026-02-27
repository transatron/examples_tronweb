import type { TronWeb } from 'tronweb';
import type { TransatronNodeInfo, TransatronNodeInfoExtension } from '../types/index.js';

export interface ChainParams {
  energyFee: number;
  transactionFee: number;
  totalEnergyLimit: number;
  totalNetLimit: number;
}

export async function getChainParams(tronWeb: TronWeb): Promise<ChainParams> {
  const params = await tronWeb.trx.getChainParameters();
  let energyFee = 0;
  let transactionFee = 0;
  let totalEnergyLimit = 0;
  let totalNetLimit = 0;

  for (const param of params) {
    switch (param.key) {
      case 'getEnergyFee':
        energyFee = param.value;
        break;
      case 'getTransactionFee':
        transactionFee = param.value;
        break;
      case 'getTotalEnergyLimit':
        totalEnergyLimit = param.value;
        break;
      case 'getTotalNetLimit':
        totalNetLimit = param.value;
        break;
    }
  }

  return { energyFee, transactionFee, totalEnergyLimit, totalNetLimit };
}

export async function getTransatronNodeInfo(
  tronWeb: TronWeb,
): Promise<TransatronNodeInfoExtension | null> {
  const nodeInfo = (await tronWeb.trx.getNodeInfo()) as unknown as TransatronNodeInfo;
  return nodeInfo.transatronInfo ?? null;
}
