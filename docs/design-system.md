# 设计系统

这份文档定义 TermPilot 当前 Web UI 的基础视觉规则。后续界面调整默认都以这里为准，不再临时各自决定颜色、圆角、阴影和间距。

## 主题色

TermPilot 当前主主题色：

```text
#1F7A53
```

语义：

- 主按钮
- 当前激活态
- 焦点环
- 在线状态
- 关键操作的视觉强调

配套色：

```text
Accent strong: #2C9A6A
Background:    #0B0F12
Surface:       #10161B
Panel border:  rgba(79, 97, 110, 0.28)
Text:          #E6EDF2
Muted text:    #9AA8B4
Danger:        #CC6856
Warning:       #C6912F
```

## 当前原则

这次重构之后，Web UI 统一遵守以下规则：

- 不使用夸张大圆角。主面板半径控制在 `16px` 到 `18px`。
- 不依赖大阴影制造层级。优先用边框、底色和轻微对比建立层次。
- 不用大面积高饱和点缀色。主题色只用于主操作、焦点和激活态。
- 终端区域优先强调可读性和信息密度，不做“卡片秀场”。
- 移动端按钮保持可点，但避免把所有控件都做成巨型 pill。

## 组件基线

### 圆角

- 页面主面板：`18px`
- 次级面板 / 内嵌区块：`16px`
- 输入框 / 按钮：`14px`
- 状态胶囊：`999px`

### 阴影

- 默认只保留极轻的表面阴影
- 终端主容器允许一层比普通面板略重的压暗边界
- 不再使用 `shadow-2xl` 这类强阴影作为默认样式

### 间距

- 模块间主间距：`16px`
- 面板内 padding：`16px` 到 `20px`
- 表单控件垂直节奏：`12px`

## 代码落点

当前主题 token 和基础样式主要落在：

- `app/src/index.css`
- `app/src/components/chrome.tsx`
- `app/src/App.tsx`

PWA 的浏览器主题色配置落在：

- `app/vite.config.ts`

VitePress 站点主题色与导航入口落在：

- `docs/.vitepress/config.mts`

## 后续约束

以后新增 Web UI 时，默认先复用现有 token 和语义，不要重新引入另一套色彩体系。如果要换主主题色，先修改这份文档，再同步更新 app、PWA manifest、docs theme-color 和相关状态色。
