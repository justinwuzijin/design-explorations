import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DialRoot } from 'dialkit';
import 'dialkit/styles.css';
import App from './App';
import './App.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <DialRoot position="top-right" defaultOpen theme="light" />
  </StrictMode>,
);
