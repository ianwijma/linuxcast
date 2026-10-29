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
