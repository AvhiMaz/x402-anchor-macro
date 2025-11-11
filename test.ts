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

  // User triggers their program function with #[x402(price = ..., address = "...")]
  // The macro automatically validates the payment inside
  // User provides their own address and price in the macro \

  const paymentRecipient = new PublicKey("ESPyXCB93a6CvrAE2btofpgXAswf4oE3NuziBsHVCAZa");
  const paymentAmount = 1_000_000;

  const paymentIx = SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: paymentRecipient,
    lamports: paymentAmount,
  });

  const tx = new Transaction().add(paymentIx);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);

  console.log("Transaction:", sig);

  const finalBalance = await connection.getBalance(payer.publicKey);
  console.log("Balance after:", (finalBalance / 1e9).toFixed(9), "SOL");
  console.log("Spent:", ((balance - finalBalance) / 1e9).toFixed(9), "SOL");

  const recipientBalance = await connection.getBalance(paymentRecipient);
  console.log("Recipient received:", (recipientBalance / 1e9).toFixed(9), "SOL");
}

test().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
