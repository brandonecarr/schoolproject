import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { today, fmt } from "@/lib/dates";
import { addObservation } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Observations — Cohort" };

export default async function ObservationsPage() {
  const { school } = await requireTeacher();
  const schoolId = school!.id;

  const students = await prisma.student.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } });
  const list = await prisma.observation.findMany({ where: { schoolId }, orderBy: { date: "desc" } });
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name || "—";

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Notes from the room</div>
          <h1>Observations</h1>
        </div>
      </div>
      <p className="muted" style={{ marginTop: -12, maxWidth: "60ch" }}>
        One sentence about what a child actually did. These become the human part of the ESA narrative
        and the weekly parent report — the part no state has ever rejected.
      </p>

      <form action={addObservation} className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label htmlFor="sid">Student</label>
            <select id="sid" name="studentId">
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ width: 170 }}>
            <label htmlFor="d">Date</label>
            <input id="d" type="date" name="date" defaultValue={today()} />
          </div>
        </div>
        <label htmlFor="t">What happened</label>
        <textarea
          id="t"
          name="text"
          required
          placeholder="Maya read her narrative to the group unprompted. First time she has volunteered."
        />
        <button className="btn" style={{ marginTop: 12 }}>
          Save observation
        </button>
      </form>

      <div className="sep" />
      <div className="card" style={{ padding: "6px 18px" }}>
        {list.length ? (
          list.map((o) => (
            <div key={o.id} style={{ padding: "14px 0", borderTop: "1px solid var(--rule)" }}>
              <div className="small">
                <strong>{nameOf(o.studentId)}</strong> <span className="muted">· {fmt(o.date)}</span>
              </div>
              <div style={{ marginTop: 4 }}>{o.text}</div>
            </div>
          ))
        ) : (
          <p className="muted" style={{ padding: "16px 0" }}>
            No observations yet. Add the first one above.
          </p>
        )}
      </div>
    </>
  );
}
