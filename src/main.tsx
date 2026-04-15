import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { TenantProvider } from './contexts/TenantContext.tsx';
import { ToastProvider } from './contexts/ToastContext.tsx';
import { SyncProvider } from './contexts/SyncContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AuthProvider>
        <TenantProvider>
          <SyncProvider>
            <App />
          </SyncProvider>
        </TenantProvider>
      </AuthProvider>
    </ToastProvider>
  </StrictMode>
);
