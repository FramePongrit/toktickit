import { Router, type RequestHandler } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { idParamSchema } from "../lib/validation.js";
import { requireRequester } from "../middleware/requireRequester.js";
import { requireRoles } from "../middleware/authorization.js";
import {
  getAttachmentMetadata,
  getDownloadableAttachment,
  removeAttachment,
} from "../services/attachments.service.js";

export interface AttachmentRouteDependencies {
  authentication: RequestHandler;
  csrf: RequestHandler;
}

const requireAttachmentReader = requireRoles("REQUESTER", "STAFF", "ADMIN");

export function createAttachmentsRouter(dependencies: AttachmentRouteDependencies): Router {
  const router = Router();

  router.get(
    "/:id",
    dependencies.authentication,
    requireAttachmentReader,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.status(200).json(await getAttachmentMetadata(req.auth!.userId, req.auth!.user.role, id));
    })
  );

  router.get(
    "/:id/download",
    dependencies.authentication,
    requireAttachmentReader,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      const file = await getDownloadableAttachment(req.auth!.userId, req.auth!.user.role, id);

      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Length", String(file.sizeBytes));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${file.originalFilename.replace(/"/g, "")}"`
      );
      res.setHeader("X-Content-Type-Options", "nosniff");

      await new Promise<void>((resolve, reject) => {
        res.sendFile(file.absolutePath, (error) => {
          if (!error) {
            resolve();
            return;
          }
          reject(error);
        });
      });
    })
  );

  router.patch(
    "/:id/remove",
    dependencies.authentication,
    requireRequester,
    dependencies.csrf,
    asyncHandler(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.status(200).json(await removeAttachment(req.auth!.userId, id, req.body));
    })
  );

  return router;
}
