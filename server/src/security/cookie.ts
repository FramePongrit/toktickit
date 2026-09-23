export interface CookieConfig {
  name: string;
  httpOnly: true;
  sameSite: "Lax";
  secure: boolean;
  path: "/";
  maxAgeSeconds: number;
}

function cookieValue(value: string): string {
  return encodeURIComponent(value);
}

export function serializeAuthCookie(token: string, config: CookieConfig): string {
  const attributes = [
    `${config.name}=${cookieValue(token)}`,
    `Max-Age=${config.maxAgeSeconds}`,
    `Path=${config.path}`,
    "HttpOnly",
    `SameSite=${config.sameSite}`,
  ];
  if (config.secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function serializeClearedAuthCookie(config: CookieConfig): string {
  const attributes = [
    `${config.name}=`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    `Path=${config.path}`,
    "HttpOnly",
    `SameSite=${config.sameSite}`,
  ];
  if (config.secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}
