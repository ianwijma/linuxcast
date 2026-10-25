import { createRoot } from 'react-dom/client';
import { FileSearch } from '@linuxcast/file-search';
import type { FileSearchApi } from '@linuxcast/contracts';
import '@linuxcast/ui/styles.css';
import '@linuxcast/ui/views.css';
const api=(window as unknown as {linuxcastFiles:FileSearchApi}).linuxcastFiles;
createRoot(document.getElementById('root')!).render(<FileSearch api={api}/>);
