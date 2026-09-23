import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { getPrisma } from "../../server/src/prisma.js";
import { hashPassword } from "../../server/src/security/password.js";
import { storedFilePath } from "../../server/src/lib/paths.js";
import type { APIRequestContext, Page } from "@playwright/test";

export const API_URL = process.env.PW_API_URL ?? "http://localhost:3000";
export const E2E_PASSWORD = "E2EValid123!";
export const E2E_INITIAL_PASSWORD = "E2EInitial123!";
export const E2E_CHANGED_PASSWORD = "E2EChanged456!";
export const E2E_TAG = `e2e-${Date.now()}-${process.pid}-${randomUUID().slice(0, 8)}`;

export function assertIsolatedE2EDatabase() {
  const configured = process.env.DATABASE_URL;
  if (!configured) throw new Error("Issue #61 E2E requires an explicit isolated DATABASE_URL.");
  const schema = new URL(configured).searchParams.get("schema");
  if (!schema || !/^issue61_verify_[a-f0-9]{24}$/.test(schema)) {
    throw new Error(`Issue #61 E2E refuses non-isolated database schema: ${schema ?? "missing"}`);
  }
}

export type E2ERole = "REQUESTER" | "STAFF" | "ADMIN";

export interface E2EUser {
  id: number;
  fullName: string;
  email: string;
  role: E2ERole;
  password: string;
}

export interface AuthSession {
  user: { id: number; fullName: string; email: string; role: E2ERole; active: boolean; mustChangePassword: boolean };
  csrfToken: string;
}

