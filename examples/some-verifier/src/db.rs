use some_verifier::Verified;
use tokio_postgres::types::ToSql;
use tokio_postgres::{NoTls, Row};

pub trait Platform {
    type Id: ToSql + Sync;
    const COLUMN_NAME: &'static str;
}

macro_rules! platform {
    ($name:ident, $column_name:literal, $id_ty:ty) => {
        pub struct $name;
        impl Platform for $name {
            type Id = $id_ty;
            const COLUMN_NAME: &'static str = $column_name;
        }
    };
}

platform!(Telegram, "telegram_id", i64);
platform!(Discord, "discord_id", i64);

pub struct Database {
    client: tokio_postgres::Client,
}

impl Database {
    pub async fn connect(db_config: tokio_postgres::Config) -> Result<Self, tokio_postgres::Error> {
        let (client, connection) = db_config.connect(NoTls).await?;

        tokio::spawn(async move {
            if let Err(e) = connection.await {
                tracing::error!("connection error: {}", e);
            }
        });

        Ok(Self { client })
    }

    pub async fn get_accounts<P: Platform>(
        &self,
        id: P::Id,
    ) -> Result<Verified, tokio_postgres::Error> {
        self.client
            .query_one(
                &format!("SELECT * FROM verified WHERE {} = $1", P::COLUMN_NAME),
                &[&id],
            )
            .await
            .map(verified_from_row)
    }
}

fn verified_from_row(row: Row) -> Verified {
    Verified {
        telegram_id: row
            .get::<_, Option<i64>>(Telegram::COLUMN_NAME)
            .map(|id| id as u64),
        discord_id: row
            .get::<_, Option<i64>>(Discord::COLUMN_NAME)
            .map(|id| id as u64),
    }
}
