use anyhow::Context;
use clap::Parser;
use concordium_rust_sdk::contract_client::CredentialStatus;
use reqwest::Url;
use some_verifier_lib::{Platform, Verification};
use std::{sync::Arc, time::Duration};
use teloxide::{
    dispatching::UpdateHandler,
    prelude::*,
    types::{InlineKeyboardButton, MessageKind, ParseMode, ReplyMarkup, User},
    utils::{command::BotCommands, markdown},
    RequestError,
};

#[derive(clap::Parser, Debug)]
#[clap(arg_required_else_help(true))]
#[clap(version, author)]
struct App {
    #[clap(
        long = "token",
        help = "Telegram bot API token.",
        env = "TELEGRAM_BOT_TOKEN"
    )]
    bot_token:       String,
    #[clap(
        long = "log-level",
        default_value = "info",
        help = "Maximum log level.",
        env = "TELEGRAM_BOT_LOG_LEVEL"
    )]
    log_level:       tracing_subscriber::filter::LevelFilter,
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
    verifier_url:    Url,
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
    #[command(description = "get verified with Concordia.")]
    Verify,
    #[command(
        description = "check if the sender of a message is verified. Must be used in reply to a \
                       message."
    )]
    Check,
}

#[derive(Clone)]
struct BotConfig {
    verifier_url: Arc<Url>,
    client:       reqwest::Client,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let app = App::parse();

    {
        use tracing_subscriber::prelude::*;
        let log_filter = tracing_subscriber::filter::Targets::new()
            .with_target(module_path!(), app.log_level)
            .with_target("teloxide", app.log_level);
        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer())
            .with(log_filter)
            .init();
    }

    tracing::info!("Starting Telegram bot...");

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(app.request_timeout))
        .connect_timeout(Duration::from_secs(5))
        .build()
        .context("Failed to start HTTP server.")?;

    // The bot creates a new network client (to talk to the Telegram API) with a
    // connect timeout of 5s and request timeout of 17s.
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
#[tracing::instrument(level = "debug", skip_all)]
async fn help(bot: Bot, msg: Message) -> ResponseResult<()> {
    let response = format!(
        "Concordia version {}.\n\n{}",
        env!("CARGO_PKG_VERSION"),
        Command::descriptions()
    );
    bot.send_message(msg.chat.id, response).await?;
    Ok(())
}

/// Handler for the `/verify` command.
#[tracing::instrument(level = "debug", skip_all)]
async fn verify(cfg: BotConfig, bot: Bot, msg: Message) -> ResponseResult<()> {
    tracing::debug!("Handling verify for msg {msg:?}");
    let dapp_url = cfg.verifier_url.as_ref().clone();
    let verify_button = ReplyMarkup::inline_kb([[InlineKeyboardButton::url("Verify", dapp_url)]]);
    bot.send_message(msg.chat.id, "Please verify with your wallet.")
        .reply_markup(verify_button)
        .await?;

    Ok(())
}

/// Handler for the `/check` command. This must be used in reply to another
/// message.
#[tracing::instrument(level = "debug", skip_all)]
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

/// Checks the verification status of a given user and sends a message with the
/// result.
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
            let mut mention = markdown::user_mention_or_link(target_user);
            if mention.starts_with('@') {
                mention = markdown::escape(&mention);
            }
            let accounts = verification.accounts;

            let telegram_status = accounts
                .iter()
                .find(|acc| acc.platform == Platform::Telegram)
                .map(|acc| acc.cred_status);

            let message = match telegram_status {
                Some(CredentialStatus::Active) => {
                    let mut message = format!("{mention} is verified with Concordia\\.");
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
                            status => message.push_str(&format!(
                                "~{}: {}~ \\({}\\)",
                                account.platform,
                                markdown::escape(&account.username),
                                credential_status_msg(status)
                            )),
                        }
                    }
                    message
                }
                Some(status) => {
                    format!(
                        "{mention} is not verified with Concordia \\({}\\)\\.",
                        credential_status_msg(status)
                    )
                }
                None => format!("{mention} is not verified with Concordia\\."),
            };

            bot.send_message(msg.chat.id, message)
                .parse_mode(ParseMode::MarkdownV2)
                .reply_to_message_id(msg.id)
                .await?;
        }
        Err(err) => {
            tracing::error!("Error accessing the verifier: {err}");
            // In this case the verifier service is unavailable, so we tell the user that
            // their request was received, but we could not handle it.
            bot.send_message(
                msg.chat.id,
                "_Sorry\\. Unable to check verification\\. Try again later\\._",
            )
            .parse_mode(ParseMode::MarkdownV2)
            .await?;
        }
    }
    Ok(())
}

fn credential_status_msg(status: CredentialStatus) -> &'static str {
    match status {
        CredentialStatus::Active => "Credential active",
        CredentialStatus::Revoked => "Credential revoked",
        CredentialStatus::Expired => "Credential expired",
        CredentialStatus::NotActivated => "Credential not yet active",
    }
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
        .join("verifications/telegram/")?
        .join(&id.to_string())?;
    Ok(cfg.client.get(url).send().await?.json().await?)
}
