const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TICKET_SEPARATOR = "----";

export type LuckMailTicketPreview = {
  email: string;
  token: string;
  valid: boolean;
  tokenOnly: boolean;
};

export function parseLuckMailTicketPreview(value: string): LuckMailTicketPreview {
  const trimmed = value.trim();
  const separatorIndex = trimmed.indexOf(TICKET_SEPARATOR);
  if (separatorIndex < 0) {
    const valid = trimmed.length > 0 && !trimmed.includes("@") && !/\s/.test(trimmed);
    return {
      email: "",
      token: trimmed,
      valid,
      tokenOnly: valid,
    };
  }

  const email = trimmed.slice(0, separatorIndex).trim();
  const token = trimmed.slice(separatorIndex + TICKET_SEPARATOR.length).trim();
  return {
    email,
    token,
    valid: EMAIL_RE.test(email) && token.length > 0,
    tokenOnly: false,
  };
}

export function resolveLuckMailDisplayEmail(
  preview: LuckMailTicketPreview,
  resultEmail?: string,
): string {
  const remoteEmail = String(resultEmail || "").trim();
  if (preview.email) return preview.email;
  if (remoteEmail) return remoteEmail;
  if (preview.tokenOnly) return "提交后识别邮箱";
  return "-";
}
