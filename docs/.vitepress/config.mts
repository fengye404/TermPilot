import { defineConfig } from "vitepress";

const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "TermPilot";
const base = process.env.GITHUB_ACTIONS ? `/${repo}/` : "/";

export default defineConfig({
  lang: "zh-CN",
  title: "TermPilot",
  description: "让手机和电脑继续接上同一条受管理终端会话的文档站。",
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
      { text: "产品概览", link: "/why-termpilot" },
      { text: "快速开始", link: "/getting-started" },
      { text: "部署", link: "/deployment-guide" },
      { text: "运维", link: "/agent-operations" },
      { text: "排障", link: "/troubleshooting" },
      { text: "架构", link: "/architecture" },
      { text: "协议", link: "/protocol" },
      { text: "安全设计", link: "/security-design" },
    ],
    sidebar: [
      {
        text: "了解产品",
        items: [
          { text: "文档首页", link: "/" },
          { text: "Why TermPilot", link: "/why-termpilot" },
          { text: "快速开始", link: "/getting-started" },
        ],
      },
      {
        text: "部署与运维",
        items: [
          { text: "运维总览", link: "/operations-guide" },
          { text: "部署指南", link: "/deployment-guide" },
          { text: "Agent 运维", link: "/agent-operations" },
          { text: "故障排查", link: "/troubleshooting" },
          { text: "CLI 参考", link: "/cli-reference" },
        ],
      },
      {
        text: "技术设计",
        items: [
          { text: "安全设计", link: "/security-design" },
          { text: "代码架构", link: "/architecture" },
          { text: "协议说明", link: "/protocol" },
          { text: "开发文档", link: "/development" },
          { text: "技术选型", link: "/tech-selection-2026" },
          { text: "设计系统", link: "/design-system" },
        ],
      },
      {
        text: "项目信息",
        items: [
          { text: "持续改进计划", link: "/roadmap" },
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
      message: "文档先描述当前实现，持续改进围绕现有主路径展开。",
      copyright: "Copyright © 2026 Fengye",
    },
  },
});
