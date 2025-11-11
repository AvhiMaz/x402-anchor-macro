# x402-anchor-macros

A Solana blockchain payment-gating framework that implements the **x402 (Payment for Services) protocol** for Anchor programs. This project enables developers to gate program functionality behind payments with minimal code changes.

## Overview

x402-anchor-macros provides:
- **Procedural macro** (`#[x402]`) for declarative payment gating in Anchor programs
- **Example Anchor program** demonstrating tiered pricing and payment tracking
- **Payment facilitator server** implementing the x402 protocol for transaction verification and settlement

The framework adapts the x402 specification (a standard payment protocol for web services) to the Solana blockchain, enabling atomic payment + function execution within a single transaction.

## Project Structure

```
x402-anchor-macros/
├── x402-macros/          # Rust procedural macro for payment gating
├── x402-example/         # Example Anchor program with gated functions
├── x402-facilitator/     # TypeScript payment facilitator server
└── test.ts               # Payment validation test script
```

## Components

### 1. x402-macros (Procedural Macro)

The core macro library that generates payment validation code.

**Usage:**
```rust
use x402_macros::x402;

#[x402(price = 1_000_000, address = "YOUR_WALLET")]
pub fn premium_compute(ctx: Context<ComputeContext>) -> Result<()> {
    // Your gated logic here
    Ok(())
}
```

**How it works:**
1. Extracts payment configuration (price, recipient address, optional facilitator fee)
2. Generates code that validates the previous instruction in the transaction
3. Confirms the previous instruction was a payment transfer with sufficient lamports/tokens
4. Verifies the payment recipient matches the configured address
5. Returns errors if validation fails

**Configuration Parameters:**
- `price` - Required lamports/tokens for access
- `address` - Recipient wallet address for payments
- `facilitator_fee` (optional) - Fee distributed to payment facilitator
- `token` (optional) - Mint address for token-based payments (defaults to SOL)

### 2. x402-example (Example Program)

A reference Anchor program demonstrating the payment-gating framework.

**Gated Functions:**
- `premium_compute()` - 1M lamports (0.001 SOL)
- `standard_compute()` - 5M lamports (0.005 SOL)
- `enterprise_compute()` - 50M lamports (0.05 SOL)
- `free_compute()` - No payment required (demonstrates non-gated function)

**Payment Utilities:**
- `verify_payment()` - Manual payment verification with ledger recording
- `record_payment()` - On-chain payment history tracking

**Key Account Structures:**
- `ComputeResult` - Stores computation results with owner tracking
- `PaymentLedger` - Maintains payment history per user

**Error Codes:**
- `InsufficientPayment` - User hasn't paid the required amount
- `InvalidPaymentAmount` - Payment amount doesn't match expected value
- `InvalidPaymentRecipient` - Payment was sent to wrong address
- `PaymentVerificationFailed` - Payment validation logic failed
- `InsufficientBalance` - Account lacks required balance

### 3. x402-facilitator (Payment Server)

A TypeScript/Express.js server implementing the x402 payment facilitator protocol.

**REST Endpoints:**

#### `POST /verify`
Validates and caches a payment transaction.

Request:
```json
{
  "transaction": "base64_encoded_transaction"
}
```

Response:
```json
{
  "status": "verified",
  "txId": "uuid-transaction-id",
  "age": 0
}
```

#### `POST /settle`
Broadcasts a verified transaction to the Solana network.

Request:
```json
{
  "txId": "uuid-transaction-id"
}
```

Response:
```json
{
  "signature": "solana_transaction_signature",
  "status": "settled"
}
```

#### `GET /supported`
Returns facilitator capabilities and configuration.

Response:
```json
{
  "version": "1.0.0",
  "scheme": "x402:sol",
  "network": "devnet",
  "feePayer": "wallet_pubkey"
}
```

#### `GET /health`
Health check endpoint.

#### `GET /status/:txId`
Check status of a cached transaction.

**Configuration (.env):**
```
PORT=3000
HOST=localhost
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet
X402_VERSION=1.0.0
X402_SCHEME=x402:sol
X402_FEE_PAYER=<your_wallet_pubkey>
KORA_RPC_ENABLED=false
```

