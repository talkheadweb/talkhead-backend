import { Router } from "express";
import authenticate from "@/Middlewares/Auth";
import validateRequest from "@/Middlewares/validateRequest";
import { fileUpload } from "@/Utils/file/config";
import { FileController } from "./controller";
import { uploadFileSchema } from "./validation";

const fileRouter = Router();

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
