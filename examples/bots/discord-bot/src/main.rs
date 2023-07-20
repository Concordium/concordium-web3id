use std::sync::Arc;

use clap::Parser;
use poise::serenity_prelude as serenity;
use reqwest::Url;

#[derive(clap::Parser, Debug)]
#[clap(arg_required_else_help(true))]
#[clap(version, author)]
struct App {
    #[clap(
        long = "token",
        help = "Discord bot API token.",
        env = "DISCORD_BOT_TOKEN"
    )]
    bot_token: String,
    #[clap(
        long = "log-level",
        default_value = "info",
        help = "Maximum log level.",
        env = "DISCORD_BOT_LOG_LEVEL"
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

struct BotConfig {
    verifier_url: Arc<Url>,
}
type Context<'a> = poise::Context<'a, BotConfig, anyhow::Error>;

// Note: The doc comment below defines what the user sees as a help message
/// Verify with Concordium
#[poise::command(slash_command, prefix_command)]
async fn verify(ctx: Context<'_>) -> anyhow::Result<()> {
    ctx.send(|reply| {
        reply
            .content("Please verify with your wallet.")
            .components(link_button(ctx.data().verifier_url.as_ref(), "Verify"))
            // Only the recipient can see the message
            .ephemeral(true)
    })
    .await?;
    Ok(())
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

    let cfg = BotConfig {
        verifier_url: Arc::new(app.verifier_url),
    };

    tracing::info!("Starting Discord bot...");

    let framework = poise::Framework::builder()
        .options(poise::FrameworkOptions {
            commands: vec![verify()],
            ..Default::default()
        })
        .token(app.bot_token)
        .intents(serenity::GatewayIntents::non_privileged())
        .setup(|ctx, _ready, framework| {
            Box::pin(async move {
                poise::builtins::register_globally(ctx, &framework.options().commands).await?;
                Ok(cfg)
            })
        });

    framework.run().await?;
    Ok(())
}

/// Creates a link button component for the given link with the given label.
fn link_button<'btn>(
    url: &'btn Url,
    label: impl ToString + 'btn,
) -> impl FnOnce(&mut serenity::CreateComponents) -> &mut serenity::CreateComponents + 'btn {
    move |comp| {
        comp.create_action_row(|row| {
            row.create_button(|button| {
                button
                    .label(label)
                    .style(serenity::ButtonStyle::Link)
                    .url(url)
            })
        })
    }
}
