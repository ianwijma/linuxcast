import {expect,it} from 'vitest';
import {notesTrashSnapshotSchema,notesEmptyTrashRequestSchema,notesEmptyTrashReplySchema} from '../src/notes.ts';
const basis={count:103,fingerprint:'a'.repeat(64)},input={expectedCount:103,expectedFingerprint:basis.fingerprint};
it('bounds one complete-Trash basis and accepts no filtered selection/content/SQL authority',()=>{
 expect(notesTrashSnapshotSchema.parse(basis)).toEqual(basis);expect(notesTrashSnapshotSchema.parse({...basis,count:0}).count).toBe(0);
 expect(notesEmptyTrashRequestSchema.parse({protocolVersion:1,input})).toEqual({protocolVersion:1,input});
 for(const patch of [{query:'public'},{ids:[]},{expectedCount:0},{expectedCount:1.1},{expectedCount:Number.MAX_SAFE_INTEGER+1},{expectedFingerprint:'A'.repeat(64)},{expectedFingerprint:'x'.repeat(100000)},{sql:'DELETE FROM notes'}])expect(notesEmptyTrashRequestSchema.safeParse({protocolVersion:1,input:{...input,...patch}}).success).toBe(false);
 for(const patch of [{count:-1},{fingerprint:''},{records:[]}])expect(notesTrashSnapshotSchema.safeParse({...basis,...patch}).success).toBe(false);
});
it('requires a positive exact-shaped deletion receipt rather than false empty success or content echoes',()=>{
 const value={deletedCount:103,fingerprint:basis.fingerprint};expect(notesEmptyTrashReplySchema.parse({ok:true,value})).toEqual({ok:true,value});for(const patch of [{deletedCount:0},{deletedCount:-1},{fingerprint:'wrong'},{count:103},{content:'public'}])expect(notesEmptyTrashReplySchema.safeParse({ok:true,value:{...value,...patch}}).success).toBe(false);
});
