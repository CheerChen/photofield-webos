# Photofield for webOS

LG webOS 电视相册客户端，提供浏览和 Kiosk 幻灯片模式，数据源为自托管 [Photofield](https://github.com/SmilyOrg/photofield) 实例。

版本变更见 [CHANGELOG.md](CHANGELOG.md) 和 [CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md)。

## 架构

```
TV app（file:// 直连，无网关）
  js/clients/source.js       源发现、缓存与 client 契约
  js/clients/photofield.js   Photofield 适配（scene 生命周期封装）
  js/core/player.js          幻灯片引擎（3 图内存窗口）
  js/core/image-loader.js    变体候选链的统一图片加载与回退
  js/core/scan.js            源级扫描编排（红键触发 + 忙时检测）
  js/ui/                     sources / collections / grid / viewer / kiosk / pin / settings
```

源契约：`collections() / photoCount() / photoAt() / slice() / thumbCandidates() / previewCandidates() / originalUrl()`。`thumbUrl()` 与 `previewUrl()` 仅保留为首选 URL 兼容助手。如需接入其他上游服务，可新增一个实现该契约的 client 模块。

## 服务器发现

应用启动时会扫描已配置服务器的 `8000–8010` 端口，并将响应正常的 Photofield 实例显示为照片源。默认服务器地址为 `192.168.0.110`；可在设置页调整地址或重新扫描。扫描结果会缓存，以便下次启动时先显示已有照片源。

## 操作

- 源选择页：方向键切换照片源；OK 浏览；播放键或绿键播放整个照片源；红键对该源触发文件系统重扫（扫描中卡片置灰，禁止进入与播放，方向键仍可切换）；蓝键打开设置。
- 相册列表：方向键移动焦点；OK 浏览相册；播放键或绿键播放当前相册。
- 网格：方向键按服务端 wall 布局移动焦点；OK 打开查看器；播放键或绿键从当前照片开始播放，后续顺序由播放设置决定；红键上一屏、黄键下一屏。
- 查看器：左右键切换照片；OK 或返回键回到网格；播放键或绿键从当前照片开始播放。
- Kiosk：OK、播放键或暂停键暂停或继续；左右键或快退、快进键切换照片；红、绿、黄、蓝键选择 Lofi 播放列表，再次按当前颜色键关闭音乐；上、下键切换当前列表的上一首或下一首；每种颜色的列表播放完后随机切换到另一种颜色；停止键或返回键退出。进入时会显示一条自动淡出的操作提示。
- 设置：启动行为、播放间隔、相片填充、播放顺序、进入 Kiosk 自动播放 Lofi、服务器地址（OK 打开数字键盘输入完整 IP）和重新扫描实例。

## 开发

```bash
npm run check          # 语法检查 + 单元测试
scripts/package.sh     # 打 IPK（需要 ares-cli）
```

生成的 IPK 已被 `.gitignore` 忽略，应作为本地构建产物或发布附件处理。

TV 调试（root + devmode，见 commit 历史与 webos-root-web-debug 笔记）：

```bash
ssh -f -N -L 9977:localhost:9998 lgtv
uv run scripts/launch_app.py 192.168.0.107 com.cheerchen.photofield
echo '(async()=>({href:location.href}))()' | uv run scripts/cdp_eval.py --target photofield
# 热更：scp -r js css index.html lgtv:/media/developer/apps/usr/palm/applications/com.cheerchen.photofield/
uv run scripts/cdp_reload.py
```
