# Photofield for webOS

LG webOS 电视相册：浏览 + Kiosk 幻灯片双模式，数据源为自托管 [photofield](https://github.com/SmilyOrg/photofield) 实例。

## 架构

```
TV app（file:// 直连，无网关）
  js/clients/source.js       源注册表 + client 契约
  js/clients/photofield.js   photofield 适配（scene 生命周期封装）
  js/core/player.js          幻灯片引擎（3 图内存窗口）
  js/ui/                     sources / collections / grid / viewer / kiosk / pin / settings
```

源契约：`collections() / photoCount() / photoAt() / slice() / thumbUrl() / previewUrl() / originalUrl()`。换上游（如 pigallery2）= 新增一个实现契约的 client 模块。

### 当前源（硬编码于 source.js）

| 源 | endpoint | 锁定 |
|---|---|---|
| DCIM | http://192.168.0.110:8000 | 否 |
| X | http://192.168.0.110:8001 | 否 |
| Wallpaper | http://192.168.0.110:8002 | 否 |

## 操作

- 源选择页：OK 浏览，**长按 OK** 直接 Kiosk 播放整源，蓝键设置
- 相册列表：OK 浏览，长按 OK 播放该相册
- 网格：方向键移动焦点（服务端 wall 布局 + 最近邻导航），OK 全屏，长按 OK 从当前位置顺序播放
- Kiosk：OK 暂停，←→ 手动切换，↑ 隐藏信息层，红 / 绿 / 黄 / 蓝键切换四首 Lofi，重复按当前颜色关闭音乐，返回退出
- 设置：启动行为、播放间隔、相片填充（竖图氛围 / 完整显示 / 裁切填满）、播放顺序（随机 / 顺序）

## 开发

```bash
npm run check          # 语法检查 + 单元测试
scripts/package.sh     # 打 IPK（需要 ares-cli）
```

TV 调试（root + devmode，见 commit 历史与 webos-root-web-debug 笔记）：

```bash
ssh -f -N -L 9977:localhost:9998 lgtv
uv run scripts/launch_app.py 192.168.0.107 com.cheerchen.photofield
echo '(async()=>({href:location.href}))()' | uv run scripts/cdp_eval.py --target photofield
# 热更：scp -r js css index.html lgtv:/media/developer/apps/usr/palm/applications/com.cheerchen.photofield/
uv run scripts/cdp_reload.py
```
