/** Forker-facing presentation and feature choices. Keep Banger endpoints server-side. */
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
