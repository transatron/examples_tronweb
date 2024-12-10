var fs = require('fs');
const dotenv = require('dotenv');
const TronWeb = require('tronweb');

// Load the appropriate .env file based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${env}` });

const USDTContractAddress = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const API = process.env.NODE_API;
const privateKey = process.env.SENDER_WALLET_PK

const tronWeb = new TronWeb({
    fullHost: API,
    eventServer: API,
    privateKey: privateKey,
    headers: {
        'TRANSATRON-API-KEY': process.env.TRANSATRON_API_KEY
    }
});

(async () => {
    try {

        //***************************CHECK THIS SETTINGS HERE *******************/
        //set to true for a company (Entity) account with separate deposit/accounting address.
        //leave value as false for individual (sender address) account
        const areYouACompany = true;
        //***************************CHECK THIS SETTINGS HERE *******************/

        const senderAddress = tronWeb.defaultAddress.base58;
        console.log("******************************* SENDER WALLET ****************************");
        console.log("senderAddress = ",senderAddress);
        const accountingAddress = areYouACompany?process.env.COMPANY_ACCOUNTING_ADDRESS:senderAddress;
        console.log("accounting address = ",accountingAddress);
        
        // Get the contract instance
        const USDTInstance = await tronWeb.contract().at(USDTContractAddress);

        // Call the balanceOf method
        const balance = await USDTInstance.methods.balanceOf(senderAddress).call();

        // Convert the balance to a readable format (TRC20 tokens usually have 6 or 18 decimals)
        const decimals = await USDTInstance.methods.decimals().call(); // Get decimals dynamically
        const formattedBalance = balance / Math.pow(10, decimals);

        console.log(`USDT Balance: ${formattedBalance}`);

        const balanceTRX = await tronWeb.trx.getBalance(senderAddress);

        // Convert to TRX
        const formattedBalanceTRX = balanceTRX / 1_000_000;

        console.log(`TRX Balance: ${formattedBalanceTRX}`);


        let transatronRTRXContractAddress = "";
        let transatronRUSDTContractAddress = "";
        let transatronDepositAddress = "";
        let transatronMinUSDTDeposit = 0;
        let transatronMinTRXDeposit = 0;

        let RTRXInstance;
        let RUSDTInstance;

        // Initialize blockchain parameters
        let energyFee, transactionFee, totalEnergyLimit, totalNetLimit;
        {
            let params = await tronWeb.trx.getChainParameters();
            // console.log("Chain params: ", params);
            console.log("************* Init paremeters (do once) *****************");
            // Iterate through the params array
            params.forEach(param => {
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
            });
             // Log the extracted values
            console.log("Energy Fee:", energyFee);
            console.log("Bandwidth Fee:", transactionFee);
            console.log("Total Energy Limit:", totalEnergyLimit);
            console.log("Total Bandwidth Limit:", totalNetLimit);
      
            const nodeInfo = await tronWeb.trx.getNodeInfo();
            // console.log("nodeInfo = ", nodeInfo);

            //read Transatron parameters
            if (nodeInfo.transatronInfo) {
                    transatronDepositAddress = nodeInfo.transatronInfo.deposit_address;
                    transatronRTRXContractAddress = nodeInfo.transatronInfo.rtrx_token_address;
                    transatronRUSDTContractAddress = nodeInfo.transatronInfo.rusdt_token_address;
                    transatronMinUSDTDeposit = nodeInfo.transatronInfo.rusdt_min_deposit;
                    transatronMinTRXDeposit = nodeInfo.transatronInfo.rtrx_min_deposit;
                    console.log("transatronDepositAddress = ", transatronDepositAddress);
                    console.log("transatronRTRXContractAddress = ", transatronRTRXContractAddress);
                    console.log("transatronRUSDTContractAddress = ", transatronRUSDTContractAddress);
                    console.log("transatronMinUSDTDeposit = ", transatronMinUSDTDeposit);
                    console.log("transatronMinTRXDeposit = ", transatronMinTRXDeposit);

                    RTRXInstance = await tronWeb.contract().at(transatronRTRXContractAddress);
                    RUSDTInstance = await tronWeb.contract().at(transatronRUSDTContractAddress);

                    let rtrxUserBalance = await RTRXInstance.methods.balanceOf(accountingAddress).call();
                    console.log("RTRX Balance = ", rtrxUserBalance.toString());

                    let rusdtUserBalance = await RUSDTInstance.methods.balanceOf(accountingAddress).call();
                    console.log("RUSDT Balance = ", rusdtUserBalance.toString());
                }
            
        }

        if (false) {
            console.log("************* Deposit Transatron account with TRX *****************");
            // Amount should be in SUN (1 TRX = 1,000,000 SUN)
            const amountInSun = transatronMinTRXDeposit; //deposit shoud be >=transatronMinTRXDeposit

            const depositAddress = areYouACompany?accountingAddress:transatronDepositAddress;

            
            let rtrxUserBalanceBefore = await RTRXInstance.methods.balanceOf(accountingAddress).call();
            console.log("RTRX Balance Before = ", rtrxUserBalanceBefore.toString());
        

            // Create the unsigned transaction
            const unsignedTransaction = await tronWeb.transactionBuilder.sendTrx(
                depositAddress,
                amountInSun,
                tronWeb.defaultAddress.base58
            );

            // Sign the transaction
            const signedTransaction = await tronWeb.trx.sign(unsignedTransaction);

            // Broadcast the signed transaction
            await broadcastTransaction(signedTransaction);

             //check balance credited
           
            let rtrxUserBalanceAfter = await RTRXInstance.methods.balanceOf(accountingAddress).call();
            console.log("RTRX Balance After: ",accountingAddress, " => ", rtrxUserBalanceAfter.toString());

            console.log(rtrxUserBalanceBefore.toString(),"+",amountInSun,"=",rtrxUserBalanceAfter.toString());
        
        }
              


        if (false) {
            console.log("************* Deposit Transatron account with USDT *****************");
            const depositAddress = areYouACompany?accountingAddress:transatronDepositAddress;
            let transferAmount = transatronMinUSDTDeposit; 
            let _callerAddress = tronWeb.address.toHex(senderAddress);
            let _smartContractHex = tronWeb.address.toHex(USDTContractAddress);
            let _callFunction = "transfer(address,uint256)";
            var _callParameters = [{ type: 'address', value: depositAddress }, { type: 'uint256', value: transferAmount }];
            let _feeLimit = 0;
            let _transactionFeeBurnTRX = 0; //transaction fee in case user will burn TRX for transaction

            {
                console.log("*************  1) estimate feeLimit *****************");
                /**
                 *WARNING! 
                 * 1) senderAddress to be activated. If not activated, the result will return an error. activated means senderAddress has non zero TRX balance.
                 * 2) if there is not enough balance on the wallet, you'll get "REVERT opcode executed" error. 
                 * 3) if not activated, assume max energy spending for USDT transfer, which is 132000 energy currently.
                 */
                let tccResponse = await tronWeb.transactionBuilder.triggerConstantContract(_smartContractHex, _callFunction, {}, _callParameters, _callerAddress);

                console.log("tccResponse:", tccResponse);
                let energy_used = tccResponse.energy_used;

                console.log("energy_used = ", energy_used);

                _feeLimit = energy_used * energyFee;
            }

            {
                console.log("*************  2) estimate transaction result and fee, show to user. *****************");
                var options = {
                    feeLimit: _feeLimit,
                    callValue: 0,
                    txLocal: true
                };

                const args = tronWeb.transactionBuilder._getTriggerSmartContractArgs(
                    _smartContractHex,
                    _callFunction,
                    options,
                    _callParameters,
                    _callerAddress,
                    0,
                    0,
                    options.callValue,
                    options.feeLimit
                );

                // console.log("args = ", args);

                pathInfo = "wallet/triggersmartcontract";
                const transactionWrap = await tronWeb['fullNode'].request(
                    pathInfo,
                    args,
                    'post'
                );

                // console.log("transactionWrap = ", transactionWrap);

                //make sure result is "true"

                // console.log("result = ", transactionWrap.result.result);

                //check Transatron data: 
                let ttCode = transactionWrap.transatron.code;
                let tx_fee_rtrx = transactionWrap.transatron.code;//transaction fee in Transatron RTRX token
                let tx_fee_burn_trx = transactionWrap.transatron.tx_fee_burn_trx; //transaction fee in user will burn TRX for transaction. i.e. without Transatron
                let message = transactionWrap.transatron.message;
                //decode message
                let decodedMessage = hexToUnicode(message);
                //console.log("Decoded message:", decodedMessage);

                //calculate bandwidth required:

                let bandwidthRequired = transactionWrap.transaction.raw_data_hex.length / 2 //raw data size in bytes
                    + 65 //signature size in bytes, assuming signing with only 1 key
                    + 64 // don't know what exactly is this. taken from ApiWrapper.estimateBandwidth
                    + 5; // my assumption from practival experience...
                // console.log("bandwidthRequired = ", bandwidthRequired);
                _transactionFeeBurnTRX = bandwidthRequired * transactionFee + _feeLimit;
                // console.log("_transactionFeeBurnTRX = ", _transactionFeeBurnTRX);
                // technically, _transactionFeeBurnTRX == tx_fee_burn_trx
            }


            if(true){
                //check RUSDT balance before
                
                let rusdtUserBalanceBefore = await RUSDTInstance.methods.balanceOf(accountingAddress).call();
                console.log("RUSDT Balance Before = ", rusdtUserBalanceBefore.toString());
                

                console.log("*************  3) sign and broadcast transaction *****************");
                console.log("Fee limit = ",_feeLimit);
                var options = {
                    feeLimit: _feeLimit,
                    callValue: 0,
                    txLocal: true
                };

                const transaction = await tronWeb.transactionBuilder._triggerSmartContractLocal(
                    _smartContractHex,
                    _callFunction,
                    options,
                    _callParameters,
                    _callerAddress
                );

                // console.log("transaction = ", transaction);

                // If privateKey is false, this won't be signed here. We assume sign functionality will be replaced.
                const signedTransaction = await tronWeb.trx.sign(transaction.transaction, privateKey);

                // console.log("signed transaction = ", signedTransaction);

                await broadcastTransaction(signedTransaction);

                //check RUSDT balance credited
                
                let rusdtUserBalanceAfter = await RUSDTInstance.methods.balanceOf(accountingAddress).call();
                console.log("RUSDT Balance After = ", rusdtUserBalanceAfter.toString());

                console.log(rusdtUserBalanceBefore.toString(),"+",transferAmount,"=",rusdtUserBalanceAfter.toString());
            }
        }

        console.log("Done");

    } catch (error) {
        console.error('Error ', error);
    }
})();

