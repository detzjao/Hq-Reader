import { Route, Routes } from 'react-router-dom';
import Home from './pages/Home.jsx';
import ReaderPage from './pages/ReaderPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/reader/:id" element={<ReaderPage />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
