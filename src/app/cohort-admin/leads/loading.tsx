// Skeleton for the leads table, grid preserved.

export default function LeadsLoading() {
  const widths = ["72%", "58%", "60%", "70%", "62%"];
  return (
    <div className="adm-screen">
      <div className="adm-eyebrow">Pipeline</div>
      <h1>Leads</h1>
      <div className="adm-table">
        <div className="adm-thead adm-cols-leads">
          <div>Lead</div>
          <div>Note</div>
          <div>Source</div>
          <div>Status</div>
          <div className="adm-cellr">Added</div>
        </div>
        {Array.from({ length: 8 }, (_, r) => (
          <div key={r} className="adm-trow adm-cols-leads" style={{ cursor: "default" }}>
          {widths.map((w, c) => (
              <div key={c} style={{ display: "flex", justifyContent: c === 4 ? "flex-end" : "flex-start" }}>
                <div className="adm-skel" style={{ width: w }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
