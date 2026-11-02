import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
export type HistoricalJob={executionMode:'mock'|'live';record:{id:string;status:string;generationMode?:'text-to-audio'|'audio-to-audio';duration?:number;createdAt?:string;updatedAt?:string;upstreamId?:string;recovery?:unknown;failure?:{submissionUnknown?:boolean}}};
/** 只读已有元数据，不加载密钥、不修改历史、不调用上游。损坏时显式报错。 */
export function readHistory(directory:string):HistoricalJob[]{
 if(!existsSync(directory))return[];
 const result:HistoricalJob[]=[];
 for(const name of readdirSync(directory).filter(n=>/^jobs-(?:mock|[a-f0-9]{16})\.json$/.test(n))){
  const records=JSON.parse(readFileSync(join(directory,name),'utf8'));if(!Array.isArray(records))throw Error('历史任务文件格式无效');
  for(const record of records){if(typeof record?.id!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(record.id))throw Error('历史任务ID无效');result.push({executionMode:name==='jobs-mock.json'?'mock':'live',record});}
 }
 return result;
}
