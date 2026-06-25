export const GET_USER_BY_USERNAME = `
SELECT id, user_id, username, passhash 
FROM users 
WHERE username=$1
`

export const CHECK_USER_EXISTS = `
SELECT username 
FROM users 
WHERE username=$1
`

export const ADD_NEW_USER = `
INSERT INTO users(user_id, username, passhash) 
VALUES($1, $2, $3) 
RETURNING id, username, user_id
`