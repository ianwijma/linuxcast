import type { PermissionSettingsApi,PermissionSettingsState } from '../../../platform-contracts/src/permission-settings.ts';
import { permissionSettingsStateReplySchema,permissionSettingsActionReplySchema } from '../../../platform-contracts/src/permission-settings.ts';
export interface PermissionScreenState {
  snapshot:PermissionSettingsState|undefined;appearance:'dark'|'light'|undefined;
  loading:boolean;removing:boolean;unconfirmed:boolean;error:string|undefined;message:string|undefined;page:number;
}
export class PermissionScreenController {
  #api:PermissionSettingsApi;
  #state:PermissionScreenState={snapshot:undefined,appearance:undefined,loading:true,removing:false,unconfirmed:false,error:undefined,message:undefined,page:0};
  #listeners=new Set<()=>void>();
  #cursors:(string|undefined)[]=[undefined];
  #epoch=0;
  #disposed=false;
  #requestActive=false;
  #unsubscribe:()=>void;
  constructor(api:PermissionSettingsApi) {
    this.#api=api;this.#unsubscribe=api.onAppearance(appearance=>{this.#set({appearance});});
  }
  getSnapshot=()=>this.#state;
  subscribe=(listener:()=>void)=>{this.#listeners.add(listener);return()=>{this.#listeners.delete(listener);};};
  #set(change:Partial<PermissionScreenState>) {if(this.#disposed)return;this.#state={...this.#state,...change};for(const listener of this.#listeners)listener();}
  async #load(cursor:string|undefined,page:number):Promise<boolean> {
    const epoch=++this.#epoch;this.#requestActive=true;this.#set({loading:true,error:undefined});
    try {
      const reply=permissionSettingsStateReplySchema.parse(await this.#api.getState(cursor?{afterId:cursor}:{}));
      if(this.#disposed||epoch!==this.#epoch)return false;
      if(!reply.ok){this.#set({error:reply.error.message,unconfirmed:true});return false;}
      this.#cursors=this.#cursors.slice(0,page);this.#cursors[page]=cursor;
      this.#set({snapshot:reply.value,appearance:reply.value.appearance,page,unconfirmed:false});return true;
    } catch {if(epoch===this.#epoch)this.#set({error:'Saved permissions could not be refreshed. Try Refresh again.',unconfirmed:true});return false;}
    finally {if(epoch===this.#epoch){this.#requestActive=false;this.#set({loading:false});}}
  }
  refresh() {if(this.#disposed||this.#state.removing||this.#requestActive)return Promise.resolve(false);return this.#load(this.#cursors[this.#state.page],this.#state.page);}
  next() {
    const cursor=this.#state.snapshot?.nextCursor;
    if(this.#state.loading||this.#state.removing||this.#state.unconfirmed||!cursor)return Promise.resolve(false);
    return this.#load(cursor,this.#state.page+1);
  }
  previous() {
    if(this.#state.loading||this.#state.removing||!this.#state.page)return Promise.resolve(false);
    return this.#load(this.#cursors[this.#state.page-1],this.#state.page-1);
  }
  async revoke(selectionId:string):Promise<boolean> {
    const snapshot=this.#state.snapshot;
    if(this.#disposed||!snapshot||this.#state.loading||this.#state.removing||this.#state.unconfirmed||!snapshot.records.some(row=>row.selectionId===selectionId))return false;
    this.#set({removing:true,error:undefined,message:undefined});
    try {
      const reply=permissionSettingsActionReplySchema.parse(await this.#api.revoke({snapshotId:snapshot.snapshotId,selectionId}));
      if(this.#disposed)return false;
      if(!reply.ok){this.#set({error:reply.error.message,unconfirmed:true});return false;}
      if(reply.value==='requested')throw new Error('Unexpected removal receipt.');
      const removed=reply.value==='removed';
      this.#set({message:removed?'Saved decision removed. New access requires a fresh check. Check any action already sent before starting another operation. Nothing is replayed.':reply.value==='changed'?'The saved decision changed. Its newer choice was kept. Review the refreshed list.':'This saved decision was already absent. Review the refreshed list.'});
      await this.#load(this.#cursors[this.#state.page],this.#state.page);
      return removed;
    } catch {this.#set({error:'Removal could not be confirmed. Refresh and inspect the decision before another action. Nothing is replayed.',unconfirmed:true});return false;}
    finally {this.#set({removing:false});}
  }
  dispose(){this.#disposed=true;this.#epoch++;this.#unsubscribe();this.#listeners.clear();}
}
