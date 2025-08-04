const {
  Client,
  PrivateKey,
  AccountId,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenMintTransaction,
  TransferTransaction,
  TokenAssociateTransaction,
  AccountCreateTransaction,
  AccountBalanceQuery,
} = require("@hashgraph/sdk");
const dotenv = require("dotenv");
dotenv.config();

async function createMintAndTransferToken({
  client,
  treasuryId,
  treasuryKey,
  recipientId,
  recipientKey,
}) {
  console.log(`---- Creating, Minting, and Transferring Token ----`);
  // 1. Create the fungible token
  const supplyKey = PrivateKey.generateECDSA();
  const tokenCreateTx = await new TokenCreateTransaction()
    .setTokenName("MyToken")
    .setTokenSymbol("MYT")
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(0)
    .setInitialSupply(0)
    .setTreasuryAccountId(treasuryId)
    .setSupplyType(TokenSupplyType.Infinite)
    .setSupplyKey(supplyKey)
    .freezeWith(client);

  const tokenCreateSign = await tokenCreateTx.sign(treasuryKey);
  const tokenCreateSubmit = await tokenCreateSign.execute(client);
  const tokenCreateRx = await tokenCreateSubmit.getReceipt(client);
  const tokenId = tokenCreateRx.tokenId;
  console.log(`Created token with ID: ${tokenId} (Treasury: ${treasuryId})`);

  // 2. Mint 1,000 tokens to the treasury
  const mintTx = await new TokenMintTransaction()
    .setTokenId(tokenId)
    .setAmount(1000)
    .freezeWith(client)
    .sign(supplyKey);
  const mintSubmit = await mintTx.execute(client);
  const mintRx = await mintSubmit.getReceipt(client);
  console.log(
    `Minted 1,000 tokens to Treasury (${treasuryId}): ${mintRx.status}`
  );

  // 3. Associate recipient account with the token
  const associateTx = await new TokenAssociateTransaction()
    .setAccountId(recipientId)
    .setTokenIds([tokenId])
    .freezeWith(client)
    .sign(recipientKey);
  const associateSubmit = await associateTx.execute(client);
  const associateRx = await associateSubmit.getReceipt(client);
  console.log(
    `Associated recipient (${recipientId}) with token: ${associateRx.status}`
  );

  // 4. Log balances before transfer
  console.log("\n--- Balances BEFORE transfer ---");
  await logTokenBalance(treasuryId, tokenId, "Treasury", client);
  await logTokenBalance(recipientId, tokenId, "Recipient", client);

  // 5. Transfer 500 tokens to the recipient
  const transferTx = await new TransferTransaction()
    .addTokenTransfer(tokenId, treasuryId, -500)
    .addTokenTransfer(tokenId, recipientId, 500)
    .freezeWith(client)
    .sign(treasuryKey);
  const transferSubmit = await transferTx.execute(client);
  const transferRx = await transferSubmit.getReceipt(client);
  console.log(
    `Transferred 500 tokens from Treasury (${treasuryId}) to Recipient (${recipientId}): ${transferRx.status}`
  );

  // 6. Log balances after transfer
  console.log("\n--- Balances AFTER transfer ---");
  await logTokenBalance(treasuryId, tokenId, "Treasury", client);
  await logTokenBalance(recipientId, tokenId, "Recipient", client);

  return tokenId;
}

// Helper Functions
async function createAccount(pvKey, initialBalance, client) {
  const response = await new AccountCreateTransaction()
    .setInitialBalance(initialBalance)
    .setKey(pvKey.publicKey)
    .setAlias(pvKey.publicKey.toEvmAddress())
    .setMaxAutomaticTokenAssociations(10)
    .execute(client);
  const receipt = await response.getReceipt(client);
  return [receipt.accountId, pvKey];
}

async function logTokenBalance(accountId, tokenId, label, client) {
  const balanceCheckTx = await new AccountBalanceQuery()
    .setAccountId(accountId)
    .execute(client);
  const tokenBalance = balanceCheckTx.tokens._map.get(tokenId.toString()) || 0;
  console.log(
    `- ${label} balance: ${tokenBalance} units of token ID ${tokenId}`
  );
}

// Example usage
// Configure your Hedera testnet client and accounts
if (!process.env.OPERATOR_ID || !process.env.OPERATOR_PVKEY) {
  console.error("Please set OPERATOR_ID and OPERATOR_PVKEY in your .env file.");
  process.exit(1);
}
const operatorId = AccountId.fromString(process.env.OPERATOR_ID); // Replace with your operator account ID
const operatorKey = PrivateKey.fromString(process.env.OPERATOR_PVKEY); // Replace with your operator private key
const treasuryKey = PrivateKey.generateECDSA();
const recipientKey = PrivateKey.generateECDSA();

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

(async function () {
  // Create treasury and recipient accounts
  const [treasuryId] = await createAccount(treasuryKey, 10, client);
  const [recipientId] = await createAccount(recipientKey, 10, client);

  // Call the function to create, mint, and transfer tokens
  await createMintAndTransferToken({
    client,
    treasuryId,
    treasuryKey,
    recipientId,
    recipientKey,
  });

  // Close the client connection
  await client.close();
  console.log("Client connection closed.");
})();
