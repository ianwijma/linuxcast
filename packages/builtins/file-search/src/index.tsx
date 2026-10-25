import { useEffect,useRef,useState,useSyncExternalStore } from 'react';
import type { FileSearchApi } from '@linuxcast/contracts';
import { ThemeProvider } from '@linuxcast/ui';
import { ViewRenderer } from '@linuxcast/ui/views';
import '@linuxcast/ui/views.css';
import { FileSearchController } from './controller.ts';
export interface FileSearchProps {api:FileSearchApi}
export function FileSearch({api}:FileSearchProps){
  const [controller]=useState(()=>new FileSearchController(api));
  const snapshot=useSyncExternalStore(controller.session.subscribe,controller.session.getSnapshot,controller.session.getSnapshot);
  const topId=snapshot.frames.at(-1)?.view.viewId;const element=useRef<HTMLElement>(null);
  useEffect(()=>{element.current?.querySelector<HTMLInputElement>('.lc-view:not([hidden]) input[data-view-query]')?.focus();},[topId]);
  const appearance=controller.getAppearance();
  useEffect(()=>{controller.start();return ()=>controller.dispose();},[controller]);
  return <ThemeProvider appearance={appearance}><main ref={element} onKeyDownCapture={event=>{if(event.key==='Enter' && event.repeat){event.preventDefault();event.stopPropagation();}}}><h1 className="lc-view-announcement">File search</h1><ViewRenderer session={controller.session} host={controller.host}/></main></ThemeProvider>;
}
export default FileSearch;
