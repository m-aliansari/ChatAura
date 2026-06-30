import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../constants/auth.js";

/**
 *
 * @param {string | Buffer | object} payload
 * @param {jwt.SignOptions} options
 * @returns {Promise<[Error | null, string | null]>}
 */
export const jwtSignPromise = (payload, options) =>
    new Promise((resolve) => {
        jwt.sign(payload, JWT_SECRET, options, (err, token) => {
            if (err) resolve([err, null]);
            resolve([null, token]);
        });
    });

/**
 *
 * @param {string} token
 * @returns {Promise<[Error | null, jwt.Jwt & jwt.JwtPayload | null]>}
 */
export const jwtVerifyPromise = (token) =>
    new Promise((resolve) => {
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) resolve([err, null]);
            resolve([null, decoded]);
        });
    });

/**
 *
 * @param {import("express").Request} req
 * @returns {string | null}
 */
export const getJwtTokenFromRequest = (req) =>
    req.headers["authorization"]?.split(" ")?.[1] ?? null;
