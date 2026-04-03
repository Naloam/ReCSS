# ReCSS

[English](./README.md) | [简体中文](./README.zh-CN.md)

[![Version](https://img.shields.io/github/package-json/v/Naloam/ReCSS?filename=packages%2Fcli%2Fpackage.json&label=version&color=10b981)](https://github.com/Naloam/ReCSS)
[![CI](https://github.com/Naloam/ReCSS/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/Naloam/ReCSS/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Naloam/ReCSS?color=111827)](./LICENSE)
[![Stars](https://img.shields.io/github/stars/Naloam/ReCSS?style=social)](https://github.com/Naloam/ReCSS/stargazers)

> 在 CSS 压垮你之前，先把它找出来。

<p align="center">
  <img src="./.github/assets/cli-demo.svg" alt="ReCSS CLI 输出示意图" width="920" />
</p>

ReCSS 是一个专注于前端真实仓库的 TypeScript CSS 健康分析工具。它解决的是团队经常遇到的三个实际问题：

- 哪些 CSS class 正在被使用？
- 哪些选择器大概率已经死掉，可以安全排查？
- 哪些地方的 specificity 已经开始不受控制？

它还提供了一条保守的 CSS Modules 迁移路径，而不是逼你一次性重写整个样式系统。

## 为什么做 ReCSS

如果你打开一个维护了五年的 `styles.scss`，看到某个选择器时会想到“这个应该还能用，但我不敢删”，这就是 ReCSS 实际需要被应用到场景。

很多 CSS 清理工具从最终产物或 bundle 出发。ReCSS 从源码树出发，更适合 Vue、React、混合技术栈、历史包袱较重的项目。它并非项尽可能压缩项目提及，而是指明到底有哪些内容没有被使用。

ReCSS 的设计原则是保守优先：

- 动态 class 默认按“不确定”处理，而不是冒进地报成未使用。
- 检测到 CSS Modules 时直接跳过，不做猜测。
- 迁移辅助会改最常见的模式，但遇到歧义表达式时会选择保守方案。

## 你能得到什么

- `recss analyze`
  从 Vue、React、HTML 源码里找出未使用的 CSS / SCSS class。
- `recss check`
  检测 specificity 冲突和 `!important` 滥用风险。
- `recss migrate --apply`
  把普通样式文件复制为 CSS Modules 文件，并自动改写常见 class 引用。
- `recss-vite-plugin`
  在本地开发和 HMR 阶段直接给出警告。
- `recss-vscode-extension`
  在 VS Code 里提供行内诊断、快速修复和文件级 fix-all。

## 快速开始

```bash
pnpm add -D recss-cli
recss analyze .
recss check .
recss migrate ./src/components/button --apply
```

仓库开发命令：

```bash
pnpm install
pnpm build
pnpm lint
pnpm test
```

## CLI 命令

```bash
recss analyze [dir] [--framework auto|vue|react|html] [--output console|json|html] [--config <path>] [--safelist a,b] [--outfile report-path]
recss check [dir] [--framework auto|vue|react|html] [--threshold 0] [--config <path>]
recss init [dir]
recss migrate [component-dir] [--apply]
```

## 迁移助手

`recss migrate --apply` 是一个简单的迁移工具，不是“万能 AST 魔法改写器”。

当前已经覆盖：

- React 的字符串字面量、模板字符串、`clsx` / `cn` / `classnames`、数组、`filter(Boolean).join(" ")`、`concat` 链、条件表达式、逻辑表达式、字符串拼接、外层包装函数调用，以及若干 optional-call 变体。
- Vue 的静态 `class`、对象型 `:class`、数组型 `:class`、静态和动态混用、`<style module="alias">` 别名、`useCssModule()` 访问器，以及支持表达式外再包一层函数调用的情况。

项目现在的设计很保守，不会去猜测多来源样式模块的歧义引用，也不会改动高度动态的表达式。

## 包结构

- [recss-cli](./packages/cli) - CLI，负责分析、检查、初始化配置和迁移入口。
- [recss-core](./packages/core) - 核心引擎，负责解析、分析、报告和迁移辅助能力。
- [recss-vite-plugin](./packages/vite-plugin) - Vite 开发期告警集成。
- [recss-vscode-extension](./packages/vscode-extension) - VS Code 诊断与快速修复扩展。

## 发布

当前仓库使用 Changesets 管理版本与 npm 发布。

```bash
pnpm changeset
pnpm version-packages
pnpm release
```

## License

[MIT](./LICENSE)

如果本项目对你有用，欢迎 star。
