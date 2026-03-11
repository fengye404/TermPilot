import { defineConfig } from "vitepress";

const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "TermPilot";
const base = process.env.GITHUB_ACTIONS ? `/${repo}/` : "/";

export default defineConfig({
  lang: "zh-CN",
  title: "TermPilot",
  description: "手机和电脑共享同一个 tmux 会话的终端远程控制工具。",
  base,
  lastUpdated: true,
  cleanUrls: true,
  head: [
    ["meta", { name: "theme-color", content: "#1f7a53" }],
    ["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
    ["link", { rel: "shortcut icon", href: "/favicon.svg" }],
  ],
  themeConfig: {
    siteTitle: "TermPilot",
    logo: "/favicon.svg",
    nav: [
      { text: "首页", link: "/" },
      { text: "Why TermPilot", link: "/why-termpilot" },
      { text: "快速开始", link: "/getting-started" },
      { text: "部署与运维", link: "/operations-guide" },
      { text: "架构", link: "/architecture" },
      { text: "协议", link: "/protocol" },
    ],
    sidebar: [
      {
        text: "开始",
        items: [
          { text: "文档首页", link: "/" },
          { text: "Why TermPilot", link: "/why-termpilot" },
          { text: "快速开始", link: "/getting-started" },
          { text: "部署与运维指南", link: "/operations-guide" },
        ],
      },
      {
        text: "参考",
        items: [
          { text: "代码架构", link: "/architecture" },
          { text: "协议说明", link: "/protocol" },
          { text: "开发文档", link: "/development" },
          { text: "技术选型", link: "/tech-selection-2026" },
        ],
      },
    ],
    search: {
      provider: "local",
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/fengye404/TermPilot" },
    ],
    editLink: {
      pattern: "https://github.com/fengye404/TermPilot/edit/main/docs/:path",
      text: "在 GitHub 上编辑此页",
    },
    outline: {
      level: [2, 3],
      label: "本页目录",
    },
    footer: {
      message: "为长期任务和跨端终端控制而构建。",
      copyright: "Copyright © 2026 Fengye",
    },
  },
});
