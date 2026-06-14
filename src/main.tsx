import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
// Self-hosted display face for on-air graphics (wght 100-900 + wdth 62-125%).
// Bundled by Vite — no network at runtime, deterministic rendering in OBS CEF.
import '@fontsource-variable/archivo/wdth.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
