export default function ImpuestoPlaceholder({ tipo }: { tipo: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 16,
        fontFamily: 'var(--font-sans, sans-serif)',
      }}
    >
      <h2
        style={{
          fontSize: '1.25rem',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          margin: 0,
        }}
      >
        {tipo}
      </h2>
      <p
        style={{
          fontSize: '0.9375rem',
          color: 'var(--color-text-muted)',
          margin: 0,
        }}
      >
        Pr\u00f3ximamente
      </p>

      {tipo === 'IVA' && (
        <div
          style={{
            marginTop: 24,
            width: '100%',
            maxWidth: 520,
            borderRadius: 8,
            border: '1px solid var(--color-border-subtle)',
            overflow: 'hidden',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.8125rem',
              color: 'var(--color-text-muted)',
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'var(--color-bg-surface)',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                {['Per\u00edodo', 'D\u00e9bito Fiscal', 'Cr\u00e9dito Fiscal', 'Saldo'].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 14px',
                      fontWeight: 600,
                      textAlign: 'left',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['01/2026', '02/2026', '03/2026'].map(p => (
                <tr
                  key={p}
                  style={{
                    borderBottom: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <td style={{ padding: '10px 14px' }}>{p}</td>
                  <td style={{ padding: '10px 14px' }}>-</td>
                  <td style={{ padding: '10px 14px' }}>-</td>
                  <td style={{ padding: '10px 14px' }}>-</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
