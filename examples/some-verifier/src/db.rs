use concordium_rust_sdk::id::constants::ArCurve;
use concordium_rust_sdk::web3id::{Presentation, Web3IdAttribute};
use itertools::Itertools;
use some_verifier_lib::{FullName, Platform};
use tokio::sync::RwLock;
use tokio_postgres::types::ToSql;
use tokio_postgres::{NoTls, Row};

const VERIFICATIONS_TABLE: &'static str = "verifications";
const TELEGRAM_ID_COLUMN: &'static str = "telegram_id";
const DISCORD_ID_COLUMN: &'static str = "discord_id";
const PRESENTATION_COLUMN: &'static str = "presentation";
const FIRST_NAME_COLUMN: &'static str = "first_name";
const LAST_NAME_COLUMN: &'static str = "last_name";
const ID_COLUMN: &'static str = "id";
const USERNAME_COLUMN: &'static str = "username";
const REVOKED_COLUMN: &'static str = "revoked";

/// A trait that is implemented for the Platform enum to give some utility functons.
trait DbName {
    /// The name of the corresponding table.
    fn table_name(&self) -> &'static str;
    /// The name of the corresponding column.
    fn column_name(&self) -> &'static str;
}

impl DbName for Platform {
    fn table_name(&self) -> &'static str {
        match self {
            Platform::Telegram => "telegram",
            Platform::Discord => "discord",
        }
    }

    fn column_name(&self) -> &'static str {
        match self {
            Platform::Telegram => "telegram_id",
            Platform::Discord => "discord_id",
        }
    }
}

fn verification_from_row(row: Row) -> DbVerification {
    let full_name = row
        .try_get(FIRST_NAME_COLUMN)
        .and_then(|first_name| {
            let last_name = row.try_get(LAST_NAME_COLUMN)?;
            let full_name = FullName {
                first_name,
                last_name,
            };
            Ok(full_name)
        })
        .ok();

    let accounts = [Platform::Discord, Platform::Telegram]
        .into_iter()
        .map(|platform| DbAccount {
            platform,
            id: row.get(platform.column_name()),
        })
        .collect();

    DbVerification {
        accounts,
        full_name,
    }
}

/// A platform and an user id for that platform.
pub struct DbAccount {
    pub platform: Platform,
    pub id: String,
}

/// The output from querying a line in the verifications table.
pub struct DbVerification {
    pub accounts: Vec<DbAccount>,
    pub full_name: Option<FullName>,
}

/// Initializer for verification entries, including the entries of the platform tables.
pub struct VerificationsEntry {
    pub telegram: Option<PlatformEntry>,
    pub discord: Option<PlatformEntry>,
    pub presentation: serde_json::Value,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
}

pub struct Database {
    client: RwLock<tokio_postgres::Client>,
}
impl VerificationsEntry {
    pub fn from_presentation(proof: &Presentation<ArCurve, Web3IdAttribute>) -> Self {
        Self {
            telegram: None,
            discord: None,
            presentation: serde_json::to_value(proof).expect("Presentations can be serialized"),
            first_name: None,
            last_name: None,
        }
    }

    fn columns(&self) -> impl Iterator<Item = (&'static str, &(dyn ToSql + Sync))> {
        [
            (
                TELEGRAM_ID_COLUMN,
                self.telegram.as_ref().map(|p| &p.id as &(dyn ToSql + Sync)),
            ),
            (
                DISCORD_ID_COLUMN,
                self.discord.as_ref().map(|p| &p.id as &(dyn ToSql + Sync)),
            ),
            (PRESENTATION_COLUMN, Some(&self.presentation)),
            (
                FIRST_NAME_COLUMN,
                self.first_name.as_ref().map(|n| n as &(dyn ToSql + Sync)),
            ),
            (
                LAST_NAME_COLUMN,
                self.last_name.as_ref().map(|n| n as &(dyn ToSql + Sync)),
            ),
        ]
        .into_iter()
        .filter_map(|(name, val)| val.map(|v| (name, v)))
    }
}

pub struct PlatformEntry {
    pub id: String,
    pub username: String,
    pub revoked: bool,
}

impl PlatformEntry {
    fn columns(&self) -> impl Iterator<Item = (&'static str, &(dyn ToSql + Sync))> {
        [
            (ID_COLUMN, &self.id as &(dyn ToSql + Sync)),
            (USERNAME_COLUMN, &self.username as &(dyn ToSql + Sync)),
            (REVOKED_COLUMN, &self.revoked),
        ]
        .into_iter()
    }
}

pub type DbResult<T> = Result<T, tokio_postgres::Error>;

impl Database {
    pub async fn connect(db_config: tokio_postgres::Config) -> DbResult<Self> {
        let (client, connection) = db_config.connect(NoTls).await?;

        tokio::spawn(async move {
            if let Err(e) = connection.await {
                tracing::error!("connection error: {}", e);
            }
        });

        Ok(Self {
            client: RwLock::new(client),
        })
    }

    /// Returns the verification for a given social media account if it exists.
    pub async fn get_verification(
        &self,
        id: &str,
        platform: Platform,
    ) -> DbResult<Option<DbVerification>> {
        let verification = self
            .client
            .read()
            .await
            .query_opt(
                &format!(
                    "SELECT * FROM {VERIFICATIONS_TABLE} WHERE {} = $1",
                    platform.column_name()
                ),
                &[&id],
            )
            .await
            .map(|opt| opt.map(verification_from_row))?;

        Ok(verification)
    }

    /// Gets the revocation status for a given social media account.
    /// Returns an error if the account is not in the DB.
    pub async fn get_revocation_status(&self, account: &DbAccount) -> DbResult<bool> {
        let status = self
            .client
            .read()
            .await
            .query_one(
                &format!(
                    "SELECT {ID_COLUMN}, {REVOKED_COLUMN} FROM {} WHERE id = $1",
                    account.platform.table_name()
                ),
                &[&account.id],
            )
            .await
            .map(|row| row.get(REVOKED_COLUMN))?;
        Ok(status)
    }

    pub async fn add_verification(&self, entry: VerificationsEntry) -> DbResult<()> {
        let (columns, values): (Vec<_>, Vec<_>) = entry.columns().unzip();

        let mut client = self.client.write().await;
        let transaction = client.transaction().await?;
        if let Some(telegram) = &entry.telegram {
            add_platform_entry(&transaction, Platform::Telegram, telegram).await?;
        }
        if let Some(discord) = &entry.discord {
            add_platform_entry(&transaction, Platform::Discord, discord).await?;
        }

        let statement = format!(
            "INSERT INTO {VERIFICATIONS_TABLE} ({}) VALUES ({})",
            columns.join(", "),
            (1..=columns.len()).format_with(", ", |i, f| f(&format_args!("${i}")))
        );

        transaction.execute(&statement, &values).await?;
        transaction.commit().await
    }
}

async fn add_platform_entry(
    transaction: &tokio_postgres::Transaction<'_>,
    platform: Platform,
    entry: &PlatformEntry,
) -> DbResult<()> {
    let (columns, values): (Vec<_>, Vec<_>) = entry.columns().unzip();

    let statement = format!(
        "INSERT INTO {} ({}) VALUES ({})",
        platform.table_name(),
        columns.join(", "),
        (1..=columns.len()).format_with(", ", |i, f| f(&format_args!("${i}")))
    );

    transaction.execute(&statement, &values).await?;
    Ok(())
}
