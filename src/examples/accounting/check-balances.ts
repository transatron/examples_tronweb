/**
 * Check balances — TRX, TRC20, chain params, node info, TFN/TFU balances.
 * Shows two types of TFN/TFU balances:
 *   - Direct address balance: on-chain token balance at the wallet address (non-spender key)
 *   - Account balance: TransaTron account-level balance (spender key, via /api/v1/config)
 */
import { TOKENS } from '../../config/tokens.js';
import { createNonSpenderTronWeb, createSpenderTronWeb } from '../../lib/tronweb-factory.js';
import { getChainParams, getTransatronNodeInfo } from '../../lib/chain-info.js';
import { getAccountingConfig } from '../../lib/transatron-api.js';

(async () => {
  try {
    const tronWeb = createNonSpenderTronWeb();
    const senderAddress = tronWeb.defaultAddress.base58 as string;

    console.log('=== Check Balances ===');
    console.log('Address:', senderAddress);

    // TRX balance
    const trxBalance = await tronWeb.trx.getBalance(senderAddress);
    console.log('TRX Balance:', trxBalance / 1_000_000);

    // TRC20 balances
    for (const [symbol, address] of Object.entries(TOKENS)) {
      try {
        const contract = await tronWeb.contract().at(address);
        const balance = await contract.methods.balanceOf(senderAddress).call();
        const decimals = await contract.methods.decimals().call();
        const formatted = Number(balance) / Math.pow(10, Number(decimals));
        console.log(`${symbol} Balance:`, formatted);
      } catch {
        console.log(`${symbol}: unable to read balance`);
      }
    }

    // Chain parameters
    const params = await getChainParams(tronWeb);
    console.log('--- Chain Parameters ---');
    console.log('Energy Fee:', params.energyFee);
    console.log('Bandwidth Fee:', params.transactionFee);
    console.log('Total Energy Limit:', params.totalEnergyLimit);
    console.log('Total Bandwidth Limit:', params.totalNetLimit);

    // TransaTron node info
    const nodeInfo = await getTransatronNodeInfo(tronWeb);
    if (nodeInfo) {
      console.log('--- TransaTron Info ---');
      console.log('Deposit address:', nodeInfo.deposit_address);
      console.log('TFN (internal TRX) token:', nodeInfo.rtrx_token_address);
      console.log('TFU (internal USDT) token:', nodeInfo.rusdt_token_address);
      console.log('Min TFU deposit:', nodeInfo.rusdt_min_deposit / 1_000_000);
      console.log('Min TFN deposit:', nodeInfo.rtrx_min_deposit / 1_000_000);
      console.log('TRX price:', nodeInfo.trx_price);

      // Direct address balance — on-chain TFN/TFU tokens held at the wallet address (non-spender key)
      const tfnContract = await tronWeb.contract().at(nodeInfo.rtrx_token_address);
      const tfuContract = await tronWeb.contract().at(nodeInfo.rusdt_token_address);
      const tfnBalance = await tfnContract.methods.balanceOf(senderAddress).call();
      const tfuBalance = await tfuContract.methods.balanceOf(senderAddress).call();
      console.log('--- Direct Address Balance (non-spender key) ---');
      console.log('TFN (internal TRX, address-bound) Balance:', Number(tfnBalance) / 1_000_000);
      console.log('TFU (internal USDT, address-bound) Balance:', Number(tfuBalance) / 1_000_000);
    } else {
      console.log('TransaTron node info not available');
    }

    // Account config (requires spender key)
    const spenderTronWeb = createSpenderTronWeb();
    const accountConfig = await getAccountingConfig(spenderTronWeb);

    // Account balance — TransaTron account-level balance from /api/v1/config (spender key)
    console.log('--- Account Balance (spender key) ---');
    console.log('TFN (internal TRX, account):', accountConfig.balance_rtrx / 1_000_000);
    console.log('TFU (internal USDT, account):', accountConfig.balance_rusdt / 1_000_000);

    const notices = accountConfig.notice as string[] | undefined;
    if (notices && notices.length > 0) {
      console.log('--- Account Notices ---');
      for (const notice of notices) {
        console.log(notice);
      }
    }

    console.log('Done.');
  } catch (error) {
    console.error('Error:', error);
  }
})();
