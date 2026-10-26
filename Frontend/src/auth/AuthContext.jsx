import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getToken } from '../api/client';
import * as authApi from '../api/auth.api';
import { resetSocket } from '../api/socket';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  const logout = useCallback(() => {
    authApi.logout(); setUser(null); setAuthError('');
  }, []);

  const login = useCallback(async (username, password) => {
    setAuthError('');
    const loggedUser = await authApi.login(username, password);
    setUser(loggedUser);
    return loggedUser;
  }, []);

  useEffect(() => {
    let alive = true;
    const onLogout = () => { resetSocket(); setUser(null); setLoading(false); };
    window.addEventListener('auth:logout', onLogout);
    if (!getToken()) setLoading(false);
    else authApi.me().then((current) => { if (alive) setUser(current); }).catch(() => { if (alive) setUser(null); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; window.removeEventListener('auth:logout', onLogout); };
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, authError, setAuthError, setUser }), [user, loading, login, logout, authError]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth phải được gọi trong AuthProvider');
  return value;
}
