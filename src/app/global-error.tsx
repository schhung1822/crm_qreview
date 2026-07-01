'use client';

// Error boundary toàn cục - tự render <html>/<body> (thay root layout cho trang lỗi).
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="vi">
      <body
        style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          display: 'grid',
          placeItems: 'center',
          minHeight: '100vh',
          margin: 0,
          background: '#f1f1f1',
          color: '#303030',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 32, margin: 0 }}>Đã xảy ra lỗi</h1>
          <p style={{ color: '#616161' }}>Vui lòng thử lại.</p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 8,
              padding: '8px 16px',
              borderRadius: 8,
              border: 0,
              background: '#1a1a1a',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Thử lại
          </button>
        </div>
      </body>
    </html>
  );
}
