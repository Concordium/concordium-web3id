use itertools::Itertools;
use some_verifier_lib::Platform;
use tokio_postgres::types::ToSql;
use tokio_postgres::{NoTls, Row};

const ACCOUNTS_TABLE: &'static str = "accounts";

/// A social media platform that can be stored in the database.
pub trait DbPlatform {
    /// The `Platform` enum value of the platform.
    const PLATFORM: Platform;
}

/// A trait that is implemented for the Platform enum to give some utility functons.
trait DbName {
    /// The name of the corresponding table.
    fn table_name(&self) -> &'static str;
    /// The name of the corresponding column.
    fn column_name(&self) -> &'static str;
}

macro_rules! db_platforms {
    {$($name:ident { db_name = $db_name:literal $(,)? })* } => {
        $(
            pub struct $name;
            impl DbPlatform for $name {
                const PLATFORM: Platform = Platform::$name;
            }
        )*

        impl DbName for Platform {
            fn table_name(&self) -> &'static str {
                match self {$(
                    Platform::$name => $db_name,
                )*}
            }

            fn column_name(&self) -> &'static str {
                match self {$(
                    Platform::$name => concat!($db_name, "_id"),
                )*}
            }
        }

        fn accounts_from_row(row: Row) -> Vec<Account> {
            vec![ $( Account::from_row::<$name>(&row)),* ]
        }
    };
}

// Produces:
// * Types each implementing DbPlatform
// * Implements the DbName trait for the Platform enum
// * Function accounts_from_row(row: Row) -> Vec<Account>
db_platforms! {
    Telegram {
        db_name = "telegram",
    }
    Discord {
        db_name = "discord",
    }
}

/// A platform and an user ID for that platform.
///
/// Note: In the future `id` may change to a different type.
pub struct Account {
    pub platform: Platform,
    pub id: i64,
}

impl Account {
    fn from_row<P: DbPlatform>(row: &Row) -> Account {
        Self {
            platform: P::PLATFORM,
            id: row.get(P::PLATFORM.column_name()),
        }
    }
}

pub struct Database {
    client: tokio_postgres::Client,
}

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("The database returned an error: {0}")]
    Postgres(#[from] tokio_postgres::Error),
    #[error("Column entries were malformed.")]
    InvalidEntries,
}
pub type DbResult<T> = Result<T, DbError>;

/// Am entry into a column in the main DB table
#[derive(Debug)]
pub enum ColumnEntry {
    PlatformId { platform: Platform, user_id: i64 },
    Presentation(serde_json::Value),
    FirstName(String),
    LastName(String),
}

impl ColumnEntry {
    fn column_name(&self) -> &'static str {
        match self {
            ColumnEntry::PlatformId { platform, .. } => platform.column_name(),
            ColumnEntry::Presentation(_) => "presentation",
            ColumnEntry::FirstName(_) => "first_name",
            ColumnEntry::LastName(_) => "last_name",
        }
    }

    fn sql_val(&self) -> &(dyn ToSql + Sync) {
        match self {
            ColumnEntry::PlatformId { user_id, .. } => user_id,
            ColumnEntry::Presentation(presentation) => presentation,
            ColumnEntry::FirstName(first_name) => first_name,
            ColumnEntry::LastName(last_name) => last_name,
        }
    }
}

impl Database {
    pub async fn connect(db_config: tokio_postgres::Config) -> DbResult<Self> {
        let (client, connection) = db_config.connect(NoTls).await?;

        tokio::spawn(async move {
            if let Err(e) = connection.await {
                tracing::error!("connection error: {}", e);
            }
        });

        Ok(Self { client })
    }

    pub async fn get_accounts<P: DbPlatform>(&self, id: i64) -> DbResult<Vec<Account>> {
        let accounts = self
            .client
            .query_one(
                &format!(
                    "SELECT * FROM {ACCOUNTS_TABLE} WHERE {} = $1",
                    P::PLATFORM.column_name()
                ),
                &[&id],
            )
            .await
            .map(accounts_from_row)?;
        Ok(accounts)
    }

    pub async fn get_revocation_status(&self, account: &Account) -> DbResult<bool> {
        let status = self
            .client
            .query_one(
                &format!(
                    "SELECT id, revoked FROM {} WHERE id = $1",
                    account.platform.table_name()
                ),
                &[&account.id],
            )
            .await
            .map(|row| row.get("revoked"))?;
        Ok(status)
    }

    pub async fn insert_row(&self, entries: &[ColumnEntry]) -> DbResult<()> {
        if entries.len() == 0 {
            return Err(DbError::InvalidEntries);
        }

        let mut columns = vec![];
        let mut values = vec![];
        for entry in entries {
            if columns.contains(&entry.column_name()) {
                return Err(DbError::InvalidEntries);
            }
            columns.push(entry.column_name());
            values.push(entry.sql_val());
        }

        let statement = format!(
            "INSERT INTO {ACCOUNTS_TABLE} ({}) VALUES ({})",
            columns.join(", "),
            (1..=columns.len()).format_with(", ", |i, f| f(&format_args!("${i}")))
        );

        self.client.execute(&statement, &values).await?;

        Ok(())
    }
}
