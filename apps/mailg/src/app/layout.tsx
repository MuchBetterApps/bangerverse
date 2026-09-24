import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "mailG",
  description: "A familiar home for your Banger-connected mail.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
