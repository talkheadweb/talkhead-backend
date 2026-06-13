import { Router } from "express";
import authenticate from "@/Middlewares/Auth";
import apiKeyAuth from "@/Middlewares/ApiKey";
import validateRequest from "@/Middlewares/validateRequest";
import { fileUpload, createUpload } from "@/Utils/file/config";
import { FileType } from "./const";
import { FileController } from "./controller";
import { externalUploadSchema, uploadFileSchema } from "./validation";

const fileRouter = Router();

// ── External API upload — x-api-key auth, no JWT ─────────────────────────
// Must be registered BEFORE the authenticate middleware below.
fileRouter.post(
  "/external-upload",
  apiKeyAuth,
  createUpload(FileType.GENERATION).single("file"),
  validateRequest(externalUploadSchema),
  FileController.externalUpload,
);

fileRouter.use(authenticate);

fileRouter.post(
  "/upload",
  fileUpload.single("file"),
  validateRequest(uploadFileSchema),
  FileController.uploadFile,
);

fileRouter.get("/",              FileController.list);
fileRouter.get("/:id",           FileController.getOne);
fileRouter.delete("/:id",        FileController.remove);
fileRouter.get("/:id/presigned", FileController.presigned);

export default fileRouter;
