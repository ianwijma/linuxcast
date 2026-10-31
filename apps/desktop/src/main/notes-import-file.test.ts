import {afterEach,expect,it} from 'vitest';
import {mkdtemp,writeFile,readFile,rm,symlink,mkdir} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readNoteMarkdownFile} from './notes-import-file.ts';
const roots:string[]=[];
async function fixture(){const root=await mkdtemp(join(tmpdir(),'linuxcast-note-import-'));roots.push(root);return root;}
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
it('reads an exact selected UTF8 file without changing the original',async()=>{const root=await fixture(),path=join(root,'public.md'),text='# Public 雪\r\n\r\n- [x] Done\r\n';await writeFile(path,text);expect(await readNoteMarkdownFile(path,new AbortController().signal)).toBe(text);expect(await readFile(path,'utf8')).toBe(text);});
it('refuses a selected symlink, symlink ancestor, directory, invalid UTF8, empty and oversized source',async()=>{const root=await fixture(),path=join(root,'public.md');await writeFile(path,'# Public');await symlink(path,join(root,'link.md'));await mkdir(join(root,'real'));await writeFile(join(root,'real','public.md'),'# Public');await symlink(join(root,'real'),join(root,'linked'));await writeFile(join(root,'invalid.md'),Buffer.from([0xc3,0x28]));await writeFile(join(root,'empty.md'),'');await writeFile(join(root,'large.md'),'x'.repeat(524289));for(const selected of [join(root,'link.md'),join(root,'linked','public.md'),root,join(root,'invalid.md'),join(root,'empty.md'),join(root,'large.md'),root+'/../public.md'])await expect(readNoteMarkdownFile(selected,new AbortController().signal)).rejects.toThrow();expect(await readFile(path,'utf8')).toBe('# Public');});
it('refuses a source mutated during a multi-chunk read and never writes content itself',async()=>{const root=await fixture(),path=join(root,'public.md');await writeFile(path,'a'.repeat(140000));const controller=new AbortController(),check=controller.signal.throwIfAborted.bind(controller.signal);let calls=0;Object.defineProperty(controller.signal,'throwIfAborted',{value:()=>{check();if(++calls===path.split('/').length+2)writeFileSync(path,'changed');}});await expect(readNoteMarkdownFile(path,controller.signal)).rejects.toThrow();expect(await readFile(path,'utf8')).toBe('changed');});
it('honors cancellation before opening any selected file',async()=>{const controller=new AbortController();controller.abort();await expect(readNoteMarkdownFile('/tmp/nonexistent-public.md',controller.signal)).rejects.toThrow();});
