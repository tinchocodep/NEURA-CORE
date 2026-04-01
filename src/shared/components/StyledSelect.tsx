import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * Drop-in replacement for <select> that renders a custom styled dropdown.
 *
 * Usage (same as native <select>):
 *   <StyledSelect value={val} onChange={e => setVal(e.target.value)} className="form-input" style={{...}}>
 *     <option value="">Todos</option>
 *     <option value="a">Opción A</option>
 *   </StyledSelect>
 */

interface StyledSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  children: React.ReactNode;
  onChange?: (e: { target: { value: string } }) => void;
}

interface ParsedOption {
  value: string;
  label: string;
  disabled?: boolean;
}

function parseOptions(children: React.ReactNode): ParsedOption[] {
  const opts: ParsedOption[] = [];
  const flatten = (nodes: React.ReactNode) => {
    if (!nodes) return;
    const arr = Array.isArray(nodes) ? nodes : [nodes];
    arr.forEach((child: any) => {
      if (!child) return;
      if (child.type === 'option') {
        opts.push({
          value: child.props.value ?? child.props.children ?? '',
          label: typeof child.props.children === 'string' ? child.props.children : String(child.props.value ?? ''),
          disabled: child.props.disabled,
        });
      } else if (child.type === 'optgroup' && child.props.children) {
        flatten(child.props.children);
      } else if (Array.isArray(child)) {
        flatten(child);
      } else if (child.props?.children) {
        flatten(child.props.children);
      }
    });
  };
  flatten(children);
  return opts;
}

export default function StyledSelect({ children, value, onChange, className, style, disabled, placeholder, ...rest }: StyledSelectProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const options = parseOptions(children);
  const selected = options.find(o => String(o.value) === String(value ?? ''));

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open || !ref.current) return;
    const update = () => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const dropHeight = Math.min(options.length * 38 + 8, 280);
        const showAbove = spaceBelow < dropHeight && rect.top > dropHeight;
        setPos({
          top: showAbove ? rect.top - dropHeight - 4 : rect.bottom + 4,
          left: rect.left,
          width: rect.width,
        });
      }
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [open, options.length]);

  const handleSelect = (val: string) => {
    onChange?.({ target: { value: val } });
    setOpen(false);
  };

  const triggerHeight = style?.height || 38;

  return (
    <div ref={ref} style={{ position: 'relative', ...((style?.width === 'auto') ? { display: 'inline-block' } : {}) }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={className}
        style={{
          ...style,
          height: triggerHeight,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          width: style?.width || '100%',
          paddingRight: 28,
          opacity: disabled ? 0.5 : 1,
          background: style?.background || 'var(--color-bg-surface)',
          position: 'relative',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: style?.fontSize || '0.8125rem' }}>
          {selected?.label || placeholder || '\u00A0'}
        </span>
        <ChevronDown size={13} color="var(--color-text-muted)" style={{ position: 'absolute', right: 8, top: '50%', transform: `translateY(-50%) ${open ? 'rotate(180deg)' : ''}`, transition: 'transform 0.15s', flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left, width: Math.max(pos.width, 140), zIndex: 9999,
          background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          overflow: 'hidden', maxHeight: 280, overflowY: 'auto',
          padding: '4px 0',
        }}>
          {options.map(o => {
            const isSelected = String(o.value) === String(value ?? '');
            return (
              <button
                key={o.value}
                type="button"
                disabled={o.disabled}
                onClick={() => !o.disabled && handleSelect(String(o.value))}
                style={{
                  width: '100%', padding: '7px 12px', textAlign: 'left',
                  background: isSelected ? 'rgba(37,99,235,0.06)' : 'none',
                  border: 'none', cursor: o.disabled ? 'not-allowed' : 'pointer',
                  fontSize: style?.fontSize || '0.8125rem', fontWeight: isSelected ? 600 : 400,
                  color: o.disabled ? 'var(--color-text-faint)' : 'var(--color-text-primary)',
                  fontFamily: 'var(--font-sans)',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'background 0.1s',
                  opacity: o.disabled ? 0.5 : 1,
                }}
                onMouseEnter={e => { if (!isSelected && !o.disabled) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? 'rgba(37,99,235,0.06)' : 'none'; }}
              >
                {isSelected && <Check size={13} color="var(--color-cta, #2563EB)" style={{ flexShrink: 0 }} />}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
