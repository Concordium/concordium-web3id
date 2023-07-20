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

struct BotConfig {}
type Context<'a> = poise::Context<'a, BotConfig, anyhow::Error>;

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

    tracing::info!("Starting Discord bot...");

    let framework = poise::Framework::builder()
        .options(poise::FrameworkOptions {
            commands: vec![age()],
            ..Default::default()
        })
        .token(app.bot_token)
        .intents(serenity::GatewayIntents::non_privileged())
        .setup(|ctx, _ready, framework| {
            Box::pin(async move {
                poise::builtins::register_globally(ctx, &framework.options().commands).await?;
                Ok(BotConfig {})
            })
        });

    framework.run().await?;
    Ok(())
}

/// Displays your or another user's account creation date
#[poise::command(slash_command, prefix_command)]
async fn age(
    ctx: Context<'_>,
    #[description = "Selected user"] user: Option<serenity::User>,
) -> anyhow::Result<()> {
    let u = user.as_ref().unwrap_or_else(|| ctx.author());
    let response = format!("{}'s account was created at {}", u.name, u.created_at());
    ctx.say(response).await?;
    Ok(())
}
