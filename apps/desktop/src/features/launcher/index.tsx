import { useEffect,useRef,useState } from 'react';
import type { LauncherApi,ShellCommandReply } from '@linuxcast/contracts';
import { ViewRenderer } from '@linuxcast/ui/views';
import '@linuxcast/ui/views.css';
import { LauncherController } from './controller.ts';
export interface LauncherProps {api:LauncherApi;visible:boolean;onDismiss:()=>Promise<ShellCommandReply>}
export function Launcher({api,visible,onDismiss}:LauncherProps){
  const dismiss=useRef(onDismiss);dismiss.current=onDismiss;
  const [controller]=useState(()=>new LauncherController(api,()=>dismiss.current()));
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{controller.setVisible(visible);if(visible)root.current?.querySelector<HTMLInputElement>('input[data-view-query]')?.focus();},[controller,visible]);
  useEffect(()=>()=>controller.dispose(),[controller]);
  return <div ref={root} onKeyDownCapture={event=>{if(event.key==='Enter' && event.repeat){event.preventDefault();event.stopPropagation();}}}><h1 className="lc-view-announcement">Linuxcast</h1><ViewRenderer session={controller.session} host={controller.host}/></div>;
}
