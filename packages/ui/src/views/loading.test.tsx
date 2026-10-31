// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ViewSession} from './session.ts';
import {ViewRenderer} from './renderer.tsx';
it.each(['list','grid'] as const)('%s shows pending searches as Loading and only reports an empty result after settlement',kind=>{
 const view={protocolVersion:1,viewId:'public-pending',revision:1,kind,title:'Public search',loading:true,search:{query:'public query',placeholder:'Search',mode:'extension'},sections:[],...(kind==='grid'?{density:'comfortable',images:[]}:{}),empty:{title:'No public items',description:'Choose another filter.'}},action=vi.fn(),session=new ViewSession(view);
 const markup=()=>renderToStaticMarkup(<ViewRenderer session={session} host={{action}}/>);
 expect(markup()).toContain('Loading…');expect(markup()).not.toContain('No matching results');expect(markup()).not.toContain('Choose another filter.');
 session.update('public-pending',{protocolVersion:1,kind:'snapshot',view:{...view,revision:2,loading:false}});
 expect(markup()).not.toContain('Loading…');expect(markup()).toContain('No matching results');expect(markup()).toContain('Choose another filter.');expect(action).not.toHaveBeenCalled();
});

it.each(['list','grid'] as const)('%s preserves unavailable/error headings for extension queries instead of claiming an empty match',kind=>{
 for(const statusKind of ['warning','error'] as const){
  const view={protocolVersion:1,viewId:'public-unavailable',revision:1,kind,title:'Public search',loading:false,search:{query:'public query',placeholder:'Search',mode:'extension'},sections:[],...(kind==='grid'?{density:'comfortable',images:[]}:{}),empty:{title:'Local source unavailable',description:'Reload or choose a supported source.'},status:{kind:statusKind,message:'The selected source changed.'}},action=vi.fn(),session=new ViewSession(view);
  const markup=()=>renderToStaticMarkup(<ViewRenderer session={session} host={{action}}/>);
  expect(markup()).toContain('Local source unavailable');expect(markup()).not.toContain('No matching results');expect(markup()).toContain('Reload or choose a supported source.');expect(action).not.toHaveBeenCalled();
 }
});

// D1-01 review regression: contract-valid extension shortcut keys that collide with Object.prototype
// names must render as plain bounded keycaps with truthful labels, never as inherited members.
it('renders contract-valid prototype-named shortcut keys safely in the action panel and footer',async()=>{
 const {render,screen,fireEvent,cleanup}=await import('@testing-library/react');
 const {viewModelSchema}=await import('@linuxcast/contracts');
 const keys=['__proto__','constructor','toString','hasOwnProperty','valueOf'] as const;
 const actions=[{id:'open',title:'Open public item',kind:'open',effect:'read',shortcut:{key:'Enter',modifiers:[]}},{id:'copy',title:'Copy public item',kind:'copy',effect:'write',shortcut:{key:'c',modifiers:['Ctrl','Shift']}},...keys.map((key,index)=>({id:`proto-${index}`,title:`Public action ${key}`,kind:'invoke',effect:'read',shortcut:{key,modifiers:['Ctrl']}}))];
 const view=viewModelSchema.parse({protocolVersion:1,viewId:'public-shortcuts',revision:1,kind:'list',title:'Public shortcuts',search:{query:'',placeholder:'Search',mode:'host'},sections:[{id:'s',items:[{id:'item',title:'Public item',actions}]}],selectedId:'item'});
 const action=vi.fn(),session=new ViewSession(view);
 // jsdom has no modal dialog implementation; scope a minimal open/close shim to this test.
 const dialog=HTMLDialogElement.prototype as {showModal?:(()=>void)|undefined;close?:(()=>void)|undefined},original={showModal:dialog.showModal,close:dialog.close};
 dialog.showModal=function(this:HTMLDialogElement){this.setAttribute('open','');};dialog.close=function(this:HTMLDialogElement){this.removeAttribute('open');};
 try{
  render(<ViewRenderer session={session} host={{action}}/>);
  fireEvent.click(screen.getByRole('button',{name:/^Actions/}));
  for(const key of keys){
   const hint=screen.getByRole('img',{name:`Ctrl+${key}`});
   expect(Array.from(hint.querySelectorAll('kbd'),cap=>cap.textContent)).toEqual(['Ctrl',key]);
  }
  expect(screen.getByRole('img',{name:'Ctrl+Shift+C'})).toBeTruthy();
  expect(document.body.textContent).not.toContain('[native code]');
  expect(action).not.toHaveBeenCalled();
 }finally{cleanup();dialog.showModal=original.showModal;dialog.close=original.close;}
});
