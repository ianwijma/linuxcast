import {BrowserWindow,dialog,ipcMain,nativeTheme,screen,session} from 'electron';
import {join} from 'node:path';
import {NOTES_APPEARANCE,NOTES_CLOSE_REQUESTED,NOTES_CLOSE_FINISHED,notesCloseFinishedSchema} from '../../../../packages/contracts/src/notes.ts';
import type {NotesActions} from './notes-ipc.ts';
import {registerNotesExportIpc} from './notes-export-ipc.ts';
import {saveNoteMarkdown} from './notes-export-file.ts';
import {registerNotesIpc} from './notes-ipc.ts';
import {NOTES_URL} from './assets.ts';
import {trustedAppSender} from './ipc.ts';
import {restrictContents,securePreferences} from './security.ts';
import type {ResidentService} from './lifecycle.ts';
import tokens from '../../../../docs/design/tokens.json' with {type:'json'};
export function createNotesWorkspace(options:{resourcesDirectory:string;isReady():boolean}&Pick<NotesActions,'list'|'get'|'write'|'setPinned'|'setArchived'>):ResidentService&{open():Promise<void>;prepareClose():Promise<boolean>}{
 let window:BrowserWindow|undefined,creating:Promise<void>|undefined,stopped=false,stopping=false,approvedClose=false,stopPromise:Promise<void>|undefined,sequence=0;
 let attempt:{id:number;owner:BrowserWindow;promise:Promise<boolean>;resolve(value:boolean):void;timer:ReturnType<typeof setTimeout>}|undefined;
 const finish=(value:boolean)=>{const pending=attempt;attempt=undefined;if(pending){clearTimeout(pending.timer);pending.resolve(value);}};
 const appearance=()=>nativeTheme.shouldUseDarkColors?'dark' as const:'light' as const;
 const alive=(owner:BrowserWindow)=>!stopped&&window===owner&&!owner.isDestroyed();
 const api=registerNotesIpc(ipcMain,{contents:()=>window?.webContents,active:()=>!stopped&&!!window&&!window.isDestroyed(),ready:options.isReady,exportBusy:()=>exporter.busy(),appearance,list:options.list,get:options.get,write:options.write,setPinned:options.setPinned,setArchived:options.setArchived,
  close(){if(window&&alive(window)&&!exporter.busy()&&!api.isWriting()){approvedClose=true;window.close();}},
 });
 const exporter=registerNotesExportIpc(ipcMain,{contents:()=>window?.webContents,active:()=>!stopped&&!!window&&!window.isDestroyed(),ready:options.isReady,writeBusy:api.isWriting,get:options.get,publish:saveNoteMarkdown,
  async choose(record){const owner=window;if(!owner||!alive(owner))return null;const choice=await dialog.showSaveDialog(owner,{title:'Export note — unencrypted Markdown',defaultPath:`linuxcast-note-${record.id}.md`,buttonLabel:'Save unencrypted Markdown',filters:[{name:'Markdown',extensions:['md']}],properties:['createDirectory']});if(!alive(owner)||owner.webContents.getURL()!==NOTES_URL)throw new Error('Notes export owner changed.');return choice.canceled||!choice.filePath?null:choice.filePath;},
 });
 const updated=()=>{if(window&&alive(window)){window.setBackgroundColor(tokens.themes[appearance()].background);if(window.webContents.getURL()===NOTES_URL)window.webContents.send(NOTES_APPEARANCE,appearance());}};
 nativeTheme.on('updated',updated);
 const requestClose=():Promise<boolean>=>{
  const owner=window;if(!owner||owner.isDestroyed())return Promise.resolve(true);if(exporter.busy()||api.isWriting())return Promise.resolve(false);if(attempt?.owner===owner)return attempt.promise;
  if(owner.webContents.getURL()!==NOTES_URL)return Promise.resolve(false);
  let resolve!:(value:boolean)=>void;const promise=new Promise<boolean>(done=>{resolve=done;});
  attempt={id:++sequence,owner,promise,resolve,timer:setTimeout(()=>finish(false),15000)};
  owner.webContents.send(NOTES_CLOSE_REQUESTED,{protocolVersion:1,attemptId:attempt.id});return promise;
 };
 ipcMain.handle(NOTES_CLOSE_FINISHED,(event,payload)=>{
  const parsed=notesCloseFinishedSchema.safeParse(payload),pending=attempt;
  if(!pending||!parsed.success||parsed.data.attemptId!==pending.id||pending.owner!==window||!trustedAppSender(event,pending.owner.webContents,NOTES_URL))return {ok:false};
  if(exporter.busy()||api.isWriting()){finish(false);return {ok:false};}
  if(!parsed.data.allowClose)finish(false);
  return {ok:true};
 });
 const dispose=()=>{stopped=true;nativeTheme.off('updated',updated);api.remove();exporter?.remove();ipcMain.removeHandler(NOTES_CLOSE_FINISHED);finish(false);};
 return {
  async open(){
   if(stopped||stopping)throw new Error('Notes are unavailable.');if(creating)await creating;
   if(stopped||stopping||attempt)throw new Error('Notes are closing.');
   if(window&&alive(window)){window.show();window.focus();return;}
   creating=(async()=>{
    const area=screen.getPrimaryDisplay().workArea,owner=new BrowserWindow({width:Math.max(1,Math.min(1100,area.width-32)),height:Math.max(1,Math.min(760,area.height-32)),minWidth:Math.min(640,area.width),minHeight:Math.min(400,area.height),show:false,title:'Notes — Linuxcast',backgroundColor:tokens.themes[appearance()].background,webPreferences:securePreferences(join(options.resourcesDirectory,'notes-preload.cjs'),session.fromPartition('linuxcast-shell'))});
    window=owner;approvedClose=false;owner.setMenu(null);restrictContents(owner.webContents);
    owner.on('close',event=>{if(!approvedClose&&!stopped){event.preventDefault();void requestClose();}});
    owner.on('closed',()=>{if(window===owner)window=undefined;if(attempt?.owner===owner)finish(true);});
    try{await owner.loadURL(NOTES_URL);if(alive(owner)&&!stopping)owner.show();else owner.destroy();}catch{if(!owner.isDestroyed())owner.destroy();throw new Error('Notes are unavailable.');}
   })().finally(()=>{creating=undefined;});return creating;
  },
  prepareClose:requestClose,
  stop(){return stopPromise??=(async()=>{stopping=true;await creating?.catch(()=>{});if(window&&!window.isDestroyed())throw new Error('Notes close preflight is incomplete.');await Promise.all([api.drain(),exporter?.drain()]);dispose();})();},
  async terminate(){dispose();if(window&&!window.isDestroyed())window.destroy();await creating?.catch(()=>{});await Promise.all([api.drain(),exporter?.drain()]);},
 };
}
