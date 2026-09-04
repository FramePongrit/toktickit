import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { idParamSchema, removeAttachmentSchema } from "../lib/validation.js";
import { requireRequester } from "../middleware/requireRequester.js";
import {
  getAttachmentMetadata,
  getDownloadableAttachment,
  removeAttachment,
} from "../services/attachments.service.js";

export const attachmentsRouter = Router();

attachmentsRouter.use(requireRequester);

attachmentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    res.status(200).json(await getAttachmentMetadata(req.requester!.id, id));
  })
);

attachmentsRouter.get(
  "/:id/download",
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const file = await getDownloadableAttachment(req.requester!.id, id);

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Length", String(file.sizeBytes));
    // The stored name is internal; the requester gets the name they uploaded.
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
        // The row exists but the bytes do not — a server-side inconsistency,
        // not something the caller did wrong.
        reject(
          new HttpError(
            500,
            "ATTACHMENT_FILE_MISSING",
            "The stored file for this attachment could not be read."
          )
        );
      });
    });
  })
);

// PATCH, not DELETE: the attachment is not deleted and stays addressable
// afterwards, so DELETE would imply a subsequent 404 that does not happen (D-04).
attachmentsRouter.patch(
  "/:id/remove",
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { removalReason } = removeAttachmentSchema.parse(req.body);
    res.status(200).json(await removeAttachment(req.requester!.id, id, removalReason));
  })
);
