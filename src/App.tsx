import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './shared/components/Layout';
import Login from './modules/auth/Login';
import Register from './modules/auth/Register';
import SetPassword from './modules/auth/SetPassword';
import TesoreriaDashboard from './modules/tesoreria/Dashboard';
import Movimientos from './modules/tesoreria/Movimientos';
import Comprobantes from './modules/tesoreria/Comprobantes';
import Cajas from './modules/tesoreria/Cajas';
import CajaDetalle from './modules/tesoreria/CajaDetalle';
import Bancos from './modules/tesoreria/Bancos';
import OrdenesPago from './modules/tesoreria/OrdenesPago/index';
import Monitor from './modules/tesoreria/Monitor';
import Equipo from './modules/tesoreria/Equipo';
import SuperAdminDashboard from './modules/superadmin/Dashboard';
import ContableDashboard from './modules/contable/Dashboard';


import ContableProveedores from './modules/contable/Proveedores';
import ContableClientes from './modules/contable/Clientes';
import ContableCatalogos from './modules/contable/Catalogos';
import ContableConfiguracion from './modules/contable/Configuracion';
import ContableComprobantesIndex from './modules/contable/Comprobantes/index';
import ImpuestoPlaceholder from './modules/impuestos/Placeholder';
// import Conciliacion from './modules/contable/Conciliacion/index'; // bloqueada
import VisionGeneral from './modules/VisionGeneral';
import CRMDashboard from './modules/crm/Dashboard';
import CRMContactos from './modules/crm/Contactos';
import CRMProspectos from './modules/crm/Prospectos';
import CRMObras from './modules/crm/Obras';
import CRMCatalogoAutos from './modules/crm/CatalogoAutos';
import ComercialDashboard from './modules/comercial/Dashboard';
import ComercialPipeline from './modules/comercial/Pipeline';
import ComercialContactos from './modules/comercial/Contactos';
import ComercialContactoDetalle from './modules/comercial/ContactoDetalle';
import ComercialReportes from './modules/comercial/Reportes';
import ComercialConfig from './modules/comercial/Config';
import InmoDashboard from './modules/inmobiliaria/Dashboard';
import InmoMapa from './modules/inmobiliaria/MapaPropiedades';
import InmoPropiedades from './modules/inmobiliaria/Propiedades';
import InmoContratos from './modules/inmobiliaria/Contratos';
import InmoLiquidaciones from './modules/inmobiliaria/Liquidaciones';
import InmoCuentas from './modules/inmobiliaria/CuentasCorrientes';
import InmoAgenda from './modules/inmobiliaria/Agenda';
import InmoProveedores from './modules/inmobiliaria/Proveedores';
import InmoOrdenesTrabajo from './modules/inmobiliaria/OrdenesTrabajoMobile';
import FacturarMobile from './modules/inmobiliaria/FacturarMobile';
import FacturarAgro from './modules/agro/FacturarAgro';
import InmoExpensas from './modules/inmobiliaria/Expensas';
import InmoServicios from './modules/inmobiliaria/Servicios';
import ProyeccionesInmob from './modules/inmobiliaria/Proyecciones';
import { useAuth } from './contexts/AuthContext';
import { useTenant } from './contexts/TenantContext';

/* Route-level component that picks Facturar based on rubro */
function FacturarRouter() {
  const { tenant } = useTenant();
  const rubro = (tenant as any)?.rubro || 'general';
  if (rubro === 'inmobiliaria') return <FacturarMobile />;
  return <FacturarAgro />;
}
import { ThemeProvider } from './contexts/ThemeContext';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div>Cargando entorno...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

