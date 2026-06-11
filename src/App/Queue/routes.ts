import apiKeyAuth from "@/Middlewares/ApiKey";
import validateRequest from "@/Middlewares/validateRequest";
import { Router } from "express";
import { QueueController } from "./controller";
import { createQueueJobSchema } from "./validation";

const queueRouter = Router();

queueRouter.use(apiKeyAuth);

queueRouter.post  ("/",         validateRequest(createQueueJobSchema), QueueController.create);
queueRouter.get   ("/",                                                 QueueController.list);
queueRouter.get   ("/:id",                                              QueueController.getOne);
queueRouter.delete("/:id",                                              QueueController.cancel);

export default queueRouter;
