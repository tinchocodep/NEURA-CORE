import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
    session: Session | null;
    user: User | null;
    role: string | null;
    displayName: string;
    userModules: string[] | null;
    loading: boolean;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    role: null,
    displayName: '',
    userModules: null,
    loading: true,
    signOut: async () => { },
    refreshProfile: async () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [displayName, setDisplayName] = useState('');
    const [userModules, setUserModules] = useState<string[] | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchUserData = async (userId: string, email?: string) => {
        const { data } = await supabase.from('users').select('role, enabled_modules, display_name, email').eq('id', userId).single();
        if (data) {
            setRole(data.role);
            setUserModules(data.enabled_modules || []);
            const raw = data.display_name || data.email?.split('@')[0] || email?.split('@')[0] || 'usuario';
            setDisplayName(raw.charAt(0).toUpperCase() + raw.slice(1));
        } else {
            setRole('user');
            setUserModules([]);
            const raw = email?.split('@')[0] || 'usuario';
            setDisplayName(raw.charAt(0).toUpperCase() + raw.slice(1));
        }
    };

    const refreshProfile = async () => {
        if (user?.id) {
            await fetchUserData(user.id, user.email || undefined);
        }
    };

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchUserData(session.user.id, session.user.email).then(() => setLoading(false));
            } else {
                setLoading(false);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchUserData(session.user.id, session.user.email).then(() => setLoading(false));
            } else {
                setRole(null);
                setDisplayName('');
                setUserModules(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ session, user, role, displayName, userModules, loading, signOut, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
