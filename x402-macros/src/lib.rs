use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, ItemFn};

#[proc_macro_attribute]
pub fn x402(args: TokenStream, input: TokenStream) -> TokenStream {
    let input_fn = parse_macro_input!(input as ItemFn);
    let args_str = args.to_string();

    let price = extract_price(&args_str).unwrap_or(1_000_000);
    let _token = extract_token(&args_str)
        .unwrap_or_else(|| "11111111111111111111111111111111".to_string());
    let _facilitator_fee = extract_facilitator_fee(&args_str).unwrap_or(0);
    let _recipient = extract_recipient(&args_str);

    let vis = &input_fn.vis;
    let sig = &input_fn.sig;
    let body = &input_fn.block;

    let expanded = quote! {
        #vis #sig {
            {
                const X402_REQUIRED_AMOUNT: u64 = #price;

                use anchor_lang::solana_program::sysvar::instructions;
                use anchor_lang::solana_program::program_error::ProgramError;

                let ix_sysvar = match ctx.remaining_accounts.iter()
                    .find(|a| a.key() == instructions::ID) {
                    Some(acc) => acc,
                    None => return Err(ProgramError::InvalidArgument.into()),
                };

                let current_ix_index = match instructions::load_current_index_checked(ix_sysvar) {
                    Ok(idx) => idx,
                    Err(_) => return Err(ProgramError::InvalidArgument.into()),
                };

                if current_ix_index == 0 {
                    return Err(ProgramError::InvalidArgument.into());
                }

                let previous_ix = match instructions::load_instruction_at_checked(
                    (current_ix_index as usize) - 1,
                    ix_sysvar
                ) {
                    Ok(ix) => ix,
                    Err(_) => return Err(ProgramError::InvalidArgument.into()),
                };

                let payment_amount = if previous_ix.data.len() >= 16 {
                    let mut amount_bytes = [0u8; 8];
                    amount_bytes.copy_from_slice(&previous_ix.data[8..16]);
                    u64::from_le_bytes(amount_bytes)
                } else if previous_ix.data.len() == 8 {
                    let mut amount_bytes = [0u8; 8];
                    amount_bytes.copy_from_slice(&previous_ix.data[0..8]);
                    u64::from_le_bytes(amount_bytes)
                } else {
                    return Err(ProgramError::InvalidArgument.into());
                };

                if payment_amount < X402_REQUIRED_AMOUNT {
                    return Err(ProgramError::InsufficientFunds.into());
                }

                let expected_recipient = anchor_lang::solana_program::pubkey!("ESPyXCB93a6CvrAE2btofpgXAswf4oE3NuziBsHVCAZa");
                let payment_recipient = previous_ix.accounts.get(1).map(|acc| acc.pubkey);

                if payment_recipient != Some(expected_recipient) {
                    return Err(ProgramError::InvalidArgument.into());
                }
            }

            #body
        }
    };

    TokenStream::from(expanded)
}

fn extract_price(args: &str) -> Option<u64> {
    let price_str = args
        .split("price")
        .nth(1)?
        .split('=')
        .nth(1)?
        .trim()
        .split(',')
        .next()?
        .trim();

    price_str.parse().ok()
}

fn extract_token(args: &str) -> Option<String> {
    let token_str = args
        .split("token")
        .nth(1)?
        .split('=')
        .nth(1)?
        .trim()
        .split(',')
        .next()?
        .trim()
        .trim_matches('"')
        .to_string();

    Some(token_str)
}

fn extract_facilitator_fee(args: &str) -> Option<u8> {
    let fee_str = args
        .split("facilitator_fee")
        .nth(1)?
        .split('=')
        .nth(1)?
        .trim()
        .split(',')
        .next()?
        .trim();

    fee_str.parse().ok()
}

fn extract_recipient(args: &str) -> Option<String> {
    let recipient_str = args
        .split("recipient")
        .nth(1)?
        .split('=')
        .nth(1)?
        .trim()
        .split(',')
        .next()?
        .trim()
        .trim_matches('"')
        .to_string();

    Some(recipient_str)
}
