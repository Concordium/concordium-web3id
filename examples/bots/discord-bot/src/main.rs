use clap::Parser;
use poise::serenity_prelude::{self as serenity, Mentionable};
use reqwest::Url;
use some_verifier_lib::{Platform, Verification};

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
    verifier_url: Url,
    client: reqwest::Client,
}
type Context<'a> = poise::Context<'a, BotConfig, anyhow::Error>;

// Note: The doc comments of the commands below define what the user sees as a help message
/// Displays the list of commands
#[poise::command(slash_command, prefix_command)]
async fn help(
    ctx: Context<'_>,
    #[description = "Specific command to show help about"]
    #[autocomplete = "poise::builtins::autocomplete_command"]
    command: Option<String>,
) -> anyhow::Result<()> {
    poise::builtins::help(
        ctx,
        command.as_deref(),
        poise::builtins::HelpConfiguration::default(),
    )
    .await?;
    Ok(())
}

/// Verify with Concordium
#[poise::command(slash_command, prefix_command)]
async fn verify(ctx: Context<'_>) -> anyhow::Result<()> {
    ctx.send(|reply| {
        reply
            .content("Please verify with your wallet.")
            .components(link_button(&ctx.data().verifier_url, "Verify"))
            // Only the recipient can see the message
            .ephemeral(true)
    })
    .await?;
    Ok(())
}

/// Checks the verification status of a user
#[poise::command(slash_command, prefix_command)]
async fn check(
    ctx: Context<'_>,
    #[description = "Selected user"] user: serenity::User,
) -> anyhow::Result<()> {
    match get_verifications(ctx.data(), user.id).await {
        Ok(verifications) => {
            let mention = user.mention();
            let message = if verifications.is_empty() {
                format!("{mention} is not verified with Concordium.")
            } else {
                let mut message = format!("{mention} is verified with Concordium.");
                for verification in verifications
                    .into_iter()
                    .filter(|v| v.platform != Platform::Discord && !v.revoked)
                {
                    message.push_str(&format!(
                        "\n- {}: {}",
                        verification.platform, verification.username
                    ));
                }
                message
            };
            // .ephemeral(true) means only the recipient can see the message
            ctx.send(|reply| reply.content(message).ephemeral(true))
                .await?;
        }
        Err(err) => tracing::error!("{err}"),
    }

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
        verifier_url: app.verifier_url,
        client: reqwest::Client::new(),
    };

    tracing::info!("Starting Discord bot...");

    let framework = poise::Framework::builder()
        .options(poise::FrameworkOptions {
            commands: vec![help(), verify(), check()],
            ..Default::default()
        })
        .token(app.bot_token)
        .intents(serenity::GatewayIntents::non_privileged())
        .setup(|ctx, _ready, framework| {
            Box::pin(async move {
                // Register the commands so that users can autocomplete them
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

async fn get_verifications(
    cfg: &BotConfig,
    id: serenity::UserId,
) -> anyhow::Result<Vec<Verification>> {
    let url = cfg
        .verifier_url
        .join("verifications/discord/")
        .expect("URLs can be joined with a string path")
        .join(&id.to_string())
        .expect("URLs can be joined with a UserId");
    Ok(cfg.client.get(url).send().await?.json().await?)
}
