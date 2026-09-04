import { Router } from "express";
import { getPrisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const requestersRouter = Router();

// Deliberately not behind requireRequester: this endpoint is what the
// Development Requester Selection screen reads before any requester has been
// chosen, so requiring an identity here would be circular.
//
// The inactive filter is applied here rather than in the client, so it cannot
// be bypassed by calling the API directly (BR-06).
requestersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const requesters = await getPrisma().requesterUser.findMany({
      where: { active: true },
      select: { id: true, fullName: true, email: true, department: true },
      orderBy: { fullName: "asc" },
    });
    res.status(200).json(requesters);
  })
);
