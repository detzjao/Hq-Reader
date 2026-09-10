import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoute, ProtectedRoute } from './auth/RouteGuards.jsx';
import Admin from './pages/Admin.jsx';
import ComicDetails from './pages/ComicDetails.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import ReaderPage from './pages/ReaderPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/comic/:id" element={<ProtectedRoute><ComicDetails /></ProtectedRoute>} />
      <Route path="/reader/:id" element={<ProtectedRoute><ReaderPage /></ProtectedRoute>} />
      <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
      <Route path="/local" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
