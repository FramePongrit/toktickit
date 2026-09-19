export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TicketStatus =
  | "NEW"
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_FOR_REQUESTER"
  | "REOPENED"
  | "RESOLVED"
  | "CLOSED"
  | "CANCELLED";

export type Role = "REQUESTER" | "STAFF" | "ADMIN";

export interface SafeUser {
  id: number;
  fullName: string;
  email: string;
  active: boolean;
  role: Role;
  mustChangePassword: boolean;
}

export interface ReferenceItem {
  id: number;
  name: string;
}

export interface UserSummary {
  id: number;
  fullName: string;
  email: string;
}

export interface CommunicationAuthor {
  id: number;
  fullName: string;
  role: Role;
}

export interface PublicComment {
  id: number;
  body: string;
  createdAt: string;
  author: CommunicationAuthor;
}

export interface ResolutionIndication {
  indicatedAt: string;
  indicatedBy: CommunicationAuthor;
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
  /** Optional keeps Lab 2 fixture objects source-compatible; the API always returns it. */
  itPriority?: Priority;
  currentStatus: TicketStatus;
  createdAt: string;
  updatedAt: string;
  category: ReferenceItem;
  relatedSystem: ReferenceItem;
  requester: UserSummary;
  attachments: AttachmentMeta[];
  /** Optional keeps Lab 2 fixture objects source-compatible; the API always returns it. */
  publicComments?: PublicComment[];
  /** Optional keeps Lab 2 fixture objects source-compatible; the API always returns it. */
  resolutionIndication?: ResolutionIndication | null;
}

export interface PagedResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
