import { BrowserWindow,dialog,ipcMain,nativeTheme,screen,session } from 'electron';
import { join } from 'node:path';
import type { FileSearchService } from '@linuxcast/file-search/service';
import { FILE_SEARCH_CHANGED,fileSearchStateSchema } from '@linuxcast/contracts';
import type { FileSearchState,FileSearchActionReply } from '@linuxcast/contracts';
import tokens from '../../../../docs/design/tokens.json' with {type:'json'};
import { FILE_SEARCH_URL } from './assets.ts';
import { restrictContents,securePreferences } from './security.ts';
import { registerFileSearchIpc } from './file-search-ipc.ts';
import type { ResidentService } from './lifecycle.ts';
export function createFileSearchWorkspace(options:{resourcesDirectory:string;service:FileSearchService;isReady():boolean}):ResidentService&{open():Promise<void>;refresh():void} {
  let window:BrowserWindow|undefined,creating:Promise<void>|undefined,stopped=false,closing:Promise<void>|undefined;
  let timer:ReturnType<typeof setTimeout>|undefined,publishing=false,dirty=false;
  const alive=(owner:BrowserWindow)=>!stopped&&window===owner&&!owner.isDestroyed();
  const state=async():Promise<FileSearchState>=>fileSearchStateSchema.parse({...await options.service.getState(),appearance:nativeTheme.shouldUseDarkColors?'dark':'light'});
  const schedule=()=>{
    if(stopped||!window||window.isDestroyed())return;
    dirty=true;if(timer||publishing)return;
    timer=setTimeout(()=>{
      timer=undefined;const owner=window;if(!owner||!alive(owner)||!options.isReady())return;
      publishing=true;dirty=false;
      void state().then(value=>{if(alive(owner)&&owner.webContents.getURL()===FILE_SEARCH_URL)owner.webContents.send(FILE_SEARCH_CHANGED,value);}).catch(()=>{}).finally(()=>{publishing=false;if(dirty)schedule();});
    },100);
  };
  const unsubscribe=options.service.subscribe(schedule);
  const removeIpc=registerFileSearchIpc(ipcMain,{
    contents:()=>window?.webContents,isReady:()=>!stopped&&options.isReady(),getState:state,
    async chooseFolder():Promise<FileSearchActionReply>{
      const owner=window;if(!owner||!alive(owner))return {ok:true,value:{outcome:'cancelled'}};
      const choice=await dialog.showOpenDialog(owner,{title:'Choose a folder for file search',buttonLabel:'Choose folder',properties:['openDirectory']});
      if(choice.canceled||choice.filePaths.length!==1||!alive(owner))return {ok:true,value:{outcome:'cancelled'}};
      const {rootId}=await options.service.addFolder(choice.filePaths[0]!);schedule();return {ok:true,value:{outcome:'selected',rootId}};
    },
    async startIndex(rootId){await options.service.startIndex(rootId);schedule();},
    async pauseIndex(rootId){await options.service.pauseIndex(rootId);schedule();},
    async removeFolder(rootId){
      const owner=window;if(!owner||!alive(owner))return 'cancelled';
      const choice=await dialog.showMessageBox(owner,{type:'warning',title:'Remove folder from file search?',message:'Remove folder from file search?',detail:'Indexing will stop and indexed metadata will be removed. Original files stay.',buttons:['Cancel','Remove folder'],defaultId:0,cancelId:0,noLink:true});
      if(choice.response!==1||!alive(owner))return 'cancelled';
      await options.service.removeFolder(rootId);schedule();return 'completed';
    },
    search:request=>options.service.search(request),close:()=>window?.close(),
  });
  const appearance=()=>{if(window&&!window.isDestroyed())window.setBackgroundColor(tokens.themes[nativeTheme.shouldUseDarkColors?'dark':'light'].background);schedule();};
  nativeTheme.on('updated',appearance);
  const close=()=>{stopped=true;clearTimeout(timer);unsubscribe();removeIpc();nativeTheme.off('updated',appearance);if(window&&!window.isDestroyed())window.destroy();window=undefined;};
  return {
    refresh:schedule,
    async open(){
      if(stopped)throw new Error('File search unavailable.');
      if(creating)return creating;
      if(window&&!window.isDestroyed()){window.show();window.focus();schedule();return;}
      creating=(async()=>{
        const area=screen.getPrimaryDisplay().workArea;
        const owner=new BrowserWindow({width:Math.max(1,Math.min(1000,area.width-32)),height:Math.max(1,Math.min(720,area.height-32)),minWidth:Math.min(480,area.width),minHeight:Math.min(320,area.height),show:false,title:'File search — Linuxcast',backgroundColor:tokens.themes[nativeTheme.shouldUseDarkColors?'dark':'light'].background,webPreferences:securePreferences(join(options.resourcesDirectory,'file-preload.cjs'),session.fromPartition('linuxcast-shell'))});
        window=owner;owner.setMenu(null);restrictContents(owner.webContents);owner.on('closed',()=>{if(window===owner)window=undefined;});
        try{await owner.loadURL(FILE_SEARCH_URL);if(alive(owner))owner.show();}catch{owner.destroy();throw new Error('File search unavailable.');}
      })().finally(()=>{creating=undefined;});return creating;
    },
    stop(){if(!closing){close();closing=(async()=>{await creating?.catch(()=>{});await options.service.stop();})();}return closing;},
    async terminate(){close();await options.service.terminate();},
  };
}
