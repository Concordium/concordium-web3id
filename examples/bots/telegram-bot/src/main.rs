use std::sync::Arc;

use clap::Parser;
use reqwest::Url;
use some_verifier_lib::{Platform, Verification};
use teloxide::dispatching::UpdateHandler;
use teloxide::types::{InlineKeyboardButton, MessageKind, ReplyMarkup, User};
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
        long = "verifier-url",
        default_value = "http://127.0.0.1:8080/",
        help = "URL of the SoMe verifier.",
        env = "SOME_VERIFIER_URL"
    )]
    verifier_url: Url,
}

#[derive(BotCommands, Clone)]
#[command(
    rename_rule = "lowercase",
    description = "These commands are supported:"
)]
enum Command {
    #[command(description = "start a new chat.")]
    Start,
    #[command(description = "show available commands.")]
    Help,
    #[command(description = "verify your Telegram account.")]
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

    let client = reqwest::Client::new();
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
    match get_verifications(cfg, target_user.id).await {
        Ok(verifications) => {
            let name = target_user.mention().unwrap_or(target_user.full_name());
            let reply = if verifications.is_empty() {
                format!("{name} is not verified with Concordium.")
            } else {
                let mut reply = format!("{name} is verified with Concordium.");
                for verification in verifications
                    .into_iter()
                    .filter(|v| v.platform != Platform::Telegram && !v.revoked)
                {
                    reply.push_str(&format!(
                        "\n- {}: {}",
                        verification.platform, verification.username
                    ));
                }
                reply
            };
            bot.send_message(msg.chat.id, reply)
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

async fn get_verifications(cfg: BotConfig, id: UserId) -> anyhow::Result<Vec<Verification>> {
    let url = cfg
        .verifier_url
        .join("verifications/telegram/")
        .expect("URLs can be joined with a string path")
        .join(&id.to_string())
        .expect("URLs can be joined with a UserId");
    Ok(cfg.client.get(url).send().await?.json().await?)
}