function TesoreriaIndexRoute() {
  const { role } = useAuth() as any;
  const { tenant } = useTenant();
  const hasInmob = tenant?.enabled_modules?.includes('inmobiliaria');
  if (hasInmob) return <ProyeccionesInmob />;
  if (role === 'admin' || role === 'superadmin') return <TesoreriaDashboard />;
  return <Navigate to="/tesoreria/movimientos" replace />;
}
export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/set-password" element={<SetPassword />} />

          {/* Authenticated Routes wrapped in Layout */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<VisionGeneral />} />

            <Route path="tesoreria">
              <Route index element={<TesoreriaIndexRoute />} />
              <Route path="movimientos" element={<Movimientos />} />
              <Route path="comprobantes" element={<Comprobantes />} />
              <Route path="cajas" element={<Cajas />} />
              <Route path="cajas/:id" element={<CajaDetalle />} />
              <Route path="bancos" element={<Bancos />} />
              <Route path="ordenes-pago" element={<OrdenesPago />} />
              <Route path="equipo" element={<Equipo />} />
              <Route path="monitor" element={<Monitor />} />
            </Route>
            {/* Modulo Contable */}
            <Route path="contable">
              <Route index element={<ContableDashboard />} />
              <Route path="comprobantes" element={<FacturarRouter />} />
              <Route path="proveedores" element={<ContableProveedores />} />
              <Route path="clientes" element={<ContableClientes />} />
              <Route path="catalogos" element={<ContableCatalogos />} />
              {/* Conciliación bloqueada por ahora */}
            </Route>
            
            {/* Modulo CRM */}
            <Route path="crm">
              <Route index element={<CRMDashboard />} />
              <Route path="contactos" element={<CRMContactos />} />
              <Route path="prospectos" element={<CRMProspectos />} />
              <Route path="obras" element={<CRMObras />} />
              <Route path="catalogo" element={<CRMCatalogoAutos />} />
            </Route>

            {/* Modulo Comercial */}
            <Route path="comercial">
              <Route index element={<ComercialDashboard />} />
              <Route path="dashboard" element={<ComercialDashboard />} />
              <Route path="pipeline" element={<ComercialPipeline />} />
              <Route path="contactos" element={<ComercialContactos />} />
              <Route path="contactos/:id" element={<ComercialContactoDetalle />} />
              <Route path="reportes" element={<ComercialReportes />} />
              <Route path="config" element={<ComercialConfig />} />
            </Route>

            {/* Modulo Inmobiliaria */}
            <Route path="inmobiliaria">
              <Route index element={<InmoDashboard />} />
              <Route path="propiedades" element={<InmoPropiedades />} />
              <Route path="contratos" element={<InmoContratos />} />
              <Route path="liquidaciones" element={<InmoLiquidaciones />} />
              <Route path="cuentas" element={<InmoCuentas />} />
              <Route path="agenda" element={<InmoAgenda />} />
              <Route path="proveedores" element={<InmoProveedores />} />
              <Route path="mapa" element={<InmoMapa />} />
              <Route path="ordenes" element={<InmoOrdenesTrabajo />} />
              <Route path="facturar" element={<FacturarMobile />} />
              <Route path="expensas" element={<InmoExpensas />} />
              <Route path="servicios" element={<InmoServicios />} />
            </Route>

            {/* Gestora: Ventas */}
            <Route path="ventas">
              <Route path="comprobantes" element={<ContableComprobantesIndex defaultTipo="venta" />} />
              <Route path="clientes" element={<ContableClientes />} />
            </Route>

            {/* Gestora: Compras */}
            <Route path="compras">
              <Route path="comprobantes" element={<ContableComprobantesIndex defaultTipo="compra" />} />
              <Route path="proveedores" element={<ContableProveedores />} />
              <Route path="ordenes-pago" element={<OrdenesPago />} />
            </Route>

            {/* Gestora: Impuestos */}
            <Route path="impuestos">
              <Route path="iva" element={<ImpuestoPlaceholder tipo="IVA" />} />
              <Route path="iibb" element={<ImpuestoPlaceholder tipo="Ingresos Brutos" />} />
              <Route path="retenciones" element={<ImpuestoPlaceholder tipo="Retenciones" />} />
            </Route>

            {/* Global Configuracion */}
            <Route path="configuracion" element={<ContableConfiguracion />} />

            {/* Modulo Super Admin */}
            <Route path="superadmin" element={<SuperAdminDashboard />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
