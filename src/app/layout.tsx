import type { Metadata } from "next";
import "./globals.css";
import { fontVars } from "./fonts";
import { EnvBanner } from "@/components/EnvBanner";

export const metadata: Metadata = {
  title: "Cohort — run the school, get paid for it",
  description:
    "Attendance, coursework, grading, families, and ESA invoicing for microschools — the system that gets a microschool paid, correctly, on time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVars}>
      <body>
        <EnvBanner />
        {children}
      </body>
    </html>
  );
}
