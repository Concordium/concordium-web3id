CREATE TABLE IF NOT EXISTS discord (
	id VARCHAR PRIMARY KEY,
	verification_id INT8 UNIQUE REFERENCES verifications(id) ON DELETE CASCADE,
	username VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram (
	id VARCHAR PRIMARY KEY,
	verification_id INT8 UNIQUE REFERENCES verifications(id) ON DELETE CASCADE,
	username VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS verifications (
	id SERIAL8 PRIMARY KEY,
	presentation JSONB NOT NULL,
	first_name VARCHAR NULL,
	last_name VARCHAR NULL,
	CONSTRAINT verifications_first_name_iff_last_name CHECK ((((first_name IS NULL) AND (last_name IS NULL)) OR ((first_name IS NOT NULL) AND (last_name IS NOT NULL))))
);
