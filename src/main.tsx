import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ThemeProvider } from './context/ThemeContext';
import { App } from './App';
import { DEMO_MODE } from './lib/runtime';
import './styles/themes.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          {/* Offline DemoApp supplies its own DataProvider; live host needs it for existing modules. */}
          {DEMO_MODE ? (
            <App />
          ) : (
            <DataProvider>
              <App />
            </DataProvider>
          )}
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
