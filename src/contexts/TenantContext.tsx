import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export interface Tenant {
    id: string;
    name: string;
    logo_url: string | null;
    primary_color: string;
    secondary_color: string;
    enabled_modules: string[];
    razon_social: string | null;
    cuit: string | null;
    direccion: string | null;
}

interface TenantContextType {
    tenant: Tenant | null;
    userProfile: any | null;
    loading: boolean;
    refreshTenant: () => void;
}

const TenantContext = createContext<TenantContextType>({
    tenant: null,
    userProfile: null,
    loading: true,
    refreshTenant: () => { },
});

export function TenantProvider({ children }: { children: React.ReactNode }) {
    const { user, loading: authLoading } = useAuth();
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [userProfile, setUserProfile] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        async function loadTenant() {
            if (!user) {
                if (mounted) {
                    setTenant(null);
                    setUserProfile(null);
                    setLoading(false);
                }
                return;
            }

            setLoading(true);

            // Fetch user profile to get tenant_id
            const { data: profile } = await supabase
                .from('users')
                .select('*')
                .eq('id', user.id)
                .single();

            if (profile && profile.tenant_id) {
                if (mounted) setUserProfile(profile);

                // Fetch tenant details
                const { data: tenantData } = await supabase
                    .from('tenants')
                    .select('*')
                    .eq('id', profile.tenant_id)
                    .single();

                if (mounted && tenantData) {
                    setTenant(tenantData as Tenant);

                    // Apply tenant styles to CSS variables on root
                    const root = document.documentElement;
                    if (tenantData.primary_color) {
                        root.style.setProperty('--tenant-primary', tenantData.primary_color);
                    }
                    if (tenantData.secondary_color) {
                        root.style.setProperty('--tenant-secondary', tenantData.secondary_color);
                    }
                }
            } else {
                if (mounted) {
                    setUserProfile(profile);
                    setTenant(null);
                }
            }
            if (mounted) setLoading(false);
        }

        if (!authLoading) {
            loadTenant();
        }

        return () => { mounted = false; };
    }, [user, authLoading]);

    const refreshTenant = async () => {
        if (!tenant) return;
        const { data } = await supabase.from('tenants').select('*').eq('id', tenant.id).single();
        if (data) setTenant(data as Tenant);
    };

    // If auth is loading, tenant is also loading
    if (authLoading) {
        return null;
    }

    return (
        <TenantContext.Provider value={{ tenant, userProfile, loading, refreshTenant }}>
            {children}
        </TenantContext.Provider>
    );
}

export const useTenant = () => useContext(TenantContext);
