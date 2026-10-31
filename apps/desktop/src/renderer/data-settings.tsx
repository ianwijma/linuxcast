import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { DataSettingsApi } from '@linuxcast/contracts';
import { LocalDataSettings } from './data-settings/local-data.tsx';
import '@linuxcast/ui/styles.css';
import './data-settings.css';
// The narrow first-party preload bridge is the only capability; no URL, hash or query state is read or written.
const api = (window as unknown as { linuxcastData?: DataSettingsApi }).linuxcastData;
createRoot(document.getElementById('root')!).render(<StrictMode><LocalDataSettings api={api} /></StrictMode>);
