use concordium_rust_sdk::{
    id::constants::ArCurve,
    web3id::{CredentialHolderId, Presentation, Web3IdAttribute},
};
use some_verifier_lib::{FullName, Platform};
use std::usize;
use tokio_postgres::{types::ToSql, NoTls};

const VERIFICATIONS_TABLE: &str = "verifications";
const PRESENTATION_COLUMN: &str = "presentation";
const FIRST_NAME_COLUMN: &str = "first_name";
const LAST_NAME_COLUMN: &str = "last_name";
const ID_COLUMN: &str = "id";
const CRED_ID_COLUMN: &str = "cred_id";
const VERIFICATION_ID_COLUMN: &str = "verification_id";
const USERNAME_COLUMN: &str = "username";

/// A trait that is implemented for the Platform enum to give some utility
/// functons. This is a trait because of orphan rules. It is only implemented
/// for a single type.
trait DbName {
    /// The name of the corresponding table.
    fn table_name(&self) -> &'static str;
    fn insert_statement(&self) -> String;
}

impl DbName for Platform {
    fn table_name(&self) -> &'static str {
        match self {
            Platform::Telegram => "telegram",
            Platform::Discord => "discord",
        }
    }

    fn insert_statement(&self) -> String {
        format!(
            "INSERT INTO {0} ({ID_COLUMN}, {CRED_ID_COLUMN}, {VERIFICATION_ID_COLUMN}, \
             {USERNAME_COLUMN}) VALUES ($1, $2, $3, $4) ON CONFLICT ON CONSTRAINT {0}_pkey DO \
             NOTHING RETURNING {ID_COLUMN}",
            self.table_name()
        )
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

impl VerificationsEntry {
    fn platform_entry(&self, platform: Platform) -> Option<&PlatformEntry> {
        match platform {
            Platform::Telegram => self.telegram.as_ref(),
            Platform::Discord => self.discord.as_ref(),
        }
    }
}

pub struct Database {
    pool: deadpool_postgres::Pool,
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

    fn insert_statement() -> String {
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

pub type DbResult<T> = anyhow::Result<T>;

impl Database {
    pub async fn connect(db_config: tokio_postgres::Config, pool_size: usize) -> DbResult<Self> {
        let (client, connection) = db_config.connect(NoTls).await?;

        tokio::spawn(async move {
            if let Err(e) = connection.await {
                tracing::error!("connection error: {}", e);
            }
        });

        client
            .batch_execute(include_str!("../resources/schema.sql"))
            .await?;

        let manager_config = deadpool_postgres::ManagerConfig {
            recycling_method: deadpool_postgres::RecyclingMethod::Verified,
        };

        let manager = deadpool_postgres::Manager::from_config(db_config, NoTls, manager_config);
        let pool = deadpool_postgres::Pool::builder(manager)
            .create_timeout(Some(std::time::Duration::from_secs(5)))
            .recycle_timeout(Some(std::time::Duration::from_secs(5)))
            .wait_timeout(Some(std::time::Duration::from_secs(5)))
            .max_size(pool_size)
            .runtime(deadpool_postgres::Runtime::Tokio1)
            .build()?;
        Ok(Self { pool })
    }

    /// Returns the verification for a given social media account if it exists.
    #[tracing::instrument(level = "debug", skip(self))]
    pub async fn get_verification(
        &self,
        id: &str,
        platform: Platform,
    ) -> DbResult<Option<DbVerification>> {
        tracing::debug!("Looking up verifications.");
        let mut client = self.pool.get().await?;
        let tx = client.transaction().await?;

        let table_name = platform.table_name();
        let select_verification_id = format!(
            "SELECT {VERIFICATION_ID_COLUMN}, {ID_COLUMN}, {USERNAME_COLUMN} FROM {table_name} \
             WHERE {table_name}.id = $1"
        );

        let Some(platform_row) = tx.query_opt(&select_verification_id, &[&id]).await? else {
            return Ok(None);
        };
        let ver_id: i64 = platform_row.try_get(VERIFICATION_ID_COLUMN)?;

        // The base statement
        let name_statement = format!(
            "SELECT {PRESENTATION_COLUMN}, {FIRST_NAME_COLUMN}, {LAST_NAME_COLUMN} FROM \
             {VERIFICATIONS_TABLE} WHERE {ID_COLUMN} = $1"
        );
        let Some(name_row) = tx.query_opt(&name_statement, &[&ver_id]).await? else {
            return Ok(None);
        };
        let first_name: Option<String> = name_row.try_get(FIRST_NAME_COLUMN)?;
        let full_name = if let Some(first_name) = first_name {
            let last_name: String = name_row.try_get(LAST_NAME_COLUMN)?;
            Some(FullName {
                first_name,
                last_name,
            })
        } else {
            None
        };

        let id = platform_row.try_get(ID_COLUMN)?;
        let username = platform_row.try_get(USERNAME_COLUMN)?;
        let acc = DbAccount {
            platform,
            id,
            username,
        };

        let mut accounts = vec![acc];

        for p in Platform::SUPPORTED_PLATFORMS {
            if p != platform {
                let Some(row) = tx.query_opt(
                    &format!(
                        "SELECT {ID_COLUMN}, {USERNAME_COLUMN} FROM {} WHERE \
                         {VERIFICATION_ID_COLUMN}=$1",
                        p.table_name()
                    ),
                    &[&ver_id],
                ).await? else {
                    continue;
                };
                let id = row.try_get(ID_COLUMN)?;
                let username = row.try_get(USERNAME_COLUMN)?;
                let acc = DbAccount {
                    platform: p,
                    id,
                    username,
                };
                accounts.push(acc);
            }
        }

        let presentation = name_row.get::<_, serde_json::Value>(PRESENTATION_COLUMN);
        let presentation =
            serde_json::from_value(presentation).expect("presentations can be deserialized");

        Ok(Some(DbVerification {
            accounts,
            full_name,
            presentation,
        }))
    }

    /// Attempt to add a verification. In case the user already exist and is
    /// identified by a different credential holder ID this will return the
    /// user ID of the clashing user, and will not do any updates.
    pub async fn add_verification(&self, entry: VerificationsEntry) -> DbResult<Option<String>> {
        let mut client = self.pool.get().await?;
        let transaction = client.transaction().await?;

        // Clear pre-existing verifications with overlapping credentials;
        for platform in Platform::SUPPORTED_PLATFORMS {
            let Some(entry) = entry.platform_entry(platform) else {
                continue;
            };
            let table_name = platform.table_name();
            let delete_statement = format!(
                "DELETE FROM {VERIFICATIONS_TABLE} WHERE {VERIFICATIONS_TABLE}.{ID_COLUMN} IN \
                 (SELECT {table_name}.{VERIFICATION_ID_COLUMN} FROM {table_name} WHERE \
                 {table_name}.{CRED_ID_COLUMN} = $1)"
            );
            tracing::debug!(
                "Will attempt to remove credential with id {} ({table_name}) from the database.",
                entry.cred_id
            );
            let rows = transaction
                .execute(&delete_statement, &[
                    entry.cred_id.public_key.as_bytes() as &(dyn ToSql + Sync)
                ])
                .await?;
            if rows > 0 {
                tracing::debug!("Deleted {rows} rows from {VERIFICATIONS_TABLE}");
            }
        }

        let insert_statement = VerificationsEntry::insert_statement();

        let values: [&(dyn ToSql + Sync); 3] = [
            &entry.full_name.as_ref().map(|n| &n.first_name),
            &entry.full_name.as_ref().map(|n| &n.last_name),
            &entry.presentation,
        ];

        // Run an insert, retrieve new verification id
        let verification_id: i64 = transaction
            .query_one(&insert_statement, &values)
            .await?
            .try_get(0)?;

        if let Some(telegram) = entry.telegram {
            if let Some(user_id) =
                add_platform_entry(&transaction, Platform::Telegram, telegram, verification_id)
                    .await?
            {
                tracing::debug!(
                    "Refusing to add new Telegram verification due to clash of user id {}.",
                    user_id
                );
                transaction.rollback().await?;
                return Ok(Some(user_id));
            }
        }
        if let Some(discord) = entry.discord {
            if let Some(user_id) =
                add_platform_entry(&transaction, Platform::Discord, discord, verification_id)
                    .await?
            {
                tracing::debug!(
                    "Refusing to add new Discord verification due to clash of user id {}.",
                    user_id
                );
                transaction.rollback().await?;
                return Ok(Some(user_id));
            }
        }

        transaction.commit().await?;
        Ok(None)
    }

    /// Remove the verification. Return if anything was removed.
    pub async fn remove_verification(
        &self,
        cred_id: &CredentialHolderId,
        platform: Platform,
    ) -> DbResult<bool> {
        let mut client = self.pool.get().await?;
        let transaction = client.transaction().await?;

        // Then delete the verification row.
        let statement = format!(
            "DELETE FROM {VERIFICATIONS_TABLE} WHERE {ID_COLUMN} IN (SELECT \
             {VERIFICATION_ID_COLUMN} FROM {} WHERE {CRED_ID_COLUMN} = $1) RETURNING {ID_COLUMN}",
            platform.table_name()
        );
        let cred_id = cred_id.public_key.as_bytes();
        // The column VERIFICATION_ID_COLUMN is unique so at most one will be returned
        let r = transaction.query_opt(&statement, &[cred_id]).await?;
        transaction.commit().await?;
        Ok(r.is_some())
    }
}

/// Attempt to add a platform entry. If an entry already exists return the
/// `user_id` and do no updates.
async fn add_platform_entry(
    transaction: &tokio_postgres::Transaction<'_>,
    platform: Platform,
    entry: PlatformEntry,
    verification_id: i64,
) -> DbResult<Option<String>> {
    let statement = platform.insert_statement();

    let values = [
        &entry.id as &(dyn ToSql + Sync),
        entry.cred_id.public_key.as_bytes() as &(dyn ToSql + Sync),
        &verification_id as &(dyn ToSql + Sync),
        &entry.username,
    ];

    if transaction
        .query_opt(statement.as_str(), &values)
        .await?
        .is_some()
    {
        Ok(None)
    } else {
        Ok(Some(entry.id))
    }
}
