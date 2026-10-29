import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ErrorState,ThemeProvider} from '@linuxcast/ui';
import {Notes} from '@linuxcast/notes';
import type {NotesApi} from '../../../../packages/contracts/src/notes.ts';
import '@linuxcast/ui/styles.css';
function Workspace(){
 const api=(window as unknown as {linuxcastNotes?:NotesApi}).linuxcastNotes;
 const [appearance,setAppearance]=useState<'dark'|'light'>();
 useEffect(()=>{let active=true;const off=api?.onAppearance(value=>{if(active)setAppearance(value);});void api?.getAppearance().then(value=>{if(active)setAppearance(value);}).catch(()=>{});return()=>{active=false;off?.();};},[api]);
 return <ThemeProvider appearance={appearance??'system'}>{api?<Notes api={api}/>:<main><ErrorState title="Notes are unavailable" description="Close and reopen Linuxcast to try again."/></main>}</ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Workspace/>);
