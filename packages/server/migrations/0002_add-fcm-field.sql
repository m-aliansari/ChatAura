-- Up Migration

ALTER TABLE users
ADD COLUMN fcm_token VARCHAR(255)[] DEFAULT NULL;


-- Down Migration

ALTER TABLE users
DROP COLUMN fcm_token;