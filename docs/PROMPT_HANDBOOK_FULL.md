# ReCSS 完整 AI 提示词手册（提取版）

以下内容按计划书第 6 节完整整理，可直接逐轮执行。

## 第 0 轮：项目初始化

```text
你现在是 ReCSS 项目的主要工程师。ReCSS 是一个 TypeScript 编写的 CSS 健康度分析工具，采用 pnpm monorepo 结构。

请帮我初始化整个项目脚手架，要求如下：

1. 创建 pnpm workspace 结构，包含三个 package：
   - packages/core（核心分析引擎）
   - packages/cli（CLI 工具）
   - packages/vite-plugin（暂时只建目录，不实现）

2. 根目录配置：
   - pnpm-workspace.yaml
   - package.json（private: true，包含 build/test/lint scripts）
   - tsconfig.base.json（strict 模式，target ES2022，module NodeNext）
   - .gitignore（排除 node_modules, dist, *.log, .recss-cache）
   - eslint.config.mjs（ESLint 9 flat config，typescript-eslint 推荐配置）

3. packages/core 配置：
   - package.json（name: @recss/core，exports 字段配置 ESM + CJS 双输出）
   - tsconfig.json（extends base）
   - src/index.ts（空的导出占位）
   - 安装依赖：postcss postcss-scss css-tree @vue/compiler-sfc @babel/parser @babel/traverse @types/babel__traverse fast-glob node-html-parser specificity zod

4. packages/cli 配置：
   - package.json（name: recss，bin 字段指向 dist/bin.js，同时保留类型导出入口）
   - tsconfig.json
   - src/index.ts（类型入口）
   - src/bin.ts（CLI 入口）
   - 安装依赖：citty @recss/core（workspace 引用）

5. 根目录开发依赖：
   - typescript vitest tsup tsx eslint @types/node

所有 package.json 的 scripts 要统一：
- build: tsup
- dev: tsup --watch
- test: vitest run

完成后输出完整的目录树结构确认。
```

## 第 1 轮：CSS 解析器

```text
现在实现 packages/core/src/parser/css-parser.ts。

这个模块负责解析 CSS/SCSS 文件，提取所有 class 定义信息。

要求：
1) 定义 ClassDefinition 和 CssParseResult 类型；
2) 实现 parseCssFile(filePath)；
3) 实现 parseCssFiles(filePaths) 并合并结果；
4) 处理解析失败、伪类、多选择器、@keyframes/@font-face 跳过逻辑；
5) 编写 vitest 单元测试覆盖普通提取、SCSS 嵌套、伪类、多选择器、keyframes 跳过。
```

## 第 2 轮：Vue SFC 扫描器

```text
实现 packages/core/src/parser/vue-parser.ts。

目标：提取 used/uncertain class。

覆盖：
- class="foo bar"
- :class 对象语法、数组语法、混合语法
- 变量与函数表达式归入 uncertain
- 检测 useCssModule() 并跳过
- 解析失败回退为空结果
- 编写对应单元测试
```

## 第 3 轮：JSX/TSX 扫描器

```text
实现 packages/core/src/parser/jsx-parser.ts，使用 @babel/parser + @babel/traverse。

覆盖：
- className 字符串
- 模板字符串
- clsx/cn/classnames 调用
- 变量/表达式 uncertain
- styles.btn 这类 CSS Modules 写法跳过
- parser plugins 使用 ['typescript','jsx']
- 编写测试
```

## 第 4 轮：HTML 扫描器 + 文件扫描器

```text
实现：
- parseHtmlFile(filePath)
- scanFiles(options)
- parser 聚合 parseAll(scanResult)

要求：
- fast-glob 并行扫描
- 默认忽略 node_modules
- 返回绝对路径
- 合并 used/uncertain 结果
```

## 第 5 轮：分析引擎

```text
实现 analyzer：
- unused.ts：analyzeUnused
- index.ts：analyze(options)

要求：
- 支持 safelist（string + RegExp）
- uncertain class 不误报
- Phase 1 先不实现 specificity 冲突
```

## 第 6 轮：Reporter

```text
实现：
- console reporter（彩色摘要、按文件分组）
- json reporter（结构化输出）
- html reporter 放到 Phase 2 以后
```

## 第 7 轮：CLI

```text
使用 citty 实现 analyze：
- analyze：主命令，Phase 1 先支持 framework/output
- check：Phase 2 再实现
- init：配置加载器落地后再实现
- 入口 runMain(main)
```

## 第 8 轮：配置加载器

```text
实现：
- schema.ts（zod schema）
- loader.ts（loadConfig）

查找顺序：
1) 指定 configPath
2) root 下 recss.config.ts/js/mjs
3) package.json 的 recss 字段
4) 默认配置
```

## 第 9 轮：测试夹具与 E2E

```text
创建 fixtures/vue-project 并添加 E2E 测试，验证：
- 未使用类检测
- 动态类 uncertain 豁免
- Vue 基础项目可被 CLI 正常扫描
```

## 第 10 轮：发布准备

```text
补齐：
- 根 README
- core/cli package 元信息
- 两个 tsup 配置
- GitHub Actions CI
- changeset 配置（@recss/core 与 recss 联动版本）
```

## 第 11 轮（可选）：Vite 插件

```text
实现开发模式插件：
- 仅 dev 激活
- 监听 CSS/SCSS 变化并防抖分析
- 通过 HMR 推送警告消息
- 支持 include/exclude 配置
```
