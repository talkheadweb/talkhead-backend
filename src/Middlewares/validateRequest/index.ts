import { NextFunction, Request, Response } from "express";
import { AnyZodObject } from "zod";

/**
 * Validates req.body / req.params / req.query against a Zod schema.
 *
 * Usage:
 *   router.post('/register', validateRequest(registerSchema), AuthController.register)
 *
 * The schema should be structured as:
 *   z.object({ body: z.object({...}), params: z.object({...}), query: z.object({...}) })
 *
 * Only include the keys you need — extras are ignored.
 * On success the parsed (and coerced) values are written back onto req.
 */
const validateRequest =
  (schema: AnyZodObject) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync({
        body  : req.body,
        params: req.params,
        query : req.query,
      });

      // Write coerced values back so controllers get clean data
      if (parsed.body)   req.body   = parsed.body;
      if (parsed.params) req.params = parsed.params;
      if (parsed.query)  req.query  = parsed.query;

      next();
    } catch (err) {
      next(err); // ZodError → globalErrorHandler
    }
  };

export default validateRequest;
