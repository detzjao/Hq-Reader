import { Navigate, useLocation } from 'react-router-dom';
import Loading from '../components/Loading.jsx';
import { useAuth } from './AuthContext.jsx';

export function ProtectedRoute({ children }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.loading) {
    return <div className="grid min-h-screen place-items-center bg-zinc-950"><Loading label="Carregando sessão..." /></div>;
  }
  if (!auth.user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export function AdminRoute({ children }) {
  const auth = useAuth();
  if (auth.loading) {
    return <div className="grid min-h-screen place-items-center bg-zinc-950"><Loading label="Validando acesso..." /></div>;
  }
  if (!auth.user) return <Navigate to="/login" replace />;
  if (!auth.isAdmin) return <Navigate to="/" replace />;
  return children;
}
