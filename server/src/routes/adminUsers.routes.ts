import { Router, type RequestHandler } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { idParamSchema } from "../lib/validation.js";
import { requireRoles } from "../middleware/authorization.js";
import {
  createAdminUser,
  editAdminUser,
  listAdminUsers,
  resetAdminUserPassword,
} from "../services/adminUsers.service.js";

export interface AdminUsersRouteDependencies {
  authentication: RequestHandler;
  csrf: RequestHandler;
}

export function createAdminUsersRouter(dependencies: AdminUsersRouteDependencies): Router {
  const router = Router();

  router.get(
    "/",
    dependencies.authentication,
    requireRoles("ADMIN"),
    asyncHandler(async (req, res) => {
      res.status(200).json(await listAdminUsers(req.query));
    })
  );

  router.post(
    "/",
    dependencies.authentication,
    requireRoles("ADMIN"),
    dependencies.csrf,
    asyncHandler(async (req, res) => {
      res.status(201).json(await createAdminUser(req.body));
    })
  );

  router.patch(
    "/:id",
    dependencies.authentication,
    requireRoles("ADMIN"),
    dependencies.csrf,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.status(200).json(await editAdminUser(req.auth!.userId, id, req.body));
    })
  );

  router.post(
    "/:id/reset-password",
    dependencies.authentication,
    requireRoles("ADMIN"),
    dependencies.csrf,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.status(200).json(await resetAdminUserPassword(req.auth!.userId, id, req.body));
    })
  );

  return router;
}
