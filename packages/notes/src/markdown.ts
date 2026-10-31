import {MarkdownManager} from '@tiptap/markdown';
import type {JSONContent,MarkdownToken} from '@tiptap/core';
import {decodeHtmlEntities,flattenExtensions,getExtensionField} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import {emptyNoteDocument,repositoryRequestSchema,noteContentSchema,noteDocumentSchema,notePlainText} from '@linuxcast/contracts';
import type {NoteContent,NoteNode} from '@linuxcast/contracts';
export const NOTE_MARKDOWN_MAX_BYTES=524288;
export const NOTE_MARKDOWN_NOTICE='Linuxcast Markdown export: preserves note text and tasks. Editor fonts, colours, layout and undo history are not exported. Multiline inline code exports as plain text. Line endings normalize to LF. This file is unencrypted.';
class NotesMarkdownManager extends MarkdownManager{
 override renderNodeToMarkdown(node:JSONContent,parent?:JSONContent,index=0,level=0,meta:Record<string,unknown>={}):string{
  // CommonMark cannot retain a structural break at a paragraph's end. Export
  // that terminal LF as text, without the structural break's backslash marker.
  if(node.type==='hardBreak')return parent?.content?.slice(index+1).every(child=>child.type==='hardBreak')?'&#10;':'\\\n';
  if(node.type==='codeBlock'){const text=(node.content??[]).map(child=>child.text??'').join('').replace(/\r\n?/gu,'\n'),fence='`'.repeat(Math.max(3,...Array.from(text.matchAll(/`+/gu),match=>match[0].length+1)));return fence+String(node.attrs?.language??'')+'\n'+text+'\n'+fence;}
  if(node.type==='paragraph'||node.type==='heading'){
   const prefix=node.type==='heading'?'#'.repeat(Number(node.attrs?.level??1))+' ':'';
   const rendered=super.renderNodeToMarkdown(node,parent,index,level,meta),body=prefix&&rendered.startsWith(prefix)?rendered.slice(prefix.length):rendered;
   const escaped=body.replace(/(^|\n)(#{1,6})(?=[ \t]|$)/gu,'$1\\$2').replace(/(^|\n)([-+])(?=[ \t])/gu,'$1\\$2').replace(/(^|\n)([0-9]{1,9})([.)])(?=[ \t])/gu,'$1$2\\$3').replace(/(^|\n)([-=])(?=\2{2,}[ \t]*(?:\n|$))/gu,'$1\\$2');
   const text=node.type==='heading'?escaped.replace(/([ \t])([#]+)([ \t]*)$/u,(_all,space:string,hashes:string,end:string)=>space+'&#35;'.repeat(hashes.length)+end):escaped;
   return prefix+text.replace(/^\n+|\n+$/gu,newlines=>'&#10;'.repeat(newlines.length)).replace(/[ \t]+/gu,(spaces:string,offset:number,source:string)=>offset===0||source[offset-1]==='\n'||offset+spaces.length===source.length||source[offset+spaces.length]==='\n'?Array.from(spaces,char=>char===' '?'&#32;':'&#9;').join(''):spaces);
  }
  return super.renderNodeToMarkdown(node,parent,index,level,meta);
 }
}
// Bare URLs are literal Notes text. The GFM lexer can split an entity between
// an autolink and adjacent text (URL&#10 + ;). Rejoin only these literal runs
// before the maintained text handlers decode entities once. Escapes/code stay
// separate, and explicit links are still refused by the lexer admission check.
function literalTextTokens(tokens:MarkdownToken[],tokenizeInline:(source:string)=>MarkdownToken[]):MarkdownToken[]{
 const result:MarkdownToken[]=[];let text='',hasUrl=false;
 const flush=()=>{
  if(!text)return;
  // GFM can also split an escape pair across URL/text tokens. Rejoin the run
  // first, then let the maintained inline lexer recognize each escape pair.
  // Escape tokens remain separate from text to prevent double entity decoding.
  let start=0,cursor=0;
  if(hasUrl)while((cursor=text.indexOf('\\',cursor))!==-1){
   const pair=tokenizeInline(text.slice(cursor,cursor+2)),escape=pair.length===1&&pair[0]?.type==='escape'?pair[0]:undefined;
   if(escape){if(cursor>start)result.push({type:'text',text:text.slice(start,cursor)});result.push(escape);cursor+=2;start=cursor;}else cursor++;
  }
  if(start<text.length)result.push({type:'text',text:text.slice(start)});
  text='';hasUrl=false;
 };
 for(const token of tokens){
  if(token.type==='text'&&!token.tokens||token.type==='link'&&token.raw===token.text){text+=token.text??'';hasUrl||=token.type==='link';}
  else {flush();result.push(token);}
 }
 flush();return result;
}
const extensions=flattenExtensions([StarterKit.configure({heading:{levels:[1,2,3]},link:false,underline:false,trailingNode:false}),TaskList,TaskItem.configure({nested:true})]).map(extension=>extension.extend({
 // Already flattened: keep each node (including nested TaskItem), without
 // registering the original children ahead of these extended handlers again.
 addExtensions:()=>[],
 ...(getExtensionField(extension,'parseMarkdown')?{parseMarkdown(token,helpers){
  if(this.name==='text')return {type:'text',text:decodeHtmlEntities(token.text||'')};
  const tokenizeInline=helpers.tokenizeInline;if(!tokenizeInline)throw new Error('Markdown inline tokenization is unavailable.');
  return this.parent!(token,{...helpers,parseInline:tokens=>helpers.parseInline(literalTextTokens(tokens,tokenizeInline)),parseChildren:tokens=>helpers.parseChildren(literalTextTokens(tokens,tokenizeInline))});
 }}:{}),
}));
const manager=new NotesMarkdownManager({extensions,markedOptions:{gfm:true},indentation:{style:'space',size:2}});
/** Only after closed, bounded schema validation: Tiptap helpers retain optional
 * undefined fields that are not JSON values. Never normalize arbitrary input. */
function wireNode(node:NoteNode):NoteNode{
 const copy={...node};for(const field of ['attrs','text','marks','content'] as const)if(copy[field]===undefined)delete copy[field];
 if(copy.content)copy.content=copy.content.map(wireNode);
 if(copy.type==='orderedList'&&copy.attrs&&copy.attrs.type===undefined){copy.attrs={...copy.attrs};delete copy.attrs.type;}
 return copy;
}
/** Main-owned bounded serialization only; no imported HTML, URL loading or editor.
 * The official serializer uses the same closed extensions as the Notes editor. */
export function exportNoteMarkdown(value:NoteContent):string{
 const content=noteContentSchema.parse(value);
 // CommonMark code spans normalize line breaks. Drop only this unsupported
 // inline styling before serialization so the original text remains literal.
 const compatible=(node:JSONContent):JSONContent=>({...node,...(node.type==='text'&&node.marks&&/[\r\n]/u.test(node.text??'')?{marks:node.marks.filter(mark=>mark.type!=='code')}:{}),...(node.content?{content:node.content.map(compatible)}:{})});
 const document={type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:content.title}]},...content.document.content.map(compatible)]};
 const text='<!-- '+NOTE_MARKDOWN_NOTICE+' -->\n\n'+manager.serialize(document)+'\n';
 if(new TextEncoder().encode(text).length>NOTE_MARKDOWN_MAX_BYTES)throw new Error('Markdown export exceeds its size limit.');return text;
}

/** Selected-file import only. Lex before parse so unsupported syntax is refused,
 * rather than silently dropped by the editor's intentionally closed extensions. */
export function importNoteMarkdown(text:string):NoteContent{
 const invalid='Markdown import needs nonblank valid UTF-8 text within 512 KiB, without NUL characters.';
 const unsupported='This Markdown uses unsupported HTML, links, images, tables or formatting. Export plain Markdown text and tasks, then choose the file again.';
 if(typeof text!=='string'||!text.trim()||text.length>NOTE_MARKDOWN_MAX_BYTES||new TextEncoder().encode(text).length>NOTE_MARKDOWN_MAX_BYTES||/[\0\p{Cs}]/u.test(text))throw new Error(invalid);
 let source=text.replace(/\r\n?/gu,'\n');const notice='<!-- '+NOTE_MARKDOWN_NOTICE+' -->\n\n';if(source.startsWith(notice))source=source.slice(notice.length);
 if(!source.trim())throw new Error(invalid);
 try{
  const tokens=manager.instance.lexer(source);const stack:{token:Record<string,unknown>;depth:number}[]=tokens.map(token=>({token:token as unknown as Record<string,unknown>,depth:1}));let count=0;
  const supported=new Set(['space','heading','paragraph','text','escape','strong','em','del','codespan','br','code','hr','list','list_item','taskList','taskItem','blockquote']);
  while(stack.length){const{token,depth}=stack.pop()!;if(++count>8192||depth>32)throw new Error(unsupported);
   if(!supported.has(String(token.type))&&!(token.type==='link'&&token.raw===token.text))throw new Error(unsupported);
   if(token.type==='heading'&&![1,2,3].includes(Number(token.depth)))throw new Error(unsupported);
   for(const field of ['tokens','items','nestedTokens'])if(Array.isArray(token[field]))for(const child of token[field])stack.push({token:child as Record<string,unknown>,depth:depth+1});
  }
  const document=manager.parse(source);let title='Imported note';const titleIndex=document.content?.findIndex(node=>node.type==='heading'&&node.attrs?.level===1)??-1;if(titleIndex>=0){const titleDocument=noteDocumentSchema.safeParse({type:'doc',content:[document.content![titleIndex]!]});if(!titleDocument.success)throw new Error(unsupported);title=notePlainText(titleDocument.data);document.content=document.content!.filter((_,index)=>index!==titleIndex);}
  if(!document.content?.length)document.content=emptyNoteDocument().content;
  const parsed=noteContentSchema.safeParse({title,document});if(!parsed.success)throw new Error(unsupported);
  const content=noteContentSchema.parse({title:parsed.data.title,document:{type:'doc',content:parsed.data.document.content.map(wireNode)}});repositoryRequestSchema.shape.params.parse(content);return content;
 }catch{throw new Error(unsupported);}
}
