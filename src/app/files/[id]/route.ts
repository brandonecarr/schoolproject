// GET /files/[id] — serve a work-sample file's bytes with access control.
// Ported from server.js. Access: staff at the file's school, or the parent/
// student attached to that child. Bytes live in the DB (FileRec.data), so this
// works on Vercel's read-only serverless filesystem.

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Sign in first.", { status: 403 });
  const { user } = session;
  const { id } = await params;

  const f = await prisma.fileRec.findUnique({ where: { id } });
  if (!f) return new Response("Not found.", { status: 404 });

  const isStaff = ["owner", "teacher"].includes(user.role) && user.schoolId === f.schoolId;
  // A file with no studentId is a teacher-attached assignment resource — shared
  // teaching material, readable by anyone signed in at that school. EXCEPT an
  // invoice-attached receipt: that is the school's claim paperwork, not shared
  // material, so it stays staff-only even though its studentId is null.
  const isSchoolResource =
    f.studentId == null && f.invoiceId == null && user.schoolId === f.schoolId;
  let isFamily = false;
  if (user.role === "parent") {
    const ids: string[] = user.studentIdsJson ? JSON.parse(user.studentIdsJson) : [];
    isFamily = f.studentId != null && ids.includes(f.studentId);
  } else if (user.role === "student") {
    isFamily = f.studentId != null && user.studentId === f.studentId;
  }
  if (!isStaff && !isFamily && !isSchoolResource)
    return new Response("Not available for this account.", { status: 403 });

  const safeName = f.label.replace(/[^\w. -]/g, "");
  return new Response(new Uint8Array(f.data), {
    status: 200,
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `inline; filename="${safeName}.${f.ext}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
