"use client";

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fafafa",
          color: "#18181b",
          padding: "16px",
          textAlign: "center",
        }}
      >
        <title>Error · Inventa</title>
        <main>
          <h1 style={{ fontSize: "20px" }}>Algo ha ido mal</h1>
          <p style={{ color: "#52525b", fontSize: "14px" }}>
            No hemos podido cargar Inventa. Inténtalo de nuevo en unos segundos.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: "16px",
              padding: "10px 16px",
              borderRadius: "8px",
              border: "none",
              background: "#18181b",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
