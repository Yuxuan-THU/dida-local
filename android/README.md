# Android 薄客户端（0.1.0）

这是一个**可安装的 Android WebView 客户端**：手机通过局域网加载电脑上的滴答移动版，
数据仍然存在电脑的 SQLite 里。

它解决的是「先有一个能装的 APK」，不是离线版。后面再做本地 SQLite + 增量同步。

---

## 已经有的

- 原生 Android 启动图标/名称：`滴答 · 本地`
- 首次打开显示「服务器地址 + 访问码」
- 不预置任何服务器地址或访问码
- 连接后全屏 WebView，无浏览器地址栏
- 长按页面 → 刷新 / 更改服务器 / 在浏览器打开
- 系统返回键优先返回 WebView 历史
- 允许局域网 HTTP 明文访问（仅本地网络）

APK 构建产物（不随仓库提交）：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

包名：`com.dida.local`，debug 签名，仅供个人安装测试。

---

## 构建

前置：

- JDK 21
- Android SDK Platform 35 + Build Tools 35.0.0
- Gradle 8.9

本机路径示例：

```text
JAVA_HOME    = <JDK 21 安装目录>
ANDROID_HOME = <Android SDK 目录>
GRADLE       = <Gradle 8.9>\bin\gradle.bat
```

一键构建：

```powershell
# 在仓库根目录
npm run apk:build
```

输出：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

直接构建：

```powershell
$env:JAVA_HOME='<JDK 21 安装目录>'
$env:ANDROID_HOME='<Android SDK 目录>'
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
cd android
gradle assembleDebug
```

---

## 安装

```powershell
# 在仓库根目录
npm run apk:install
```

小米/Redmi 如果报：

```text
INSTALL_FAILED_USER_RESTRICTED: Install canceled by user
```

在手机上开启：

```text
设置 → 更多设置 → 开发者选项
  ✓ USB 调试
  ✓ USB 安装（通过 USB 安装）
  ✓ USB 调试（安全设置）
```

然后重新插线/授权，再运行 `npm run apk:install`。

也可以手动安装：

```powershell
adb push android\app\build\outputs\apk\debug\app-debug.apk /sdcard/Download/
```

手机打开「文件管理 → Download → app-debug.apk」，允许安装未知应用。

---

## 首次连接

1. 电脑打开安装版「滴答清单」（或运行 `启动滴答清单.cmd`）；
2. 手机和电脑同一 Wi-Fi；
3. 电脑端 **设置 → 手机访问** 里会显示地址和访问码；
4. 打开 APK，把地址和访问码填进去；
5. 点「连接」。

> APK 不预置任何地址或访问码，避免把个人局域网信息带进安装包。
> 访问码在电脑的 `%APPDATA%\DidaLocal\data\mobile-token.txt`（开发版在 `data/mobile-token.txt`），
> 可在设置里重新生成/查看。

长按页面可以重新连接或刷新。

---

## 限制

- 需要电脑开机并运行本地服务；不是离线 App。
- WebView 里没有浏览器地址栏，扫码/登录第三方页面可能受限。
- 局域网 HTTP 无法注册 Service Worker；这个 APK 不依赖 Service Worker。
- 无推送、无后台提醒、无桌面小组件。
- 正式版应该：
  - 本地 SQLite + `/api/sync` 增量同步；
  - 原生通知/提醒；
  - 正式签名 + 混淆 + 网络配置；
  - 可配置的服务器发现（mDNS/二维码扫描）。

---

## 源码

```text
android/app/src/main/java/com/dida/local/MainActivity.java
android/app/src/main/AndroidManifest.xml
android/app/src/main/res/values/strings.xml
```

`MainActivity` 只用系统 `WebView`，不依赖 AndroidX/Compose；
构建体积约 28 KB（不含 Web 资源，Web 资源由电脑服务提供）。
