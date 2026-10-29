import { Router, type RequestHandler } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { emptyQuerySchema, staffActionsQuerySchema } from "../lib/validation.js";
import { requireRequesterRole, requireStaffRole } from "../middleware/authorization.js";
import { getRequesterDashboard, getStaffDashboard, listStaffDashboardActions } from "../services/dashboards.service.js";

export interface DashboardRouteDependencies {
  authentication: RequestHandler;
}

const privateNoStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
};

export function createRequesterDashboardRouter({ authentication }: DashboardRouteDependencies): Router {
  const router = Router();
  router.get(
    "/dashboard",
    privateNoStore,
    authentication,
    requireRequesterRole,
    asyncHandler(async (req, res) => {
      emptyQuerySchema.parse(req.query);
      res.status(200).json(await getRequesterDashboard(req.auth!.userId));
    })
  );
  return router;
}

export function createStaffDashboardRouter({ authentication }: DashboardRouteDependencies): Router {
  const router = Router();
  router.get(
    "/dashboard",
    privateNoStore,
    authentication,
    requireStaffRole,
    asyncHandler(async (req, res) => {
      emptyQuerySchema.parse(req.query);
      res.status(200).json(await getStaffDashboard(req.auth!.userId));
    })
  );
  router.get(
    "/actions",
    privateNoStore,
    authentication,
    requireStaffRole,
    asyncHandler(async (req, res) => {
      const query = staffActionsQuerySchema.parse(req.query);
      res.status(200).json(await listStaffDashboardActions(req.auth!.userId, query));
    })
  );
  return router;
}
