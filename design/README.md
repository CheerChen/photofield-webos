# 图标与 Splash 母版

`icon.svg` 和 `splash.svg` 是矢量母版，PNG 产物在 `assets/` 下（会打进 IPK，本目录不会）。

设计语言：取应用自身的 justified 照片墙布局抽象成四块圆角瓦片，暖色黄昏渐变（琥珀 → 珊瑚 → 玫瑰 → 暮紫），右上瓦片内一枚落日圆点；底色与应用 `--bg: #0e0f12` 一致，珊瑚色延续 `--accent: #e5484d`。

## 重新生成 PNG

本机无 librsvg/ImageMagick 时用 headless Chrome 渲染（小于约 500px 的窗口会被 Chrome 钳制，
所以图标先渲 800px 再用 sips 缩小）：

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# icon: 800px 中间产物 -> 80 / 130
"$CHROME" --headless=new --disable-gpu --force-device-scale-factor=1 \
  --default-background-color=00000000 --window-size=800,800 \
  --screenshot="$PWD/design/icon-800.png" "file://$PWD/design/icon.svg"
sips -z 80 80   design/icon-800.png --out assets/icons/icon.png
sips -z 130 130 design/icon-800.png --out assets/icons/icon-large.png
rm design/icon-800.png

# splash: 1920x1080 直出
"$CHROME" --headless=new --disable-gpu --force-device-scale-factor=1 \
  --window-size=1920,1080 \
  --screenshot="$PWD/assets/splash.png" "file://$PWD/design/splash.svg"
```

注意：SVG 内的 XML 注释不能含 `--`（会导致解析失败、渲染出错误页）。
