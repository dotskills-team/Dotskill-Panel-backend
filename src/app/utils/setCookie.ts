import { CookieOptions, Request, Response } from "express";
import { envVars } from "../config/env";

export interface AuthToken {
    accessToken?: string,
    refreshToken?: string
}

/**
 * True when the client reached us over HTTPS. Relies on `app.set("trust proxy", 1)`
 * so Express honours Vercel's X-Forwarded-Proto. Decided per request instead of via
 * NODE_ENV, because a missing/wrong NODE_ENV on the host silently produced
 * `SameSite=Lax` cookies that the browser refuses on cross-site responses.
 */
const isHttpsRequest = (req: Request) =>
    req.secure ||
    req.headers["x-forwarded-proto"]?.toString().split(",")[0].trim() === "https" ||
    envVars.NODE_ENV === "production";

/**
 * Shared by res.cookie and res.clearCookie — they MUST use identical options.
 * Frontend and backend are on different *.vercel.app sites, so in production the
 * cookies are cross-site and need `Secure; SameSite=None`, both when set and when cleared.
 * Over plain-HTTP localhost, `SameSite=None` requires Secure and would be rejected, so use Lax.
 */
export const getCookieOptions = (req: Request): CookieOptions => {
    const secure = isHttpsRequest(req);

    return {
        httpOnly: true,
        secure,
        sameSite: secure ? "none" : "lax",
        path: "/",
        ...(envVars.COOKIE_DOMAIN ? { domain: envVars.COOKIE_DOMAIN } : {}),
    };
};

const ACCESS_TOKEN_MAX_AGE = 1000 * 60 * 60 * 24;
const REFRESH_TOKEN_MAX_AGE = 1000 * 60 * 60 * 24 * 7;

export const setAuthCookie = (res: Response, tokenInfo: AuthToken) => {
    const cookieOptions = getCookieOptions(res.req);

    if (tokenInfo.accessToken) {
        res.cookie("accessToken", tokenInfo.accessToken, {
            ...cookieOptions,
            maxAge: ACCESS_TOKEN_MAX_AGE,
        })
    }

    if (tokenInfo.refreshToken) {
        res.cookie("refreshToken", tokenInfo.refreshToken, {
            ...cookieOptions,
            maxAge: REFRESH_TOKEN_MAX_AGE,
        })
    }
}

export const clearAuthCookie = (res: Response) => {
    const cookieOptions = getCookieOptions(res.req);

    res.clearCookie("accessToken", cookieOptions);
    res.clearCookie("refreshToken", cookieOptions);
}
