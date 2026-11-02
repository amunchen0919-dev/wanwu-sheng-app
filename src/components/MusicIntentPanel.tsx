import type {MusicIntent} from '../services/composition/musicIntent';
export function MusicIntentPanel({intent}:{intent:MusicIntent}){
 return <section className="panel lab-panel" aria-labelledby="music-intent-title"><h2 id="music-intent-title">用户声音特征分析</h2>
 <p>依据现有敲击事件，不从混合WAV猜测节奏。记录 {intent.eventCount} 次敲击，跨度 {(intent.spanMs/1000).toFixed(2)}秒，密度 {intent.densityPerSecond.toFixed(2)}次/秒。</p>
 <p>参考BPM：{intent.tempo.estimate??'无法可靠估计'}；候选：{intent.tempo.candidates.join(' / ')||'不足'}；可信度：{intent.tempo.confidence==='medium'?'中':intent.tempo.confidence==='low'?'低':'证据不足'}。{intent.tempo.note}</p>
 <p>力度范围 {intent.dynamics.min.toFixed(2)}–{intent.dynamics.max.toFixed(2)}，平均 {intent.dynamics.mean.toFixed(2)}；重复间隔动机 {intent.motifs.length} 组。力度来源沿用原事件，不当作真实压力测量。</p>
 <ul>{intent.sounds.map(s=><li key={s.id}>{s.name} · {s.source==='builtin'?'内置':s.source==='recording'?'个人录音':'照片关联'} · {s.triggerTimesMs.length}个参考触发点</li>)}</ul>
 <p>{intent.unknowns.join('；')}</p><details><summary>查看 MusicIntent 结构化数据</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:320,overflow:'auto'}}>{JSON.stringify(intent,null,2)}</pre></details></section>;
}
