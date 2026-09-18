import express, { Request, Response } from "express";
import cors from "cors";
import type { SecurityConfig } from "./security/config.js";
import { createCredentialedCorsOptions } from "./security/cors.js";
import { getPrisma } from "./prisma.js";
import { apiRouter } from "./routes/index.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export function createApp(securityConfig: SecurityConfig) {
  const application = express();

  application.use(cors(createCredentialedCorsOptions(securityConfig)));
  application.use(express.json());

// ---------------------------------------------------------------------------
// Issue 2 — API health check
// Make the test in tests/lab-01/health.test.ts pass.
// It must return HTTP 200 with JSON: { status: "ok", service: "TokTickIT API" }
// ---------------------------------------------------------------------------
  application.get("/api/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", service: "TokTickIT API" });
  });

// Lab 2 filters to active categories. The response shape is unchanged, which
// is what tests/lab-01/categories.test.ts asserts.
  application.get("/api/categories", async (_req: Request, res: Response) => {
    try {
      const prisma = getPrisma();
      const categories = await prisma.category.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { id: "asc" },
      });
      res.status(200).json(categories);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
// ---------------------------------------------------------------------------

  application.use("/api", apiRouter);

// Order matters: the catch-all runs after every route, and the error handler
// must be registered last of all.
  application.use(notFound);
  application.use(errorHandler);
  return application;
}
