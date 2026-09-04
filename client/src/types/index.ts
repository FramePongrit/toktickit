export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TicketStatus = "NEW";

export interface ReferenceItem {
  id: number;
  name: string;
}

export interface DevRequester {
  id: number;
  fullName: string;
  email: string;
  department: string | null;
}

export interface AttachmentMeta {
  id: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  isRemoved: boolean;
  removedAt: string | null;
  removalReason: string | null;
}

export interface TicketListItem {
  id: number;
  ticketNumber: string;
  summary: string;
  requestedPriority: Priority;
  currentStatus: TicketStatus;
  createdAt: string;
  category: ReferenceItem;
  relatedSystem: ReferenceItem;
  attachmentCount: number;
}

export interface TicketDetail {
  id: number;
  ticketNumber: string;
  summary: string;
  description: string;
  requestedPriority: Priority;
  currentStatus: TicketStatus;
  createdAt: string;
  updatedAt: string;
  category: ReferenceItem;
  relatedSystem: ReferenceItem;
  requester: DevRequester;
  attachments: AttachmentMeta[];
}

export interface PagedResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
