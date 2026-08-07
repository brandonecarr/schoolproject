import type { Metadata } from "next";
import "./globals.css";
import { fontVars } from "./fonts";
import { EnvBanner } from "@/components/EnvBanner";
import { rootDomain } from "@/lib/tenant-config";

// metadataBase resolves the relative URLs Next puts in canonical and OpenGraph
// tags. It is the APEX, always — those tags are only meaningful on the one page
// that is meant to be shared, and a school's subdomain is explicitly kept out
// of search (see proxy.ts and robots.txt). Undefined when tenancy is off; Next
// then falls back to the deployment URL, which is right for a preview.
const apex = rootDomain();

export const metadata: Metadata = {
  metadataBase: apex ? new URL(`https://${apex}`) : undefined,
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
