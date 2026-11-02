// 实验室参考独立缓存；不修改个人声音数据库，不删除磁盘WAV。
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){reject(new Error('参考缓存不可用'));return;}
  const request=indexedDB.open('wanwu-audio-lab',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('references');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});}
export async function loadLabReference(sessionId:string):Promise<Blob|undefined>{
  const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('references','readonly'),request=tx.objectStore('references').get(sessionId);tx.oncomplete=()=>{db.close();resolve(request.result);};tx.onabort=()=>{db.close();reject(tx.error);};});
}
export async function saveLabReference(sessionId:string,blob:Blob){
  const db=await open();return new Promise<void>((resolve,reject)=>{const tx=db.transaction('references','readwrite');tx.objectStore('references').put(blob,sessionId);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};});
}
