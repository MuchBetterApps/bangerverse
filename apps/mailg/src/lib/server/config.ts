export const demoMode = process.env.MAILG_DEMO_MODE === "true";

export function appUrl(request: Request): URL {
  const raw = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") || (demoMode ? new URL(request.url).origin : "");
  if (!raw) throw new Error("APP_URL is required outside demo mode");
  const url = new URL(raw);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("APP_URL must use HTTPS (or local loopback HTTP)");
  }
  return url;
}

export function bangerUrl(): URL {
  const raw = process.env.BANGER_API_URL || "https://api.bangermail.com";
  const url = new URL(raw);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("BANGER_API_URL must use HTTPS (or local loopback HTTP)");
  }
  return url;
}
