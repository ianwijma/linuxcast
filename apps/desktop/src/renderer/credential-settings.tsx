import {createRoot} from 'react-dom/client';
import {CredentialSettings} from '../../../../packages/secrets/src/ui/index.tsx';
import type {CredentialSettingsApi} from '../../../../packages/platform-contracts/src/credential-settings.ts';
import '@linuxcast/ui/styles.css';
const api=(window as unknown as {linuxcastCredentials?:CredentialSettingsApi}).linuxcastCredentials;
createRoot(document.getElementById('root')!).render(<CredentialSettings {...(api?{api}:{})}/>);
