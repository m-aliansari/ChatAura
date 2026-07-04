import jwt from "jsonwebtoken";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import type { Request } from "express";
import { JWT_SECRET } from "../constants/auth.js";

// Go-style [err, result] tuples instead of throws.
export type JwtSignResult = [Error, null] | [null, string];
export type JwtVerifyResult = [Error, null] | [null, JwtPayload];

export const jwtSignPromise = (
    payload: string | Buffer | object,
    options: SignOptions = {},
): Promise<JwtSignResult> =>
    new Promise((resolve) => {
        jwt.sign(payload, JWT_SECRET, options, (err, token) => {
            if (err) return resolve([err, null]);
            resolve([null, token as string]);
        });
    });

export const jwtVerifyPromise = (token: string | null | undefined): Promise<JwtVerifyResult> =>
    new Promise((resolve) => {
        jwt.verify(token as string, JWT_SECRET, (err, decoded) => {
            if (err) return resolve([err, null]);
            resolve([null, decoded as JwtPayload]);
        });
    });

export const getJwtTokenFromRequest = (req: Request): string | null =>
    req.headers["authorization"]?.split(" ")?.[1] ?? null;
