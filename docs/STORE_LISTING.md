# Tab Manager - App Store Listing Kit

## 1) Basic Info

- Product name: `Tab Manager`
- Category (recommended): `Productivity`
- Language support: `English`, `简体中文`
- Minimum Chrome version: `114`

## 2) Short Description

Use this in the Chrome Web Store short description field (132 chars max).

### Chinese
在侧边栏、弹窗和独立工作区集中管理标签页：秒级搜索、智能分组、批量操作、历史回溯。

### English
Manage tabs in one workspace across popup, side panel, and dashboard with instant search, smart grouping, batch actions, history.

## 3) Detailed Description

### Chinese
Tab Manager 是一个面向高频浏览用户的标签工作台，帮你把“找标签、分标签、整理标签”三件事合到一个界面里。

你可以在侧边栏、弹窗或独立页面中管理当前窗口和全局标签：

- 全局搜索：按标题、网址、域名、分组名快速检索
- 智能视图：快速筛选未分组、已分组、休眠、有声音、固定、长期未访问标签
- 批量操作：一键关闭、固定、静音、休眠、分组、取消分组
- 智能分组：支持按域名、网站类型自动归类
- 拖拽编排：支持标签排序、跨分组移动、分组内外重排
- 标签详情与历史：查看活跃时长、最近活动、历史轨迹，并支持重开历史标签
- 工作区偏好：支持主题、语言、默认打开方式、自动刷新频率设置

适合以下场景：

- 日常并行处理多个任务
- 研究/学习中频繁切换资料
- 需要定期清理杂乱标签
- 想保留标签历史并快速恢复

### English
Tab Manager is a focused workspace for people who handle many tabs every day. It combines searching, grouping, and cleanup into one consistent interface.

Use it from the popup, side panel, or standalone dashboard to organize tabs across your browser session:

- Fast search across title, URL, hostname, and group title
- Smart views for ungrouped, grouped, sleeping, audible, pinned, and stale tabs
- Batch actions for close, pin, mute, sleep, group, and ungroup
- Smart grouping by domain or site type
- Drag-and-drop ordering across and within groups
- Tab detail and history with activity timeline and reopen support
- Workspace preferences for theme, language, launch surface, and auto refresh

Built for users who want a cleaner tab workflow, faster switching, and less tab clutter.

## 4) Permission Justification

- `tabs`: Read, focus, reorder, group, sleep, and close tabs.
- `tabGroups`: Read and update Chrome tab groups.
- `sidePanel`: Open and control the side panel workspace.
- `storage`: Save local settings (theme, language, launch mode, refresh rate).
- `system.memory`: Show memory snapshot info inside the workspace.
- `favicon`: Display each tab's favicon for faster visual recognition.

## 5) Single Purpose Statement

### Chinese
Tab Manager 的唯一目的，是帮助用户在 Chrome 中高效搜索、分组、整理与回溯标签页，降低多标签工作场景下的切换成本和管理负担。

### English
Tab Manager has one purpose: helping users efficiently search, group, organize, and revisit browser tabs in Chrome.

## 6) Privacy Statement (For Listing Form)

### Chinese
Tab Manager 不会将你的标签数据上传到外部服务器。插件仅在本地处理标签与分组信息，配置与历史数据存储在浏览器本地存储空间（`chrome.storage`）中，用于提供核心功能。

### English
Tab Manager does not send your tab data to external servers. Tab and group data are processed locally, and settings/history are stored in browser storage (`chrome.storage`) to provide core features.

## 7) Privacy Policy URL (GitHub Pages)

Use this URL in the Chrome Web Store privacy policy field after you publish this repo and enable GitHub Pages:

- `https://<YOUR_GITHUB_USERNAME>.github.io/TabManager/privacy.html`

If your repository name is different, replace `TabManager` with your actual repository name.

## 8) Suggested Store Assets

- Icon: `128x128` (already available)
- Screenshots (recommended 5):
  - Smart search and filter view
  - Batch action toolbar
  - Group management with drag-and-drop
  - Tab detail timeline/history
  - Options page (language/theme/launch settings)

## 9) One-Line Promo Variants

### Chinese
- 把标签管理从“救火”变成“工作流”。
- 用一个工作区，收住所有标签混乱。

### English
- Turn tab chaos into a focused workflow.
- One workspace to control all your tabs.

## 10) Release Notes Template (v0.1.0)

### Chinese
首个可用版本上线：支持标签搜索与筛选、批量操作、智能分组、拖拽排序、历史标签回溯，以及侧边栏/弹窗/独立页三种工作区入口。

### English
First public release: includes tab search and filtering, batch actions, smart grouping, drag-and-drop ordering, tab history, and three work surfaces (popup, side panel, dashboard).
