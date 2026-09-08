export function randomId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
