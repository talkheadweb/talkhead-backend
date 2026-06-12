import { Router } from "express";
import authenticate from "@/Middlewares/Auth";
import AccessLimit from "@/Middlewares/AccessLimit";
import { EUserRole } from "@/App/Auth/types";
import { avatarUpload } from "@/Utils/file/config";
import {
  AvatarController,
  validateCreateAvatar,
  validateUpdateAvatar,
} from "./controller";

const avatarRouter = Router();

// All avatar routes require authentication
avatarRouter.use(authenticate);

avatarRouter.post(
  "/",
  AccessLimit([EUserRole.ADMIN]),
  avatarUpload.single("file"),
  validateCreateAvatar,
  AvatarController.create,
);

avatarRouter.get("/", AvatarController.list);

avatarRouter.get("/:id", AvatarController.getOne);

avatarRouter.patch(
  "/:id",
  AccessLimit([EUserRole.ADMIN]),
  validateUpdateAvatar,
  AvatarController.update,
);

avatarRouter.delete(
  "/:id",
  AccessLimit([EUserRole.ADMIN]),
  AvatarController.remove,
);

export default avatarRouter;
