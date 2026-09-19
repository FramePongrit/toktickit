import { Router, type RequestHandler } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { idParamSchema } from "../lib/validation.js";
import { requireStaffRole } from "../middleware/authorization.js";
import { staffQueueQuerySchema } from "../lib/validation.js";
import {
  createInternalNote,
  listInternalNotes,
} from "../services/communications.service.js";
import { listEligibleTicketOwners, listStaffQueue } from "../services/staffQueue.service.js";

export interface StaffTicketsRouteDependencies {
  authentication: RequestHandler;
  csrf: RequestHandler;
}

export function createStaffTicketsRouter(dependencies: StaffTicketsRouteDependencies): Router {
  const router = Router();

  router.get(
    "/",
    dependencies.authentication,
    requireStaffRole,
    asyncHandler(async (req, res) => {
      const query = staffQueueQuerySchema.parse(req.query);
      res.status(200).json(await listStaffQueue(req.auth!.userId, query));
    })
  );

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

export function createStaffTicketOwnersRouter(dependencies: StaffTicketsRouteDependencies): Router {
  const router = Router();
  router.get(
    "/ticket-owners",
    dependencies.authentication,
    requireStaffRole,
    asyncHandler(async (req, res) => {
      const queryKeys = Object.keys(req.query);
      if (queryKeys.length > 0) {
        throw HttpError.validationFailed(
          "The eligible Owner directory does not accept query parameters.",
          queryKeys.map((field) => ({ field, message: "This query parameter is not supported." }))
        );
      }
      res.status(200).json({ data: await listEligibleTicketOwners() });
    })
  );
  return router;
}
