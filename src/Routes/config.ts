import debuggerMiddleware from "@/Middlewares/Debug";
import { globalLimiter } from "@/Middlewares/RateLimit";
import rootRouter from "@/Routes/index";
import config from "@/Config";
import { ENodeEnv } from "@/Config/utils/config.types";
import { Router, type RequestHandler } from 'express';

const configRoutes = Router()

// Global rate limiter is enforced in production only.
// In development it is skipped so active API work is never blocked by stale counters.
const rateLimitMiddlewares: RequestHandler[] = config.node_env === ENodeEnv.PROD
  ? [globalLimiter]
  : [];

configRoutes
  .use(
    '/api/v1',
    ...rateLimitMiddlewares,
    debuggerMiddleware,
    rootRouter
  )
  .get('/health', (req, res) => {
    res.send('Healthy')
  })


export default configRoutes
