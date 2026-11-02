// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest';
import {analyzeAudio,inspectAudioQuality} from '../services/composition/quality';
afterEach(()=>vi.unstubAllGlobals());
describe('音频有效时长和近静音检查（不评价音乐审美）',()=>{
 it('90秒文件后60秒静音会警告，HTTP成功不等于完整音乐',()=>{
  const pcm=new Float32Array(9000);pcm.fill(.2,0,3000);const report=analyzeAudio([pcm],100,90);
  expect(report.duration).toBe(90);expect(report.activeSeconds).toBeCloseTo(30);expect(report.trailingSilence).toBeCloseTo(60);expect(report.warnings.join()).toContain('作品可能不完整');
 });
 it('极弱信号也算近静音，但普通安静段不误判为长静音',()=>{
  const pcm=new Float32Array(9000).fill(.00001);const report=analyzeAudio([pcm],100,90);
  expect(report.activeSeconds).toBe(0);expect(report.windows[0].rmsDb).toBeCloseTo(-100);
  expect(analyzeAudio([new Float32Array(9000).fill(.01)],100,90).warnings).toEqual([]);
 });
 it('立体声反相不相消，不把单边有声判为静音',()=>{
  const report=analyzeAudio([new Float32Array(9000).fill(.2),new Float32Array(9000).fill(-.2)],100,90);
  expect(report.activeSeconds).toBeCloseTo(90);expect(report.warnings).toEqual([]);
 });
 it('中间长静音和实际时长不足分别提示',()=>{
  const pcm=new Float32Array(6000).fill(.2);pcm.fill(0,2000,4000);const report=analyzeAudio([pcm],100,90);
  expect(report.longestSilence).toBeCloseTo(20);expect(report.trailingSilence).toBe(0);expect(report.warnings.join()).toContain('短于目标90秒');
 });
 it('无效采样拒绝分析，全零不能报作品合格',()=>{
  expect(()=>analyzeAudio([new Float32Array([NaN])],100,90)).toThrow();
  expect(analyzeAudio([new Float32Array(9000)],100,90).warnings.length).toBeGreaterThan(0);
 });
 it('浏览器解码原Blob并释放上下文，不更改音频内容',async()=>{
  const close=vi.fn(async()=>{}),decode=vi.fn(async()=>({numberOfChannels:1,sampleRate:100,getChannelData:()=>new Float32Array(9000).fill(.1)}));
  vi.stubGlobal('AudioContext',class {decodeAudioData=decode;close=close;});
  const blob=new Blob(['original']);await expect(inspectAudioQuality(blob,90)).resolves.toMatchObject({duration:90});expect(await blob.text()).toBe('original');expect(close).toHaveBeenCalledOnce();
 });
 it('解码失败释放资源，不伪装检查通过',async()=>{
  const close=vi.fn(async()=>{});vi.stubGlobal('AudioContext',class {decodeAudioData=async()=>{throw Error('decode');};close=close;});
  await expect(inspectAudioQuality(new Blob(['x']),90)).rejects.toThrow('decode');expect(close).toHaveBeenCalledOnce();
 });
});
