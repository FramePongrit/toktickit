import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { createTicketSchema, idParamSchema, listTicketsQuerySchema } from "../lib/validation.js";
import { requireRequester } from "../middleware/requireRequester.js";
import { createTicket, getOwnedTicket, listTickets } from "../services/tickets.service.js";

export const ticketsRouter = Router();

// Ownership starts here: every route below resolves the caller once, and no
// handler reads the identity from anywhere else (BR-48).
ticketsRouter.use(requireRequester);

ticketsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createTicketSchema.parse(req.body);
    const ticket = await createTicket(req.requester!.id, input);
    res.status(201).json(ticket);
  })
);

ticketsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listTicketsQuerySchema.parse(req.query);
    const page = await listTickets(req.requester!.id, query);
    res.status(200).json(page);
  })
);

ticketsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const ticket = await getOwnedTicket(req.requester!.id, id);
    res.status(200).json(ticket);
  })
);
