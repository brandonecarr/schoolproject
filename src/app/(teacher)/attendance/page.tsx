import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { today, fmt } from "@/lib/dates";
import { saveAttendance } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attendance — Cohort" };

const STATUSES = ["present", "absent", "excused"] as const;

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; saved?: string }>;
}) {
  const { school } = await requireTeacher();
  const sp = await searchParams;
  const date = sp.date || today();

  const students = await prisma.student.findMany({
    where: { schoolId: school!.id },
    orderBy: { createdAt: "asc" },
  });
  const existing = await prisma.attendance.findMany({ where: { schoolId: school!.id, date } });
  const statusOf = (id: string) => existing.find((a) => a.studentId === id)?.status || "present";

  return (
    <>
      {sp.saved && <div className="notice good">Attendance saved for {fmt(date)}.</div>}
      <div className="topbar">
        <div>
          <div className="eyebrow">Roll book</div>
          <h1>Attendance</h1>
        </div>
        <form method="get" className="row">
          <input type="date" name="date" defaultValue={date} style={{ width: "auto" }} />
          <button className="btn sec">Go</button>
        </form>
      </div>

      <form action={saveAttendance}>
        <input type="hidden" name="date" value={date} />
        <div className="card" style={{ padding: "10px 16px" }}>
          {students.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 0",
                borderTop: "1px solid var(--rule)",
              }}
            >
              <div style={{ flex: 1, fontWeight: 600 }}>
                {s.name}
                <span className="small muted" style={{ fontWeight: 400 }}>
                  {" "}
                  · grade {s.grade}
                </span>
              </div>
              {STATUSES.map((v) => (
                <label
                  key={v}
                  style={{
                    margin: 0,
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    fontWeight: 500,
                    textTransform: "capitalize",
                  }}
                >
                  <input
                    type="radio"
                    name={`s_${s.id}`}
                    value={v}
                    defaultChecked={statusOf(s.id) === v}
                    style={{ width: "auto" }}
                  />
                  {v}
                </label>
              ))}
            </div>
          ))}
        </div>
        <button className="btn" style={{ marginTop: 14 }}>
          Save attendance
        </button>
      </form>
    </>
  );
}
