import { test, expect, request as playwrightRequest } from "@playwright/test";
import {
  API_URL,
  E2E_CHANGED_PASSWORD,
  E2E_TAG,
  type E2EUser,
  assertIsolatedE2EDatabase,
  assertDialogsAccessible,
  assertNoHorizontalOverflow,
  cleanupE2EUsers,
  closeE2EPrisma,
  createE2EUser,
  findUserIdByEmail,
  loginApi,
  loginUi,
} from "../support/fixtures.js";

test.describe.serial("E2E-U01 — Administrator User Management", () => {
  let admin: E2EUser;
  let staff: E2EUser;
  let inactiveStaff: E2EUser;
  let lastActiveAdmin: E2EUser;
  const createdUserIds: number[] = [];

  test.beforeAll(async () => {
    assertIsolatedE2EDatabase();
    admin = await createE2EUser("ADMIN", "users-admin");
    staff = await createE2EUser("STAFF", "users-staff");
    inactiveStaff = await createE2EUser("STAFF", "users-inactive-staff", { active: false });
    lastActiveAdmin = await createE2EUser("ADMIN", "users-last-active-admin");
    createdUserIds.push(admin.id, staff.id, inactiveStaff.id, lastActiveAdmin.id);
  });

  test.afterAll(async () => {
    await cleanupE2EUsers(createdUserIds);
    await closeE2EPrisma();
  });

  test("Admin manages a User while direct non-Admin and CSRF boundaries remain enforced", async ({ page, request }) => {
    const adminSession = await loginApi(request, admin);
    const nonAdminApi = await playwrightRequest.newContext({ baseURL: API_URL });
    try {
      const staffSession = await loginApi(nonAdminApi, staff);
      const denied = await nonAdminApi.get(`${API_URL}/api/admin/users`);
      expect(denied.status()).toBe(403);
      expect((await denied.json()).error.code).toBe("FORBIDDEN");

      const missingCsrf = await request.post(`${API_URL}/api/admin/users`, {
        data: {
          fullName: "Should Not Be Created",
          email: `csrf-${E2E_TAG}@example.test`,
          role: "REQUESTER",
          active: true,
          initialPassword: "ValidInitial123!",
          confirmation: "ValidInitial123!",
        },
      });
      expect(missingCsrf.status()).toBe(403);
      expect((await missingCsrf.json()).error.code).toBe("CSRF_INVALID");
      expect(staffSession.user.role).toBe("STAFF");

      await loginUi(page, admin);
      await expect(page).toHaveURL(/\/admin\/users$/);
      await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
      await expect(page.getByTestId("admin-users-table")).toBeVisible();

      await page.locator("#admin-user-role-filter").selectOption("STAFF");
      await expect(page.getByRole("cell", { name: staff.fullName, exact: true })).toBeVisible();
      await expect(page.getByRole("cell", { name: inactiveStaff.fullName, exact: true })).toBeVisible();
      await page.locator("#admin-user-active-filter").selectOption("false");
      await expect(page.getByRole("cell", { name: inactiveStaff.fullName, exact: true })).toBeVisible();
      await expect(page.getByRole("cell", { name: staff.fullName, exact: true })).toHaveCount(0);
      await page.locator("#admin-user-role-filter").selectOption("");
      await page.locator("#admin-user-active-filter").selectOption("");

      const createdEmail = `managed-${E2E_TAG}@example.test`;
      const createdName = `Managed User ${E2E_TAG}`;
      await page.getByRole("button", { name: "Create User" }).click();
      const createDialog = page.getByTestId("create-user-dialog");
      await expect(createDialog).toBeVisible();
      await assertDialogsAccessible(page);
      await createDialog.getByLabel("Full name").fill(createdName);
      await createDialog.getByLabel("Email").fill(createdEmail);
      await createDialog.getByLabel("Role").selectOption("REQUESTER");
      await createDialog.getByLabel("Initial Password", { exact: true }).fill("ValidInitial123!");
      await createDialog.getByLabel("Confirm Initial Password").fill("ValidInitial123!");
      await createDialog.getByRole("button", { name: "Create User" }).click();
      await expect(page.getByRole("status")).toContainText("User created successfully");

      const managedId = await findUserIdByEmail(createdEmail);
      createdUserIds.push(managedId);
      await page.getByLabel("Search").fill(createdEmail);
      await expect(page.getByRole("cell", { name: createdName, exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Create User" }).click();
      const duplicateDialog = page.getByTestId("create-user-dialog");
      await duplicateDialog.getByLabel("Full name").fill("Duplicate Email Attempt");
      await duplicateDialog.getByLabel("Email").fill(createdEmail);
      await duplicateDialog.getByLabel("Initial Password", { exact: true }).fill("ValidInitial123!");
      await duplicateDialog.getByLabel("Confirm Initial Password").fill("ValidInitial123!");
      await duplicateDialog.getByRole("button", { name: "Create User" }).click();
      await expect(duplicateDialog.getByRole("alert")).toContainText("already exists");
      await duplicateDialog.getByRole("button", { name: "Cancel" }).click();

      const createdRow = page.getByRole("row").filter({ hasText: createdName });
      await createdRow.getByRole("button", { name: "Edit" }).click();
      const editDialog = page.getByTestId("edit-user-dialog");
      await expect(editDialog).toBeVisible();
      await assertDialogsAccessible(page);
      await editDialog.getByLabel("Full name").fill(`${createdName} Updated`);
      await editDialog.getByLabel("Role").selectOption("STAFF");
      await editDialog.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByRole("status")).toContainText("updated successfully");
      await expect(page.getByRole("cell", { name: `${createdName} Updated`, exact: true })).toBeVisible();

      const updatedStaffRow = page.getByRole("row").filter({ hasText: `${createdName} Updated` });
      await updatedStaffRow.getByRole("button", { name: "Edit" }).click();
      const deactivateDialog = page.getByTestId("edit-user-dialog");
      await expect(deactivateDialog.getByLabel("Active account")).toBeChecked();
      await deactivateDialog.getByLabel("Active account").uncheck();
      await deactivateDialog.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByRole("status")).toContainText("updated successfully");
      await expect(page.getByRole("row").filter({ hasText: `${createdName} Updated` })).toContainText("Inactive");

      await page.locator("#admin-user-active-filter").selectOption("false");
      await expect(page.getByRole("cell", { name: `${createdName} Updated`, exact: true })).toBeVisible();
      const inactiveManagedRow = page.getByRole("row").filter({ hasText: `${createdName} Updated` });
      await inactiveManagedRow.getByRole("button", { name: "Edit" }).click();
      const activateDialog = page.getByTestId("edit-user-dialog");
      await activateDialog.getByLabel("Active account").check();
      await activateDialog.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByRole("status")).toContainText("updated successfully");
      await page.locator("#admin-user-active-filter").selectOption("true");
      await expect(page.getByRole("row").filter({ hasText: `${createdName} Updated` })).toContainText("Active");
      await page.locator("#admin-user-active-filter").selectOption("");

      const updatedRow = page.getByRole("row").filter({ hasText: `${createdName} Updated` });
      await updatedRow.getByRole("button", { name: "Edit" }).click();
      await page.getByRole("button", { name: "Reset Initial Password" }).click();
      const resetDialog = page.getByTestId("reset-user-dialog");
      await expect(resetDialog).toBeVisible();
      await assertDialogsAccessible(page);
      await resetDialog.getByLabel("New Initial Password").fill(E2E_CHANGED_PASSWORD);
      await resetDialog.getByLabel("Confirm Initial Password").fill(E2E_CHANGED_PASSWORD);
      await resetDialog.locator("button[type=submit]").click();
      await expect(page.getByRole("status")).toContainText("Initial Password reset");

      const resetLoginApi = await playwrightRequest.newContext({ baseURL: API_URL });
      try {
        const old = await resetLoginApi.post(`${API_URL}/api/auth/login`, {
          data: { email: createdEmail, password: "ValidInitial123!" },
        });
        expect(old.status()).toBe(401);
        const next = await resetLoginApi.post(`${API_URL}/api/auth/login`, {
          data: { email: createdEmail, password: E2E_CHANGED_PASSWORD },
        });
        expect(next.status()).toBe(200);
        expect((await next.json()).user.mustChangePassword).toBe(true);
      } finally {
        await resetLoginApi.dispose();
      }

      await page.getByLabel("Search").fill(admin.email);
      const ownRow = page.getByRole("row").filter({ hasText: admin.fullName });
      await expect(ownRow).toBeVisible();
      await ownRow.getByRole("button", { name: "Edit" }).click();
      const ownEdit = page.getByTestId("edit-user-dialog");
      await expect(ownEdit.getByLabel("Role")).toBeDisabled();
      await expect(ownEdit.getByLabel("Active account")).toBeDisabled();
      await expect(ownEdit.getByRole("button", { name: "Reset Initial Password" })).toBeDisabled();
      await ownEdit.getByRole("button", { name: "Cancel" }).click();

      const selfProtection = await request.patch(`${API_URL}/api/admin/users/${admin.id}`, {
        headers: { "X-CSRF-Token": adminSession.csrfToken },
        data: { role: "REQUESTER", active: false },
      });
      expect(selfProtection.status()).toBe(409);
      expect((await selfProtection.json()).error.code).toBe("ADMIN_SELF_PROTECTION");
      await assertNoHorizontalOverflow(page, "User Management desktop");
    } finally {
      await nonAdminApi.dispose();
    }
  });

  test("Browser proves LAST_ACTIVE_ADMINISTRATOR for an isolated concurrent Admin pair", async ({ browser }) => {
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();
    const userPath = (id: number) => `/api/admin/users/${id}`;
    try {
      await Promise.all([loginUi(firstPage, admin), loginUi(secondPage, lastActiveAdmin)]);
      await Promise.all([
        expect(firstPage).toHaveURL(/\/admin\/users$/),
        expect(secondPage).toHaveURL(/\/admin\/users$/),
      ]);

      const firstTargetRow = firstPage.getByRole("row").filter({ hasText: lastActiveAdmin.fullName });
      const secondTargetRow = secondPage.getByRole("row").filter({ hasText: admin.fullName });
      await expect(firstTargetRow).toBeVisible();
      await expect(secondTargetRow).toBeVisible();
      await firstTargetRow.getByRole("button", { name: "Edit" }).click();
      await secondTargetRow.getByRole("button", { name: "Edit" }).click();

      const firstDialog = firstPage.getByTestId("edit-user-dialog");
      const secondDialog = secondPage.getByTestId("edit-user-dialog");
      await expect(firstDialog).toBeVisible();
      await expect(secondDialog).toBeVisible();
      await assertDialogsAccessible(firstPage);
      await assertDialogsAccessible(secondPage);
      await firstDialog.getByLabel("Active account").uncheck();
      await secondDialog.getByLabel("Active account").uncheck();

      const firstResponsePromise = firstPage.waitForResponse((response) =>
        response.url().endsWith(userPath(lastActiveAdmin.id)) && response.request().method() === "PATCH"
      );
      const secondResponsePromise = secondPage.waitForResponse((response) =>
        response.url().endsWith(userPath(admin.id)) && response.request().method() === "PATCH"
      );
      await Promise.all([
        firstDialog.getByRole("button", { name: "Save changes" }).click(),
        secondDialog.getByRole("button", { name: "Save changes" }).click(),
      ]);
      const [firstResponse, secondResponse] = await Promise.all([firstResponsePromise, secondResponsePromise]);
      const [firstBody, secondBody] = await Promise.all([firstResponse.json(), secondResponse.json()]);
      const responses = [firstResponse, secondResponse];
      expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);
      const rejectedIndex = firstResponse.status() === 409 ? 0 : 1;
      const rejectedBody = rejectedIndex === 0 ? firstBody : secondBody;
      expect(rejectedBody.error.code).toBe("LAST_ACTIVE_ADMINISTRATOR");

      const rejectedDialog = rejectedIndex === 0 ? firstDialog : secondDialog;
      const successfulPage = rejectedIndex === 0 ? secondPage : firstPage;
      await expect(rejectedDialog.getByRole("alert")).toContainText("Keep another active Administrator");
      await expect(successfulPage.getByRole("status")).toContainText("updated successfully");
    } finally {
      await firstContext.close();
      await secondContext.close();
    }
  });

});
