CREATE TABLE IF NOT EXISTS discord (
	id INT8 PRIMARY KEY,
	revoked BOOL NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS telegram (
	id INT8 PRIMARY KEY,
	revoked BOOL NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS verifications (
	telegram_id INT8 NULL UNIQUE,
	discord_id INT8 NULL UNIQUE,
	presentation JSONB NOT NULL,
	first_name VARCHAR NULL,
	last_name VARCHAR NULL,
	CONSTRAINT verifications_first_name_iff_last_name CHECK ((((first_name IS NULL) AND (last_name IS NULL)) OR ((first_name IS NOT NULL) AND (last_name IS NOT NULL)))),
	CONSTRAINT verified_discord_fk FOREIGN KEY (discord_id) REFERENCES discord(id) ON DELETE SET NULL ON UPDATE SET NULL,
	CONSTRAINT verified_telegram_fk FOREIGN KEY (telegram_id) REFERENCES telegram(id) ON DELETE SET NULL ON UPDATE SET NULL
);
