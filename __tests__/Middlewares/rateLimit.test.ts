import express from "express";
import request from "supertest";
import { createRateLimiter } from "@/Middlewares/RateLimit";
import globalErrorHandler from "@/Middlewares/Errors/globalErrorHandler";

/**
 * Builds a throwaway app with the limiter forced ON (skip disabled) so we can
 * assert throttling behaviour. The route-level limiters used by the real app
 * are skipped under Jest — here we override that to actually exercise the logic.
 */
const buildApp = (max: number) => {
  const app = express();
  app.use(express.json());
  app.post(
    "/ping",
    createRateLimiter({
      windowMs: 60_000,
      max,
      prefix : "rl:test:",
      message: "Too many requests. Slow down.",
      skip   : () => false, // force the limiter on inside tests
    }),
    (_req, res) => res.status(200).json({ success: true }),
  );
  app.use(globalErrorHandler);
  return app;
};

describe("RateLimit middleware", () => {
  it("allows requests up to the max, then returns 429", async () => {
    const app = buildApp(2);

    const r1 = await request(app).post("/ping").send({});
    const r2 = await request(app).post("/ping").send({});
    const r3 = await request(app).post("/ping").send({});

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
  });

  it("429 response uses the standard error shape with the custom message", async () => {
    const app = buildApp(1);

    await request(app).post("/ping").send({});
    const blocked = await request(app).post("/ping").send({});

    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.message).toBe("Too many requests. Slow down.");
  });

  it("sets standard RateLimit-* headers", async () => {
    const app = buildApp(5);

    const res = await request(app).post("/ping").send({});

    expect(res.headers).toHaveProperty("ratelimit-limit");
    expect(res.headers).toHaveProperty("ratelimit-remaining");
  });
});
