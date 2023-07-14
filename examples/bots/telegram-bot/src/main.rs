use clap::Parser;
use reqwest::Url;
use serde::Serialize;
use teloxide::dispatching::UpdateHandler;
use teloxide::types::{InlineKeyboardButton, MessageKind, ReplyMarkup};
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
        long = "dapp-url",
        default_value = "http://127.0.0.1/",
        help = "URL of the verification dapp.",
        env = "CONCORDIA_DAPP_URL"
    )]
    dapp_url: Url,
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
    dapp_url: Url,
}

#[derive(Serialize, Debug)]
pub struct DappData {
    pub user_id: UserId,
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

    let bot = Bot::new(app.bot_token);
    let cfg = BotConfig {
        dapp_url: app.dapp_url,
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

    Update::filter_message()
        .branch(
            teloxide::filter_command::<Command, _>()
                .branch(case![Command::Start].endpoint(help))
                .branch(case![Command::Help].endpoint(help))
                .branch(case![Command::Verify].endpoint(verify))
                .branch(case![Command::Check].endpoint(check)),
        )
        .endpoint(other)
}

/// Handlers for the `/help` and `/start` commands
async fn help(bot: Bot, msg: Message) -> ResponseResult<()> {
    bot.send_message(msg.chat.id, Command::descriptions().to_string())
        .await?;
    Ok(())
}

/// Handler for the `/verify` command
async fn verify(cfg: BotConfig, bot: Bot, msg: Message) -> ResponseResult<()> {
    let verify_button =
        ReplyMarkup::inline_kb([[InlineKeyboardButton::url("Verify", cfg.dapp_url)]]);
    bot.send_message(msg.chat.id, "Please verify with your wallet.")
        .reply_markup(verify_button)
        .await?;

    Ok(())
}

/// Handler for the `/check` command. This must be used in reply to another message.
async fn check(bot: Bot, msg: Message) -> ResponseResult<()> {
    if let Some(target_msg) = msg.reply_to_message() {
        if let Some(target_user) = target_msg.from() {
            bot.send_message(
                msg.chat.id,
                format!("Debug: target user has id {}.", target_user.id),
            )
            .await?;
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
