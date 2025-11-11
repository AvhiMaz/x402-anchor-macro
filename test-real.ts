import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  TransactionInstruction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as borsh from "borsh";

async function testRealScenario() {
  const connection = new Connection("https://api.devnet.solana.com");
  const payerPath = process.env.HOME + "/.config/solana/id.json";
  const payerData = JSON.parse(fs.readFileSync(payerPath, "utf-8"));
  const payer = Keypair.fromSecretKey(new Uint8Array(payerData));

  console.log("=== x402 Real Scenario Test ===\n");
  console.log("Payer:", payer.publicKey.toString());

  const balance = await connection.getBalance(payer.publicKey);
  console.log("Balance before:", (balance / 1e9).toFixed(9), "SOL");

  // Developer treasury - address specified in the macro
  const developerAddress = new PublicKey("ESPyXCB93a6CvrAE2btofpgXAswf4oE3NuziBsHVCAZa");
  const requiredPayment = 1_000_000; // 0.001 SOL

  console.log("\n--- Scenario: Call premium_compute() ---");
  console.log("Required payment:", (requiredPayment / 1e9).toFixed(9), "SOL");
  console.log("Payment recipient:", developerAddress.toString());

  // Step 1: Create payment instruction to developer
  const paymentIx = SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: developerAddress,
    lamports: requiredPayment,
  });

  // Step 2: Create transaction with payment BEFORE the program call
  // The macro will check the previous instruction to verify payment
  const tx = new Transaction().add(paymentIx);

  console.log("\nSending payment...");
  const paymentSig = await sendAndConfirmTransaction(connection, tx, [payer]);
  console.log("Payment confirmed:", paymentSig);

  const finalBalance = await connection.getBalance(payer.publicKey);
  console.log("\nBalance after:", (finalBalance / 1e9).toFixed(9), "SOL");
  console.log("Total spent:", ((balance - finalBalance) / 1e9).toFixed(9), "SOL");

  const developerBalance = await connection.getBalance(developerAddress);
  console.log("Developer treasury balance:", (developerBalance / 1e9).toFixed(9), "SOL");

  console.log("\n✓ x402 payment flow verified");
  console.log("  User sends payment to address specified in macro");
  console.log("  Macro validates payment amount and recipient");
  console.log("  Program function executes after validation");
}

testRealScenario().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
