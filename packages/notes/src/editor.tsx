import { useEffect, useRef, useState } from 'react';
import { Extension } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { Plugin } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Button } from '@linuxcast/ui';
import { NOTE_TEXT_MAX_BYTES, noteDocumentSchema } from '@linuxcast/contracts';
import type { NoteDocument } from '@linuxcast/contracts';
import type { Editor } from '@tiptap/core';

const commands=[
 {label:'Paragraph',run:(editor:Editor)=>editor.chain().setParagraph().run()},
 {label:'Heading 1',run:(editor:Editor)=>editor.chain().setHeading({level:1}).run()},
 {label:'Heading 2',run:(editor:Editor)=>editor.chain().setHeading({level:2}).run()},
 {label:'Heading 3',run:(editor:Editor)=>editor.chain().setHeading({level:3}).run()},
 {label:'Bullet list',run:(editor:Editor)=>editor.chain().toggleBulletList().run()},
 {label:'Numbered list',run:(editor:Editor)=>editor.chain().toggleOrderedList().run()},
 {label:'Task list',run:(editor:Editor)=>editor.chain().toggleTaskList().run()},
 {label:'Quote',run:(editor:Editor)=>editor.chain().toggleBlockquote().run()},
 {label:'Code block',run:(editor:Editor)=>editor.chain().toggleCodeBlock().run()},
 {label:'Divider',run:(editor:Editor)=>editor.chain().setHorizontalRule().run()},
];
type Slash={from:number;to:number;query:string;index:number};
export function RichNoteEditor({document,disabled=false,onChange,onError}:{document:NoteDocument;disabled?:boolean;onChange:(document:NoteDocument)=>void;onError:(message:string)=>void}){
 const callbacks=useRef({onChange,onError});callbacks.current={onChange,onError};
 const [slash,setSlash]=useState<Slash|null>(null),[,render]=useState(0);const slashRef=useRef(slash);slashRef.current=slash;
 const rejected=()=>queueMicrotask(()=>callbacks.current.onError('This change exceeds the supported note structure or 64 KiB text limit. Keep or shorten the existing text.'));
 const editor=useEditor({
  extensions:[StarterKit.configure({heading:{levels:[1,2,3]},link:false,underline:false,trailingNode:false}),TaskList,TaskItem.configure({nested:true,a11y:{checkboxLabel:node=>`Task: ${node.textContent||'empty task'}`}}),Extension.create({name:'boundedNote',addProseMirrorPlugins(){return[new Plugin({filterTransaction(transaction){if(!transaction.docChanged)return true;const valid=noteDocumentSchema.safeParse(transaction.doc.toJSON()).success;if(!valid)rejected();return valid;}})];}})],
  content:document,injectCSS:false,immediatelyRender:false,
  editorProps:{attributes:{role:'textbox','aria-label':'Note body','aria-multiline':'true','aria-describedby':'notes-rich-guidance',spellcheck:'true'},
   handlePaste(_view,event){event.preventDefault();if(event.clipboardData?.files.length){callbacks.current.onError('Attachments are unavailable. Paste plain text only.');return true;}insertPlain(event.clipboardData?.getData('text/plain')??'');return true;},
   handleDrop(_view,event){event.preventDefault();if(event.dataTransfer?.files.length){callbacks.current.onError('Attachments are unavailable. Drop plain text only.');return true;}insertPlain(event.dataTransfer?.getData('text/plain')??'');return true;},
   handleKeyDown(_view,event){if(event.isComposing)return false;const current=slashRef.current;if(!current)return false;
    const filtered=commands.filter(command=>command.label.toLowerCase().includes(current.query));
    if(event.key==='Escape'){event.preventDefault();setSlash(null);return true;}
    if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();setSlash({...current,index:(current.index+(event.key==='ArrowDown'?1:-1)+filtered.length)%Math.max(1,filtered.length)});return true;}
    if(event.key==='Enter'){event.preventDefault();if(!event.repeat&&filtered[current.index])choose(filtered[current.index]!);return true;}return false;},
  },
  onUpdate({editor:current}){const json=noteDocumentSchema.safeParse(current.getJSON());if(json.success)callbacks.current.onChange(json.data);const {$from}=current.state.selection;const before=$from.parent.textBetween(0,$from.parentOffset);const match=/(?:^|\s)\/([a-zA-Z ]*)$/u.exec(before);setSlash(match?{from:$from.pos-match[1]!.length-1,to:$from.pos,query:match[1]!.toLowerCase(),index:0}:null);render(value=>value+1);},
  onSelectionUpdate(){render(value=>value+1);},
 });
 function insertPlain(text:string){if(!editor||!text)return;if(new TextEncoder().encode(text).length>NOTE_TEXT_MAX_BYTES||/[\0\p{Cs}]/u.test(text)){callbacks.current.onError('Paste or drop at most 64 KiB of valid plain text without NUL characters.');return;}
  const content=text.replace(/\r\n?/gu,'\n').split('\n').map(line=>({type:'paragraph',...(line?{content:[{type:'text',text:line}]}:{})}));editor.chain().focus().insertContent(content).run();
 }
 function choose(command:typeof commands[number]){const current=slashRef.current;if(!editor||!current)return;editor.chain().focus().deleteRange({from:current.from,to:current.to}).run();command.run(editor);setSlash(null);}
 useEffect(()=>{if(editor&&JSON.stringify(editor.getJSON())!==JSON.stringify(document))editor.commands.setContent(document,{emitUpdate:false});},[editor,document]);
 useEffect(()=>{editor?.setEditable(!disabled,false);},[editor,disabled]);
 useEffect(()=>{if(!editor)return;if(slash){editor.view.dom.setAttribute('aria-controls','notes-slash-menu');editor.view.dom.setAttribute('aria-activedescendant',`notes-slash-${slash.index}`);}else{editor.view.dom.removeAttribute('aria-controls');editor.view.dom.removeAttribute('aria-activedescendant');}},[editor,slash]);
 const filtered=slash?commands.filter(command=>command.label.toLowerCase().includes(slash.query)):[];
 return <div className="notes-rich">
  <div role="toolbar" aria-label="Note formatting" className="notes-toolbar">
   {(['bold','italic','strike','code'] as const).map(mark=><Button key={mark} disabled={!editor||disabled} aria-pressed={editor?.isActive(mark)??false} onClick={()=>editor?.chain().focus().toggleMark(mark).run()}>{mark==='strike'?'Strikethrough':mark[0]!.toUpperCase()+mark.slice(1)}</Button>)}
   <label className="notes-block-label">Block <select aria-label="Block style" disabled={disabled} value="" onChange={event=>{const command=commands.find(item=>item.label===event.target.value);if(editor&&command){editor.commands.focus();command.run(editor);}}}><option value="">Choose block</option>{commands.map(item=><option key={item.label}>{item.label}</option>)}</select></label>
   <Button disabled={disabled||!editor?.can().undo()} onClick={()=>editor?.chain().focus().undo().run()}>Undo</Button><Button disabled={disabled||!editor?.can().redo()} onClick={()=>editor?.chain().focus().redo().run()}>Redo</Button>
  </div>
  <p id="notes-rich-guidance" className="lc-muted">Type / for blocks and tasks. Paste and drop plain text only; attachments and links are unavailable. Maximum 64 KiB of text.</p>
  {slash&&<div id="notes-slash-menu" role="listbox" aria-label="Insert block" className="notes-slash">{filtered.length?filtered.map((command,index)=><button type="button" role="option" id={`notes-slash-${index}`} aria-selected={slash.index===index} key={command.label} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(command)}>{command.label}</button>):<p>No matching blocks. Press Escape to keep typing.</p>}</div>}
  <EditorContent editor={editor}/>
 </div>;
}
