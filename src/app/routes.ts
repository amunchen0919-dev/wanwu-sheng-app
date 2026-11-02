export const paths = {
  home: '/', rhythm: '/rhythm', discover: '/discover', select: '/sounds/select',
  prepare: '/compose', record: '/record', camera: '/camera', composing: '/compose/progress',
  library: '/library', player: '/music/play', mine: '/mine', works: '/music',
  saved: '/music/saved', photoResult: '/camera/result', recorded: '/record/complete',
  emptyLibrary: '/library/empty',
} as const;

export const pageCatalog = [
  ['01', '首页', paths.home], ['02', '敲击节奏', paths.rhythm],
  ['03', '声音邂逅', paths.discover], ['04', '选择声音', paths.select],
  ['05', 'AI 编曲准备', paths.prepare], ['06', '录音', paths.record],
  ['07', '拍照', paths.camera], ['08', '正在编曲', paths.composing],
  ['09', '我的声音库', paths.library], ['10', '音乐播放与保存', paths.player],
  ['11', '我的声音', paths.mine], ['12', '我制作的音乐', paths.works],
  ['13', '保存成功', paths.saved], ['14', '拍照识别结果', paths.photoResult],
  ['15', '录音完成', paths.recorded], ['16', '声音库空状态', paths.emptyLibrary],
] as const;
