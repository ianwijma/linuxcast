import {expect,it} from 'vitest';
import {emptyNoteDocument,noteDocumentSchema,notePlainText,noteContentKey,noteWriteSchema,notesListRequestSchema} from '../src/notes.ts';
import {NOTES_CHANNELS,noteHistorySchema,noteRevisionReadSchema,noteHistoryRequestSchema,noteRevisionSelectionSchema,notesHistoryRequestSchema,notesRevisionRequestSchema,notesRepositoryContracts} from '../src/notes.ts';
import {noteDeleteSchema,noteDeletedSchema,notesDeleteRequestSchema,notesDeleteReplySchema,NOTES_STORAGE_METHODS} from '../src/notes.ts';
it('accepts the closed rich Tiptap grammar with tasks and literal Unicode search projection',()=>{
 const value={type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'Public 雪',marks:[{type:'bold'}]}]},{type:'taskList',content:[{type:'taskItem',attrs:{checked:true},content:[{type:'paragraph',content:[{type:'text',text:'<script>literal</script>'}]}]}]},{type:'orderedList',attrs:{start:2,type:null},content:[{type:'listItem',content:[{type:'paragraph'}]}]},{type:'codeBlock',attrs:{language:null},content:[{type:'text',text:'public()'}]}]};
 const document=noteDocumentSchema.parse(value);expect(notePlainText(document)).toBe('Public 雪\n<script>literal</script>\n\npublic()');expect(noteDocumentSchema.parse(emptyNoteDocument())).toEqual(emptyNoteDocument());
});
it.each(['image','iframe','html','script','link','table','unknown'])('rejects unapproved %s nodes and content authority',type=>{expect(noteDocumentSchema.safeParse({type:'doc',content:[{type,attrs:{src:'https://private.invalid/'}}]}).success).toBe(false);});
it('rejects arbitrary attributes, URLs, malformed structural content and control payloads',()=>{
 for(const content of [[{type:'paragraph',attrs:{style:'color:red'}}],[{type:'paragraph',content:[{type:'text',text:'public',marks:[{type:'link',attrs:{href:'javascript:private'}}]}]}],[{type:'heading',attrs:{level:4}}],[{type:'bulletList',content:[{type:'paragraph'}]}],[{type:'taskList',content:[{type:'taskItem',attrs:{checked:'yes'},content:[{type:'paragraph'}]}]}],[{type:'paragraph',content:[{type:'text',text:'a\0b'}]}],[{type:'paragraph',content:[{type:'text',text:'\ud800'}]}]])expect(noteDocumentSchema.safeParse({type:'doc',content}).success).toBe(false);
});
it('bounds bytes, graph depth and cycles before recursive consumers',()=>{
 const text=(value:string)=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:value}]}]});expect(noteDocumentSchema.safeParse(text('é'.repeat(32768))).success).toBe(true);expect(noteDocumentSchema.safeParse(text('é'.repeat(32769))).success).toBe(false);
 const deep:{type:string;content:unknown[]}={type:'blockquote',content:[]};deep.content=[deep];expect(noteDocumentSchema.safeParse({type:'doc',content:[deep]}).success).toBe(false);expect(noteDocumentSchema.safeParse({type:'doc',content:Array.from({length:2049},()=>({type:'paragraph'}))}).success).toBe(false);
});
it('keeps exact content under stable object ordering, with strict write and query identities',()=>{
 const first={title:'Public',document:emptyNoteDocument()},other={document:{content:[{type:'paragraph'}],type:'doc' as const},title:'Public'};expect(noteContentKey(first)).toBe(noteContentKey(other));
 const input={id:'11111111-1111-4111-8111-111111111111',expectedRevision:0,action:'draft',content:first};expect(noteWriteSchema.safeParse(input).success).toBe(true);for(const value of [{...input,path:'/private'},{...input,action:'delete'},{...input,expectedRevision:-1},{...input,content:{...first,text:'caller index'}}])expect(noteWriteSchema.safeParse(value).success).toBe(false);
 expect(notesListRequestSchema.safeParse({query:'Public',sql:'SELECT private'}).success).toBe(false);
});

it('limits pin mutation to exact existing identity/revision and boolean intent',async()=>{const {notePinSchema,notesPinRequestSchema,noteRecordSchema,noteSummarySchema}=await import('../src/notes.ts');const request={id:'11111111-1111-4111-8111-111111111111',expectedRevision:1,pinned:true};expect(notePinSchema.parse(request)).toEqual(request);for(const extra of [{expectedRevision:0},{pinned:'true'},{document:emptyNoteDocument()},{path:'/tmp/public'}])expect(notesPinRequestSchema.safeParse({protocolVersion:1,input:{...request,...extra}}).success).toBe(false);expect(noteRecordSchema.safeParse({id:request.id,documentVersion:1,revision:1,archived:false,trashed:false,draft:{title:'Public',document:emptyNoteDocument()},saved:null,createdAt:'2026-10-29T00:00:00.000Z',updatedAt:'2026-10-29T00:00:00.000Z'}).success).toBe(false);expect(noteSummarySchema.safeParse({id:request.id,revision:1,title:'Public',archived:false,trashed:false,excerpt:'',hasDraft:true,updatedAt:'2026-10-29T00:00:00.000Z'}).success).toBe(false);});