## How It Works

1. **Developer** decorates an Anchor function with `#[x402]` macro
2. **Client** constructs a transaction with:
   - Payment instruction (SystemProgram transfer to recipient)
   - Gated function instruction
3. **Client** sends transaction to facilitator `/verify` endpoint
4. **Facilitator** validates transaction structure and caches it
5. **Client** calls `/settle` to broadcast to Solana
6. **Solana validator** executes both instructions atomically:
   - Payment instruction transfers lamports/tokens
   - Gated function instruction runs
   - Macro-generated code confirms payment was received
   - Function executes if payment is valid, errors if not

## Getting Started

### Prerequisites
- Rust 1.70+ (for macros and example program)
- Node.js 18+ (for facilitator server)
- Solana CLI tools
- Anchor framework

### Building

**Macro and Example Program:**
```bash
cargo build
```

**Facilitator Server:**
```bash
cd x402-facilitator
npm install
npm run build
```

### Development

**Run Tests:**
```bash
cargo test
```

**Start Facilitator Server:**
```bash
cd x402-facilitator
npm run dev
```

**Deploy Example Program to Devnet:**
```bash
anchor deploy --provider.cluster devnet
```

## Usage Example

### In Your Anchor Program

```rust
use anchor_lang::prelude::*;
use x402_macros::x402;

#[program]
pub mod my_program {
    use super::*;

    #[x402(price = 5_000_000, address = "YOUR_WALLET_HERE")]
    pub fn premium_feature(ctx: Context<MyContext>) -> Result<()> {
        // Your premium logic - only executes if payment received
        msg!("Processing premium feature...");
        Ok(())
    }
}
```

### From a Client

```typescript
import * as web3 from "@solana/web3.js";

// 1. Create transaction with payment + function call
const transaction = new web3.Transaction();
transaction.add(
  web3.SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: recipientAddress,
    lamports: 5_000_000,
  })
);
// Add your gated function instruction here

// 2. Verify with facilitator
const verifyResponse = await fetch("http://localhost:3000/verify", {
  method: "POST",
  body: JSON.stringify({
    transaction: transaction.serialize().toString("base64"),
  }),
});
const { txId } = await verifyResponse.json();

// 3. Settle the transaction
const settleResponse = await fetch("http://localhost:3000/settle", {
  method: "POST",
  body: JSON.stringify({ txId }),
});
const { signature } = await settleResponse.json();
```

## Architecture

### Payment Validation Flow

```
Client Transaction
    ↓
    ├─ Instruction 1: Transfer payment to recipient
    └─ Instruction 2: Call gated function
    ↓
Facilitator /verify
    ├─ Validate transaction structure
    ├─ Cache verified transaction
    └─ Return txId
    ↓
Facilitator /settle
    ├─ Get latest blockhash
    ├─ Broadcast to Solana
    └─ Return signature
    ↓
Solana Validator Execution
    ├─ Execute payment instruction
    ├─ Execute gated function
    │   └─ Macro code validates prior payment
    └─ Return result
```

### Macro Implementation Details

The `#[x402]` macro:
1. Reads macro arguments (price, address, etc.)
2. Accesses the Solana instruction sysvar
3. Inspects the previous instruction in the transaction
4. Verifies it's a SystemProgram/Token transfer with sufficient amount
5. Confirms recipient address matches configuration
6. Allows function execution if validation passes
7. Returns custom error if payment is missing or invalid

## Security Considerations

- **Atomic Execution**: Payment and function call execute in same transaction
- **Address Validation**: Confirms payments go to intended recipient
- **Amount Verification**: Ensures minimum payment requirements are met
- **Instruction History**: Uses Solana's sysvar to inspect transaction history
- **No Replay Attacks**: Each transaction has unique blockhash

## Technologies

- **Solana** - Blockchain platform
- **Anchor** - Framework for Solana program development
- **Rust** - Systems programming language (macros, smart contracts)
- **TypeScript** - Payment facilitator server
- **Express.js** - HTTP server framework
- **Web3.js** - JavaScript client library for Solana

## License

[Add your license here]

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues, questions, or feedback, please open an issue on the repository.
