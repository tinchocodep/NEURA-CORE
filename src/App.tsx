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
import Monitor from './modules/tesoreria/Monitor';
import Equipo from './modules/tesoreria/Equipo';
import SuperAdminDashboard from './modules/superadmin/Dashboard';
import ContableDashboard from './modules/contable/Dashboard';
import ContableComprobantes from './modules/contable/Comprobantes/index';

import ContableProveedores from './modules/contable/Proveedores';
import ContableClientes from './modules/contable/Clientes';
import ContableCatalogos from './modules/contable/Catalogos';
import ContableConfiguracion from './modules/contable/Configuracion';
import VisionGeneral from './modules/VisionGeneral';
import { useAuth } from './contexts/AuthContext';
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div>Cargando entorno...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

function TesoreriaIndexRoute() {
  const { role } = useAuth() as any;
  if (role === 'admin' || role === 'superadmin') {
    return <TesoreriaDashboard />;
  }
  return <Navigate to="/tesoreria/movimientos" replace />;
}

export default function App() {
  return (
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
            <Route path="equipo" element={<Equipo />} />
            <Route path="monitor" element={<Monitor />} />
          </Route>
          {/* Modulo Contable */}
          <Route path="contable">
            <Route index element={<ContableDashboard />} />
            <Route path="comprobantes" element={<ContableComprobantes />} />
            <Route path="proveedores" element={<ContableProveedores />} />
            <Route path="clientes" element={<ContableClientes />} />
            <Route path="catalogos" element={<ContableCatalogos />} />
            <Route path="configuracion" element={<ContableConfiguracion />} />
          </Route>
          {/* Modulo Super Admin */}
          <Route path="superadmin" element={<SuperAdminDashboard />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
