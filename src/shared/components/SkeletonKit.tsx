import React from 'react';

/* =====================================================
   SKELETON KIT — Placeholder loaders con shimmer
   Componentes: SkeletonLine, SkeletonCircle, SkeletonCard,
                SkeletonKPI, SkeletonTable
   ===================================================== */

// ── SkeletonLine ──
// Línea individual con ancho y alto configurables
interface SkeletonLineProps {
    width?: string | number;
    height?: string | number;
    borderRadius?: string | number;
    style?: React.CSSProperties;
}

export function SkeletonLine({
    width = '100%',
    height = 14,
    borderRadius = 6,
    style,
}: SkeletonLineProps) {
    return (
        <div
            className="skeleton-shimmer"
            style={{
                width,
                height,
                borderRadius,
                background: 'var(--skeleton-bg, #e2e8f0)',
                ...style,
            }}
        />
    );
}

// ── SkeletonCircle ──
interface SkeletonCircleProps {
    size?: number;
    style?: React.CSSProperties;
}

export function SkeletonCircle({ size = 40, style }: SkeletonCircleProps) {
    return (
        <div
            className="skeleton-shimmer"
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                background: 'var(--skeleton-bg, #e2e8f0)',
                flexShrink: 0,
                ...style,
            }}
        />
    );
}

// ── SkeletonCard ──
// Card genérica con líneas placeholder
interface SkeletonCardProps {
    lines?: number;
    style?: React.CSSProperties;
}

export function SkeletonCard({ lines = 3, style }: SkeletonCardProps) {
    return (
        <div
            style={{
                background: 'var(--bg-card, #fff)',
                borderRadius: 'var(--radius-lg, 12px)',
                border: '1px solid var(--border, #e2e8f0)',
                padding: '1.25rem',
                ...style,
            }}
        >
            <SkeletonLine width="45%" height={16} style={{ marginBottom: 16 }} />
            {Array.from({ length: lines }).map((_, i) => (
                <SkeletonLine
                    key={i}
                    width={i === lines - 1 ? '60%' : '100%'}
                    height={12}
                    style={{ marginBottom: i < lines - 1 ? 10 : 0 }}
                />
            ))}
        </div>
    );
}

// ── SkeletonKPI ──
// Card KPI: ícono circular + número grande + label
interface SkeletonKPIProps {
    style?: React.CSSProperties;
}

export function SkeletonKPI({ style }: SkeletonKPIProps) {
    return (
        <div
            style={{
                background: 'var(--bg-card, #fff)',
                borderRadius: 'var(--radius-lg, 12px)',
                border: '1px solid var(--border, #e2e8f0)',
                padding: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                ...style,
            }}
        >
            <SkeletonCircle size={42} />
            <div style={{ flex: 1 }}>
                <SkeletonLine width="35%" height={22} style={{ marginBottom: 8 }} />
                <SkeletonLine width="55%" height={11} />
            </div>
        </div>
    );
}

// ── SkeletonTable ──
// Tabla con header + N filas
interface SkeletonTableProps {
    rows?: number;
    columns?: number;
    style?: React.CSSProperties;
}

export function SkeletonTable({ rows = 6, columns = 4, style }: SkeletonTableProps) {
    const colWidths = ['30%', '20%', '25%', '15%', '10%'];

    return (
        <div
            style={{
                background: 'var(--bg-card, #fff)',
                borderRadius: 'var(--radius-lg, 12px)',
                border: '1px solid var(--border, #e2e8f0)',
                overflow: 'hidden',
                ...style,
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    gap: '1rem',
                    padding: '0.875rem 1.25rem',
                    borderBottom: '1px solid var(--border, #e2e8f0)',
                    background: 'var(--bg-subtle, #f8fafc)',
                }}
            >
                {Array.from({ length: columns }).map((_, i) => (
                    <SkeletonLine
                        key={`h-${i}`}
                        width={colWidths[i % colWidths.length]}
                        height={10}
                    />
                ))}
            </div>

            {/* Rows */}
            {Array.from({ length: rows }).map((_, rowIdx) => (
                <div
                    key={`r-${rowIdx}`}
                    style={{
                        display: 'flex',
                        gap: '1rem',
                        padding: '0.75rem 1.25rem',
                        borderBottom: rowIdx < rows - 1 ? '1px solid var(--border, #e2e8f0)' : 'none',
                        alignItems: 'center',
                    }}
                >
                    {Array.from({ length: columns }).map((_, colIdx) => (
                        <SkeletonLine
                            key={`c-${colIdx}`}
                            width={colWidths[colIdx % colWidths.length]}
                            height={12}
                            style={{ opacity: 0.7 + (rowIdx % 3) * 0.1 }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

// ── SkeletonPageHeader ──
// Título + subtítulo placeholder
export function SkeletonPageHeader() {
    return (
        <div style={{ marginBottom: '1.5rem' }}>
            <SkeletonLine width="30%" height={24} style={{ marginBottom: 8 }} />
            <SkeletonLine width="50%" height={13} />
        </div>
    );
}
