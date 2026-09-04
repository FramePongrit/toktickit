import { Router } from "express";
import { getPrisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const relatedSystemsRouter = Router();

// No identity required: the Create Ticket screen loads this reference data, and
// keeping it open matches /api/categories.
relatedSystemsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const relatedSystems = await getPrisma().relatedSystem.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    res.status(200).json(relatedSystems);
  })
);
