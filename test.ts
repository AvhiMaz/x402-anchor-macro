import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";

async function test() {
  const connection = new Connection("https://api.devnet.solana.com");
  const payerPath = process.env.HOME + "/.config/solana/id.json";
  const payerData = JSON.parse(fs.readFileSync(payerPath, "utf-8"));
  const payer = Keypair.fromSecretKey(new Uint8Array(payerData));

  console.log("Payer:", payer.publicKey.toString());

  const balance = await connection.getBalance(payer.publicKey);
  console.log("Balance before:", (balance / 1e9).toFixed(9), "SOL");

  const developerTreasury = Keypair.generate();
  console.log("Developer Treasury:", developerTreasury.publicKey.toString());

  const paymentAmount = 1_000_000;

  const paymentIx = SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: developerTreasury.publicKey,
    lamports: paymentAmount,
  });

  const tx = new Transaction().add(paymentIx);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);

  console.log("Transaction:", sig);

  const finalBalance = await connection.getBalance(payer.publicKey);
  console.log("Balance after:", (finalBalance / 1e9).toFixed(9), "SOL");
  console.log("Spent:", ((balance - finalBalance) / 1e9).toFixed(9), "SOL");

  const treasuryBalance = await connection.getBalance(developerTreasury.publicKey);
  console.log("Treasury received:", (treasuryBalance / 1e9).toFixed(9), "SOL");
}

test().catch(err => {
  console.error(err.message);
  process.exit(1);
});
