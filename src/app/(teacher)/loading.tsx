// Instant feedback on every navigation in the teacher console. Without this
// file a click did NOTHING visible until the server had run every query on
// the destination page — the app felt frozen. With it, the sidebar stays put
// and the content area swaps to this skeleton the moment the link is clicked.
export default function TeacherLoading() {
  return (
    <div className="page-skel" aria-hidden>
      <div className="page-skel-eyebrow" />
      <div className="page-skel-title" />
      <div className="page-skel-line" />
      <div className="page-skel-card" />
      <div className="page-skel-card short" />
    </div>
  );
}
