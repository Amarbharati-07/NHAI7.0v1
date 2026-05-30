export function getApiBase(): string {
  if (process.env["EXPO_PUBLIC_API_URL"]) return process.env["EXPO_PUBLIC_API_URL"]!;
  const domain = process.env["EXPO_PUBLIC_DOMAIN"];
  if (domain) return `https://${domain}:3000/api`;
  return "http://localhost:3000/api";
}
