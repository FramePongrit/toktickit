import { Router } from "express";
import { relatedSystemsRouter } from "./relatedSystems.routes.js";
import { requestersRouter } from "./requesters.routes.js";
import { ticketsRouter } from "./tickets.routes.js";

export const apiRouter = Router();

apiRouter.use("/related-systems", relatedSystemsRouter);
apiRouter.use("/dev-requesters", requestersRouter);
apiRouter.use("/tickets", ticketsRouter);
