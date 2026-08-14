// Instant feedback for the operator console sections that lack their own
// loading file (schools/ and leads/ keep their richer skeletons).
export default function AdminLoading() {
  return (
    <div className="page-skel" aria-hidden>
      <div className="page-skel-eyebrow" />
      <div className="page-skel-title" />
      <div className="page-skel-card" />
      <div className="page-skel-card short" />
    </div>
  );
}
