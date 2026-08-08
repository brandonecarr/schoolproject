// The admin console's frame: no school sidebar — this surface is about the
// platform, not any one school. A plain centred page with the standard tokens.

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell" data-role="teacher" data-style="soft">
      <main className="panel" style={{ marginLeft: 0 }}>
        <div className="page" style={{ maxWidth: 1080, margin: "0 auto" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
