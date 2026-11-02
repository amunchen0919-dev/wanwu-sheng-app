import {DATABASE_NAME,DATABASE_VERSION} from './contracts';
export function openDatabase():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 if(!globalThis.indexedDB){reject(Error('此浏览器无法使用本地声音数据库'));return;}
 const request=indexedDB.open(DATABASE_NAME,DATABASE_VERSION);let blocked=false;
 request.onupgradeneeded=()=>{const db=request.result;for(const name of ['sounds','music'])if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'});if(!db.objectStoreNames.contains('blobs'))db.createObjectStore('blobs');};
 request.onblocked=()=>{blocked=true;reject(Error('数据库升级被其他页面阻止，请关闭其他万物声页面后重试'));};request.onerror=()=>reject(request.error??Error('无法打开本地数据库'));
 request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();if(blocked)request.result.close();else resolve(request.result);};
});}
