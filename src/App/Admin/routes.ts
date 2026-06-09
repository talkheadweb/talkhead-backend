import AccessLimit from "@/Middlewares/AccessLimit";
import authenticate from "@/Middlewares/Auth";
import validateRequest from "@/Middlewares/validateRequest";
import { Router } from "express";
import { EUserRole } from "@/App/Auth/types";
import { AdminController } from "./controller";
import { AdminValidation } from "./validation";

const adminRouter = Router();

// All admin routes require authentication + admin role
adminRouter.use(authenticate, AccessLimit([EUserRole.ADMIN]));

adminRouter
  .get   ("/users",                                                                        AdminController.listUsers)
  .post  ("/users",          validateRequest(AdminValidation.createUserSchema),            AdminController.createUser)
  .get   ("/users/:id",      validateRequest(AdminValidation.getUserSchema),               AdminController.getUserById)
  .patch ("/users/:id",      validateRequest(AdminValidation.updateUserSchema),            AdminController.updateUser)
  .patch ("/users/:id/password", validateRequest(AdminValidation.changeUserPasswordSchema), AdminController.changeUserPassword)
  .delete("/users/:id",      validateRequest(AdminValidation.getUserSchema),               AdminController.deleteUser);

export default adminRouter;
