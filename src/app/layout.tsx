import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cohort — run the school, get paid for it",
  description:
    "Attendance, coursework, grading, families, and ESA invoicing for microschools — the system that gets a microschool paid, correctly, on time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
