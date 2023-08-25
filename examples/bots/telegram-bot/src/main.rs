use std::sync::Arc;
use std::time::Duration;

use anyhow::Context;
use clap::Parser;
use concordium_rust_sdk::contract_client::CredentialStatus;
use reqwest::Url;
use some_verifier_lib::{Platform, Verification};
use teloxide::dispatching::UpdateHandler;
use teloxide::types::{InlineKeyboardButton, MessageKind, ParseMode, ReplyMarkup, User};
use teloxide::utils::markdown;
use teloxide::RequestError;
use teloxide::{prelude::*, utils::command::BotCommands};

#[derive(clap::Parser, Debug)]
#[clap(arg_required_else_help(true))]
#[clap(version, author)]
struct App {
    #[clap(
        long = "token",
        help = "Telegram bot API token.",
        env = "TELEGRAM_BOT_TOKEN"
    )]
    bot_token: String,
    #[clap(
        long = "log-level",
        default_value = "info",
        help = "Maximum log level.",
        env = "TELEGRAM_BOT_LOG_LEVEL"
    )]
    log_level: tracing_subscriber::filter::LevelFilter,
    #[clap(
        long = "request-timeout",
        help = "Request timeout in milliseconds.",
        default_value = "5000",
        env = "TELEGRAM_BOT_REQUEST_TIMEOUT"
    )]
    request_timeout: u64,
    #[clap(
        long = "verifier-url",
        default_value = "http://127.0.0.1/",
        help = "URL of the SoMe verifier.",
        env = "TELEGRAM_BOT_VERIFIER_URL"
    )]
    verifier_url: Url,
}

#[derive(BotCommands, Clone)]
#[command(
    rename_rule = "lowercase",
    description = "The following commands are supported:"
)]
enum Command {
    #[command(description = "start a new chat.")]
    Start,
    #[command(description = "show available commands.")]
    Help,
    #[command(description = "verify with Concordia.")]
    Verify,
    #[command(description = "use in reply to a message, checks if account is verified.")]
    Check,
}

#[derive(Clone)]
struct BotConfig {
    verifier_url: Arc<Url>,
    client: reqwest::Client,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let app = App::parse();

    {
        use tracing_subscriber::prelude::*;
        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer())
            .with(app.log_level)
            .init();
    }

    tracing::info!("Starting Telegram bot...");

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(app.request_timeout))
        .build()
        .context("Failed to start HTTP server.")?;

    let bot = Bot::new(app.bot_token);
    let cfg = BotConfig {
        verifier_url: Arc::new(app.verifier_url),
        client,
    };
    bot.set_my_commands(Command::bot_commands()).await?;

    Dispatcher::builder(bot, schema())
        .dependencies(dptree::deps![cfg])
        .error_handler(LoggingErrorHandler::with_custom_text(
            "An error has occurred in the dispatcher",
        ))
        .enable_ctrlc_handler()
        .build()
        .dispatch()
        .await;

    Ok(())
}

fn schema() -> UpdateHandler<RequestError> {
    use dptree::case;
    let command_handler = teloxide::filter_command::<Command, _>()
        .branch(case![Command::Start].endpoint(help))
        .branch(case![Command::Help].endpoint(help))
        .branch(case![Command::Verify].endpoint(verify))
        .branch(case![Command::Check].endpoint(check));

    Update::filter_message()
        .branch(command_handler)
        .endpoint(other)
}

/// Handlers for the `/help` and `/start` commands.
async fn help(bot: Bot, msg: Message) -> ResponseResult<()> {
    bot.send_message(msg.chat.id, Command::descriptions().to_string())
        .await?;
    Ok(())
}

/// Handler for the `/verify` command.
async fn verify(cfg: BotConfig, bot: Bot, msg: Message) -> ResponseResult<()> {
    let dapp_url = cfg.verifier_url.as_ref().clone();
    let verify_button = ReplyMarkup::inline_kb([[InlineKeyboardButton::url("Verify", dapp_url)]]);
    bot.send_message(msg.chat.id, "Please verify with your wallet.")
        .reply_markup(verify_button)
        .await?;

    Ok(())
}

