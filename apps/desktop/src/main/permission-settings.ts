import { BrowserWindow,ipcMain,nativeTheme,screen,session } from 'electron';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { PERMISSION_SETTINGS_CHANNELS,PERMISSION_SETTINGS_APPEARANCE,permissionSettingsRequestSchema,permissionSettingsListSchema,permissionSettingsRevokeSchema,permissionSettingsStateSchema } from '../../../../packages/platform-contracts/src/permission-settings.ts';
import type { PermissionSettingsRow } from '../../../../packages/platform-contracts/src/permission-settings.ts';
import type { PermissionRegistry } from '../../../../packages/permissions/src/registry.ts';
import type { DecisionRecord } from '../../../../packages/permissions/src/types.ts';
import tokens from '../../../../docs/design/tokens.json' with {type:'json'};
import { PERMISSION_SETTINGS_URL } from './assets.ts';
import { trustedAppSender } from './ipc.ts';
import { restrictContents,securePreferences } from './security.ts';
import type { ResidentService } from './lifecycle.ts';

function label(value:string,limit=256):string {
  const characters=Array.from(value.replace(/[\p{Cc}\p{Cf}]/gu,''));
  return characters.length>limit ? characters.slice(0,limit-1).join('')+'…' : characters.join('')||'Unnamed source';
}
function scope(record:DecisionRecord):string {
  const value=record.scope;
  if(value.kind==='origin')return value.origin;
  if(value.kind==='resource')return 'Selected resource: '+value.resourceId;
  if(value.kind==='application')return 'Application: '+value.applicationId;
  return {'clipboard.read':'Current clipboard','clipboard.write':'Replace the current clipboard','ai.generate':'Configured AI provider and model','notifications.show':'Linuxcast notifications','background.run':'While Linuxcast is resident'}[record.permissionId as 'clipboard.read']??'Application-wide scope';
}
export function createPermissionSettings(options:{
  resourcesDirectory:string;registry:PermissionRegistry;isReady():boolean;
  workflowName?(principal:DecisionRecord['principal']):Promise<string|undefined>;
}):ResidentService&{open():Promise<void>} {
  let window:BrowserWindow|undefined,creating:Promise<void>|undefined,active:Promise<unknown>|undefined,stopped=false;
  let snapshotId:string|undefined,selections=new Map<string,DecisionRecord>();
  const fail=(code:'invalid-request'|'permission-denied'|'conflict'|'unavailable',message:string)=>({ok:false as const,error:{code,message}});
  const alive=(owner:BrowserWindow)=>!stopped&&window===owner&&!owner.isDestroyed();
  for(const channel of Object.values(PERMISSION_SETTINGS_CHANNELS))ipcMain.handle(channel,async(event,payload)=>{
    const owner=window;
    if(!owner||!alive(owner)||!trustedAppSender(event,owner.webContents,PERMISSION_SETTINGS_URL))return fail('permission-denied','Saved permission request denied.');
    const schema=channel===PERMISSION_SETTINGS_CHANNELS.list?permissionSettingsListSchema:channel===PERMISSION_SETTINGS_CHANNELS.revoke?permissionSettingsRevokeSchema:permissionSettingsRequestSchema;
    const parsed=schema.safeParse(payload);if(!parsed.success)return fail('invalid-request','Invalid saved permission request.');
    if(channel===PERMISSION_SETTINGS_CHANNELS.close){setImmediate(()=>{if(alive(owner))owner.close();});return {ok:true,value:'requested'};}
    if(!options.isReady())return fail('unavailable','Saved permissions are unavailable. Wait for local data, then refresh.');
    if(active)return fail('conflict','Another permission action is still running. Refresh when it finishes.');
    const perform=async()=>{
      try {
        if(channel===PERMISSION_SETTINGS_CHANNELS.list) {
          const {afterId}=permissionSettingsListSchema.parse(payload),page=await options.registry.inventory(afterId);
          const next=new Map<string,DecisionRecord>(),records:PermissionSettingsRow[]=[];
          for(const record of page.records) {
            const selectionId=randomUUID(),name=record.principal.kind==='workflow'?await options.workflowName?.(record.principal):undefined;
            next.set(selectionId,structuredClone(record));
            records.push({selectionId,sourceKind:record.principal.kind,sourceLabel:label(name??record.principal.id),
              version:record.principal.kind==='builtin'?null:label(record.principal.version),
              permissionId:record.permissionId,scopeLabel:label(scope(record),2200),decision:record.decision,updatedAt:record.updatedAt});
          }
          if(!alive(owner))return fail('conflict','This permission window closed. Open it again to refresh.');
          const value=permissionSettingsStateSchema.parse({snapshotId:randomUUID(),appearance:nativeTheme.shouldUseDarkColors?'dark':'light',records,nextCursor:page.nextCursor});
          selections=next;snapshotId=value.snapshotId;return {ok:true as const,value};
        }
        const input=permissionSettingsRevokeSchema.parse(payload),record=selections.get(input.selectionId);
        if(input.snapshotId!==snapshotId||!record)return fail('conflict','This saved decision changed. Refresh before removing it.');
        // Invalidate every old selection before any asynchronous mutation.
        snapshotId=undefined;selections.clear();
        const outcome=await options.registry.revoke(record);
        if(outcome==='unavailable')return fail('unavailable','Removal could not be confirmed. Requests for this source are paused for this session. Check local storage, reopen Linuxcast and review the decision before another operation.');
        return {ok:true as const,value:outcome};
      } catch {snapshotId=undefined;selections.clear();return fail('unavailable','Saved permissions could not be read or changed. Refresh to inspect current decisions. Nothing is replayed.');}
    };
    active=perform();try{return await active;}finally{active=undefined;}
  });
  const appearance=()=>{if(window&&!window.isDestroyed()) {
    window.setBackgroundColor(tokens.themes[nativeTheme.shouldUseDarkColors?'dark':'light'].background);
    if(window.webContents.getURL()===PERMISSION_SETTINGS_URL)window.webContents.send(PERMISSION_SETTINGS_APPEARANCE,nativeTheme.shouldUseDarkColors?'dark':'light');
  }};
  nativeTheme.on('updated',appearance);
  const close=()=>{stopped=true;snapshotId=undefined;selections.clear();for(const channel of Object.values(PERMISSION_SETTINGS_CHANNELS))ipcMain.removeHandler(channel);nativeTheme.off('updated',appearance);if(window&&!window.isDestroyed())window.destroy();window=undefined;};
  return {
    async open(){
      if(stopped)throw new Error('Saved permissions unavailable.');
      if(creating){await creating;return;}
      if(window&&!window.isDestroyed()){window.show();window.focus();return;}
      creating=(async()=>{
        const area=screen.getPrimaryDisplay().workArea,owner=new BrowserWindow({
          width:Math.max(1,Math.min(1000,area.width-32)),height:Math.max(1,Math.min(720,area.height-32)),
          minWidth:Math.min(480,area.width),minHeight:Math.min(320,area.height),show:false,title:'Saved permissions — Linuxcast',
          backgroundColor:tokens.themes[nativeTheme.shouldUseDarkColors?'dark':'light'].background,
          webPreferences:securePreferences(join(options.resourcesDirectory,'permission-preload.cjs'),session.fromPartition('linuxcast-shell')),
        });
        window=owner;owner.setMenu(null);restrictContents(owner.webContents);
        owner.on('closed',()=>{if(window===owner){window=undefined;snapshotId=undefined;selections.clear();}});
        try {await owner.loadURL(PERMISSION_SETTINGS_URL);if(alive(owner))owner.show();}catch{owner.destroy();throw new Error('Saved permissions unavailable.');}
      })().finally(()=>{creating=undefined;});
      await creating;
    },
    async stop(){close();await creating?.catch(()=>{});await active;},
    async terminate(){close();},
  };
}
