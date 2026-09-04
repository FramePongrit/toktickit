import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { createTicketSchema } from "../lib/validation.js";
import { requireRequester } from "../middleware/requireRequester.js";
import { createTicket } from "../services/tickets.service.js";

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
