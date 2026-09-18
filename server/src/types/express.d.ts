export {};

declare global {
  namespace Express {
    interface AuthenticatedRequestContext {
      sessionId: string;
      userId: number;
      issuedAt: Date;
      expiresAt: Date;
      user: {
        id: number;
        fullName: string;
        email: string;
        active: boolean;
        role: "REQUESTER" | "STAFF" | "ADMIN";
        mustChangePassword: boolean;
      };
    }

    interface Request {
      auth?: AuthenticatedRequestContext;
    }
  }
}
