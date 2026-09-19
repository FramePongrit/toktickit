import request from "supertest";
import { app } from "../testApp.js";

export const TEST_PASSWORD = "Lab2AuthPass123";

export interface AuthSessionFixture {
  cookie: string;
  csrfToken: string;
}

function cookieFrom(response: request.Response): string {
  const cookies = response.headers["set-cookie"];
  if (!cookies?.[0]) throw new Error("The test login did not set an authentication cookie.");
  return cookies[0].split(";")[0];
}

export async function loginAs(email: string, password = TEST_PASSWORD): Promise<AuthSessionFixture> {
  const response = await request(app).post("/api/auth/login").send({ email, password });
  if (response.status !== 200) {
    throw new Error(`The test fixture login failed with HTTP ${response.status}.`);
  }
  return { cookie: cookieFrom(response), csrfToken: response.body.csrfToken };
}

export function withAuth(
  builder: request.Test,
  auth: AuthSessionFixture,
  includeCsrf = true
): request.Test {
  builder.set("Cookie", auth.cookie);
  if (includeCsrf) builder.set("X-CSRF-Token", auth.csrfToken);
  return builder;
}
