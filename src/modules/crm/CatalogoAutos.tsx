import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Car, Plus, Search, Filter, X, Edit2, Trash2, DollarSign, Gauge, Fuel, Settings2 } from 'lucide-react';

interface Cliente { id: string; razon_social: string; }
interface Contacto { id: string; nombre: string; apellido: string | null; }
interface Prospecto { id: string; nombre: string; etapa: string; }

interface Auto {
  id: string;
  marca: string;
  modelo: string;
  anio: number;
  version: string | null;
  tipo: 'nuevo' | 'usado';
  precio: number | null;
  moneda: string;
  kilometraje: number;
  color: string | null;
  patente: string | null;
  combustible: string | null;
  transmision: string | null;
  estado: 'disponible' | 'reservado' | 'vendido';
  imagen_url: string | null;
  descripcion: string | null;
  contacto_vendedor_id: string | null;
  cliente_comprador_id: string | null;
  prospecto_id: string | null;
  created_at: string;
}

const ESTADOS = [
  { id: 'disponible', label: 'Disponible', color: '#10b981', bg: '#d1fae5' },
  { id: 'reservado', label: 'Reservado', color: '#f59e0b', bg: '#fef3c7' },
  { id: 'vendido', label: 'Vendido', color: '#6366f1', bg: '#e0e7ff' },
];

const TIPOS = [
  { id: 'nuevo', label: '0km' },
  { id: 'usado', label: 'Usado' },
];

const COMBUSTIBLES = ['Nafta', 'Diesel', 'GNC', 'Híbrido', 'Eléctrico'];
const TRANSMISIONES = ['Manual', 'Automática'];

const EMPTY_AUTO: Partial<Auto> = {
  marca: '', modelo: '', anio: new Date().getFullYear(), version: '', tipo: 'usado',
  precio: undefined, moneda: 'ARS', kilometraje: 0, color: '', patente: '',
  combustible: 'Nafta', transmision: 'Manual', estado: 'disponible', descripcion: '',
  contacto_vendedor_id: null, cliente_comprador_id: null, prospecto_id: null,
};

function formatPrice(n: number | null, moneda: string) {
  if (!n) return '-';
  const sym = moneda === 'USD' ? 'USD ' : '$ ';
  return sym + n.toLocaleString('es-AR');
}

function formatKm(n: number) {
  return n === 0 ? '0 km' : n.toLocaleString('es-AR') + ' km';
}