// Convert hex to bytes
function hexToBytes(hex) {
    let bytes = [];
    for (let c = 0; c < hex.length; c += 2)
        bytes.push(parseInt(hex.substr(c, 2), 16));
    return new Uint8Array(bytes);
}

// Convert hex to Unicode string
function hexToUnicode(hex) {
    if (hex!=null && hex.length > 0) {
        const bytes = hexToBytes(hex);
        return new TextDecoder('utf-8').decode(bytes);
    } else {
        return "";
    }
}

async function broadcastTransaction(signedTransaction) {
    const broadcastResult = await tronWeb.trx.sendRawTransaction(signedTransaction)
        .catch(err => console.error(err));

    console.log("broadcastResult = ", broadcastResult);
    //check Transatron data: 
    let ttCode = broadcastResult.transatron.code;//Transatron transaction processing code
    let tx_fee_rtrx = broadcastResult.transatron.code;//transaction fee in Transatron RTRX token
    let tx_fee_burn_trx = broadcastResult.transatron.tx_fee_burn_trx; //transaction fee in user will burn TRX for transaction. i.e. without Transatron
    let message = broadcastResult.transatron.message;
    //decode message
    let decodedMessage = hexToUnicode(message);

    if ("CONTRACT_VALIDATE_ERROR" === broadcastResult.code) {
        console.log("Error processing transaction: CONTRACT_VALIDATE_ERROR, message = ", hexToUnicode(broadcastResult.message), " txHash = ", broadcastResult.txid);
        return;
    }

    let txID = broadcastResult.txid;
    //------------ check status
    let txMined = false;
    let waitedTime = 0;
    do {
        const txReceipt1 = await tronWeb.trx.getTransaction(txID).catch(err => console.error(err));
        console.log("************** txReceipt1 ****************");
        console.log(txReceipt1);
        const state1 = isObjectEmpty(txReceipt1) ? '' : txReceipt1.ret[0].contractRet;
        const txReceipt2 = await tronWeb.trx.getTransactionInfo(txID).catch(err => console.error(err));
        console.log("************** txReceipt2 ****************");
        console.log(txReceipt2);

        if ("OUT_OF_ENERGY" === state1) {
            console.log("Error processing transaction: OUT_OF_ENERGY, txHash = ", broadcastResult.txID);
            break;
        }

        const state2 = isObjectEmpty(txReceipt2) ? false : (txReceipt2.receipt.net_usage > 0 || txReceipt2.receipt.net_fee > 0);
        txMined = !isObjectEmpty(txReceipt1) && !isObjectEmpty(txReceipt2) && (state1 === 'SUCCESS') && state2;


        if (!txMined) {
            console.log("txMined = ", txMined, " Waiting....", " / state1 ", state1, "state2 ", state2);
            let timeout = (waitedTime == 0) ? 50000 : 5000;
            waitedTime += timeout;
            await new Promise(resolve => setTimeout(resolve, timeout));
        }
    }
    while (!txMined);
    console.log("Transaction mined");
}

const isObjectEmpty = (objectName) => {
    return objectName == null || JSON.stringify(objectName) === "{}";
};



