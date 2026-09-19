import { Router, type RequestHandler } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { createTicketSchema, idParamSchema, listTicketsQuerySchema } from "../lib/validation.js";
import { requireRequester } from "../middleware/requireRequester.js";
import { parseSingleAttachment, cleanupUploadedFileOnError } from "../middleware/upload.js";
import { createTicket, getOwnedTicket, listTickets } from "../services/tickets.service.js";
import { addAttachment, assertTicketIsOwned } from "../services/attachments.service.js";

export interface TicketRouteDependencies {
  authentication: RequestHandler;
  csrf: RequestHandler;
}

/**
 * Preserved Requester Ticket routes. Authentication and role checks are
 * attached to every route rather than relying on a UI decision or a client
 * identity override. The upload route intentionally puts its multipart parser
 * first; parser failures are transport failures and must not reveal auth,
 * ownership, or Ticket state.
 */
export function createTicketsRouter(dependencies: TicketRouteDependencies): Router {
  const router = Router();

  router.post(
    "/",
    dependencies.authentication,
    requireRequester,
    dependencies.csrf,
    asyncHandler(async (req, res) => {
      const input = createTicketSchema.parse(req.body);
      const ticket = await createTicket(req.auth!.userId, input);
      res.status(201).json(ticket);
    })
  );

  router.get(
    "/",
    dependencies.authentication,
    requireRequester,
    asyncHandler(async (req, res) => {
      const query = listTicketsQuerySchema.parse(req.query);
      const page = await listTickets(req.auth!.userId, query);
      res.status(200).json(page);
    })
  );

  router.get(
    "/:id",
    dependencies.authentication,
    requireRequester,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      const ticket = await getOwnedTicket(req.auth!.userId, id);
      res.status(200).json(ticket);
    })
  );

  router.post(
    "/:id/attachments",
    // Multipart parsing is the transport boundary. It must run before the
    // application guards, and every later failure cleans the staged file.
    parseSingleAttachment,
    dependencies.authentication,
    requireRequester,
    dependencies.csrf,
    asyncHandler(async (req, _res, next) => {
      const { id } = idParamSchema.parse(req.params);
      await assertTicketIsOwned(req.auth!.userId, id);
      next();
    }),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        throw HttpError.badRequest("NO_FILE", "No file was included in the request.");
      }
      const { id } = idParamSchema.parse(req.params);
      res.status(201).json(await addAttachment(req.auth!.userId, id, req.file));
    })
  );

  // Multer can create a disk file before a later application guard or service
  // fails. Express error middleware is required here because ordinary route
  // cleanup cannot run after an error has already entered the chain.
  router.use(cleanupUploadedFileOnError);
  return router;
}
