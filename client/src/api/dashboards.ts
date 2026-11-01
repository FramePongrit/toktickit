import { request } from "../lib/http.js";
import type { PagedResult, Priority, SafeUser, TicketStatus } from "../types/index.js";
import type { ActionStatus } from "./actions.js";

export interface DashboardMetric {
  value: number;
  unit: "tickets" | "actions";
  href: string;
}

export interface DashboardWindow {
  timeZone: "Asia/Bangkok";
  from: string;
  through: string;
}

export interface DashboardTicket {
  id: number;
  ticketNumber: string;
  summary: string;
  currentStatus: TicketStatus;
  itPriority: Priority;
  updatedAt: string;
  resolvedAt: string | null;
  requestedPriority?: Priority;
  createdAt?: string;
  requester?: Pick<SafeUser, "id" | "fullName">;
  owner?: Pick<SafeUser, "id" | "fullName"> | null;
}

export interface DashboardPerson {
  id: number;
  fullName: string;
}

export interface DashboardAction {
  id: number;
  ticketId: number;
  ticketNumber: string;
  description: string;
  status: ActionStatus;
  workCycle: number;
  assignee: DashboardPerson;
  performedBy: DashboardPerson | null;
  completedAt: string | null;
  ticket: { currentStatus: TicketStatus; workCycle: number };
}

interface DashboardPreview<T> {
  data: T[];
  href: string;
}

export interface RequesterDashboard {
  generatedAt: string;
  window: DashboardWindow;
  metrics: {
    openTickets: DashboardMetric;
    waitingForMe: DashboardMetric;
    recentlyUpdated: DashboardMetric;
    recentlyResolved: DashboardMetric;
  };
  previews: {
    recentUpdated: DashboardPreview<DashboardTicket>;
    recentResolved: DashboardPreview<DashboardTicket>;
  };
}

export interface StaffDashboard {
  generatedAt: string;
  window: DashboardWindow;
  metrics: {
    unassignedTickets: DashboardMetric;
    myActiveTickets: DashboardMetric;
    myActiveActions: DashboardMetric;
    highUrgentTickets: DashboardMetric;
  };
  statusCounts: Record<TicketStatus, DashboardMetric>;
  previews: {
    priorityRecentTickets: DashboardPreview<DashboardTicket>;
    myCompletedActions: DashboardPreview<DashboardAction>;
  };
}

export type StaffActionView = "active-assigned" | "completed-performed";

export interface StaffDashboardActionQuery {
  view: StaffActionView;
  page: number;
  pageSize: 10 | 20 | 50;
  from?: string;
  through?: string;
}

export function fetchRequesterDashboard(signal?: AbortSignal): Promise<RequesterDashboard> {
  return request<RequesterDashboard>("/api/requester/dashboard", { signal });
}

export function fetchStaffDashboard(signal?: AbortSignal): Promise<StaffDashboard> {
  return request<StaffDashboard>("/api/staff/dashboard", { signal });
}

export function fetchStaffDashboardActions(query: StaffDashboardActionQuery, signal?: AbortSignal): Promise<PagedResult<DashboardAction>> {
  const params = new URLSearchParams({
    view: query.view,
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.from) params.set("from", query.from);
  if (query.through) params.set("through", query.through);
  return request<PagedResult<DashboardAction>>(`/api/staff/actions?${params.toString()}`, { signal });
}
