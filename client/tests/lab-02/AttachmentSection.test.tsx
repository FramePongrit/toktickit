import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AttachmentSection } from "../../src/components/AttachmentSection.js";
import * as attachmentsApi from "../../src/api/attachments.js";
import { ApiError } from "../../src/lib/http.js";
import type { AttachmentMeta } from "../../src/types/index.js";

function attachment(overrides: Partial<AttachmentMeta> = {}): AttachmentMeta {
  return {
    id: 1,
    originalFilename: "evidence.png",
    mimeType: "image/png",
    sizeBytes: 402_118,
    uploadedAt: "2026-09-01T09:15:00.000Z",
    isRemoved: false,
    removedAt: null,
    removalReason: null,
    ...overrides,
  };
}

function makeFile(name: string, type: string, sizeBytes = 1024): File {
  const file = new File(["x"], name, { type });
  // File size cannot be set through the constructor in jsdom.
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

function renderSection(attachments: AttachmentMeta[] = []) {
  const onChanged = vi.fn();
  render(<AttachmentSection ticketId={42} attachments={attachments} onChanged={onChanged} />);
  return { onChanged };
}

function selectFile(file: File) {
  fireEvent.change(document.getElementById("attachment-input")!, { target: { files: [file] } });
}

describe("Attachments — listing", () => {
  it("UI-19: says so explicitly when a ticket has no attachments", () => {
    renderSection([]);

    // An explicit message rather than an empty region (BR-43).
    expect(screen.getByText(/No attachments on this ticket/i)).toBeInTheDocument();
  });

  it("shows the filename, size, type and upload time", () => {
    renderSection([attachment()]);

    expect(screen.getByText("evidence.png")).toBeInTheDocument();
    expect(screen.getByText(/393 KB/)).toBeInTheDocument();
    expect(screen.getByText(/image\/png/)).toBeInTheDocument();
  });

  it("counts only active attachments toward the limit", () => {
    renderSection([
      attachment({ id: 1 }),
      attachment({ id: 2, isRemoved: true, removedAt: "2026-09-02T10:00:00.000Z", removalReason: "Wrong file" }),
    ]);

    expect(screen.getByText(/1 active of 5/i)).toBeInTheDocument();
  });
});

describe("Attachments — removed presentation", () => {
  it("UI-23: shows a removed attachment as metadata with no way to reach its content", () => {
    renderSection([
      attachment({
        id: 7,
        originalFilename: "wrong-screenshot.png",
        isRemoved: true,
        removedAt: "2026-09-02T10:00:00.000Z",
        removalReason: "Uploaded the wrong screenshot",
      }),
    ]);

    expect(screen.getByText("wrong-screenshot.png")).toBeInTheDocument();
    expect(screen.getByText("Removed")).toBeInTheDocument();
    expect(screen.getByText(/Uploaded the wrong screenshot/)).toBeInTheDocument();

    // No download and no remove action for a removed attachment (BR-33).
    expect(screen.queryByRole("button", { name: /Download/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("keeps download and remove available for an active attachment", () => {
    renderSection([attachment()]);

    expect(screen.getByRole("button", { name: /Download/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Remove$/i })).toBeInTheDocument();
  });
});

describe("Attachments — upload", () => {
  it("UI-20: uploads a permitted file and reports the new attachment", async () => {
    const created = attachment({ id: 9, originalFilename: "scan.pdf", mimeType: "application/pdf" });
    const spy = vi.spyOn(attachmentsApi, "uploadAttachment").mockResolvedValue(created);
    const { onChanged } = renderSection([]);

    selectFile(makeFile("scan.pdf", "application/pdf"));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0][0]).toBe(42);
    expect(onChanged).toHaveBeenCalledWith([created]);
  });

  it("UI-21: rejects a disallowed type before any request is made", async () => {
    const spy = vi.spyOn(attachmentsApi, "uploadAttachment");
    renderSection([]);

    selectFile(makeFile("payload.exe", "application/octet-stream"));

    expect(await screen.findByText(/Only JPG, JPEG, PNG, WEBP and PDF/i)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("UI-21: rejects an oversized file before any request is made", async () => {
    const spy = vi.spyOn(attachmentsApi, "uploadAttachment");
    renderSection([]);

    selectFile(makeFile("huge.png", "image/png", 6 * 1024 * 1024));

    expect(await screen.findByText(/5 MB or smaller/i)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("UI-22: disables the input and explains once five are active", () => {
    renderSection([1, 2, 3, 4, 5].map((id) => attachment({ id })));

    expect(screen.getByText(/already has 5 active attachments/i)).toBeInTheDocument();
    expect(document.getElementById("attachment-input")).toBeDisabled();
  });

  it("shows a safe message when the upload fails on the server", async () => {
    vi.spyOn(attachmentsApi, "uploadAttachment").mockRejectedValue(
      new ApiError(409, "ATTACHMENT_LIMIT_REACHED", "A ticket may have at most 5 active attachments.")
    );
    renderSection([]);

    selectFile(makeFile("evidence.png", "image/png"));

    expect(await screen.findByText(/at most 5 active attachments/i)).toBeInTheDocument();
  });
});

describe("Attachments — download", () => {
  it("downloads through the API layer rather than a plain link", async () => {
    const spy = vi.spyOn(attachmentsApi, "downloadAttachment").mockResolvedValue(undefined);
    const active = attachment();
    renderSection([active]);

    fireEvent.click(screen.getByRole("button", { name: /Download/i }));

    // A plain <a href> could not carry the identity header across origins, so
    // the action must go through the fetch-and-blob path (D-06).
    await waitFor(() => expect(spy).toHaveBeenCalledWith(active));
  });

  it("reports a failed download without exposing internals", async () => {
    vi.spyOn(attachmentsApi, "downloadAttachment").mockRejectedValue(
      new Error("ECONNREFUSED 127.0.0.1:3000")
    );
    renderSection([attachment()]);

    fireEvent.click(screen.getByRole("button", { name: /Download/i }));

    expect(await screen.findByText(/could not be downloaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
  });
});

describe("Attachments — removal", () => {
  it("UI-24: keeps Confirm disabled until the reason is long enough", async () => {
    renderSection([attachment()]);

    fireEvent.click(screen.getByRole("button", { name: /^Remove$/i }));

    const confirm = await screen.findByRole("button", { name: /Confirm removal/i });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Removal reason/i), { target: { value: "no" } });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Removal reason/i), {
      target: { value: "Uploaded the wrong screenshot" },
    });
    expect(confirm).toBeEnabled();
  });

  it("UI-24: treats a whitespace-only reason as empty", async () => {
    renderSection([attachment()]);

    fireEvent.click(screen.getByRole("button", { name: /^Remove$/i }));
    fireEvent.change(await screen.findByLabelText(/Removal reason/i), {
      target: { value: "     " },
    });

    expect(screen.getByRole("button", { name: /Confirm removal/i })).toBeDisabled();
  });

  it("sends the trimmed reason and updates the attachment in place", async () => {
    const removed = attachment({
      isRemoved: true,
      removedAt: "2026-09-02T10:00:00.000Z",
      removalReason: "Uploaded the wrong screenshot",
    });
    const spy = vi.spyOn(attachmentsApi, "removeAttachment").mockResolvedValue(removed);
    const { onChanged } = renderSection([attachment()]);

    fireEvent.click(screen.getByRole("button", { name: /^Remove$/i }));
    fireEvent.change(await screen.findByLabelText(/Removal reason/i), {
      target: { value: "  Uploaded the wrong screenshot  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Confirm removal/i }));

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(1, "Uploaded the wrong screenshot")
    );
    expect(onChanged).toHaveBeenCalledWith([removed]);
  });

  it("shows a message and keeps the dialog open when removal fails", async () => {
    vi.spyOn(attachmentsApi, "removeAttachment").mockRejectedValue(
      new ApiError(409, "ALREADY_REMOVED", "This attachment has already been removed.")
    );
    renderSection([attachment()]);

    fireEvent.click(screen.getByRole("button", { name: /^Remove$/i }));
    fireEvent.change(await screen.findByLabelText(/Removal reason/i), {
      target: { value: "Removing this one" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Confirm removal/i }));

    expect(await screen.findByText(/already been removed/i)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes the dialog on cancel without removing anything", async () => {
    const spy = vi.spyOn(attachmentsApi, "removeAttachment");
    renderSection([attachment()]);

    fireEvent.click(screen.getByRole("button", { name: /^Remove$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Cancel$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(spy).not.toHaveBeenCalled();
  });
});
