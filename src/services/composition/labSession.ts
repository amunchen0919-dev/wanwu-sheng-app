import type {GenerationMode} from './musicIntent';
import type {Retention} from './prompt';
import {AUDIO_LAB_DURATIONS} from '../../types/audioLabOptions';
export type LabTask={id:string;state:'unknown'|'submitting'|'pending'|'complete'|'rejected'|'error';generationMode?:GenerationMode;duration?:number;canManualRecover?:boolean;manuallyArchived?:boolean;upstreamId?:string;diagnostic?:{source:string;elapsedMs:number;timeoutMs:number;cause:string};outcome?:string;executionMode?:'mock'|'live';requiresModeSwitch?:boolean;modeMismatch?:boolean;error?:string;canPrepare:boolean;conflict?:boolean;};
export type LabSession={version:1;prompt?:string;strength:number;duration:number;scenario:string;promptIsAutomatic?:boolean;promptsByMode?:Partial<Record<GenerationMode,string>>;generationMode?:GenerationMode;mixEnabled?:boolean;mixIntensity?:Retention;retention?:Retention;task?:LabTask};
export function readLabSession(key:string):LabSession{
  let raw:string|null=null,id:string|null=null;
  try{id=sessionStorage.getItem(key);raw=sessionStorage.getItem(`${key}:state`);
    if(raw){const value=JSON.parse(raw);if(value.version===1&&typeof value.strength==='number'&&AUDIO_LAB_DURATIONS.some(duration=>duration===value.duration)){
      let task:LabTask|undefined;
      if(typeof value.task?.id==='string'&&value.task.id){task={executionMode:['mock','live'].includes(value.task.executionMode)?value.task.executionMode:undefined,generationMode:['text-to-audio','audio-to-audio'].includes(value.task.generationMode)?value.task.generationMode:undefined,duration:AUDIO_LAB_DURATIONS.some(d=>d===value.task.duration)?value.task.duration:undefined,id:value.task.id,state:'unknown',canPrepare:false,error:typeof value.task.error==='string'?value.task.error:undefined,conflict:!!value.task.conflict};}
      // 兼容旧版/HMR只更新ID键的情况，不能被不含任务的旧快照覆盖。
      if(id&&id!==task?.id){task={id,state:'unknown',canPrepare:false,conflict:!!task,error:task?'任务ID与状态快照不一致，需人工核对，不能直接解除锁':'发现旧版任务ID，旧快照不含失败详情；保持锁定待本地核对'};}
      return{version:1,promptIsAutomatic:value.promptIsAutomatic===true,promptsByMode:Object.fromEntries(Object.entries(value.promptsByMode??{}).filter(([key,prompt])=>['text-to-audio','audio-to-audio'].includes(key)&&typeof prompt==='string')),generationMode:value.generationMode==='text-to-audio'?'text-to-audio':'audio-to-audio',mixEnabled:value.mixEnabled===true,mixIntensity:['low','medium','high'].includes(value.mixIntensity)?value.mixIntensity:'low',retention:['low','medium','high'].includes(value.retention)?value.retention:'low',prompt:typeof value.prompt==='string'?value.prompt:undefined,strength:value.strength,duration:value.duration,scenario:['success','upload-error','generation-error','query-error'].includes(value.scenario)?value.scenario:'success',task};
    }}
  }catch{/* 损坏的状态不能当作无任务 */}
  return{version:1,generationMode:'text-to-audio',mixEnabled:false,mixIntensity:'low',strength:.6,duration:90,scenario:'success',...((id||raw)?{task:{id:id??'corrupt-record-unknown',state:'unknown',canPrepare:false,error:'发现旧版或损坏的任务锁，未保存可靠失败详情；不能假定上次未计费。'}}:{})};
}
export function writeLabSession(key:string,value:LabSession){
  sessionStorage.setItem(`${key}:state`,JSON.stringify(value));
  if(value.task)sessionStorage.setItem(key,value.task.id);else sessionStorage.removeItem(key);
}
