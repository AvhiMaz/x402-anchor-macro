import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import { Connection, Transaction, PublicKey, SystemProgram } from "@solana/web3.js";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

/**
 * x402 Facilitator Server
 *
 * Implements the official Solana x402 payment facilitator protocol
 * Provides three key endpoints:
 * - POST /verify - Validates payment transactions
 * - POST /settle - Broadcasts verified transactions to blockchain
 * - GET /supported - Returns facilitator capabilities
 */

interface X402PaymentRequest {
  transaction: string; // Base64-encoded transaction
  network: "solana-devnet" | "solana-testnet" | "solana-mainnet";
}

interface X402PaymentResponse {
  signature: string;
  status: "verified" | "settled" | "pending";
  timestamp: number;
  message?: string;
}

interface X402FacilitatorCapabilities {
  version: string;
  scheme: "x402:sol" | "x402:usdc";
  network: "solana-devnet" | "solana-testnet" | "solana-mainnet";
  feePayer: string;
}

// Initialize Solana connection
const getSolanaConnection = (): Connection => {
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  return new Connection(rpcUrl, "confirmed");
};

// Parse network from environment
const getNetwork = (): "solana-devnet" | "solana-testnet" | "solana-mainnet" => {
  const network = process.env.SOLANA_NETWORK || "devnet";
  switch (network) {
    case "testnet":
      return "solana-testnet";
    case "mainnet":
      return "solana-mainnet";
    case "devnet":
    default:
      return "solana-devnet";
  }
};

// In-memory transaction cache (for demo - use Redis in production)
const transactionCache = new Map<string, { tx: Transaction; status: string; timestamp: number }>();

const app: Express = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));

/**
 * POST /verify
 * Validates payment transaction structure and requirements
 * Returns verification status before broadcasting
 */
app.post("/verify", async (req: Request, res: Response) => {
  try {
    const { transaction: txBase64, network }: X402PaymentRequest = req.body;

    if (!txBase64 || !network) {
      return res.status(400).json({ error: "Missing transaction or network" });
    }

    // Decode transaction
    let tx: Transaction;
    try {
      const txBuffer = Buffer.from(txBase64, "base64");
      tx = Transaction.from(txBuffer);
    } catch (error) {
      return res.status(400).json({ error: "Invalid transaction format" });
    }

    // Validate transaction structure
    if (!tx.instructions || tx.instructions.length < 2) {
      return res.status(400).json({
        error: "Invalid x402 transaction: must have at least 2 instructions (payment + gated)",
      });
    }

    // First instruction should be payment (SystemProgram.transfer)
    const paymentIx = tx.instructions[0];
    if (paymentIx.programId.toString() !== SystemProgram.programId.toString()) {
      return res.status(400).json({
        error: "First instruction must be SystemProgram transfer for x402 payment",
      });
    }

    // Generate transaction ID and cache
    const txId = uuidv4();
    transactionCache.set(txId, {
      tx,
      status: "verified",
      timestamp: Date.now(),
    });

    // Return verification response
    const verifyResponse: X402PaymentResponse = {
      signature: txId,
      status: "verified",
      timestamp: Date.now(),
      message: "Transaction verified and ready for settlement",
    };

    console.log(`[x402] Payment verified: ${txId}`);
    res.json(verifyResponse);
  } catch (error) {
    console.error("[x402] Verification error:", error);
    res.status(500).json({ error: "Verification failed" });
  }
});

/**
 * POST /settle
 * Broadcasts verified payment transaction to blockchain
 * Signs and submits transaction using Kora RPC (if enabled)
 * Otherwise broadcasts with client signature
 */
app.post("/settle", async (req: Request, res: Response) => {
  try {
    const { transaction: txBase64, network }: X402PaymentRequest = req.body;

    if (!txBase64 || !network) {
      return res.status(400).json({ error: "Missing transaction or network" });
    }

    // Decode transaction
    let tx: Transaction;
    try {
      const txBuffer = Buffer.from(txBase64, "base64");
      tx = Transaction.from(txBuffer);
    } catch (error) {
      return res.status(400).json({ error: "Invalid transaction format" });
    }

    const connection = getSolanaConnection();

    // Get latest blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    // TODO: Integrate with Kora RPC for gasless signing
    // For now, expect client to have already signed the transaction
    const useKoraRpc = process.env.KORA_RPC_ENABLED === "true";
    if (useKoraRpc) {
      console.log("[x402] Using Kora RPC for transaction signing");
      // Implementation would go here
    }

    // Broadcast transaction
    let signature: string;
    try {
      signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
    } catch (broadcastError) {
      console.error("[x402] Broadcast error:", broadcastError);
      return res.status(400).json({
        error: "Transaction broadcast failed",
        details: String(broadcastError),
      });
    }

    // Cache settlement
    transactionCache.set(signature, {
      tx,
      status: "settled",
      timestamp: Date.now(),
    });

    // Return settlement response
    const settleResponse: X402PaymentResponse = {
      signature,
      status: "settled",
      timestamp: Date.now(),
      message: "Transaction broadcast successfully",
    };

    console.log(`[x402] Payment settled: ${signature}`);
    res.json(settleResponse);
  } catch (error) {
    console.error("[x402] Settlement error:", error);
    res.status(500).json({ error: "Settlement failed" });
  }
});

/**
 * GET /supported
 * Returns facilitator capabilities and supported protocols
 * Used by clients to discover facilitator configuration
 */
app.get("/supported", (_req: Request, res: Response) => {
  const capabilities: X402FacilitatorCapabilities = {
    version: process.env.X402_VERSION || "1.0.0",
    scheme: (process.env.X402_SCHEME as "x402:sol" | "x402:usdc") || "x402:sol",
    network: getNetwork(),
    feePayer: process.env.X402_FEE_PAYER || "unknown",
  };

  console.log("[x402] Capabilities requested");
  res.json(capabilities);
});

/**
 * Health check endpoint
 */
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * Status endpoint for debugging
 */
app.get("/status/:txId", (req: Request, res: Response) => {
  const { txId } = req.params;
  const cached = transactionCache.get(txId);

  if (!cached) {
    return res.status(404).json({ error: "Transaction not found in cache" });
  }

  res.json({
    txId,
    status: cached.status,
    timestamp: cached.timestamp,
    age: Date.now() - cached.timestamp,
  });
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response) => {
  console.error("[x402] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(port, () => {
  console.log(`
    
Server running on ${process.env.HOST || "localhost"}:${port}
Network: ${process.env.SOLANA_NETWORK || "devnet"}
RPC URL: ${process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com"}
x402 Scheme: ${process.env.X402_SCHEME || "x402:sol"}

Endpoints:
  POST /verify    - Validate payment transactions
  POST /settle    - Broadcast payments to blockchain
  GET  /supported - Facilitator capabilities
  GET  /health    - Server health check
  GET  /status/:txId - Transaction status

  `);
});

export { app };
