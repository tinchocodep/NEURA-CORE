import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export type SyncStatus = 'idle' | 'running' | 'success' | 'error';

export type SyncKind = 'conciliacion' | 'xubio' | 'arca' | 'other';

interface SyncState {
    status: SyncStatus;
    kind: SyncKind | null;
    step: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    error: string | null;
    lastResult: unknown;
}

interface SyncContextType extends SyncState {
    start: (kind: SyncKind, initialStep?: string) => void;
    setStep: (step: string) => void;
    finish: (result?: unknown) => void;
    fail: (error: string) => void;
    reset: () => void;
    run: <T>(kind: SyncKind, fn: (setStep: (s: string) => void) => Promise<T>) => Promise<T | null>;
}

const initialState: SyncState = {
    status: 'idle',
    kind: null,
    step: null,
    startedAt: null,
    finishedAt: null,
    error: null,
    lastResult: null,
};

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<SyncState>(initialState);
    const runningRef = useRef(false);

    const start = useCallback((kind: SyncKind, initialStep?: string) => {
        runningRef.current = true;
        setState({
            status: 'running',
            kind,
            step: initialStep || null,
            startedAt: new Date(),
            finishedAt: null,
            error: null,
            lastResult: null,
        });
    }, []);

    const setStep = useCallback((step: string) => {
        setState(prev => (prev.status === 'running' ? { ...prev, step } : prev));
    }, []);

    const finish = useCallback((result?: unknown) => {
        runningRef.current = false;
        setState(prev => ({
            ...prev,
            status: 'success',
            finishedAt: new Date(),
            lastResult: result ?? prev.lastResult,
            step: null,
        }));
    }, []);

    const fail = useCallback((error: string) => {
        runningRef.current = false;
        setState(prev => ({
            ...prev,
            status: 'error',
            finishedAt: new Date(),
            error,
            step: null,
        }));
    }, []);

    const reset = useCallback(() => {
        runningRef.current = false;
        setState(initialState);
    }, []);

    const run = useCallback(async <T,>(kind: SyncKind, fn: (setStep: (s: string) => void) => Promise<T>): Promise<T | null> => {
        if (runningRef.current) return null;
        runningRef.current = true;
        setState({
            status: 'running',
            kind,
            step: null,
            startedAt: new Date(),
            finishedAt: null,
            error: null,
            lastResult: null,
        });
        try {
            const result = await fn((s: string) => setState(prev => (prev.status === 'running' ? { ...prev, step: s } : prev)));
            runningRef.current = false;
            setState(prev => ({ ...prev, status: 'success', finishedAt: new Date(), lastResult: result, step: null }));
            return result;
        } catch (err: any) {
            runningRef.current = false;
            setState(prev => ({ ...prev, status: 'error', finishedAt: new Date(), error: err?.message || String(err), step: null }));
            return null;
        }
    }, []);

    return (
        <SyncContext.Provider value={{ ...state, start, setStep, finish, fail, reset, run }}>
            {children}
        </SyncContext.Provider>
    );
}

export function useSync(): SyncContextType {
    const ctx = useContext(SyncContext);
    if (!ctx) throw new Error('useSync must be used within SyncProvider');
    return ctx;
}
