import apiKeyAuth from "@/Middlewares/ApiKey";
import validateRequest from "@/Middlewares/validateRequest";
import { Router } from "express";
import { QueueController } from "./controller";
import { createQueueJobSchema } from "./validation";

const queueRouter = Router();

queueRouter.use(apiKeyAuth);

queueRouter.post  ("/",         validateRequest(createQueueJobSchema), QueueController.create);
queueRouter.get   ("/",                                                 QueueController.list);
queueRouter.get   ("/:jobId",                                           QueueController.getOne);
queueRouter.delete("/:jobId",                                           QueueController.cancel);

export default queueRouter;
