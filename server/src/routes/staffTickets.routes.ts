import { Router, type RequestHandler } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { idParamSchema } from "../lib/validation.js";
import { requireStaffRole } from "../middleware/authorization.js";
import {
  createInternalNote,
  listInternalNotes,
} from "../services/communications.service.js";

export interface StaffTicketsRouteDependencies {
  authentication: RequestHandler;
  csrf: RequestHandler;
}

export function createStaffTicketsRouter(dependencies: StaffTicketsRouteDependencies): Router {
  const router = Router();

  router.get(
    "/:id/notes",
    dependencies.authentication,
    requireStaffRole,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      const notes = await listInternalNotes(req.auth!.userId, req.auth!.user.role, id);
      res.status(200).json({ data: notes });
    })
  );

  router.post(
    "/:id/notes",
    dependencies.authentication,
    requireStaffRole,
    dependencies.csrf,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      const note = await createInternalNote(req.auth!.userId, req.auth!.user.role, id, req.body);
      res.status(201).json(note);
    })
  );

  return router;
}
