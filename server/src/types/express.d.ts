export interface ResolvedRequester {
  id: number;
  fullName: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      /**
       * Set by the requireRequester middleware. Route handlers read the caller's
       * identity only from here, never from the header directly, so Lab 3 can
       * replace header resolution with token verification in one place (BR-48).
       */
      requester?: ResolvedRequester;
    }
  }
}
