/** Forker-facing presentation and feature choices. Banger provides the API; this app is static. */
export const mailGConfig = {
  brand: {
    name: "mailG",
    logoText: "mailG",
    accent: "#0b57d0",
  },
  themes: ["light", "dark", "landscape"] as const,
  defaultTheme: "light" as const,
  features: {
    labels: true,
    triage: true,
    realtime: true,
    attachments: true,
  },
};
