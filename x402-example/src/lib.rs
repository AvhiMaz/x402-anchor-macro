#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use x402_macros::x402;

declare_id!("9xwTdtTvo4h1tZWakCz3JPSpi4ePht9VHzujtr2Dywb1");

#[program]
pub mod x402_example {
    use super::*;

    #[x402(price = 1_000_000)]
    pub fn premium_compute(ctx: Context<PremiumCompute>) -> Result<()> {
        ctx.accounts.result.owner = ctx.accounts.payer.key();
        ctx.accounts.result.value = 42;
        ctx.accounts.result.paid = true;

        emit!(ComputeEvent {
            payer: ctx.accounts.payer.key(),
            result: 42,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    #[x402(price = 5_000_000)]
    pub fn standard_compute(ctx: Context<PremiumCompute>) -> Result<()> {
        ctx.accounts.result.owner = ctx.accounts.payer.key();
        ctx.accounts.result.value = 100;
        ctx.accounts.result.paid = true;

        emit!(ComputeEvent {
            payer: ctx.accounts.payer.key(),
            result: 100,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    #[x402(price = 50_000_000)]
    pub fn enterprise_compute(ctx: Context<PremiumCompute>) -> Result<()> {

        ctx.accounts.result.owner = ctx.accounts.payer.key();
        ctx.accounts.result.value = 1000;
        ctx.accounts.result.paid = true;

        emit!(ComputeEvent {
            payer: ctx.accounts.payer.key(),
            result: 1000,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
    pub fn free_compute(ctx: Context<FreeCompute>) -> Result<()> {
        ctx.accounts.result.owner = ctx.accounts.payer.key();
        ctx.accounts.result.value = 0;
        ctx.accounts.result.paid = false;

        Ok(())
    }

    pub fn verify_payment(ctx: Context<VerifyPayment>) -> Result<()> {
        let required_lamports = 1_000_000u64;

        if ctx.accounts.payer.lamports() < required_lamports {
            return Err(error!(ErrorCode::InsufficientPayment));
        }

        Ok(())
    }
    pub fn record_payment(ctx: Context<RecordPayment>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidPaymentAmount);

        ctx.accounts.payment_ledger.total_payments += 1;
        ctx.accounts.payment_ledger.total_amount += amount;
        ctx.accounts.payment_ledger.last_payment = Clock::get()?.unix_timestamp;

        emit!(PaymentRecordedEvent {
            payer: ctx.accounts.payer.key(),
            amount,
            total_payments: ctx.accounts.payment_ledger.total_payments,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct PremiumCompute<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 8 + 1
    )]
    pub result: Account<'info, ComputeResult>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FreeCompute<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 8 + 1
    )]
    pub result: Account<'info, ComputeResult>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyPayment<'info> {
    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct X402Pay<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub payment_recipient: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordPayment<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + 32 + 8 + 8 + 8,
        seeds = [b"payment_ledger", payer.key().as_ref()],
        bump
    )]
    pub payment_ledger: Account<'info, PaymentLedger>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct ComputeResult {
    pub owner: Pubkey,
    pub value: u64,
    pub paid: bool,
}

#[account]
pub struct PaymentLedger {
    pub payer: Pubkey,
    pub total_payments: u64,
    pub total_amount: u64,
    pub last_payment: i64,
}

#[event]
pub struct ComputeEvent {
    pub payer: Pubkey,
    pub result: u64,
    pub timestamp: i64,
}

#[event]
pub struct X402PaymentEvent {
    pub payer: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct PaymentRecordedEvent {
    pub payer: Pubkey,
    pub amount: u64,
    pub total_payments: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient payment for x402 access")]
    InsufficientPayment,
    #[msg("Invalid payment amount")]
    InvalidPaymentAmount,
    #[msg("Payment recipient not valid")]
    InvalidPaymentRecipient,
    #[msg("Payment verification failed")]
    PaymentVerificationFailed,
    #[msg("Insufficient balance for payment")]
    InsufficientBalance,
}
