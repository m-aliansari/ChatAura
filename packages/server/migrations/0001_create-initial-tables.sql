-- Up Migration

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(28) NOT NULL UNIQUE,
    passhash VARCHAR NOT NULL,
    user_id VARCHAR NOT NULL UNIQUE
);


-- Down Migration

DROP TABLE users;