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
import {
  createStaffAction,
  getStaffAction,
  listStaffActionHistory,
  listStaffActions,
  patchStaffAction,
  transitionStaffAction,
} from "../services/actions.service.js";
import {
  claimStaffTicket,
  getStaffTicketDetail,
  reassignStaffTicket,
  updateStaffItPriority,
  updateStaffTicketStatus,
} from "../services/staffTicketOperations.service.js";
import { listStaffTicketWorkflow } from "../services/workflow.service.js";

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
    "/:id/actions/:actionId/history",
    dependencies.authentication,
    requireStaffRole,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      const { id: actionId } = idParamSchema.parse({ id: req.params.actionId });
      res.status(200).json(await listStaffActionHistory(id, actionId, req.query));
    })
  );

  router.get(
    "/:id/actions/:actionId",
    dependencies.authentication,
    requireStaffRole,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      const { id: actionId } = idParamSchema.parse({ id: req.params.actionId });
      res.status(200).json(await getStaffAction(id, actionId));
    })
  );

  router.get(
    "/:id/actions",
    dependencies.authentication,
    requireStaffRole,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.status(200).json(await listStaffActions(id, req.query));
    })
  );

  router.post(
    "/:id/actions/:actionId/transitions",
    dependencies.authentication,
    requireStaffRole,
    dependencies.csrf,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      const { id: actionId } = idParamSchema.parse({ id: req.params.actionId });
      const result = await transitionStaffAction(
        { userId: req.auth!.userId, sessionId: req.auth!.sessionId },
        id,
        actionId,
        req.body,
        req.header("Idempotency-Key")
      );
      if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
      res.status(result.status).json(result.body);
    })
  );

  router.patch(
    "/:id/actions/:actionId",
    dependencies.authentication,
    requireStaffRole,
    dependencies.csrf,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      const { id: actionId } = idParamSchema.parse({ id: req.params.actionId });
      const result = await patchStaffAction(
        { userId: req.auth!.userId, sessionId: req.auth!.sessionId },
        id,
        actionId,
        req.body
      );
      res.status(result.status).json(result.body);
    })
  );

  router.post(
    "/:id/actions",
    dependencies.authentication,
    requireStaffRole,
    dependencies.csrf,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      const result = await createStaffAction(
        { userId: req.auth!.userId, sessionId: req.auth!.sessionId },
        id,
        req.body,
        req.header("Idempotency-Key")
      );
      if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
      res.status(result.status).json(result.body);
    })
  );

  router.get(
    "/:id",
    dependencies.authentication,
    requireStaffRole,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.status(200).json(await getStaffTicketDetail(id));
    })
  );

  router.get(
    "/:id/workflow",
    dependencies.authentication,
    requireStaffRole,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.status(200).json(await listStaffTicketWorkflow(id, req.query));
    })
  );

  router.patch(
    "/:id/claim",
    dependencies.authentication,
    requireStaffRole,
    dependencies.csrf,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.status(200).json(await claimStaffTicket(
        { userId: req.auth!.userId, sessionId: req.auth!.sessionId }, id, req.body
      ));
    })
  );

  router.patch(
    "/:id/owner",
    dependencies.authentication,
    requireStaffRole,
    dependencies.csrf,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.status(200).json(await reassignStaffTicket(
        { userId: req.auth!.userId, sessionId: req.auth!.sessionId }, id, req.body
      ));
    })
  );

  router.patch(
    "/:id/it-priority",
    dependencies.authentication,
    requireStaffRole,
    dependencies.csrf,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.status(200).json(await updateStaffItPriority(
        { userId: req.auth!.userId, sessionId: req.auth!.sessionId }, id, req.body
      ));
    })
  );

  router.patch(
    "/:id/status",
    dependencies.authentication,
    requireStaffRole,
    dependencies.csrf,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      const result = await updateStaffTicketStatus(
        { userId: req.auth!.userId, sessionId: req.auth!.sessionId },
        id,
        req.body,
        req.header("Idempotency-Key")
      );
      if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
      res.status(result.status).json(result.body);
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
