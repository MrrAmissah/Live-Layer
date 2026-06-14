import { Route, Routes, Navigate } from 'react-router-dom';
import ControlPage from './app/ControlPage';
import OutputPage from './app/OutputPage';
import SetupPage from './app/SetupPage';

function App() {
  return (
    <Routes>
      <Route path="/control" element={<ControlPage />} />
      <Route path="/output" element={<OutputPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="*" element={<Navigate to="/control" replace />} />
    </Routes>
  );
}

export default App;
