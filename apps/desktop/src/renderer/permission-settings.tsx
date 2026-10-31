import { createRoot } from 'react-dom/client';
import { ErrorState,ThemeProvider } from '@linuxcast/ui';
import { SavedPermissions } from '../../../../packages/permissions/src/ui/index.tsx';
import type { PermissionSettingsApi } from '../../../../packages/platform-contracts/src/permission-settings.ts';
import '@linuxcast/ui/styles.css';
import './permission-settings.css';
const api=(window as unknown as {linuxcastPermissions?:PermissionSettingsApi}).linuxcastPermissions;
createRoot(document.getElementById('root')!).render(api?<SavedPermissions api={api}/>:<ThemeProvider><main><h1>Saved permissions</h1><ErrorState title="Saved permissions unavailable" description="Close and reopen this window to reconnect." announce/></main></ThemeProvider>);
