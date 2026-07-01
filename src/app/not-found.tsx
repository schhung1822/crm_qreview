// Not-found toàn cục (route không khớp locale). Render trong root layout (đã có <html>).
export default function GlobalNotFound() {
  return (
    <div
      style={{
        fontFamily: 'Inter, system-ui, sans-serif',
        display: 'grid',
        placeItems: 'center',
        minHeight: '100vh',
        background: '#f1f1f1',
        color: '#303030',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 48, margin: 0 }}>404</h1>
        <p style={{ color: '#616161' }}>Không tìm thấy trang.</p>
        <a href="/vi/dashboard" style={{ color: '#005bd3', fontWeight: 600 }}>
          Về Dashboard
        </a>
      </div>
    </div>
  );
}
