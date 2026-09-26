import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { authApi } from '../api/auth';
import { refreshSession, setAccessToken, setSessionExpiredHandler } from '../api/client';

const AuthContext = createContext(null);

/** Where each role lands after logging in. */
export function homePathFor(user) {
  if (!user) return '/';
  if (user.role === 'admin') return '/admin';
  if (user.role === 'organizer') return user.status === 'active' ? '/organizer' : '/organizer/pending';
  return '/';
}

/**
 * Where to go after logging in: back to the page that asked for a login when that page is
 * open to this role, otherwise the role's home page.
 */
export function redirectAfterLogin(user, redirect) {
  const safe = redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : null;
  if (!safe || !user) return homePathFor(user);
  const allowed = { '/admin': 'admin', '/organizer': 'organizer', '/bookings': 'attendee', '/checkout': 'attendee' };
  const owner = Object.entries(allowed).find(([prefix]) => safe === prefix || safe.startsWith(`${prefix}/`) || safe.startsWith(`${prefix}?`));
  if (owner && owner[1] !== user.role) return homePathFor(user);
  if (user.role === 'organizer' && user.status !== 'active') return homePathFor(user);
  return safe;
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  // Restore the session from the refresh cookie when the app loads.
  useEffect(() => {
    let cancelled = false;
    refreshSession()
      .then((data) => !cancelled && setUser(data.user))
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setInitializing(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      clearSession();
      toast.error('Your session expired. Please log in again.');
    });
  }, [clearSession]);

  const startSession = useCallback((data) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const login = useCallback(async (credentials) => startSession(await authApi.login(credentials)), [startSession]);

  const register = useCallback(async (payload) => startSession(await authApi.register(payload)), [startSession]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const data = await authApi.me();
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({ user, initializing, isAuthenticated: Boolean(user), login, register, logout, setUser, refreshUser, clearSession }),
    [user, initializing, login, register, logout, refreshUser, clearSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
