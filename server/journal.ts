import {existsSync,readFileSync,mkdirSync,writeFileSync,renameSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {dirname} from 'node:path';
export interface JobJournal { read():unknown; write(value:unknown):void }
/** 仅保存任务元数据；不保存密钥、Prompt、音频。损坏记录必须阻止提交。 */
export function fileJournal(path:string):JobJournal{
  return {read(){return existsSync(path)?JSON.parse(readFileSync(path,'utf8')):[];},write(value){mkdirSync(dirname(path),{recursive:true});const tmp=`${path}.tmp`;const fd=openSync(tmp,'w',0o600);try{writeFileSync(fd,JSON.stringify(value,null,2));fsyncSync(fd);}finally{closeSync(fd);}renameSync(tmp,path);}};
}
