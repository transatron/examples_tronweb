var fs = require('fs');
const dotenv = require('dotenv');
const TronWeb = require('tronweb');
const internal = require('stream');

// Load the appropriate .env file based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
console.log("loading ",`.env.${env}`);
dotenv.config({ path: `.env.${env}` });

const USDTContractAddress = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDCContractAddress = "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8";

const API = process.env.NODE_API;
const privateKey = process.env.SENDER_WALLET_PK

const tronWebGeneric = new TronWeb({
    fullHost: API,
    eventServer: API,
    privateKey: privateKey,
    headers: {
        'TRANSATRON-API-KEY': process.env.TRANSATRON_API_KEY
    }
});

const tronWebSpender = new TronWeb({
    fullHost: API,
    eventServer: API,
    privateKey: privateKey,
    headers: {
        'TRANSATRON-API-KEY': process.env.TRANSATRON_API_KEY_SPENDER
    }
});

function format(numberUSDTorTRX){
    return (numberUSDTorTRX*0.000001).toFixed(2);
}

(async () => {
    try {

        //***************************CHECK THIS SETTINGS HERE *******************/
        //set to true for a company (Entity) account with separate deposit/accounting address.
        //leave value as false for individual (sender address) account
        const areYouACompany = false;
        //this statement results in Transatron charging all transactions broadcasted with Spender API key from related company account.
        const tronWeb = (true && areYouACompany)?tronWebSpender:tronWebGeneric;
        const accountingAddress = areYouACompany?process.env.COMPANY_ACCOUNTING_ADDRESS:tronWeb.defaultAddress.base58;
        //***************************CHECK THIS SETTINGS HERE *******************/

        let targetAddress = process.env.RECEIVER_WALLET_ADDRESS; 
        const senderAddress = tronWeb.defaultAddress.base58;
        console.log("******************************* SENDER WALLET ****************************");
        console.log("senderAddress = ",senderAddress);
        console.log("targetAddress = ",targetAddress);

        // const TRC20ContractAddress = USDCContractAddress;
        const TRC20ContractAddress = USDTContractAddress;

        // Get the contract instance
        const USDTInstance = await tronWeb.contract().at(TRC20ContractAddress);

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
            console.log("************* Sending TRX transactions *****************");
            // Amount should be in SUN (1 TRX = 1,000,000 SUN)
            const amountInSun = 14000000; // 1 TRX

            // Create the unsigned transaction
            const unsignedTransaction = await tronWeb.transactionBuilder.sendTrx(
                targetAddress,
                amountInSun,
                senderAddress
            );

            // Sign the transaction
            const signedTransaction = await tronWeb.trx.sign(unsignedTransaction);

            // Broadcast the signed transaction
            await broadcastTransaction(tronWeb, signedTransaction);
        }
        // return;

        const numberOfUSDTTransactions = 1;
        const transactionInterval = 1000;//ms

        for(let i=0;i<numberOfUSDTTransactions;i++){
            console.log("************* Sending TRC20 Transaction ",(i+1)," *****************");
            if(process.env.RECEIVER_WALLETS !=null && numberOfUSDTTransactions >1 ){
                const array = JSON.parse(process.env.RECEIVER_WALLETS);
                let index = i%array.length;
                console.log("index ",index);
                targetAddress = array[index];
                console.log("targetAddress = ",targetAddress);
            }

            let transferAmount = Math.floor(Math.random() * (15000 - 5000 + 1)) + 5000; // Random amount between 5000 and 15000
            let _ownerHexAddress = tronWeb.address.toHex(senderAddress);
            let _USDTContractHexAddress = tronWeb.address.toHex(USDTContractAddress);
            let _TRC20ContractHexAddress = tronWeb.address.toHex(TRC20ContractAddress);
            let _callFunction = "transfer(address,uint256)";
            var _callParameters = [{ type: 'address', value: targetAddress }, { type: 'uint256', value: transferAmount }];
            let _feeLimit = 0;
            let _transactionFeeBurnTRX = 0; //transaction fee in case user will burn TRX for transaction

            
            console.log("*************  1) estimate feeLimit *****************");
            /**
             *WARNING! 
                * 1) senderAddress to be activated. If not activated, the result will return an error. activated means senderAddress has non zero TRX balance.
                * 2) if there is not enough balance on the wallet, you'll get "REVERT opcode executed" error. 
                * 3) if not activated, assume max energy spending for USDT transfer, which is 132000 energy currently.
                */
            try{
                if(true){
                    let tccResponse = await tronWeb.transactionBuilder.triggerConstantContract(_TRC20ContractHexAddress, _callFunction, {}, _callParameters, _ownerHexAddress);

                    let energy_used = tccResponse.energy_used;
                    console.log("estimated Transaction energy_used = ", energy_used);
                    _feeLimit = energy_used * energyFee;
                } else {
                    //this is to test a case when wallets simply hardcode feeLimit to 100 TRX. Shit happens. 
                    _feeLimit = 100*1000000;
                    console.log("Hardcode _feeLimit. Transaction energy_used = ", (_feeLimit/energyFee));
                }
            }
            catch(error){
                _feeLimit = 132000 * energyFee;
            }
            
            console.log("*************  2) estimate transaction result and Transatron fees, show to user if required. *****************");
            var options = {
                feeLimit: _feeLimit,
                callValue: 0,
                txLocal: true
            };

            const args = tronWeb.transactionBuilder._getTriggerSmartContractArgs(
                _TRC20ContractHexAddress,
                _callFunction,
                options,
                _callParameters,
                _ownerHexAddress,
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
            let tx_fee_rtrx_account = transactionWrap.transatron.tx_fee_rtrx_account;//transaction fee in Transatron RTRX token from internal account.
            let tx_fee_rusdt_account = transactionWrap.transatron.tx_fee_rusdt_account;//transaction fee in Transatron RUSDT token from internal account.
            let tx_fee_rtrx_instant = transactionWrap.transatron.tx_fee_rtrx_instant;//transaction fee in TRX when paid instantly
            let tx_fee_rusdt_instant = transactionWrap.transatron.tx_fee_rusdt_instant;//transaction fee in USDT when paid instantly
            let user_account_balance_rtrx = transactionWrap.transatron.user_account_balance_rtrx;//transaction fee in USDT when paid instantly
            let user_account_balance_rusdt = transactionWrap.transatron.user_account_balance_rusdt;//transaction fee in USDT when paid instantly    
            let tx_fee_burn_trx = transactionWrap.transatron.tx_fee_burn_trx; //transaction fee in user will burn TRX for transaction. i.e. without Transatron
            let message = transactionWrap.transatron.message;
            //decode message
            let decodedMessage = hexToUnicode(message);
            console.log("Transatron estimated result code:", ttCode, " message:",decodedMessage);
            console.log("Transatron fees if charged from internal account (RTRX/RUSDT)", format(tx_fee_rtrx_account), " RTRX / ",format(tx_fee_rusdt_account)," RUSDT");
            console.log("In case of paying with instant payment, the transaction fee would be ",format(tx_fee_rtrx_instant)," TRX or ",format(tx_fee_rusdt_instant)," USDT");
            console.log("In case TRX will be burned for transaction, the fee would be: ",format(tx_fee_burn_trx)," TRX");
            console.log("Current balance is: ",format(user_account_balance_rtrx), " RTRX and ",format(user_account_balance_rusdt)," RUSDT");

            //calculate bandwidth required:
            let bandwidthRequired = transactionWrap.transaction.raw_data_hex.length / 2 //raw data size in bytes
                + 65 //signature size in bytes, assuming signing with only 1 key
                + 64 // don't know what exactly is this. taken from ApiWrapper.estimateBandwidth
                + 5; // my assumption from practival experience...
            // console.log("bandwidthRequired = ", bandwidthRequired);
            _transactionFeeBurnTRX = bandwidthRequired * transactionFee + _feeLimit;
            // console.log("_transactionFeeBurnTRX = ", _transactionFeeBurnTRX);
            // technically, _transactionFeeBurnTRX == tx_fee_burn_trx

            if(true){
                console.log("*************  3) sign and broadcast transaction *****************");

                var options = {
                    feeLimit: _feeLimit,
                    callValue: 0,
                    txLocal: true
                };

                const transaction = await tronWeb.transactionBuilder._triggerSmartContractLocal(
                    _TRC20ContractHexAddress,
                    _callFunction,
                    options,
                    _callParameters,
                    _ownerHexAddress
                );

                let unsignedUserTransaction = JSON.parse(JSON.stringify(transaction.transaction)); //make a copy
                let signedUserTransaction = await tronWeb.trx.sign(transaction.transaction, privateKey);

                if(true){
                    console.log("************* 3.a) ACCOUNT PAYMENT *****************");
                    console.log("Current balance is: ",format(user_account_balance_rtrx), " RTRX and ",format(user_account_balance_rusdt)," RUSDT");
                    console.log("Transatron will charge ",format((tx_fee_rtrx_account > 0)?tx_fee_rtrx_account:tx_fee_rusdt_account),(tx_fee_rtrx_account > 0)?" RTRX":" RUSDT"," from internal account" );
                } else if (false) {
                    console.log("************* 3.b) INSTANT USDT PAYMENT *****************");
                    if(tx_fee_rusdt_instant > 0){
                        var _callParametersDeposit = [{ type: 'address', value: transatronDepositAddress }, { type: 'uint256', value: tx_fee_rusdt_instant }];
                        let tccResponse = await tronWeb.transactionBuilder.triggerConstantContract(_USDTContractHexAddress, _callFunction, {}, _callParametersDeposit, _ownerHexAddress);
                        // console.log('tccResponse',tccResponse);
                        let energy_used = tccResponse.energy_used;
        
                        var _feeLimitDeposit = energy_used * energyFee;
                        
                        var options = {
                            feeLimit: _feeLimitDeposit,
                            callValue: 0,
                            txLocal: true
                        };
        
                        const transactionInlinePayment = await tronWeb.transactionBuilder._triggerSmartContractLocal(
                            _USDTContractHexAddress,
                            _callFunction,
                            options,
                            _callParametersDeposit,
                            _ownerHexAddress
                        );
                        // console.log('transactionInlinePayment',transactionInlinePayment);
                        
                        // If privateKey is false, this won't be signed here. We assume sign functionality will be replaced.
                        const signedTransactionDeposit = await tronWeb.trx.sign(transactionInlinePayment.transaction, privateKey);
            
                        // Broadcast the signed transaction
                        const broadcastResult = await tronWeb.trx.sendRawTransaction(signedTransactionDeposit).catch(err => console.error(err));
                        console.log("broadcast payment tx Result = ", broadcastResult);
                    } else {
                        console.log("seems address has enough resources, don't need to make instant payment!");
                    }
                } else if (true) {
                    console.log("************* 3.c) INSTANT TRX PAYMENT *****************");
                    if(tx_fee_rtrx_instant > 0){
                        // Create the unsigned transaction
                        const unsignedTransaction = await tronWeb.transactionBuilder.sendTrx(
                            transatronDepositAddress,
                            tx_fee_rtrx_instant,
                            senderAddress
                        );
            
                        // Sign the transaction
                        const signedTransaction = await tronWeb.trx.sign(unsignedTransaction);
            
                        // Broadcast the signed transaction
                        const broadcastResult = await tronWeb.trx.sendRawTransaction(signedTransaction).catch(err => console.error(err));
                        console.log("broadcast payment tx Result = ", broadcastResult);
                    }else {
                        console.log("seems address has enough resources, don't need to make instant payment!");
                    }
                } else if (false){
                    console.log("************* 3.d) SENDING DELAYED TRANSACTION *****************");
                    //IMPORTANT! make sure originating address (sender address) is registered on Transatron as a "optimized address" prior to sending Delayed transactions. 
                
                    //IMPORTANT! min accepted delayed transaction expiration is currentTime+3 minutes. 

                    //extend expiration to 15 min
                    unsignedUserTransaction.raw_data.expiration += 1000*60*15;
                    //update transaction data
                    const updatedTxPack = await tronWeb.transactionBuilder.newTxID(unsignedUserTransaction);
                    unsignedUserTransaction.txID = updatedTxPack.txID;
                    unsignedUserTransaction.raw_data = updatedTxPack.raw_data;
                    unsignedUserTransaction.raw_data_hex = updatedTxPack.raw_data_hex;
                    unsignedUserTransaction.visible = updatedTxPack.visible;
                    // console.log("udpated transaction = ", unsignedUserTransaction);
                    //re-sign and override transaction object
                    signedUserTransaction = await tronWeb.trx.sign(unsignedUserTransaction, privateKey, false, false);
                    const pendingInfo = await tronWebSpender['fullNode'].request(
                        "api/v1/pendingtxs",
                        "",
                        'get'
                    );

                    console.log('Pending transactions data:',pendingInfo)
                    if(true){
                        const pendingInfoFlush = await tronWebSpender['fullNode'].request(
                            "api/v1/pendingtxs/flush",
                            "{}",
                            'post'
                        );
    
                        console.log('Pending transactions flush data:',pendingInfoFlush)
                    }
                }  else if (true){
                    console.log("************* 3.e) PAYING FOR TRANSACTION WITH COUPON *****************");
                    console.log("******************* CREATE COUPON **************************");
                    
                    //every coupon is 1-time-use 
                    //you can limit coupon to 1 default USDT transaction by setting usdt_transactions = 1
                    //alternatively, you can set rtrx_limit usage cap
                    //if transaction will need smaller fee, remaining RTRX will be refunded to a company account.
                    //
                    // for custom smart contract (not USDT transfer) transaction, set rtrx_limit = _feeLimit
                    // for TRX transfer transaction, set rtrx_limit = 300000 (0.3 TRX)
                    const request = {
                        rtrx_limit: 0,
                        usdt_transactions: 1,
                        address: senderAddress, //coupon can be address limited. set address value here to limit to coupon usage to specific address
                        valid_to: (new Date()).getTime() + 1*60*1000 //1 min validity
                        };
                    //console.log("request= ",request);
                    
                    let couponCode;
                    //IMPORTANT! Make sure you are using _SPENDER API key for creating coupons! 
                    const couponInfo = await tronWebSpender['fullNode'].request(
                        "api/v1/coupon",
                        request,
                        'post'
                    );
    
                    // console.log("couponInfo = ", couponInfo);
                    if("SUCCESS" === couponInfo.code){
                        couponCode = couponInfo.coupon.id;
                        let balanceRTRX = couponInfo.balance_rtrx;
                        let balanceRUSDT = couponInfo.balance_rusdt;
                        let balanceOnUnspentCouponsRTRX = couponInfo.balance_on_coupons_rtrx;
                        console.log("couponCode = ",couponCode);
                        console.log("balanceRTRX = ",balanceRTRX);
                        console.log("balanceRUSDT = ",balanceRUSDT);
                        console.log("balanceOnUnspentCouponsRTRX = ",balanceOnUnspentCouponsRTRX);
                    }
                
                    //read coupon data
                    if(true){
                        const couponInfoGET = await tronWebSpender['fullNode'].request(
                            "api/v1/coupon/"+couponCode,
                            'get'
                        );
                        console.log("couponInfoGET = ", couponInfoGET);
                    }

                    //set coupon as a separate parameter of signed transaction.
                    console.log("Use coupon for transaction. ",couponCode);
                    signedUserTransaction.coupon = couponCode;
                }

                // console.log("signed transaction = ", signedTransaction);
                if(true){
                    setImmediate(async () => {
                        try {
                            broadcastTransaction(tronWeb, signedUserTransaction, transactionInterval == 0 || numberOfUSDTTransactions < 2);
                        } catch (error) {
                            console.error('Error in background transaction:', error);
                        }
                    });
                }else {
                    await broadcastTransaction(tronWeb, signedUserTransaction, transactionInterval == 0 || numberOfUSDTTransactions < 2);
                }
                if(transactionInterval>0){
                    await new Promise(resolve => setTimeout(resolve, transactionInterval)); // sleeps for 100ms
                }
                
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

async function broadcastTransaction(tronWeb, signedTransaction, waitUntilConfirmed) {
    const broadcastResult = await tronWeb.trx.sendRawTransaction(signedTransaction)
        .catch(err => console.error(err));

    console.log("broadcastResult = ", broadcastResult);
    //check Transatron data: 
    let ttCode = broadcastResult.transatron?.code;//Transatron transaction processing code
    if("PENDING" === ttCode){
        console.log("Delayed transaction sent. Please check txHash = ",broadcastResult.txid," later on!");
        return;
    }
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
    if(waitUntilConfirmed){
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
}

const isObjectEmpty = (objectName) => {
    return objectName == null || JSON.stringify(objectName) === "{}";
};



