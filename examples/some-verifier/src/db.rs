use concordium_rust_sdk::{
    id::constants::ArCurve,
    web3id::{CredentialHolderId, Presentation, Web3IdAttribute},
};
use some_verifier_lib::{FullName, Platform};
use tokio::sync::RwLock;
use tokio_postgres::{types::ToSql, NoTls, Row};

const VERIFICATIONS_TABLE: &'static str = "verifications";
const PRESENTATION_COLUMN: &'static str = "presentation";
const FIRST_NAME_COLUMN: &'static str = "first_name";
const LAST_NAME_COLUMN: &'static str = "last_name";
const ID_COLUMN: &'static str = "id";
const CRED_ID_COLUMN: &'static str = "cred_id";
const VERIFICATION_ID_COLUMN: &'static str = "verification_id";
const USERNAME_COLUMN: &'static str = "username";

/// A trait that is implemented for the Platform enum to give some utility
/// functons. This is a trait because of orphan rules. It is only implemented
/// for a single type.
trait DbName {
    /// The name of the corresponding table.
    fn table_name(&self) -> &'static str;
    /// The username alias used when joined with other platforms
    fn username_alias(&self) -> String;
    /// The id alias used when joined with other platforms
    fn id_alias(&self) -> String;
    fn insert_statement(&self) -> String;
}

impl DbName for Platform {
    fn table_name(&self) -> &'static str {
        match self {
            Platform::Telegram => "telegram",
            Platform::Discord => "discord",
        }
    }

    fn username_alias(&self) -> String { format!("{}_{USERNAME_COLUMN}", self.table_name()) }

    fn id_alias(&self) -> String { format!("{}_{ID_COLUMN}", self.table_name()) }

    fn insert_statement(&self) -> String {
        format!(
            "INSERT INTO {} ({ID_COLUMN}, {CRED_ID_COLUMN}, {VERIFICATION_ID_COLUMN}, \
             {USERNAME_COLUMN}) VALUES ($1, $2, $3, $4)",
            self.table_name()
        )
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

    let presentation = row.get::<_, serde_json::Value>(PRESENTATION_COLUMN);
    let presentation =
        serde_json::from_value(presentation).expect("presentations can be deserialized");

    DbVerification {
        accounts,
        full_name,
        presentation,
    }
}

/// A platform and user id + username for that platform.
#[derive(Debug)]
pub struct DbAccount {
    pub platform: Platform,
    pub id:       String,
    pub username: String,
}

/// The output from querying a line in the verifications table.
pub struct DbVerification {
    pub accounts:     Vec<DbAccount>,
    pub full_name:    Option<FullName>,
    pub presentation: Presentation<ArCurve, Web3IdAttribute>,
}

/// Initializer for verification entries, including the entries of the platform
/// tables.
pub struct VerificationsEntry {
    pub telegram:     Option<PlatformEntry>,
    pub discord:      Option<PlatformEntry>,
    pub presentation: serde_json::Value,
    pub full_name:    Option<FullName>,
}

pub struct Database {
    // TODO: This RwLock is not the best design.
    // There would ideally be a connection pool.
    client: RwLock<tokio_postgres::Client>,
}

impl VerificationsEntry {
    pub fn from_presentation(proof: &Presentation<ArCurve, Web3IdAttribute>) -> Self {
        Self {
            telegram:     None,
            discord:      None,
            presentation: serde_json::to_value(proof).expect("Presentations can be serialized"),
            full_name:    None,
        }
    }

    fn insert_statement(&self) -> String {
        format!(
            "INSERT INTO {VERIFICATIONS_TABLE} ({FIRST_NAME_COLUMN}, {LAST_NAME_COLUMN}, \
             {PRESENTATION_COLUMN}) VALUES ($1, $2, $3) RETURNING id"
        )
    }
}

pub struct PlatformEntry {
    pub id:       String,
    pub cred_id:  CredentialHolderId,
    pub username: String,
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

        client
            .batch_execute(include_str!("../resources/schema.sql"))
            .await?;

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
        let mut statement =
            format!("SELECT {PRESENTATION_COLUMN}, {FIRST_NAME_COLUMN}, {LAST_NAME_COLUMN}");

        // Additional columns to select and joins to perform built from the supported
        // platforms.
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
        let mut client = self.client.write().await;
        let transaction = client.transaction().await?;

        let statement = entry.insert_statement();

        let values: [&(dyn ToSql + Sync); 3] = [
            &entry.full_name.as_ref().map(|n| &n.first_name),
            &entry.full_name.as_ref().map(|n| &n.last_name),
            &entry.presentation,
        ];

        let verification_id: i64 = transaction
            .query_one(&statement, &values)
            .await?
            .try_get(0)?;

        if let Some(telegram) = &entry.telegram {
            add_platform_entry(&transaction, Platform::Telegram, telegram, verification_id).await?;
        }
        if let Some(discord) = &entry.discord {
            add_platform_entry(&transaction, Platform::Discord, discord, verification_id).await?;
        }

        transaction.commit().await
    }

    pub async fn remove_verification(
        &self,
        cred_id: &CredentialHolderId,
        platform: Platform,
    ) -> DbResult<()> {
        let mut client = self.client.write().await;
        let transaction = client.transaction().await?;

        // Then delete the verification row.
        let statement = format!(
            "DELETE FROM {VERIFICATIONS_TABLE} WHERE {ID_COLUMN} IN (SELECT \
             {VERIFICATION_ID_COLUMN} FROM {} WHERE {CRED_ID_COLUMN} = $1) RETURNING {ID_COLUMN}",
            platform.table_name()
        );
        let cred_id = cred_id.public_key.as_bytes();
        transaction.query_one(&statement, &[cred_id]).await?;
        transaction.commit().await
    }
}

async fn add_platform_entry(
    transaction: &tokio_postgres::Transaction<'_>,
    platform: Platform,
    entry: &PlatformEntry,
    verification_id: i64,
) -> DbResult<()> {
    let statement = platform.insert_statement();

    let values = [
        &entry.id as &(dyn ToSql + Sync),
        entry.cred_id.public_key.as_bytes() as &(dyn ToSql + Sync),
        &verification_id as &(dyn ToSql + Sync),
        &entry.username,
    ];

    transaction.execute(statement.as_str(), &values).await?;
    Ok(())
}
