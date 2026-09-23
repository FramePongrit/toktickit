import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { HttpError } from "../lib/httpError.js";
import { normalizeEmail } from "../security/identity.js";
import {
  comparePassword,
  hashPassword,
  isPasswordReuse,
  validatePassword,
} from "../security/password.js";
import { AuthSessionService, type CreatedSession, type SessionUser } from "../security/session.js";
import { JwtService } from "../security/jwt.js";
import { LoginThrottle } from "../security/throttle.js";

export type SafeUser = SessionUser;

export interface LoginResult {
  user: SafeUser;
  session: CreatedSession;
  jwt: string;
}

export interface ChangePasswordResult {
  user: SafeUser;
  session: CreatedSession;
  jwt: string;
}

export interface AuthServiceDependencies {
  repository?: PrismaClient;
  sessions: AuthSessionService;
  jwt: JwtService;
  throttle: LoginThrottle;
}

function invalidCredentials(): HttpError {
  return HttpError.unauthorized("INVALID_CREDENTIALS", "Email or password is incorrect.");
}

function validationIssuesForPassword(field: string, value: string) {
  const result = validatePassword(value);
  return result.valid ? [] : [{ field, message: result.issues.join(" ") }];
}

export class AuthService {
  private readonly repository: PrismaClient;
  private readonly sessions: AuthSessionService;
  private readonly jwt: JwtService;
  private readonly throttle: LoginThrottle;

  constructor(dependencies: AuthServiceDependencies) {
    this.repository = dependencies.repository ?? getPrisma();
    this.sessions = dependencies.sessions;
    this.jwt = dependencies.jwt;
    this.throttle = dependencies.throttle;
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = normalizeEmail(email);
    if (this.throttle.isThrottled(normalizedEmail)) {
      throw HttpError.tooManyRequests("LOGIN_THROTTLED", "Too many failed login attempts. Try again later.");
    }

    const user = await this.repository.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        fullName: true,
        email: true,
        active: true,
        role: true,
        mustChangePassword: true,
        passwordHash: true,
      },
    });

    const passwordMatches = user?.passwordHash
      ? await comparePassword(password, user.passwordHash)
      : false;
    if (!user || !passwordMatches) {
      const attempt = this.throttle.recordFailure(normalizedEmail);
      if (attempt.throttled) {
        throw HttpError.tooManyRequests("LOGIN_THROTTLED", "Too many failed login attempts. Try again later.");
      }
      throw invalidCredentials();
    }

    this.throttle.clear(normalizedEmail);
    if (!user.active) {
      throw HttpError.forbidden("USER_INACTIVE", "This User is inactive.");
    }

    const session = await this.sessions.create(user.id);
    return {
      user: toSafeUser(user),
      session,
      jwt: this.jwt.sign({ userId: user.id, sessionId: session.id }),
    };
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    confirmation: string
  ): Promise<ChangePasswordResult> {
    const user = await this.repository.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        active: true,
        role: true,
        mustChangePassword: true,
        passwordHash: true,
      },
    });

    if (!user?.active || !user.passwordHash || !(await comparePassword(currentPassword, user.passwordHash))) {
      throw HttpError.unauthorized("CURRENT_PASSWORD_INVALID", "The current password is incorrect.");
    }

    const normalizedNewPassword = newPassword.trim();
    const normalizedConfirmation = confirmation.trim();
    const details = [
      ...validationIssuesForPassword("newPassword", normalizedNewPassword),
      ...validationIssuesForPassword("confirmation", normalizedConfirmation),
    ];
    if (normalizedNewPassword !== normalizedConfirmation) {
      details.push({ field: "confirmation", message: "Confirmation must match the new password." });
    }
    if (details.length > 0) {
      throw HttpError.validationFailed("The submitted data is invalid.", details);
    }
    if (await isPasswordReuse(normalizedNewPassword, user.passwordHash)) {
      throw HttpError.validationFailed("The submitted data is invalid.", [
        { field: "newPassword", message: "The new password must differ from the current password." },
      ]);
    }

    const newHash = await hashPassword(normalizedNewPassword);
    const replacement = await this.sessions.replaceAllAfterPasswordChange(user.id, newHash);
    return {
      user: replacement.user,
      session: replacement.session,
      jwt: this.jwt.sign({ userId: replacement.user.id, sessionId: replacement.session.id }),
    };
  }
}

function toSafeUser(user: {
  id: number;
  fullName: string;
  email: string;
  active: boolean;
  role: SafeUser["role"];
  mustChangePassword: boolean;
}): SafeUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    active: user.active,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

export function validateCurrentPasswordShape(password: string): void {
  // Current-password format failures intentionally collapse to the same safe
  // authentication response as a wrong current password.
  if (!validatePassword(password).valid) {
    throw HttpError.unauthorized("CURRENT_PASSWORD_INVALID", "The current password is incorrect.");
  }
}
