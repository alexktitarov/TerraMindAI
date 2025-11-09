import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '@/lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, role?: string, gradeLevel?: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          try {
            const { user } = await api.getCurrentUser();
            setUser(user);
          } catch (error) {
            // Backend not available or token invalid - clear it
            console.error('Auth check failed:', error);
            api.setToken(null);
            localStorage.removeItem('token');
          }
        }
      } catch (error) {
        console.error('Auth check error:', error);
        api.setToken(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const { user, token } = await api.login({ email, password });
    setUser(user);
    api.setToken(token);
  };

  const signup = async (email: string, password: string, name: string, role: string = 'STUDENT', gradeLevel?: string) => {
    const { user, token } = await api.signup({ email, password, name, role, gradeLevel });
    setUser(user);
    api.setToken(token);
  };

  const logout = () => {
    setUser(null);
    api.setToken(null);
    // Navigation will be handled by ProtectedRoute or components using this context
    window.location.href = '/auth';
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        signup,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

