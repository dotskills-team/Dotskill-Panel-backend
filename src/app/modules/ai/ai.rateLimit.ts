import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import AppError from "../../errorHelpers/appError";
import { AI_RATE_LIMIT_MAX, AI_RATE_LIMIT_WINDOW_MS } from "./ai.constant";

/**
 * Small per-user limiter for the AI endpoint (each call costs money).
 * In-memory, so it is per server instance: a best-effort guard, not a hard quota.
 */
const hits = new Map<string, number[]>();

export const aiRateLimit = (req: Request, _res: Response, next: NextFunction) => {
  const key = String(req.user?.userId ?? req.ip);
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < AI_RATE_LIMIT_WINDOW_MS);

  if (recent.length >= AI_RATE_LIMIT_MAX) {
    hits.set(key, recent);
    return next(
      new AppError(StatusCodes.TOO_MANY_REQUESTS, "Too many AI requests. Please wait a few minutes."),
    );
  }

  recent.push(now);
  hits.set(key, recent);

  // Drop idle keys so the map cannot grow forever
  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (!times.some((t) => now - t < AI_RATE_LIMIT_WINDOW_MS)) hits.delete(k);
    }
  }
  next();
};