/// Handler for the `/check` command. This must be used in reply to another message.
async fn check(cfg: BotConfig, bot: Bot, msg: Message) -> ResponseResult<()> {
    if let Some(target_msg) = msg.reply_to_message() {
        if let Some(target_user) = target_msg.from() {
            check_user(cfg, bot, &msg, target_user).await?;
        } else {
            bot.send_message(msg.chat.id, "/check can not be used in channels.")
                .await?;
        }
    } else {
        bot.send_message(msg.chat.id, "Usage: reply /check to a message.")
            .await?;
    }

    Ok(())
}

/// Checks the verification status of a given user and sends a message with the result.
async fn check_user(
    cfg: BotConfig,
    bot: Bot,
    msg: &Message,
    target_user: &User,
) -> ResponseResult<()> {
    match get_verification(cfg, target_user.id).await {
        Ok(verification) => {
            // The message will be formatted with MarkdownV2 (https://core.telegram.org/bots/api#markdownv2-style)
            // Therefore, we need to escape all reserved characters and arbitrary strings
            let name = target_user
                .mention()
                .unwrap_or(markdown::escape(&target_user.full_name()));
            let accounts = verification.accounts;

            let telegram_status = accounts
                .iter()
                .find(|acc| acc.platform == Platform::Telegram)
                .map(|acc| acc.cred_status);

            let message = match telegram_status {
                None => format!("{name} is not verified with Concordia\\."),
                Some(CredentialStatus::Expired) => {
                    format!("{name} is not verified with Concordia: Verification has expired\\.")
                }
                Some(CredentialStatus::NotActivated) => {
                    format!(
                        "{name} is not verified with Concordia: Verification is not yet active\\."
                    )
                }
                Some(CredentialStatus::Revoked) => {
                    format!("{name} is not verified with Concordia: Verification was revoked\\.")
                }
                Some(CredentialStatus::Active) => {
                    let mut message = format!("{name} is verified with Concordia\\.");
                    if let Some(full_name) = verification.full_name {
                        let full_name = markdown::escape(&full_name.to_string());
                        message.push_str(&format!("\n• Real name: {full_name}"));
                    }
                    for account in accounts
                        .into_iter()
                        .filter(|acc| acc.platform != Platform::Telegram)
                    {
                        message.push_str("\n• ");
                        match account.cred_status {
                            CredentialStatus::Active => {
                                message.push_str(&format!(
                                    "{}: {}",
                                    account.platform,
                                    markdown::escape(&account.username)
                                ));
                            }
                            _ => message.push_str(&format!(
                                "~{}: {}~ \\[{}\\]",
                                account.platform,
                                markdown::escape(&account.username),
                                account.cred_status
                            )),
                        }
                    }
                    message
                }
            };

            bot.send_message(msg.chat.id, message)
                .parse_mode(ParseMode::MarkdownV2)
                .reply_to_message_id(msg.id)
                .await?;
        }
        Err(err) => tracing::error!("{err}"),
    }

    Ok(())
}

/// Fallback handler.
async fn other(bot: Bot, msg: Message) -> ResponseResult<()> {
    // If not direct message to bot
    if !matches!(msg.kind, MessageKind::Common(_)) || !msg.chat.is_private() {
        return Ok(());
    }

    bot.send_message(
        msg.chat.id,
        "Unrecognized command, type /help to see available commands.",
    )
    .await?;
    Ok(())
}

async fn get_verification(cfg: BotConfig, id: UserId) -> anyhow::Result<Verification> {
    let url = cfg
        .verifier_url
        .join("verifications/telegram/")
        .expect("URLs can be joined with a string path")
        .join(&id.to_string())
        .expect("URLs can be joined with a UserId");
    Ok(cfg.client.get(url).send().await?.json().await?)
}
