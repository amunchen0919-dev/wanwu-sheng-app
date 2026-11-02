# 万物声 · Wanwu Sound

**听见万物。** 面向视障用户的声音创作 Web App：选择生活声音、敲击节奏、表达音乐偏好，再由 AI 创作完整器乐作品，并可将少量个人声音融入音乐。

## 已实现

- 16 个页面和移动端优先的深色界面，保留大操作区、键盘控制、页面焦点及重要状态播报。
- 六张声音卡循环、试听/暂停/切换停止、喜欢/取消、随机换组。
- Pointer Events/键盘真实节奏录制：毫秒时间、持续时间和力度；Web Audio 调度试听及清除重录。
- MediaRecorder 真实麦克风录音、试听及 IndexedDB 个人声音库。
- 正式创作流程：输入 → MusicIntent → 英文描述 → Stable Audio 3.0 Text-to-Audio（默认约90秒）→ 质量检查 → 试听、下载和本地保存。
- 可关闭的保守后期混音，原曲与混音独立保留；时长、近静音、覆盖率和疑似削波检查。
- Mock 免费体验、Live 当次费用确认、任务持久化、未知锁、只查询恢复和人工审计机制。

尚未完成：真实 AI 图像识别、语音偏好转写、实体球连接、账号/云端同步、原生安装包。模拟音频始终标注为模拟；技术检查不代表音乐审美验收。完整 VoiceOver 体验仍需人工验证。

## 环境与安装

建议 Node.js **22.18 或更新的22.x**，npm 10+。仓库提供 `.nvmrc`，使用 nvm 时可运行 `nvm install && nvm use`。

```sh
git clone https://github.com/amunchen0919-dev/wanwu-sheng-app.git
cd wanwu-sheng-app
npm ci
cp .env.example .env
```

私有仓库成员需先接受协作邀请，并使用自己的 GitHub 身份授权。不要把 GitHub token 或 Stability Key 发到聊天、提交到仓库，或写进前端变量。

## 免费 Mock 启动（组员推荐）

在两个终端分别运行：

```sh
npm run dev:api:mock
```

```sh
npm run dev
```

打开 **http://localhost:5173/**。

从首页“开始创作”或“先选择声音，再敲击节奏”进入，完成节奏和声音选择，在确认页查看模拟来源，开始免费测试。也可勾选“免费体验完整流程（本地模拟，不调用AI）”，无需密钥即可验证正式播放、混音和保存。

Mock 不调用付费服务，不代表真实AI的创作效果。后端8787和前端5173各只启动一个进程；切换模式前在旧服务终端按 Ctrl+C。生成的音频、任务记录和浏览器数据均不随Git克隆同步。

## Live 模式（由使用者自行配置）

在本机 `.env` 中填写自己的 `STABILITY_API_KEY`，保留 `ENABLE_AUDIO_LAB=true`。然后停止旧Mock后端，运行：

```sh
npm run dev:api:live
```

前端仍用 `npm run dev`。正式确认页应显示Live及当前费用；取消本地免费体验，核对内容后重新勾选当次费用确认，再主动提交一次。

当前服务使用官方 `stable-audio-3` Text-to-Audio，默认90秒，按最近核对的官方价格为8credits/成功生成（约US$0.08）；以页面及官方实际结算为准。即使音乐不符合期待，也可能已经计费。不会因失败、质量警告或刷新自动重新付费生成。API Key只由Node后端读取，绝不使用 `VITE_STABILITY_API_KEY`。

[官方接口](https://docs.stability.ai/api-reference/stable-audio/text-to-audio) · [官方价格](https://docs.stability.ai/pricing)

已有未知任务时仅查询，不要删除任务文件或清空网站存储绕过锁。开发实验室位于 `/dev/audio-lab`，保留旧Audio-to-Audio对照与诊断；正式用户不必进入实验室。

## 命令与质量检查

```sh
npm run typecheck
npm test
npm run build
npm run security:check
```

自动测试不使用真实密钥或调用付费API。安全检查需Python 3，检查待提交文件和本地已有Git历史，报告路径与规则，不输出密钥。扫描不能代替人工审查；提交前还需 `git diff --cached` 检查。

生产构建后可 `npm run preview` 在4173做本机预览，API后端仍需单独运行。当前后端绑定本机地址；本项目尚未进行公网部署、账号鉴权或生产运维验收。

## 项目结构

```text
src/app/                   路由、创作草稿和正式音乐任务状态
src/pages/                 正式16页与开发实验室
src/components/            公共控件、试听、特征展示和混音界面
src/services/audio/        Web Audio 播放与调度
src/services/rhythm/       统一节奏输入（预留硬件适配）
src/services/recording/    麦克风录音
src/services/composition/ MusicIntent、Prompt、共享API客户端、混音与质检
src/services/storage/     IndexedDB声音/作品、草稿和参考缓存
src/test/                  Vitest与React Testing Library测试
server/                    本地API、模式诊断、第三方接口、任务日志与恢复
public/assets/sounds/      项目自行合成的10种可播放素材
scripts/                   素材生成与安全检查
docs/                      可共享的架构和设计参考
```

[架构与数据流](docs/ARCHITECTURE.md) · [设计参考](docs/design-reference.md)

内置声音由 `scripts/generate_sounds.py` 自行合成；仓库包含运行所需WAV，日常启动不必重新生成。不要把个人录音或AI生成作品当作内置素材提交。

## 组内协作与数据安全

- `.env`、任务数据库、日志、生成音乐、分析报告、缓存、依赖和构建输出不提交。
- 用户音频和音乐作品存于各自浏览器IndexedDB；清理网站数据可能丢失，请主动下载备份。
- 数据库升级保留原声音仓。若被旧标签阻止，先刷新或关闭旧页面，不清库解决。
- 本地 `DEVELOPMENT_PROGRESS.md` 和操作诊断保留在开发者电脑，未作为可共享项目文档发布。
- 不强制推送、不覆盖他人提交。正常提交前先检查状态、运行测试与安全检查。
