// Skeleton for the schools table: the grid is preserved so nothing shifts
// when the data streams in.

export default function SchoolsLoading() {
  const widths = ["72%", "58%", "60%", "70%", "44%", "44%", "62%"];
  return (
    <div className="adm-screen">
      <div className="adm-eyebrow">Platform</div>
      <h1>Schools</h1>
      <div className="adm-table">
        <div className="adm-thead adm-cols-schools">
          <div>School</div>
          <div>State</div>
          <div>Rail</div>
          <div className="adm-cellr">Students</div>
          <div className="adm-cellr">Accounts</div>
          <div className="adm-cellr">Paid</div>
          <div className="adm-cellr">Joined</div>
        </div>
        {Array.from({ length: 8 }, (_, r) => (
          <div key={r} className="adm-trow adm-cols-schools" style={{ cursor: "default" }}>
            {widths.map((w, c) => (
              <div key={c} style={{ display: "flex", justifyContent: c >= 3 ? "flex-end" : "flex-start" }}>
                <div className="adm-skel" style={{ width: w }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
