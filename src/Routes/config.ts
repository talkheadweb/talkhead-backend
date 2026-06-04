import debuggerMiddleware from "@/Middlewares/Debug";
import { globalLimiter } from "@/Middlewares/RateLimit";
import rootRouter from "@/Routes/index";
import { Router } from 'express';

const configRoutes = Router()


configRoutes
  .use(
    '/api/v1',
    globalLimiter,        // blanket rate limit for the whole API
    debuggerMiddleware,
    rootRouter
  )
  .get('/health', (req, res) => {
    res.send('Healthy')
  })


export default configRoutes
