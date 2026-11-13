import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Role } from '../types';
import { initialUsers } from '../data/seedData';
import { ApiError, apiClient } from '../lib/apiClient';

interface AuthContextType {
  currentUser: User | null;
  currentSchoolId: string;
  /** Verifies the password with the backend before signing in. */
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  loginAsRole: (role: Role) => void;
  logout: () => void;
  switchSchool: (schoolId: string) => void;
  availableUsers: User[];
  isAuthenticated: boolean;
}

const DEMO_AUTO_LOGIN = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_DEMO_AUTO_LOGIN === 'true';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('lumeneios_auth_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEMO_AUTO_LOGIN ? initialUsers[0] : null;
      }
    }
    // Secure by default: no saved session means the sign-in page. Instant admin access for stakeholder demos is an
    // explicit opt-in (VITE_DEMO_AUTO_LOGIN=true), never an implicit fallback.
    return DEMO_AUTO_LOGIN ? initialUsers[0] : null;
  });

  const [currentSchoolId, setCurrentSchoolId] = useState<string>(() => {
    return localStorage.getItem('lumeneios_current_school') || 'school-1';
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('lumeneios_auth_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('lumeneios_auth_user');
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('lumeneios_current_school', currentSchoolId);
  }, [currentSchoolId]);

  const login = async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    const user = initialUsers.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) return { ok: false, error: 'Invalid email or password.' };
    try {
      await apiClient.auth.login(user.email, password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) return { ok: false, error: 'Cannot reach the LumenEIOS backend to verify your password. Use a 1-click demo persona or try again.' };
      return { ok: false, error: 'Invalid email or password.' };
    }
    setCurrentUser(user);
    setCurrentSchoolId(user.schoolId || 'school-1');
    return { ok: true };
  };

  const loginAsRole = (role: Role) => {
    const user = initialUsers.find((u) => u.role === role);
    if (user) {
      setCurrentUser(user);
      setCurrentSchoolId(user.schoolId || 'school-1');
      apiClient.auth.login(user.email).catch((err) => {
        console.warn('Backend login sync notice:', err.message);
      });
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('lumeneios_auth_user');
    apiClient.auth.logout();
  };

  const switchSchool = (schoolId: string) => {
    setCurrentSchoolId(schoolId);
    apiClient.auth.switchSchool(schoolId).catch((err) => {
      console.warn('Backend school switch sync notice:', err.message);
    });
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentSchoolId,
        login,
        loginAsRole,
        logout,
        switchSchool,
        availableUsers: initialUsers,
        isAuthenticated: !!currentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

