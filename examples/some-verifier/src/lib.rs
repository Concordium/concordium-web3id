use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Default, Debug)]
pub struct Verified {
    pub telegram_id: Option<u64>,
    pub discord_id: Option<u64>,
}
