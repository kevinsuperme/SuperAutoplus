const TOKEN_KEYS = new Set(["accessToken", "access_token", "token", "primary_token"]);
const EMAIL_KEYS = new Set(["email", "email_address", "mail"]);

function text(value: unknown) {
  return String(value || "").trim();
}

function findToken(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const token = findToken(item);
      if (token) return token;
    }
    return "";
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of TOKEN_KEYS) {
      const token = text(record[key]);
      if (token) return token;
    }
    for (const item of Object.values(record)) {
      const token = findToken(item);
      if (token) return token;
    }
  }

  return "";
}

function findEmail(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const email = findEmail(item);
      if (email) return email;
    }
    return "";
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of EMAIL_KEYS) {
      const email = text(record[key]);
      if (email.includes("@")) return email;
    }
    for (const item of Object.values(record)) {
      const email = findEmail(item);
      if (email) return email;
    }
  }

  return "";
}

export function extractAccessTokenFromSessionText(value: string) {
  const raw = value.trim();
  if (!raw) return "";

  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      return findToken(JSON.parse(raw));
    } catch {
      return "";
    }
  }

  return raw;
}

export function extractEmailFromSessionText(value: string) {
  const raw = value.trim();
  if (!raw || (!raw.startsWith("{") && !raw.startsWith("["))) return "";

  try {
    return findEmail(JSON.parse(raw));
  } catch {
    return "";
  }
}

export function maskAccessToken(value: string) {
  const token = value.trim();
  if (!token) return "";
  if (token.length <= 18) return token;
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}
