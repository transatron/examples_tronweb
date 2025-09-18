var fs = require('fs');
const dotenv = require('dotenv');
const { TronWeb } = require('tronweb');
const internal = require('stream');

// Load the appropriate .env file based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
console.log("loading ",`.env.${env}`);
dotenv.config({ path: `.env.${env}` });

const showDebugInfo = false;

const TxType = {
    TRX_TRANSACTION: 'trx_transaction',
    ACCOUNT_PAYMENT: 'account_payment',
    INSTANT_PAYMENT_USDT: 'instant_payment_usdt',
    INSTANT_PAYMENT_TRX: 'instant_payment_trx',
    COUPON_PAYMENT: 'coupon_payment',
    DELAYED_TRANSACTION: 'delayed_transaction'
};

const Token = {
    USDT: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    USDC: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
    SUN: 'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S'
};

const API = process.env.NODE_API;
const privateKey = process.env.SENDER_WALLET_PK

const tronWebNonSpender = new TronWeb({
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

        //********************************* CHECK THIS SETTINGS HERE *****************************/
        //********************************* TEST CONFIGURATION *****************************/
        //set to true for a company (Entity) account with separate deposit/accounting address.
        //leave value as false for individual (sender address) account
        const areYouACompany = true;
        const runningTxType = TxType.ACCOUNT_PAYMENT; 
        const TRC20ContractAddress = Token.USDT; //token to send
        const numberOfUSDTTransactions = 1; //applied for ACCOUNT_PAYMENT or DELAYED_TRANSACTIONS 
        const transactionInterval = 1000;//ms
        const exactTransferAmount = 0; //set to 0 to make test script generate low random transfer amount. 
        //********************************* END OF TEST CONFIGURATION  *****************************/
        //********************************* CHECK THIS SETTINGS HERE *****************************

         //this statement results in Transatron charging all transactions broadcasted with Spender API key from related company account.
        let tronWeb = areYouACompany ? tronWebSpender:tronWebNonSpender;
        const accountingAddress = areYouACompany?process.env.COMPANY_ACCOUNTING_ADDRESS:tronWeb.defaultAddress.base58;

        let targetAddress = process.env.RECEIVER_WALLET_ADDRESS; 
        const senderAddress = tronWeb.defaultAddress.base58;
        console.log("******************************* SENDER WALLET INFO ****************************");
        console.log("senderAddress = ",senderAddress);
        console.log("targetAddress = ",targetAddress);

        const TRC20TokenInstance = await tronWeb.contract().at(TRC20ContractAddress);
        const symbol = await TRC20TokenInstance.methods.symbol().call();
        const balance = await TRC20TokenInstance.methods.balanceOf(senderAddress).call();
        const decimals = await TRC20TokenInstance.methods.decimals().call(); // Get decimals dynamically
        const formattedBalance = Number(balance) / Math.pow(10, Number(decimals));
        console.log(`${symbol} Token Balance(${senderAddress}): ${formattedBalance}`);

        const balanceTRX = await tronWeb.trx.getBalance(senderAddress); 
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

        

              
        if (runningTxType === TxType.TRX_TRANSACTION) {
            console.log("************* Sending TRX transactions *****************");
            // Amount should be in SUN (1 TRX = 1,000,000 SUN)
            const amountInSun = 140000; // 1 TRX

            // Create the unsigned transaction
            const unsignedTransaction = await tronWeb.transactionBuilder.sendTrx(
                targetAddress,
                amountInSun,
                senderAddress
            );

            // Sign the transaction
            const signedTransaction = await tronWeb.trx.sign(unsignedTransaction);

            // Broadcast the signed transaction
            await broadcastTransaction(tronWeb, signedTransaction, true);

            return;
        }
        
        //broadcast TRC20 transactions
        let numberOfTx = (runningTxType == TxType.ACCOUNT_PAYMENT || runningTxType == TxType.DELAYED_TRANSACTION )? numberOfUSDTTransactions : 1;
        for(let i=0;i<numberOfTx;i++){
            console.log("************* Sending TRC20 Transaction ",(i+1)," *****************");
            if(process.env.RECEIVER_WALLETS !=null && numberOfUSDTTransactions >1 ){
                const array = JSON.parse(process.env.RECEIVER_WALLETS);
                let index = i%array.length;
                console.log("index ",index);
                targetAddress = array[index];
                console.log("targetAddress = ",targetAddress);
            }

            let transferAmount = exactTransferAmount>0?exactTransferAmount:(Math.floor(Math.random() * (15000 - 5000 + 1)) + 5000); // Random amount between 5000 and 15000
            console.log("transferAmount = ",transferAmount);
            let _ownerHexAddress = tronWeb.address.toHex(senderAddress);
            let _USDTContractHexAddress = tronWeb.address.toHex(Token.USDT);
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

            pathInfo = "wallet/triggersmartcontract";
            const transactionWrap = await tronWeb['fullNode'].request(
                pathInfo,
                args,
                'post'
            );

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

            if(runningTxType === TxType.ACCOUNT_PAYMENT){
                console.log("************* 3.a) ACCOUNT PAYMENT *****************");
                console.log("Current balance is: ",format(user_account_balance_rtrx), " RTRX and ",format(user_account_balance_rusdt)," RUSDT");
                console.log("Transatron will charge ",format((tx_fee_rtrx_account > 0)?tx_fee_rtrx_account:tx_fee_rusdt_account),(tx_fee_rtrx_account > 0)?" RTRX":" RUSDT"," from internal account" );
            } else if (runningTxType === TxType.INSTANT_PAYMENT_USDT) {
                console.log("************* 3.b) INSTANT USDT PAYMENT *****************");
                /**
                 * IMPORTANT! Instant payments are designed to go through non-spender API key (i.e. by non-custody wallet)
                 * 
                 * Sending instant payments via Spender key within account with non-negative balance will result in charging such transaction 
                 * as if it is 'ACCOUNT_PAYMENT'. Instant payment transaction will not be broadcasted at all in this case. 
                 */
                tronWeb = tronWebNonSpender;

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
            } else if (runningTxType === TxType.INSTANT_PAYMENT_TRX) {
                console.log("************* 3.c) INSTANT TRX PAYMENT *****************");
                /**
                 * IMPORTANT! Instant payments are designed to go through non-spender API key (i.e. by non-custody wallet)
                 * 
                 * Sending instant payments via Spender key within account with non-negative balance will result in charging such transaction 
                 * as if it is 'ACCOUNT_PAYMENT'. Instant payment transaction will not be broadcasted at all in this case. 
                 */
                tronWeb = tronWebNonSpender;
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
            } else if (runningTxType === TxType.DELAYED_TRANSACTION){
                console.log("************* 3.d) SENDING DELAYED TRANSACTION *****************");
        
                /**
                 * IMPORTANT! min accepted delayed transaction expiration is currentTime+1 hour.
                 * if transaction expiration time is less than currentTime + 1 hour, it will be treated as usual. 
                 * 
                 * There's an option to configure this parameter individually for each senderAddress (for example, for 
                 * specific Hot Wallet address, setting it to 15 min or so. Please contact @TransatronSupport in Telegram
                 * if requied)
                 **/
                
                //extend expiration by 65 min
                unsignedUserTransaction.raw_data.expiration += 1000*60*(60+5);
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
                    {address:senderAddress},
                    'post'
                );

                console.log(`Delayed transactions before broadcastting, pending txs: ${pendingInfo.pending_transactions_amount}, processing txs ${pendingInfo.processing_transactions_amount}`);
                
            }  else if (runningTxType === TxType.COUPON_PAYMENT){
                console.log("************* 3.e) PAYING FOR TRANSACTION WITH COUPON *****************");
                console.log("******************* CREATE COUPON **************************");
                
                /**
                 * Every coupon is 1-time-use only.
                 * You can limit coupon to 1 default USDT transaction by setting usdt_transactions = 1
                 * Alternatively, you can set rtrx_limit usage cap
                 * 
                 * If transaction will need smaller fee, remaining RTRX will be refunded back to a company account.
                 *
                 * For custom smart contract (not USDT transfer) transaction, set rtrx_limit = _feeLimit
                 * For TRX transfer transaction, set rtrx_limit = 300000 (0.3 TRX)
                 */
                const request = {
                    rtrx_limit: 0,
                    usdt_transactions: 1,
                    address: senderAddress, //coupon can be address limited. set address value here to limit to coupon usage to specific address
                    valid_to: (new Date()).getTime() + 10*60*1000 //10 min validity
                    };
                //console.log("request= ",request);
                
                let couponCode;
                //IMPORTANT! Make sure you are using _SPENDER API key for creating coupons! 
                const couponInfo = await tronWebSpender['fullNode'].request(
                    "api/v1/coupon",
                    request,
                    'post'
                );

                console.log("couponInfoPOST = ", couponInfo);

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
                        {},
                        'get'
                    );
                    console.log("couponInfoGET = ", couponInfoGET);
                }

                //set coupon as a separate parameter of signed transaction.
                console.log("Use coupon for transaction. ",couponCode);
                signedUserTransaction.coupon = couponCode;

                /**
                 * IMPORTANT! Coupons are designed to go through non-spender API key (i.e. by non-custody wallet)
                 * 
                 * Sending transaction with coupons via Spender key within account with non-negative balance will result in charging such transaction 
                 * as if it is 'ACCOUNT_PAYMENT' tx. Coupon will not be applied. 
                 */
                tronWeb = tronWebNonSpender;
            }

            var waitingForBroadcastResult = true;//default
            if(runningTxType === TxType.DELAYED_TRANSACTION){
                waitingForBroadcastResult = false;
            } else if(runningTxType === TxType.ACCOUNT_PAYMENT){
                waitingForBroadcastResult = transactionInterval == 0 || numberOfUSDTTransactions < 2;
            }
 
            if(numberOfTx > 1 ){
                //async broadcast
                setImmediate(async () => {
                    try {
                        broadcastTransaction(tronWeb, signedUserTransaction, waitingForBroadcastResult);
                    } catch (error) {
                        console.error('Error in background transaction:', error);
                    }
                });
            }else {
                //sync broadcast and wait for tx to be processed
                await broadcastTransaction(tronWeb, signedUserTransaction, waitingForBroadcastResult);
            }

            if(transactionInterval>0){
                await new Promise(resolve => setTimeout(resolve, transactionInterval));
            }    
        }

        if(runningTxType === TxType.DELAYED_TRANSACTION){
            const pendingInfo = await tronWebSpender['fullNode'].request(
                "api/v1/pendingtxs",
                {address:senderAddress},
                'post'
            );

            console.log(`Delayed transactions after broadcastting, pending txs: ${pendingInfo.pending_transactions_amount}, processing txs ${pendingInfo.processing_transactions_amount}`);

            console.log('waiting for 1 minute before flushing delayed txs ...');
            await new Promise(resolve => setTimeout(resolve, 60*1000));
            console.log('Flushing pending txs...');
            const flushPendingTx = await tronWebSpender['fullNode'].request(
                "api/v1/pendingtxs/flush",
                {address:senderAddress},
                'post'
            );

            const verificationDelay = 1;//sec
            const verificationInterval = 5;//sec
            const verificationTimeout = 30;//sec
            var pendingInfoAfterFlush;

            await new Promise(resolve => setTimeout(resolve, verificationDelay*1000));
            var k = verificationDelay;
            do{
                pendingInfoAfterFlush = await tronWebSpender['fullNode'].request(
                    "api/v1/pendingtxs",
                    {address:senderAddress},
                    'post'
                );
                console.log(`Delayed transactions after flush in ${k} sec, pending txs: ${pendingInfoAfterFlush.pending_transactions_amount}, processing txs ${pendingInfoAfterFlush.processing_transactions_amount}`);    
                await new Promise(resolve => setTimeout(resolve, verificationInterval*1000));
                k+=verificationInterval;
            } while((pendingInfoAfterFlush.pending_transactions_amount > 0 || pendingInfoAfterFlush.processing_transactions_amount > 0) && k < verificationTimeout);
            
            console.log("Transactions processed!")

            return;
        } 
        console.log(`Completed. ${numberOfTx} transactions sent.`);

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
    if(waitUntilConfirmed){
        console.log(`Broadcasting tx ${signedTransaction.txID} and waiting until confirmed...`);
    }else {
        console.log(`Broadcasting tx ${signedTransaction.txID}  without waiting for confirmation...`);
    }
    const broadcastResult = await tronWeb.trx.sendRawTransaction(signedTransaction)
        .catch(err => console.error(err));

    if(showDebugInfo){
        console.log("broadcastResult = ", broadcastResult);
    }
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
            if(showDebugInfo){
                console.log("************** txReceipt1 ****************");
                console.log(txReceipt1);
            }
            const state1 = isObjectEmpty(txReceipt1) ? '' : txReceipt1.ret[0].contractRet;
            const txReceipt2 = await tronWeb.trx.getTransactionInfo(txID).catch(err => console.error(err));
            if(showDebugInfo){
                console.log("************** txReceipt2 ****************");
                console.log(txReceipt2);
            }
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