export default function CatalogoAutos() {
  const { tenant } = useTenant();
  const [autos, setAutos] = useState<Auto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [prospectos, setProspectos] = useState<Prospecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAuto, setEditingAuto] = useState<Partial<Auto>>(EMPTY_AUTO);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('todos');
  const [filterTipo, setFilterTipo] = useState<string>('todos');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => { if (tenant) loadAll(); }, [tenant]);

  async function loadAll() {
    setLoading(true);
    const [autosRes, clientesRes, contactosRes, prospectosRes] = await Promise.all([
      supabase.from('crm_catalogo_autos').select('*').eq('tenant_id', tenant!.id).order('created_at', { ascending: false }),
      supabase.from('contable_clientes').select('id, razon_social').eq('tenant_id', tenant!.id).eq('activo', true),
      supabase.from('crm_contactos').select('id, nombre, apellido').eq('tenant_id', tenant!.id).eq('activo', true),
      supabase.from('crm_prospectos').select('id, nombre, etapa').eq('tenant_id', tenant!.id),
    ]);
    setAutos(autosRes.data || []);
    setClientes(clientesRes.data || []);
    setContactos(contactosRes.data || []);
    setProspectos(prospectosRes.data || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!editingAuto.marca || !editingAuto.modelo) return;
    const payload = {
      tenant_id: tenant!.id,
      marca: editingAuto.marca,
      modelo: editingAuto.modelo,
      anio: editingAuto.anio,
      version: editingAuto.version || null,
      tipo: editingAuto.tipo,
      precio: editingAuto.precio || null,
      moneda: editingAuto.moneda || 'ARS',
      kilometraje: editingAuto.kilometraje || 0,
      color: editingAuto.color || null,
      patente: editingAuto.patente || null,
      combustible: editingAuto.combustible || null,
      transmision: editingAuto.transmision || null,
      estado: editingAuto.estado,
      descripcion: editingAuto.descripcion || null,
      contacto_vendedor_id: editingAuto.contacto_vendedor_id || null,
      cliente_comprador_id: editingAuto.cliente_comprador_id || null,
      prospecto_id: editingAuto.prospecto_id || null,
      updated_at: new Date().toISOString(),
    };
    if (editingId) {
      await supabase.from('crm_catalogo_autos').update(payload).eq('id', editingId);
    } else {
      await supabase.from('crm_catalogo_autos').insert(payload);
    }
    setShowForm(false);
    setEditingAuto(EMPTY_AUTO);
    setEditingId(null);
    loadAll();
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este vehículo del catálogo?')) return;
    await supabase.from('crm_catalogo_autos').delete().eq('id', id);
    loadAll();
  }

  function openEdit(auto: Auto) {
    setEditingAuto(auto);
    setEditingId(auto.id);
    setShowForm(true);
  }

  function openNew() {
    setEditingAuto(EMPTY_AUTO);
    setEditingId(null);
    setShowForm(true);
  }

  const filtered = autos.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q || `${a.marca} ${a.modelo} ${a.version || ''} ${a.patente || ''} ${a.color || ''}`.toLowerCase().includes(q);
    const matchEstado = filterEstado === 'todos' || a.estado === filterEstado;
    const matchTipo = filterTipo === 'todos' || a.tipo === filterTipo;
    return matchSearch && matchEstado && matchTipo;
  });

  const stats = {
    total: autos.length,
    disponibles: autos.filter(a => a.estado === 'disponible').length,
    reservados: autos.filter(a => a.estado === 'reservado').length,
    vendidos: autos.filter(a => a.estado === 'vendido').length,
  };

  const getClienteName = (id: string | null) => clientes.find(c => c.id === id)?.razon_social || '-';

  const getProspectoName = (id: string | null) => prospectos.find(p => p.id === id)?.nombre || '-';
  const getEstadoStyle = (estado: string) => ESTADOS.find(e => e.id === estado) || ESTADOS[0];

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Car className="w-7 h-7 text-blue-600" /> Catálogo de Vehículos
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {stats.total} vehículos · {stats.disponibles} disponibles · {stats.reservados} reservados · {stats.vendidos} vendidos
          </p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
          <Plus className="w-4 h-4" /> Nuevo Vehículo
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200' },
          { label: 'Disponibles', value: stats.disponibles, color: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
          { label: 'Reservados', value: stats.reservados, color: 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' },
          { label: 'Vendidos', value: stats.vendidos, color: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' },
        ].map(kpi => (
          <div key={kpi.label} className={`rounded-xl p-4 ${kpi.color}`}>
            <p className="text-sm font-medium opacity-80">{kpi.label}</p>
            <p className="text-2xl font-bold">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por marca, modelo, patente, color..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm" />
        </div>
        <div className="flex gap-2">
          <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm">
            <option value="todos">Todos los estados</option>
            {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
          <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm">
            <option value="todos">Nuevo y Usado</option>
            {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <div className="flex border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('grid')} className={`px-3 py-2 text-sm ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
              <Filter className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('list')} className={`px-3 py-2 text-sm ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
              ☰
            </button>
          </div>
        </div>
      </div>

      {/* Grid / List */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(auto => {
            const est = getEstadoStyle(auto.estado);
            return (
              <div key={auto.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition group">
                {/* Image placeholder */}
                <div className="h-40 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center relative">
                  <Car className="w-16 h-16 text-gray-300 dark:text-gray-600" />
                  <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: est.bg, color: est.color }}>
                    {est.label}
                  </span>
                  <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-xs font-medium bg-white/80 dark:bg-gray-900/80 text-gray-700 dark:text-gray-300">
                    {auto.tipo === 'nuevo' ? '0km' : 'Usado'}
                  </span>
                  {/* Action buttons on hover */}
                  <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => openEdit(auto)} className="p-1.5 bg-white dark:bg-gray-700 rounded-lg shadow hover:bg-blue-50 dark:hover:bg-blue-900/30">
                      <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                    </button>
                    <button onClick={() => handleDelete(auto.id)} className="p-1.5 bg-white dark:bg-gray-700 rounded-lg shadow hover:bg-red-50 dark:hover:bg-red-900/30">
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white">{auto.marca} {auto.modelo}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{auto.version || ''} · {auto.anio}</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatPrice(auto.precio, auto.moneda)}</p>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                    {auto.kilometraje > 0 && (
                      <span className="flex items-center gap-1"><Gauge className="w-3 h-3" /> {formatKm(auto.kilometraje)}</span>
                    )}
                    {auto.combustible && (
                      <span className="flex items-center gap-1"><Fuel className="w-3 h-3" /> {auto.combustible}</span>
                    )}
                    {auto.transmision && (
                      <span className="flex items-center gap-1"><Settings2 className="w-3 h-3" /> {auto.transmision}</span>
                    )}
                    {auto.color && <span>🎨 {auto.color}</span>}
                  </div>
                  {auto.patente && <p className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded inline-block text-gray-600 dark:text-gray-300">{auto.patente}</p>}
                  {auto.prospecto_id && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      <DollarSign className="w-3 h-3 inline" /> Prospecto: {getProspectoName(auto.prospecto_id)}
                    </p>
                  )}
                  {auto.cliente_comprador_id && (
                    <p className="text-xs text-green-600 dark:text-green-400">
                      Comprador: {getClienteName(auto.cliente_comprador_id)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Vehículo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Precio</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Km</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Prospecto</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.map(auto => {
                const est = getEstadoStyle(auto.estado);
                return (
                  <tr key={auto.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-white">{auto.marca} {auto.modelo} {auto.anio}</p>
                      <p className="text-xs text-gray-500">{auto.version} {auto.color ? `· ${auto.color}` : ''} {auto.patente ? `· ${auto.patente}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{auto.tipo === 'nuevo' ? '0km' : 'Usado'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{formatPrice(auto.precio, auto.moneda)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatKm(auto.kilometraje)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: est.bg, color: est.color }}>{est.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-[150px] truncate">{auto.prospecto_id ? getProspectoName(auto.prospecto_id) : '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(auto)} className="p-1 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"><Edit2 className="w-4 h-4 text-blue-600" /></button>
                      <button onClick={() => handleDelete(auto.id)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded ml-1"><Trash2 className="w-4 h-4 text-red-500" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="text-center py-8 text-gray-400">No se encontraron vehículos</p>}
        </div>
      )}

      {filtered.length === 0 && viewMode === 'grid' && (
        <p className="text-center py-8 text-gray-400">No se encontraron vehículos con los filtros seleccionados</p>
      )}

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editingId ? 'Editar Vehículo' : 'Nuevo Vehículo'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Row: Marca, Modelo, Año */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Marca *</label>
                  <input value={editingAuto.marca || ''} onChange={e => setEditingAuto({ ...editingAuto, marca: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="Toyota" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Modelo *</label>
                  <input value={editingAuto.modelo || ''} onChange={e => setEditingAuto({ ...editingAuto, modelo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="Hilux" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Año</label>
                  <input type="number" value={editingAuto.anio || ''} onChange={e => setEditingAuto({ ...editingAuto, anio: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
              </div>
              {/* Row: Versión, Tipo, Color */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Versión</label>
                  <input value={editingAuto.version || ''} onChange={e => setEditingAuto({ ...editingAuto, version: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="SRX 4x4" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tipo</label>
                  <select value={editingAuto.tipo || 'usado'} onChange={e => setEditingAuto({ ...editingAuto, tipo: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                    {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Color</label>
                  <input value={editingAuto.color || ''} onChange={e => setEditingAuto({ ...editingAuto, color: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="Negro" />
                </div>
              </div>
              {/* Row: Precio, Moneda, Km */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Precio</label>
                  <input type="number" value={editingAuto.precio || ''} onChange={e => setEditingAuto({ ...editingAuto, precio: Number(e.target.value) || undefined })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Moneda</label>
                  <select value={editingAuto.moneda || 'ARS'} onChange={e => setEditingAuto({ ...editingAuto, moneda: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Kilometraje</label>
                  <input type="number" value={editingAuto.kilometraje || 0} onChange={e => setEditingAuto({ ...editingAuto, kilometraje: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
              </div>
              {/* Row: Patente, Combustible, Transmisión */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Patente</label>
                  <input value={editingAuto.patente || ''} onChange={e => setEditingAuto({ ...editingAuto, patente: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono" placeholder="AB 123 CD" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Combustible</label>
                  <select value={editingAuto.combustible || 'Nafta'} onChange={e => setEditingAuto({ ...editingAuto, combustible: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                    {COMBUSTIBLES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Transmisión</label>
                  <select value={editingAuto.transmision || 'Manual'} onChange={e => setEditingAuto({ ...editingAuto, transmision: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                    {TRANSMISIONES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              {/* Estado */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Estado</label>
                <div className="flex gap-2">
                  {ESTADOS.map(e => (
                    <button key={e.id} onClick={() => setEditingAuto({ ...editingAuto, estado: e.id as any })}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${editingAuto.estado === e.id
                        ? 'border-transparent text-white' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700'}`}
                      style={editingAuto.estado === e.id ? { backgroundColor: e.color } : {}}>
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Vínculos */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Prospecto vinculado</label>
                  <select value={editingAuto.prospecto_id || ''} onChange={e => setEditingAuto({ ...editingAuto, prospecto_id: e.target.value || null })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                    <option value="">Sin vincular</option>
                    {prospectos.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.etapa})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Cliente comprador</label>
                  <select value={editingAuto.cliente_comprador_id || ''} onChange={e => setEditingAuto({ ...editingAuto, cliente_comprador_id: e.target.value || null })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                    <option value="">Sin comprador</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Contacto vendedor</label>
                  <select value={editingAuto.contacto_vendedor_id || ''} onChange={e => setEditingAuto({ ...editingAuto, contacto_vendedor_id: e.target.value || null })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                    <option value="">Sin contacto</option>
                    {contactos.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellido || ''}</option>)}
                  </select>
                </div>
              </div>
              {/* Descripción */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Descripción / Notas</label>
                <textarea rows={3} value={editingAuto.descripcion || ''} onChange={e => setEditingAuto({ ...editingAuto, descripcion: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm">Cancelar</button>
              <button onClick={handleSave} disabled={!editingAuto.marca || !editingAuto.modelo}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
                {editingId ? 'Guardar Cambios' : 'Crear Vehículo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
