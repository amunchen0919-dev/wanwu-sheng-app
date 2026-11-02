export type CapturedRecording = { id: string; blob: Blob; createdAt: number; duration: number; mimeType: string };
export function recordingError(error: unknown) {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return '麦克风权限被拒绝，请在浏览器网站设置中允许麦克风后重试';
  if (name === 'NotFoundError') return '未找到麦克风，请连接设备后重试';
  if (name === 'NotReadableError') return '麦克风不可用，可能正被其他应用占用';
  return error instanceof Error ? error.message : '录音失败，请重试';
}
export class MicrophoneRecorder {
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private cancelled = false;
  private chunks: Blob[] = [];
  private started = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private reject?: (error: Error) => void;
  private complete?: Promise<CapturedRecording>;
  async start() {
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) throw new Error('浏览器不支持麦克风录音，请使用 HTTPS 或 localhost 下的新版 Safari / Chrome');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (this.cancelled) { this.release(); throw new Error('录音已取消'); }
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
    try {
      this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      this.complete = new Promise((resolve, reject) => {
        this.reject = reject;
        this.recorder!.ondataavailable = event => { if (event.data.size) this.chunks.push(event.data); };
        this.recorder!.onerror = () => { reject(new Error('录音中断，请重新录制')); this.release(); };
        this.recorder!.onstop = () => {
          const duration = Math.min(60, (performance.now() - this.started) / 1000);
          const type = this.recorder!.mimeType || this.chunks[0]?.type || 'application/octet-stream';
          const blob = new Blob(this.chunks, { type });
          this.release();
          if (!blob.size) reject(new Error('没有录到声音数据，请重新录制'));
          else resolve({ id: crypto.randomUUID(), blob, createdAt: Date.now(), duration, mimeType: type });
        };
        for (const track of this.stream!.getAudioTracks()) track.onended = () => { reject(new Error('麦克风连接中断，请重新录制')); this.cancel(); };
      });
      // 提前注册处理，避免用户尚未点击结束时产生未处理的拒绝。
      void this.complete.catch(() => {});
      this.started = performance.now();
      this.recorder.start(250);
      this.timer = setTimeout(() => this.stop(), 60000);
    } catch (error) { this.release(); throw error; }
  }
  get result() { return this.complete; }
  get elapsed() { if (!this.recorder) return 0; return Math.min(60, (performance.now() - this.started) / 1000); }
  stop() { if (this.recorder?.state === 'recording') this.recorder.stop(); }
  private release() { clearTimeout(this.timer); this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); }); this.stream = undefined; }
  cancel() {
    this.cancelled = true;
    if (this.recorder) { this.recorder.ondataavailable = null; this.recorder.onstop = null; this.recorder.onerror = null; this.stop(); }
    this.reject?.(new Error('录音已取消'));
    this.release(); this.chunks = [];
  }
}
