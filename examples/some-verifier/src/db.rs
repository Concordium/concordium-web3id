use concordium_rust_sdk::id::constants::ArCurve;
use concordium_rust_sdk::web3id::{Presentation, Web3IdAttribute};
use itertools::Itertools;
use some_verifier_lib::{FullName, Platform};
use tokio::sync::RwLock;
use tokio_postgres::types::ToSql;
use tokio_postgres::{NoTls, Row};

const VERIFICATIONS_TABLE: &'static str = "verifications";
const PRESENTATION_COLUMN: &'static str = "presentation";
const FIRST_NAME_COLUMN: &'static str = "first_name";
const LAST_NAME_COLUMN: &'static str = "last_name";
const ID_COLUMN: &'static str = "id";
const VERIFICATION_ID_COLUMN: &'static str = "verification_id";
const USERNAME_COLUMN: &'static str = "username";

/// A trait that is implemented for the Platform enum to give some utility functons.
trait DbName {
    /// The name of the corresponding table.
    fn table_name(&self) -> &'static str;
    /// The username alias used when joined with other platforms
    fn username_alias(&self) -> String;
    /// The id alias used when joined with other platforms
    fn id_alias(&self) -> String;
}

impl DbName for Platform {
    fn table_name(&self) -> &'static str {
        match self {
            Platform::Telegram => "telegram",
            Platform::Discord => "discord",
        }
    }

    fn username_alias(&self) -> String {
        format!("{}_{USERNAME_COLUMN}", self.table_name())
    }

    fn id_alias(&self) -> String {
        format!("{}_{ID_COLUMN}", self.table_name())
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

    let accounts = Platform::SUPPORTED_PLATFORMS
        .into_iter()
        .map(|platform| {
            let id = row.get(platform.id_alias().as_str());
            let username = row.get(platform.username_alias().as_str());

            DbAccount {
                platform,
                id,
                username,
            }
        })
        .collect();

    DbVerification {
        accounts,
        full_name,
    }
}

/// A platform and an user id for that platform.
#[derive(Debug)]
pub struct DbAccount {
    pub platform: Platform,
    pub id: String,
    pub username: String,
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
                FIRST_NAME_COLUMN,
                self.first_name.as_ref().map(|n| n as &(dyn ToSql + Sync)),
            ),
            (
                LAST_NAME_COLUMN,
                self.last_name.as_ref().map(|n| n as &(dyn ToSql + Sync)),
            ),
            (PRESENTATION_COLUMN, Some(&self.presentation)),
        ]
        .into_iter()
        .filter_map(|(name, val)| val.map(|v| (name, v)))
    }
}

pub struct PlatformEntry {
    pub id: String,
    pub username: String,
}

impl PlatformEntry {
    fn columns<'a>(
        &'a self,
        verification_id: &'a i64,
    ) -> impl Iterator<Item = (&'static str, &(dyn ToSql + Sync))> {
        [
            (ID_COLUMN, &self.id as &(dyn ToSql + Sync)),
            (
                VERIFICATION_ID_COLUMN,
                verification_id as &(dyn ToSql + Sync),
            ),
            (USERNAME_COLUMN, &self.username),
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
        // The base statement
        let mut statement = format!("SELECT {FIRST_NAME_COLUMN}, {LAST_NAME_COLUMN}");

        // Additional columns to select and joins to perform built from the supported platforms.
        let (columns, joins) = Platform::SUPPORTED_PLATFORMS
            .into_iter()
            .map(|platform| {
                let column = format!(
                    "{0}.{USERNAME_COLUMN} AS {1}, {}.{ID_COLUMN} AS {2}",
                    platform.table_name(),
                    platform.username_alias(),
                    platform.id_alias()
                );
                let join = format!(
                    "JOIN {0} ON {0}.{VERIFICATION_ID_COLUMN}={VERIFICATIONS_TABLE}.{ID_COLUMN}",
                    platform.table_name(),
                );
                (column, join)
            })
            .fold(
                (String::new(), String::new()),
                |(mut columns, mut joins), (column, join)| {
                    columns.push_str(&format!(", {}", column));
                    joins.push_str(&format!(" {}", join));
                    (columns, joins)
                },
            );

        statement.push_str(&columns);
        statement.push_str(&format!(" FROM {VERIFICATIONS_TABLE}"));
        statement.push_str(&joins);
        statement.push_str(&format!(
            " WHERE {}.{ID_COLUMN} = $1",
            platform.table_name()
        ));

        let verification = self
            .client
            .read()
            .await
            .query_opt(&statement, &[&id])
            .await
            .map(|opt| opt.map(verification_from_row))?;

        Ok(verification)
    }

    pub async fn add_verification(&self, entry: VerificationsEntry) -> DbResult<()> {
        let (columns, values): (Vec<_>, Vec<_>) = entry.columns().unzip();

        let mut client = self.client.write().await;
        let transaction = client.transaction().await?;

        let statement = format!(
            "INSERT INTO {VERIFICATIONS_TABLE} ({}) VALUES ({}) RETURNING id",
            columns.join(", "),
            (1..=columns.len()).format_with(", ", |i, f| f(&format_args!("${i}")))
        );

        let verification_id: i64 = transaction.query_one(&statement, &values).await?.get(0);

        if let Some(telegram) = &entry.telegram {
            add_platform_entry(&transaction, Platform::Telegram, telegram, verification_id).await?;
        }
        if let Some(discord) = &entry.discord {
            add_platform_entry(&transaction, Platform::Discord, discord, verification_id).await?;
        }

        transaction.commit().await
    }

    pub async fn remove_verirication(&self, id: &str, platform: Platform) -> DbResult<()> {
        let mut client = self.client.write().await;
        let transaction = client.transaction().await?;

        // Then delete the verification row.
        let statement = format!(
            "DELETE FROM {VERIFICATIONS_TABLE} WHERE {ID_COLUMN} IN (SELECT {VERIFICATION_ID_COLUMN} FROM {} WHERE {ID_COLUMN} = $1)",
            platform.table_name()
        );
        transaction.execute(&statement, &[&id]).await?;
        transaction.commit().await
    }
}

async fn add_platform_entry(
    transaction: &tokio_postgres::Transaction<'_>,
    platform: Platform,
    entry: &PlatformEntry,
    verification_id: i64,
) -> DbResult<()> {
    let (columns, values): (Vec<_>, Vec<_>) = entry.columns(&verification_id).unzip();

    let statement = format!(
        "INSERT INTO {} ({}) VALUES ({})",
        platform.table_name(),
        columns.join(", "),
        (1..=columns.len()).format_with(", ", |i, f| f(&format_args!("${i}")))
    );

    transaction.execute(&statement, &values).await?;
    Ok(())
}
