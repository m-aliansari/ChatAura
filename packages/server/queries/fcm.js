export const ADD_FCM_TOKEN = `
UPDATE users
SET fcm_token = 
    CASE
        WHEN fcm_token IS NULL THEN ARRAY[$1::varchar]
        WHEN NOT fcm_token @> ARRAY[$1::varchar] THEN array_append(fcm_token, $1)
        ELSE fcm_token
    END
WHERE user_id = $2
RETURNING fcm_token;
`;

export const GET_FCM_TOKENS = `
SELECT fcm_token FROM users WHERE user_id = $1;
`;

export const REMOVE_FCM_TOKEN = `
UPDATE users
SET fcm_token = array_remove(fcm_token, $1)
WHERE user_id = $2
RETURNING fcm_token;
`;
