import { useState, useEffect, useRef } from 'react';
import { FileText, Building2, Users, Home, FileSignature, Wrench, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  path: string;
  icon: any;
  color: string;
}

const TYPE_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  propiedad: { icon: Home, label: 'Propiedades', color: '#3B82F6' },
  contrato: { icon: FileSignature, label: 'Contratos', color: '#10B981' },
  comprobante: { icon: FileText, label: 'Comprobantes', color: '#F59E0B' },
  proveedor: { icon: Building2, label: 'Proveedores', color: '#8B5CF6' },
  cliente: { icon: Users, label: 'Clientes', color: '#0D9488' },
  orden: { icon: Wrench, label: 'Órdenes', color: '#EF4444' },
  contacto: { icon: Users, label: 'Contactos', color: '#EC4899' },
};

export default function GlobalSearch({ query, onClose }: { query: string; onClose: () => void }) {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<any>(null);
  const ref = useRef<HTMLDivElement>(null);

  const tenantModules = tenant?.enabled_modules || [];
  const hasInmob = tenantModules.includes('inmobiliaria');

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!query.trim() || !tenant) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query.trim()), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, tenant]);

  const doSearch = async (q: string) => {
    if (!tenant) return;
    setLoading(true);
    const tid = tenant.id;
    const all: SearchResult[] = [];
    const searches: PromiseLike<void>[] = [];

    if (hasInmob) {
      searches.push(
        supabase.from('inmobiliaria_propiedades').select('id, direccion, tipo, estado')
          .eq('tenant_id', tid).ilike('direccion', `%${q}%`).limit(5)
          .then(({ data }) => {
            (data || []).forEach(p => all.push({
              id: p.id, type: 'propiedad', title: p.direccion,
              subtitle: `${p.tipo} · ${p.estado}`, path: `/inmobiliaria/propiedades`,
              icon: Home, color: '#3B82F6',
            }));
          })
      );
      searches.push(
        supabase.from('inmobiliaria_contratos')
          .select('id, estado, propiedad:inmobiliaria_propiedades(direccion), inquilino:contable_clientes!inquilino_id(razon_social)')
          .eq('tenant_id', tid).limit(20)
          .then(({ data }) => {
            (data || []).filter(c =>
              (c.propiedad as any)?.direccion?.toLowerCase().includes(q.toLowerCase()) ||
              (c.inquilino as any)?.razon_social?.toLowerCase().includes(q.toLowerCase())
            ).slice(0, 5).forEach(c => all.push({
              id: c.id, type: 'contrato',
              title: (c.propiedad as any)?.direccion || 'Contrato',
              subtitle: `${(c.inquilino as any)?.razon_social || '—'} · ${c.estado}`,
              path: `/inmobiliaria/contratos`, icon: FileSignature, color: '#10B981',
            }));
          })
      );
      searches.push(
        supabase.from('inmobiliaria_ordenes_trabajo').select('id, titulo, estado')
          .eq('tenant_id', tid).ilike('titulo', `%${q}%`).limit(5)
          .then(({ data }) => {
            (data || []).forEach(o => all.push({
              id: o.id, type: 'orden', title: o.titulo,
              subtitle: o.estado, path: `/inmobiliaria/ordenes`, icon: Wrench, color: '#EF4444',
            }));
          })
      );
    }

    if (tenantModules.includes('contable') || hasInmob) {
      searches.push(
        supabase.from('contable_comprobantes').select('id, descripcion, tipo_comprobante, monto_ars, estado, numero_comprobante')
          .eq('tenant_id', tid).or(`descripcion.ilike.%${q}%,numero_comprobante.ilike.%${q}%`).limit(5)
          .then(({ data }) => {
            (data || []).forEach(c => all.push({
              id: c.id, type: 'comprobante',
              title: c.descripcion || c.numero_comprobante || 'Comprobante',
              subtitle: `${c.tipo_comprobante || ''} · $${(c.monto_ars || 0).toLocaleString('es-AR')} · ${c.estado}`,
              path: hasInmob ? `/inmobiliaria/facturar` : `/contable/comprobantes`,
              icon: FileText, color: '#F59E0B',
            }));
          })
      );
      if (hasInmob) {
        searches.push(
          supabase.from('inmobiliaria_proveedores').select('id, nombre')
            .eq('tenant_id', tid).ilike('nombre', `%${q}%`).limit(5)
            .then(({ data }) => {
              (data || []).forEach(p => all.push({
                id: p.id, type: 'proveedor', title: p.nombre,
                subtitle: 'Proveedor', path: `/inmobiliaria/proveedores`,
                icon: Building2, color: '#8B5CF6',
              }));
            })
        );
      } else {
        searches.push(
          supabase.from('contable_proveedores').select('id, razon_social')
            .eq('tenant_id', tid).ilike('razon_social', `%${q}%`).limit(5)
            .then(({ data }) => {
              (data || []).forEach(p => all.push({
                id: p.id, type: 'proveedor', title: p.razon_social,
                subtitle: 'Proveedor', path: `/contable/proveedores`,
                icon: Building2, color: '#8B5CF6',
              }));
            })
        );
      }
    }

    searches.push(
      supabase.from('contable_clientes').select('id, razon_social, cuit')
        .eq('tenant_id', tid).ilike('razon_social', `%${q}%`).limit(5)
        .then(({ data }) => {
          (data || []).forEach((c: any) => all.push({
            id: c.id, type: 'cliente', title: c.razon_social,
            subtitle: c.cuit || 'Cliente', path: hasInmob ? `/crm/contactos` : `/contable/proveedores`,
            icon: Users, color: '#0D9488',
          }));
        }) as Promise<void>
    );

    if (tenantModules.includes('crm')) {
      searches.push(
        supabase.from('crm_contactos').select('id, nombre, empresa, email')
          .eq('tenant_id', tid).or(`nombre.ilike.%${q}%,empresa.ilike.%${q}%,email.ilike.%${q}%`).limit(5)
          .then(({ data }) => {
            (data || []).forEach(c => all.push({
              id: c.id, type: 'contacto', title: c.nombre,
              subtitle: [c.empresa, c.email].filter(Boolean).join(' · ') || 'Contacto',
              path: `/crm/contactos`, icon: Users, color: '#EC4899',
            }));
          })
      );
    }

    await Promise.all(searches);
    setResults(all);
    setLoading(false);
  };

  const go = (r: SearchResult) => {
    onClose();
    navigate(r.path);
  };

  const grouped = results.reduce((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5000,
      background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderTop: 'none',
      borderRadius: '0 0 16px 16px', boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
      maxHeight: 400, overflowY: 'auto',
    }}>
      {loading && (
        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Buscando...</div>
      )}

      {!loading && query && results.length === 0 && (
        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Sin resultados para "{query}"</div>
      )}

      {!loading && Object.entries(grouped).map(([type, items]) => {
        const cfg = TYPE_CONFIG[type] || { icon: FileText, color: '#6B7280', label: type };
        return (
          <div key={type}>
            <div style={{ padding: '8px 16px 4px', fontSize: '0.5625rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {cfg.label}
            </div>
            {items.map(r => (
              <div key={r.id} onClick={() => go(r)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `${r.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <r.icon size={14} color={r.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                  <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subtitle}</div>
                </div>
                <ArrowRight size={12} color="var(--color-text-faint)" style={{ flexShrink: 0 }} />
              </div>
            ))}
          </div>
        );
      })}

      {!query && (
        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-faint)', fontSize: '0.8125rem' }}>
          Escribí para buscar en toda la app
        </div>
      )}
    </div>
  );
}
