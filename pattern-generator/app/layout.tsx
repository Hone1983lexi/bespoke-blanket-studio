import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bespoke Crochet Pattern Generator",
  description: "Create a crochet pattern blueprint and generate a structured row-by-row pattern.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
