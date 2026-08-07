// Loading a school's branding for a printed document.
//
// Separate from lib/packet.ts so the rendering helpers there stay pure and
// unit-testable — the same split as portfolio.ts / portfolio-read.ts.

import { prisma } from "@/lib/db";
import { brandOf, type Brand } from "@/lib/branding";

/** A school's letterhead, logo bytes included and ready to inline. */
export async function brandForSchool(schoolId: string): Promise<Brand> {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  const logo = school?.logoFileId
    ? await prisma.fileRec.findFirst({
        where: { id: school.logoFileId, schoolId },
        select: { mime: true, data: true },
      })
    : null;
  return brandOf(school, logo);
}
