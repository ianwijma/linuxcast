import {expect,it} from 'vitest';
import {noteExportRequestSchema,noteExportReplySchema} from '../src/notes-export.ts';
const selection={id:'11111111-1111-4111-8111-111111111111',revision:3};
it('rejects renderer content, destination authority and unsupported stored identities',()=>{
 for(const extra of [{path:'/tmp/note.md'},{markdown:'# forged'},{document:{}},{revision:0},{id:'not-id'},{protocolVersion:2}])expect(noteExportRequestSchema.safeParse({protocolVersion:1,...selection,...extra}).success).toBe(false);
 expect(noteExportRequestSchema.parse({protocolVersion:1,...selection})).toEqual({protocolVersion:1,...selection});
});
it('distinguishes cancellation, publication and fixed safe failure without file paths',()=>{
 for(const outcome of ['exported','cancelled'])expect(noteExportReplySchema.safeParse({ok:true,value:{...selection,outcome}}).success).toBe(true);
 for(const value of [{...selection,outcome:'saved'},{...selection,outcome:'exported',path:'/tmp/private'}])expect(noteExportReplySchema.safeParse({ok:true,value}).success).toBe(false);
 expect(noteExportReplySchema.safeParse({ok:false,error:{code:'deadline-exceeded',message:'Check selected file.',retryable:false}}).success).toBe(true);
});
