import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(
        () => (localStorage.getItem('neura_theme_preference') as Theme) || 'system'
    );
    const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

    useEffect(() => {
        const root = window.document.documentElement;
        
        const applyTheme = (t: Theme) => {
            root.classList.remove('light', 'dark');
            
            let finalTheme: 'light' | 'dark';
            if (t === 'system') {
                const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                finalTheme = systemPrefersDark ? 'dark' : 'light';
            } else {
                finalTheme = t;
            }

            root.classList.add(finalTheme);
            setResolvedTheme(finalTheme);
        };

        applyTheme(theme);

        // Listen for system changes if set to system
        let mediaQuery: MediaQueryList | null = null;
        const handleChange = () => {
            if (theme === 'system') applyTheme('system');
        };

        if (theme === 'system') {
            mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQuery.addEventListener('change', handleChange);
        }

        return () => {
             if (mediaQuery) {
                 mediaQuery.removeEventListener('change', handleChange);
             }
        };
    }, [theme]);

    const setTheme = (newTheme: Theme) => {
        localStorage.setItem('neura_theme_preference', newTheme);
        setThemeState(newTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within ThemeProvider');
    return context;
}
