import { useState, useRef, useEffect } from 'react';
import { Search, Check, ChevronDown, X } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  sub?: string;       // secondary text (e.g. rubro, address)
  group?: string;     // for grouping/filtering (e.g. rubro category)
  color?: string;     // optional dot color
}

interface Props {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  groups?: string[];       // available groups for filter tabs
  emptyLabel?: string;     // label for empty option
  disabled?: boolean;
}

export default function CustomSelect({ options, value, onChange, placeholder = 'Seleccionar...', searchable = true, groups, emptyLabel, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open && searchable) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  const selected = options.find(o => o.value === value);

  const filtered = options.filter(o => {
    if (activeGroup && o.group !== activeGroup) return false;
    if (search) {
      const q = search.toLowerCase();
      return o.label.toLowerCase().includes(q) || (o.sub || '').toLowerCase().includes(q) || (o.group || '').toLowerCase().includes(q);
    }
    return true;
  });

  // Unique groups from data if not provided
  const groupList = groups || [...new Set(options.map(o => o.group).filter(Boolean))] as string[];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '0.625rem 0.875rem', borderRadius: 12,
          border: `1.5px solid ${open ? 'var(--color-cta, #2563EB)' : 'var(--color-border)'}`,
          background: disabled ? 'var(--color-bg-surface-2)' : 'var(--color-bg-surface)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-sans)', fontSize: '0.875rem',
          color: selected ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
          transition: 'border-color 0.12s',
          textAlign: 'left',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {selected?.color && <span style={{ width: 8, height: 8, borderRadius: 99, background: selected.color, flexShrink: 0 }} />}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        {value && !disabled ? (
          <X size={14} color="var(--color-text-muted)" onClick={e => { e.stopPropagation(); onChange(''); }} style={{ cursor: 'pointer', flexShrink: 0 }} />
        ) : (
          <ChevronDown size={14} color="var(--color-text-muted)" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
          borderRadius: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
          overflow: 'hidden', maxHeight: 320, display: 'flex', flexDirection: 'column',
        }}>
          {/* Search */}
          {searchable && (
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  style={{
                    width: '100%', padding: '8px 10px 8px 32px', borderRadius: 10,
                    border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface-2)',
                    fontSize: '0.8125rem', fontFamily: 'var(--font-sans)',
                    color: 'var(--color-text-primary)', outline: 'none',
                  }}
                />
              </div>
            </div>
          )}

          {/* Group filter tabs */}
          {groupList.length > 1 && (
            <div style={{ display: 'flex', gap: 4, padding: '6px 10px', borderBottom: '1px solid var(--color-border-subtle)', overflowX: 'auto', flexShrink: 0 }}>
              <button onClick={() => setActiveGroup('')}
                style={{
                  padding: '3px 10px', borderRadius: 99, border: '1px solid var(--color-border-subtle)',
                  background: !activeGroup ? 'var(--color-text-primary)' : 'transparent',
                  color: !activeGroup ? '#fff' : 'var(--color-text-muted)',
                  fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)',
                }}>Todos</button>
              {groupList.map(g => (
                <button key={g} onClick={() => setActiveGroup(activeGroup === g ? '' : g)}
                  style={{
                    padding: '3px 10px', borderRadius: 99, border: '1px solid var(--color-border-subtle)',
                    background: activeGroup === g ? 'var(--color-cta, #2563EB)' : 'transparent',
                    color: activeGroup === g ? '#fff' : 'var(--color-text-muted)',
                    fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)',
                    textTransform: 'capitalize',
                  }}>{g}</button>
              ))}
            </div>
          )}

          {/* Options list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {emptyLabel && (
              <button
                onClick={() => { onChange(''); setOpen(false); setSearch(''); setActiveGroup(''); }}
                style={{
                  width: '100%', padding: '10px 14px', textAlign: 'left', background: !value ? 'var(--color-bg-hover)' : 'none',
                  border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500,
                  color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)', fontStyle: 'italic',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                {!value && <Check size={14} color="var(--color-cta, #2563EB)" />}
                {emptyLabel}
              </button>
            )}
            {filtered.map(o => {
              const isSelected = o.value === value;
              return (
                <button
                  key={o.value}
                  onClick={() => { onChange(o.value); setOpen(false); setSearch(''); setActiveGroup(''); }}
                  style={{
                    width: '100%', padding: '10px 14px', textAlign: 'left',
                    background: isSelected ? 'rgba(37,99,235,0.06)' : 'none',
                    border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: isSelected ? 600 : 500,
                    color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)',
                    borderBottom: '1px solid var(--color-border-subtle)',
                    display: 'flex', alignItems: 'center', gap: 8,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'none'; }}
                >
                  {isSelected && <Check size={14} color="var(--color-cta, #2563EB)" style={{ flexShrink: 0 }} />}
                  {o.color && !isSelected && <span style={{ width: 8, height: 8, borderRadius: 99, background: o.color, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</div>
                    {o.sub && <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: 1 }}>{o.sub}</div>}
                  </div>
                  {o.group && (
                    <span style={{ fontSize: '0.5625rem', fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: 'var(--color-bg-surface-2)', color: 'var(--color-text-muted)', textTransform: 'capitalize', flexShrink: 0 }}>{o.group}</span>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
                Sin resultados
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
