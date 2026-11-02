import {openDatabase} from './database';
import type {MusicIntent} from '../composition/musicIntent';
import type {AudioQuality} from '../composition/quality';
export type MusicWork={id:string;title:string;createdAt:number;updatedAt:number;duration:number;source:'live'|'mock'|'imported';blob:Blob;mixBlob?:Blob;preferredMix?:boolean;intent?:MusicIntent;prompt?:string;quality?:AudioQuality;mixQuality?:AudioQuality;mixNote?:string;saved:boolean};
async function run<T>(mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(['music'],mode);let request:IDBRequest<T>;try{request=operation(tx.objectStore('music'));}catch(e){tx.abort();db.close();reject(e);return;}tx.oncomplete=()=>{db.close();resolve(request.result);};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error??Error('作品保存失败，请检查本地存储空间'));};});}
export const musicRepository={
 get:(id:string)=>run<MusicWork|undefined>('readonly',s=>s.get(id)),
 async list(){return(await run<MusicWork[]>('readonly',s=>s.getAll())).filter(w=>w.saved).sort((a,b)=>b.createdAt-a.createdAt);},
 async put(work:MusicWork){if(!work.blob.size)throw Error('作品音频为空，无法保存');await run('readwrite',s=>s.put(work));},
};