it('limits archive mutation authority and distinguishes active/archive filters with required state',async()=>{const {noteArchiveSchema,notesArchiveRequestSchema,noteRecordSchema,noteSummarySchema}=await import('../src/notes.ts');const input={id:'11111111-1111-4111-8111-111111111111',expectedRevision:1,archived:true};expect(noteArchiveSchema.parse(input)).toEqual(input);for(const extra of [{expectedRevision:0},{archived:'true'},{pinned:true},{content:{title:'Public',document:emptyNoteDocument()}},{path:'/tmp/public'}])expect(notesArchiveRequestSchema.safeParse({protocolVersion:1,input:{...input,...extra}}).success).toBe(false);expect(notesListRequestSchema.parse({query:'',archived:true,pinnedOnly:true})).toEqual({query:'',archived:true,pinnedOnly:true});expect(noteRecordSchema.safeParse({id:input.id,documentVersion:1,revision:1,pinned:false,trashed:false,draft:{title:'Public',document:emptyNoteDocument()},saved:null,createdAt:'2026-10-29T00:00:00.000Z',updatedAt:'2026-10-29T00:00:00.000Z'}).success).toBe(false);expect(noteSummarySchema.safeParse({id:input.id,revision:1,pinned:false,trashed:false,title:'Public',excerpt:'',hasDraft:true,updatedAt:'2026-10-29T00:00:00.000Z'}).success).toBe(false);});

it('limits recoverable Trash authority and preserves the cross-filter refinement in the wire schema',async()=>{const {noteTrashSchema,notesTrashRequestSchema,notesQueryRequestSchema,noteRecordSchema}=await import('../src/notes.ts');const id='11111111-1111-4111-8111-111111111111',input={id,expectedRevision:1,trashed:true};expect(noteTrashSchema.parse(input)).toEqual(input);for(const extra of [{expectedRevision:0},{trashed:'true'},{content:{title:'Public',document:emptyNoteDocument()}},{pinned:true},{archived:true}])expect(notesTrashRequestSchema.safeParse({protocolVersion:1,input:{...input,...extra}}).success).toBe(false);expect(notesQueryRequestSchema.parse({protocolVersion:1,query:'',trashed:true,pinnedOnly:true})).toEqual({protocolVersion:1,query:'',trashed:true,pinnedOnly:true});expect(notesQueryRequestSchema.safeParse({protocolVersion:1,query:'',trashed:true,archived:true}).success).toBe(false);expect(noteRecordSchema.safeParse({id,documentVersion:1,revision:1,pinned:false,archived:false,draft:{title:'Public',document:emptyNoteDocument()},saved:null,createdAt:'2026-10-29T00:00:00.000Z',updatedAt:'2026-10-29T00:00:00.000Z'}).success).toBe(false);});

