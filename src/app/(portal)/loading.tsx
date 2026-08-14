// Same instant-feedback skeleton as the teacher console — see (teacher)/loading.tsx.
export default function PortalLoading() {
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