export async function createE2EUser(
  role: E2ERole,
  label: string,
  options: { mustChangePassword?: boolean; active?: boolean; password?: string } = {},
): Promise<E2EUser> {
  const prisma = getPrisma();
  const password = options.password ?? E2E_PASSWORD;
  const fullName = `E2E ${label} ${E2E_TAG}`;
  const email = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${E2E_TAG}@example.test`;
  const user = await prisma.user.create({
    data: {
      fullName,
      email,
      role,
      active: options.active ?? true,
      passwordHash: await hashPassword(password),
      mustChangePassword: options.mustChangePassword ?? false,
    },
  });
  return { id: user.id, fullName, email, role, password };
}

export async function findUserIdByEmail(email: string): Promise<number> {
  const user = await getPrisma().user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  return user.id;
}

export async function loginApi(api: APIRequestContext, user: Pick<E2EUser, "email" | "password">): Promise<AuthSession> {
  const response = await api.post(`${API_URL}/api/auth/login`, {
    data: { email: user.email, password: user.password },
  });
  if (!response.ok()) throw new Error(`E2E login failed with HTTP ${response.status()}`);
  return response.json() as Promise<AuthSession>;
}

export async function createTicketApi(
  api: APIRequestContext,
  session: AuthSession,
  summary: string,
  requestedPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" = "MEDIUM",
): Promise<{ id: number; ticketNumber: string }> {
  const [categoriesResponse, systemsResponse] = await Promise.all([
    api.get(`${API_URL}/api/categories`),
    api.get(`${API_URL}/api/related-systems`),
  ]);
  const categories = (await categoriesResponse.json()) as Array<{ id: number; name: string }>;
  const systems = (await systemsResponse.json()) as Array<{ id: number; name: string }>;
  const response = await api.post(`${API_URL}/api/tickets`, {
    headers: { "X-CSRF-Token": session.csrfToken },
    data: {
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
      requestedPriority,
      summary,
      description: "E2E-owned ticket fixture for Issue 61.",
    },
  });
  if (!response.ok()) throw new Error(`E2E ticket creation failed with HTTP ${response.status()}`);
  const ticket = (await response.json()) as { id: number; ticketNumber: string };
  return ticket;
}

export async function loginUi(page: Page, user: Pick<E2EUser, "email" | "password" | "fullName">) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
  if (page.url().includes("/change-password")) {
    await page.getByRole("heading", { name: "Change password" }).waitFor({ state: "visible" });
    return;
  }
  await expectCurrentUser(page, user.fullName);
}

export async function expectCurrentUser(page: Page, fullName: string) {
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
  const currentUser = page.getByTestId("current-user");
  if (!(await currentUser.isVisible())) {
    const navigationToggle = page.getByRole("button", { name: "Open navigation menu" });
    if (await navigationToggle.isVisible()) await navigationToggle.click();
  }
  await currentUser.waitFor({ state: "visible" });
  if ((await currentUser.textContent()) !== fullName) {
    throw new Error(`Expected authenticated user ${fullName}`);
  }
}

export async function assertNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) throw new Error(`${label} has ${overflow}px horizontal overflow`);
}

export async function assertResponsiveLayout(page: Page, label: string) {
  await assertNoHorizontalOverflow(page, label);
  const diagnostics = await page.evaluate(() => {
    const visible = (element: HTMLElement) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const inViewport = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= window.innerWidth + 1;
    };
    const clipped: string[] = [];
    document.querySelectorAll<HTMLElement>("section, [role='dialog'], table, input, select, textarea, button, a.btn").forEach((element) => {
      if (visible(element) && !inViewport(element)) clipped.push(`${element.tagName} ${element.id || element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 32) || "anonymous"}`);
    });

    const textClipping: string[] = [];
    document.querySelectorAll<HTMLElement>("h1, h2, h3, label, button, a.btn, input, select, textarea").forEach((element) => {
      if (!visible(element) || element.classList.contains("visually-hidden")) return;
      const style = window.getComputedStyle(element);
      if (element.scrollWidth > element.clientWidth + 1 && (style.overflowX === "hidden" || style.overflowX === "clip")) {
        textClipping.push(`${element.tagName} ${element.id || element.textContent?.trim().slice(0, 32) || "anonymous"}`);
      }
    });

    const tooSmall: string[] = [];
    document.querySelectorAll<HTMLElement>("h1, h2, h3, label, button, a.btn, input, select, textarea").forEach((element) => {
      if (visible(element) && !element.classList.contains("visually-hidden") && Number.parseFloat(window.getComputedStyle(element).fontSize) < 12) {
        tooSmall.push(`${element.tagName} ${element.id || element.textContent?.trim().slice(0, 32) || "anonymous"}`);
      }
    });

    const interactive = Array.from(document.querySelectorAll<HTMLElement>("button, input, select, textarea, a.btn"))
      .filter(visible)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const topmost = document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
        return topmost === element || Boolean(topmost && element.contains(topmost));
      });
    const overlaps: string[] = [];
    for (let leftIndex = 0; leftIndex < interactive.length; leftIndex += 1) {
      const left = interactive[leftIndex].getBoundingClientRect();
      for (let rightIndex = leftIndex + 1; rightIndex < interactive.length; rightIndex += 1) {
        const right = interactive[rightIndex].getBoundingClientRect();
        const overlapWidth = Math.min(left.right, right.right) - Math.max(left.left, right.left);
        const overlapHeight = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
        if (overlapWidth > 1 && overlapHeight > 1) {
          overlaps.push(`${interactive[leftIndex].tagName} overlaps ${interactive[rightIndex].tagName}`);
        }
      }
    }
    return { clipped, textClipping, tooSmall, overlaps };
  });
  if (diagnostics.clipped.length) throw new Error(`${label} has clipped elements: ${diagnostics.clipped.join(", ")}`);
  if (diagnostics.textClipping.length) throw new Error(`${label} has clipped text/control content: ${diagnostics.textClipping.join(", ")}`);
  if (diagnostics.tooSmall.length) throw new Error(`${label} has unreadable controls/text: ${diagnostics.tooSmall.join(", ")}`);
  if (diagnostics.overlaps.length) throw new Error(`${label} has overlapping controls: ${diagnostics.overlaps.join(", ")}`);
}

export async function assertDialogsAccessible(page: Page) {
  const dialogs = page.getByRole("dialog");
  for (let index = 0; index < await dialogs.count(); index += 1) {
    const dialog = dialogs.nth(index);
    await dialog.evaluate((element) => {
      if (element.getAttribute("aria-modal") !== "true") throw new Error("dialog must declare aria-modal=true");
      const labelledBy = element.getAttribute("aria-labelledby");
      if (!labelledBy || !element.ownerDocument.getElementById(labelledBy)) throw new Error("dialog needs a valid label");
    });
    await dialog.focus();
    await page.keyboard.press("Tab");
    const activeInside = await dialog.evaluate((element) => element.contains(document.activeElement));
    if (!activeInside) throw new Error("dialog focus escaped on Tab");
  }
}

export async function cleanupE2EUsers(userIds: number[]) {
  if (userIds.length === 0) return;
  const prisma = getPrisma();
  const tickets = await prisma.ticket.findMany({
    where: { requesterId: { in: userIds } },
    select: { id: true, attachments: { select: { storedFilename: true } } },
  });
  const ticketIds = tickets.map((ticket) => ticket.id);
  const storedFiles = tickets.flatMap((ticket) => ticket.attachments.map((attachment) => attachment.storedFilename));

  await prisma.$transaction(async (tx) => {
    await tx.authSession.deleteMany({ where: { userId: { in: userIds } } });
    if (ticketIds.length > 0) {
      await tx.publicComment.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await tx.internalNote.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await tx.attachment.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await tx.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    }
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });

  await Promise.all(storedFiles.map((storedFilename) => fs.rm(storedFilePath(storedFilename), { force: true })));
}

export async function closeE2EPrisma() {
  await getPrisma().$disconnect();
}