const historyId='11111111-1111-4111-8111-111111111111',historyTime='2026-10-29T00:00:00.000Z';
it('limits permanent deletion to one exact existing revision and a content-free strict receipt',()=>{
 const input={id:historyId,expectedRevision:3},value={id:historyId,deletedRevision:3};
 expect(NOTES_CHANNELS.deletePermanently).toBe('notes:delete-permanently');
 expect(NOTES_STORAGE_METHODS.filter(method=>method==='notes.deletePermanently')).toHaveLength(1);
 expect(notesDeleteRequestSchema.parse({protocolVersion:1,input})).toEqual({protocolVersion:1,input});
 expect(notesDeleteReplySchema.parse({ok:true,value})).toEqual({ok:true,value});
 for(const extra of [{expectedRevision:0},{expectedRevision:Number.MAX_SAFE_INTEGER+1},{expectedRevision:'3'},{id:'not-id'},{ids:[historyId]},{content:{title:'Public',document:emptyNoteDocument()}},{trashed:true},{path:'/tmp/public'},{sql:'DELETE FROM notes'}])expect(noteDeleteSchema.safeParse({...input,...extra}).success).toBe(false);
 for(const extra of [{deletedRevision:0},{deletedRevision:3.5},{deletedRevision:Number.MAX_SAFE_INTEGER+1},{revision:3},{content:'SYNTHETIC_PRIVATE'},{path:'/tmp/public'}])expect(noteDeletedSchema.safeParse({...value,...extra}).success).toBe(false);
 for(const reply of [{ok:true,value:null},{ok:true,value:{...value,content:'SYNTHETIC_PRIVATE'}},{ok:true,value,request:input}])expect(notesDeleteReplySchema.safeParse(reply).success).toBe(false);
 const repository=notesRepositoryContracts.get('notes.deletePermanently')!;expect(repository.params.parse(input)).toEqual(input);expect(repository.result.parse(value)).toEqual(value);
});
const savedSummary=(revision:number)=>({revision,createdAt:historyTime,title:'Public saved '+revision});
it('admits exactly fifty descending saved summaries and keeps the current revision inclusive',()=>{
 const value={id:historyId,currentRevision:50,revisions:Array.from({length:50},(_,index)=>savedSummary(50-index))};
 expect(noteHistorySchema.parse(value)).toEqual(value);
 expect(noteHistorySchema.safeParse({...value,currentRevision:51,revisions:[savedSummary(51),...value.revisions]}).success).toBe(false);
 expect(noteHistorySchema.parse({...value,revisions:[]})).toEqual({...value,revisions:[]});
 for(const revisions of [[savedSummary(1),savedSummary(2)],[savedSummary(2),savedSummary(2)],[savedSummary(51)],[savedSummary(0)]])expect(noteHistorySchema.safeParse({...value,revisions}).success).toBe(false);
 for(const currentRevision of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1])expect(noteHistorySchema.safeParse({...value,currentRevision,revisions:[]}).success).toBe(false);
});
it('keeps history metadata-only with closed summary fields and valid literal titles',()=>{
 const value={id:historyId,currentRevision:1,revisions:[savedSummary(1)]};
 for(const extra of [{content:{title:'Public',document:emptyNoteDocument()}},{document:emptyNoteDocument()},{path:'/tmp/public'},{url:'https://example.invalid'}])expect(noteHistorySchema.safeParse({...value,revisions:[{...savedSummary(1),...extra}]}).success).toBe(false);
 expect(noteHistorySchema.safeParse({...value,content:'caller body'}).success).toBe(false);
 expect(noteHistorySchema.safeParse({...value,revisions:[{...savedSummary(1),title:'Public\0title'}]}).success).toBe(false);
});
it('validates one closed rich saved preview, bounded by its current revision and content limits',()=>{
 const content={title:'Public saved 雪',document:{type:'doc',content:[{type:'taskList',content:[{type:'taskItem',attrs:{checked:true},content:[{type:'paragraph',content:[{type:'text',text:'Public task'}]}]}]}]}};
 const value={id:historyId,currentRevision:3,savedRevision:{revision:3,createdAt:historyTime,content}};
 expect(noteRevisionReadSchema.parse(value)).toEqual(value);
 for(const savedRevision of [{...value.savedRevision,revision:4},{...value.savedRevision,path:'/tmp/public'},{...value.savedRevision,content:{...content,html:'<b>caller</b>'}},{...value.savedRevision,content:{...content,document:{type:'doc',content:[{type:'image',attrs:{src:'https://example.invalid'}}]}}},{...value.savedRevision,content:{...content,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'é'.repeat(32769)}]}]}}}])expect(noteRevisionReadSchema.safeParse({...value,savedRevision}).success).toBe(false);
});
it('keeps saved-history and restore selection wire authority to exact named identifiers only',()=>{
 const request={id:historyId,expectedRevision:3},selection={...request,revision:1};
 expect(NOTES_CHANNELS.history).toBe('notes:history');expect(NOTES_CHANNELS.getRevision).toBe('notes:get-revision');expect(NOTES_CHANNELS.restoreRevision).toBe('notes:restore-revision');
 expect(notesHistoryRequestSchema.parse({protocolVersion:1,input:request})).toEqual({protocolVersion:1,input:request});
 expect(notesRevisionRequestSchema.parse({protocolVersion:1,input:selection})).toEqual({protocolVersion:1,input:selection});
 for(const extra of [{content:{title:'Public',document:emptyNoteDocument()}},{savedRevision:{revision:1}},{path:'/tmp/public'},{sql:'SELECT private'},{action:'save'},{expectedRevision:0},{revision:0}])expect(noteRevisionSelectionSchema.safeParse({...selection,...extra}).success).toBe(false);
 expect(noteHistoryRequestSchema.safeParse(selection).success).toBe(false);
 for(const value of [{protocolVersion:2,input:selection},{protocolVersion:1,input:{...selection,revision:'1'}},{protocolVersion:1,input:selection,path:'/tmp/public'}])expect(notesRevisionRequestSchema.safeParse(value).success).toBe(false);
 for(const method of ['notes.history','notes.getRevision','notes.restoreRevision']){const schema=notesRepositoryContracts.get(method)!.params;expect(schema.safeParse(method==='notes.history'?request:selection).success).toBe(true);expect(schema.safeParse({...selection,content:'caller source'}).success).toBe(false);}
});
