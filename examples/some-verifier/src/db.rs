use some_verifier::Platform;
use tokio_postgres::{NoTls, Row};

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

macro_rules! db_platform {
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
db_platform! {
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

pub type DbResult<T> = Result<T, tokio_postgres::Error>;

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
        self.client
            .query_one(
                &format!(
                    "SELECT * FROM accounts WHERE {} = $1",
                    P::PLATFORM.column_name()
                ),
                &[&id],
            )
            .await
            .map(accounts_from_row)
    }

    pub async fn get_revocation_status(&self, account: &Account) -> DbResult<bool> {
        self.client
            .query_one(
                &format!(
                    "SELECT id, revoked FROM {} WHERE id = $1",
                    account.platform.table_name()
                ),
                &[&account.id],
            )
            .await
            .map(|row| row.get("revoked"))
    }
}
