import React, { useState, useEffect } from 'react';

export function DocumentViewer({ url, style }: { url: string, style?: React.CSSProperties }) {
    const [viewerType, setViewerType] = useState<'img' | 'iframe'>('img');
    const [objectUrl, setObjectUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    useEffect(() => {
        // Reset when URL changes
        setObjectUrl(null);
        setFetchError(null);
        setLoading(false);
        if (url.match(/\.(jpeg|jpg|png|webp|gif)$/i)) {
            setViewerType('img');
        } else {
            setViewerType('iframe');
        }

        return () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [url]);

    const handleError = async () => {
        // Only attempt recovery if we started as an img and don't already have an objectUrl
        if (viewerType !== 'img' || objectUrl) return;

        setLoading(true);
        setFetchError(null);
        try {
            const res = await fetch(encodeURI(url));
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

            const arrayBuffer = await res.arrayBuffer();
            const u8 = new Uint8Array(arrayBuffer.slice(0, 4));
            const hex = Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('');

            let mimeType = 'application/pdf';
            let nextViewerType: 'img' | 'iframe' = 'iframe';

            if (hex.startsWith('89504e47')) {
                mimeType = 'image/png';
                nextViewerType = 'img';
            } else if (hex.startsWith('ffd8ff')) {
                mimeType = 'image/jpeg';
                nextViewerType = 'img';
            } else if (hex.startsWith('25504446')) { // %PDF
                mimeType = 'application/pdf';
                nextViewerType = 'iframe';
            } else {
                const ext = url.split('.').pop()?.toLowerCase();
                if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext || '')) {
                    mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
                    nextViewerType = 'img';
                }
            }

            const blob = new Blob([arrayBuffer], { type: mimeType });
            const newObjUrl = URL.createObjectURL(blob);
            setObjectUrl(newObjUrl);
            setViewerType(nextViewerType);
        } catch (e: any) {
            console.error('Failed to resolve document format.', e);
            setFetchError(e.message || 'Error de lectura del archivo');
            setViewerType('iframe'); // Fallback immediately to iframe
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', color: '#64748b' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div className="spinner" style={{ width: 24, height: 24, border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: '0.875rem' }}>Procesando documento...</span>
                </div>
                <style>{`
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }

    if (viewerType === 'img') {
        const docUrl = objectUrl || encodeURI(url);
        return (
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', ...style }}>
                <img
                    src={docUrl}
                    alt="Documento adjunto"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    onError={objectUrl ? undefined : handleError}
                />
            </div>
        );
    }

    const finalUrl = objectUrl || encodeURI(url);
    const googleDocsUrl = fetchError ? `https://docs.google.com/viewer?url=${encodeURIComponent(encodeURI(url))}&embedded=true` : finalUrl;

    return (
        <div style={{ ...style, position: 'relative', display: 'flex', flexDirection: 'column' }}>
            {fetchError && (
                <div style={{ background: '#fef2f2', color: '#991b1b', padding: '8px 12px', fontSize: '0.75rem', borderBottom: '1px solid #fca5a5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span><b>Aviso:</b> No se pudo cargar la vista previa ({fetchError}).</span>
                </div>
            )}
            <iframe
                src={googleDocsUrl}
                style={{ flex: 1, border: 'none', width: '100%' }}
                title="Documento adjunto"
            />
        </div>
    );
}
