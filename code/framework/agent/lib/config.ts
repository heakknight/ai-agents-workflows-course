export const CUSTOMER_SUPPORT_MODEL =
  process.env.CUSTOMER_SUPPORT_AGENT_MODEL?.trim() || "gpt-4.1-mini";

export function csvEnv(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
