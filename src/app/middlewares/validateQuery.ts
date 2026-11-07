import { NextFunction, Request, Response } from "express";
import { ZodTypeAny } from "zod";

/**
 * Validates and coerces req.query with a Zod schema.
 * Express 5 exposes req.query as a getter, so the parsed value is defined over it.
 */
export const validateQuery =
  (schema: ZodTypeAny) => async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync(req.query);
      Object.defineProperty(req, "query", {
        value: parsed,
        writable: true,
        configurable: true,
        enumerable: true,
      });
      next();
    } catch (error) {
      next(error);
    }
  };
