import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSchoolTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { threadFor } from "@/lib/messages";
import { MessageThread } from "@/components/MessageThread";
import { AutoMarkRead } from "@/components/AutoMarkRead";

export const dynamic = "force-dynamic";
export const metadata = { title: "Message thread — Cohort" };

export default async function TeacherThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, school } = await requireSchoolTeacher();
  const { id } = await params;

  const student = await prisma.student.findFirst({ where: { id, schoolId: school!.id } });
  if (!student) notFound();
  const messages = await threadFor(id);

  return (
    <>
      <AutoMarkRead studentId={id} />
      <div className="topbar">
        <div>
          <div className="eyebrow">
            <Link href="/messages">Messages</Link> · {student.name}&apos;s family
          </div>
          <h1>{student.name}</h1>
        </div>
      </div>
      <div className="card">
        <MessageThread
          messages={messages}
          meId={user.id}
          studentId={id}
          redirectTo={`/messages/${id}`}
          placeholder={`Message ${student.name.split(" ")[0]}'s family…`}
        />
      </div>
    </>
  );
}
