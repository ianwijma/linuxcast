/** Human draft review precedes the bounded resource teardown. A cancelled/failed
 * close leaves the resident app running and permits a later explicit Quit. */
export function createQuitRequest(prepare:()=>Promise<boolean>,quit:()=>Promise<void>){
  let pending:Promise<boolean>|undefined;
  return ()=>{
    if(pending)return pending;
    const operation=(async()=>{try{if(!await prepare())return false;await quit();return true;}catch{return false;}})();
    pending=operation;void operation.finally(()=>{if(pending===operation)pending=undefined;});return operation;
  };
}
