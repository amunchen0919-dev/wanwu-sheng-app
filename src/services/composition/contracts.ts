import type { Composition, CompositionInput } from '../../types/domain';
// 接口预留。尚未实现基础规则编曲或生成式 AI，不在界面报告任务成功。
export interface CompositionService {
  compose(input: CompositionInput, onProgress?: (progress: number) => void): Promise<Composition>;
}
export interface ImageRecognitionService {
  recognize(image: Blob): Promise<{ label: string; soundId: string; simulated: boolean }>;
}
