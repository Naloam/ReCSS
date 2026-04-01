# ReCSS — 项目完整计划书

> 版本：v1.0 | 状态：规划阶段 | 作者：Naloam

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术架构设计](#2-技术架构设计)
3. [详细功能规格](#3-详细功能规格)
4. [项目目录结构](#4-项目目录结构)
5. [开发路线图与里程碑](#5-开发路线图与里程碑)
6. [完整 AI 提示词手册](#6-完整-ai-提示词手册)
7. [CLAUDE.md 配置文件](#7-claudemd-配置文件)
8. [MCP 服务器配置](#8-mcp-服务器配置)
9. [VSCode 环境配置](#9-vscode-环境配置)

---

## 1. 项目概述

### 1.1 项目背景

大型前端项目经过持续迭代后，CSS/SCSS 文件普遍面临以下问题：

- **样式臃肿**：平均 60% 的 CSS 选择器从未被真正使用（学术案例研究数据）
- **优先级混乱**：`!important` 滥用、选择器层级过深导致样式相互覆盖
- **缺乏模块化**：全局样式污染、命名空间冲突、BEM 执行不一致
- **现有工具不足**：PurgeCSS 等工具面向产物裁剪，不面向源码分析与重构

### 1.2 项目定位

**ReCSS** 是一个面向开发者的 CSS 健康度分析工具，核心定位：

```
静态分析 → 精准报告 → 安全演进
```

**不做什么（Scope Exclusion）：**
- 不替代 PurgeCSS（不做生产环境裁剪）
- 不处理 CSS-in-JS（styled-components / emotion）
- 不做样式的自动美化格式化（那是 Prettier 的职责）
- 不支持 Less（初版）
- 不在 MVP 中引入大规模自动迁移

### 1.3 目标用户

- 接手历史遗留项目的前端工程师
- 需要做技术债治理的团队 Tech Lead
- 想先做一轮样式债务盘点，再决定是否继续重构的团队

### 1.4 项目名称确认

推荐保留 `recss`，作为 npm 包名。GitHub 仓库名建议用 `recss`，CLI 命令为 `recss`。

---

## 2. 技术架构设计

### 2.1 整体架构图

```
┌──────────────────────────────────────────────────────┐
│                    ReCSS Core                        │
│                                                      │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────┐ │
│  │ File Scanner │──▶│ AST Parsers  │──▶│ Analyzer  │ │
│  │ (fast-glob)  │   │ CSS / Vue    │   │ Engine    │ │
│  └──────────────┘   └──────────────┘   └─────┬─────┘ │
│                                              │       │
│  ┌───────────────────────────────────────────▼─────┐ │
│  │                 Reporter                       │ │
│  │              Console │ JSON                    │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
                        │
                    ┌───▼───┐
                    │  CLI  │
                    │citty  │
                    └───────┘

后续可选扩展：Vite 插件、优先级冲突检测、HTML 报告、迁移助手
```

### 2.2 技术选型详表

| 层级 | 用途 | 选型 | 理由 |
|------|------|------|------|
| CSS 解析 | AST 解析与转换 | `postcss` + `postcss-scss` | 生态最成熟，插件丰富，支持转换 |
| CSS 选择器解析 | 精细化 selector 分析 | `css-tree` | 专为 selector 分析优化 |
| Vue SFC 扫描 | 解析 Vue 单文件组件 | `@vue/compiler-sfc` | 官方工具，最准确 |
| 文件遍历 | 扫描项目文件树 | `fast-glob` | 性能最好 |
| CLI 框架 | 命令行界面 | `citty` | 更现代，TypeScript 原生 |
| 报告渲染 | 报告输出 | Console / JSON | 先把核心链路做小做稳 |
| 构建工具 | 打包 | `tsup` | 基于 esbuild，速度快，配置简单 |
| 包管理 | Monorepo | `pnpm workspaces` | 你日常使用的工具 |
| 测试 | 单元测试 | `vitest` | 你熟悉的工具 |

延后到后续阶段：
- `@babel/parser` + `@babel/traverse`（React / JSX）
- `node-html-parser`（HTML 扫描）
- `specificity`（优先级冲突）
- HTML 报告 / Vite 插件 / VSCode 插件

### 2.3 数据流设计

```
Step 1: Scan
  fast-glob → 收集所有 .css/.scss/.vue 文件路径

Step 2: Parse CSS
  PostCSS + postcss-scss → CSS AST
  遍历所有 Rule 节点 → 提取 selector
  css-tree 解析 selector → 提取 class names
  输出: Map<className, ClassDefinition[]>
    ClassDefinition = { file, line, col, selector }

Step 3: Parse Source Files
  @vue/compiler-sfc → Vue template AST → 提取 :class / class
  输出: Set<string>（已使用类名）+ Set<string>（动态/不确定类名）

Step 4: Analyze
  未使用类名 = CSS 类名集合 - 已使用集合 - safelist - 动态类名
  输出: AnalysisResult

Step 5: Report
  AnalysisResult → JSON / Console
```

---

## 3. 详细功能规格

### 3.1 Feature 1：未使用类名检测（核心功能）

**输入：** 项目根目录路径  
**输出：** 按文件分组的未使用类名列表，附行号

**边界处理：**

| 场景 | 处理策略 |
|------|---------|
| `clsx('btn', { active: isActive })` | 静态部分（`btn`）纳入已使用，动态 key（`active`）标记为"不确定" |
| `:class="{ 'is-active': flag }"` | 字符串字面量纳入已使用 |
| `:class="dynamicClass"` | 变量引用，整个文件的相关样式标记为"不确定"，跳过 |
| `className={styles.btn}` | CSS Modules 写法，识别并跳过（不在分析范围） |
| `node_modules/` 内的 CSS | 自动忽略 |
| `@keyframes`, `@font-face` | 不做未使用检测 |
| CSS 变量 `--color-primary` | 不做未使用检测（初版） |

**Safelist 配置：**
```json
{
  "safelist": [/^js-/, /^is-/, "active", "disabled"]
}
```

### 3.2 Feature 2：优先级冲突检测

该功能延后到 Phase 2。前提是未使用类名检测链路稳定、误报率可控，再增加 specificity 分析。

### 3.3 Feature 3：CSS Modules 迁移助手（Future Backlog）

**迁移范围：** 单个组件目录（不做全局批量迁移，太激进）

**迁移步骤：**
1. 读取组件对应的 `.scss` 文件
2. 拍平 BEM 嵌套（`&__element` → `.element`）
3. 生成 `Component.module.scss`
4. 更新组件文件中的 `class="btn"` → `:class="$style.btn"`（Vue）或 `className={styles.btn}`（React）
5. 生成 diff 预览，不自动写入（安全第一）

### 3.4 CLI 命令设计

```bash
# 当前 MVP：分析未使用类名
recss analyze [dir] [options]
  --framework auto|vue|react|html  # 当前优先实现 vue
  --output json|console            # 当前支持 console / json

# 后续命令（暂不进入 MVP）
recss check [dir]
recss migrate <component-dir>
recss init
```

### 3.5 配置文件规格（`recss.config.ts`）

> 说明：`defineConfig()` 类型入口已保留，配置文件加载器放到 Phase 2 再实现。

```typescript
import { defineConfig } from 'recss'

export default defineConfig({
  // 项目根目录（默认 process.cwd()）
  root: '.',

  // CSS/SCSS 文件匹配规则
  css: {
    include: ['src/**/*.{css,scss}'],
    exclude: ['src/**/*.module.{css,scss}'],
  },

  // 源文件匹配规则
  sources: {
    include: ['src/**/*.{vue,tsx,jsx,html}'],
    exclude: ['src/**/*.test.*', 'src/**/*.spec.*'],
  },

  // 框架（auto | vue | react | html）
  framework: 'auto',

  // 白名单：这些 class 永远不报告为未使用
  safelist: [
    /^js-/,    // JS hook classes
    /^is-/,    // state classes
    'active',
    'disabled',
  ],

  // 报告配置
  report: {
    format: 'console',  // console | json
    outfile: './recss-report.json',
    // 忽略低于此数量未使用 class 的文件
    minUnusedThreshold: 0,
  },
})
```

---

## 4. 项目目录结构

```
recss/
├── packages/
│   ├── core/                          # 核心分析引擎
│   │   ├── src/
│   │   │   ├── config.ts              # defineConfig 类型入口
│   │   │   ├── scanner/
│   │   │   │   ├── index.ts           # 文件扫描器入口
│   │   │   │   ├── css-scanner.ts     # CSS/SCSS 文件扫描
│   │   │   │   └── source-scanner.ts  # Vue 扫描（后续再扩展）
│   │   │   ├── parser/
│   │   │   │   ├── css-parser.ts      # PostCSS AST → ClassDefinition[]
│   │   │   │   ├── vue-parser.ts      # @vue/compiler-sfc → Set<string>
│   │   │   ├── analyzer/
│   │   │   │   ├── unused.ts          # 未使用类名分析
│   │   │   │   └── index.ts           # Analyzer 主入口
│   │   │   ├── reporter/
│   │   │   │   ├── console.ts         # 终端彩色输出
│   │   │   │   ├── json.ts            # JSON 报告
│   │   │   ├── schema/
│   │   │   │   └── config.ts          # Zod schema（Phase 2 接 loader）
│   │   │   ├── types.ts               # 包级共享类型
│   │   │   └── index.ts               # 公共 API 导出
│   │   ├── tests/
│   │   │   ├── fixtures/              # 测试用的 demo 项目文件
│   │   │   └── config/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── cli/                           # CLI 包
│   │   ├── src/
│   │   │   ├── bin.ts                 # CLI 入口
│   │   │   ├── commands/
│   │   │   │   ├── analyze.ts
│   │   │   └── index.ts               # 类型与辅助导出
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── vite-plugin/                   # Future placeholder
│       ├── src/
│       │   └── index.ts
│       └── package.json
│
├── examples/                          # 测试用 demo 项目
│   ├── vue-demo/                      # Vue 3 项目示例
│   └── react-demo/                    # React 项目示例
│
├── docs/                              # 文档
│   └── README.md
│
├── CLAUDE.md                          # AI 编码助手配置（见第7节）
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

---

## 5. 开发路线图与里程碑

### Phase 1 — MVP（目标：2-3 周）

**目标：** 一个能跑起来的 CLI，支持 Vue 项目的未使用类名检测

| 任务 | 优先级 | 预估 |
|------|--------|------|
| Monorepo 脚手架搭建 | P0 | 0.5 天 |
| `defineConfig()` 类型入口 | P0 | 0.25 天 |
| CSS/SCSS 解析器（PostCSS） | P0 | 1 天 |
| Vue SFC 扫描器 | P0 | 1 天 |
| 差异分析器（核心算法） | P0 | 1 天 |
| Console / JSON 报告输出 | P0 | 0.5 天 |
| CLI 基础命令（analyze） | P0 | 0.5 天 |
| Safelist 支持 | P1 | 0.5 天 |
| 基础单元测试（fixtures） | P1 | 1 天 |

**Phase 1 验收标准：**
```bash
npx recss analyze ./src --framework vue
# 输出：在 12 个文件中发现 47 个未使用的 CSS 类名
# 耗时：1.2s
```

### Phase 2 — 完整功能（目标：再 2 周）

| 任务 | 优先级 | 预估 |
|------|--------|------|
| JSX/TSX 扫描器 | P0 | 1 天 |
| 优先级冲突检测 | P0 | 1.5 天 |
| HTML 报告生成 | P1 | 1 天 |
| `recss.config.ts` 配置文件支持 | P1 | 0.5 天 |
| `recss check` 命令 | P1 | 0.5 天 |
| `recss init` 命令 | P2 | 0.5 天 |

### Phase 3 — 生态扩展（目标：视情况）

| 任务 | 说明 |
|------|------|
| CSS Modules 迁移助手 | `recss migrate` 命令 |
| Vite 插件 | 集成到开发服务器，实时警告 |
| VSCode 插件 | 内联高亮未使用 class |

---

## 6. 完整 AI 提示词手册

> 以下提示词专为 Claude Code（claude.ai/code 或 VSCode 中的 Continue/Cline）设计。
> 使用时请在每轮开始前确认当前所在目录，并按顺序执行。

---

### 🟦 第 0 轮：项目初始化

```
你现在是 ReCSS 项目的主要工程师。ReCSS 是一个 TypeScript 编写的 CSS 健康度分析工具，
采用 pnpm monorepo 结构。

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
   - 安装依赖：postcss postcss-scss css-tree @vue/compiler-sfc @babel/parser 
     @babel/traverse @types/babel__traverse fast-glob node-html-parser specificity zod

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

---

### 🟦 第 1 轮：CSS 解析器

```
现在实现 packages/core/src/parser/css-parser.ts。

这个模块负责解析 CSS/SCSS 文件，提取所有 class 定义信息。

要求：

1. 定义并导出以下 TypeScript 类型（放在 src/types.ts 中）：

interface ClassDefinition {
  name: string           // 类名（不含 .）
  selector: string       // 原始选择器字符串
  file: string           // 绝对路径
  line: number           // 行号
  column: number         // 列号
  specificity: [number, number, number]  // [id, class, element]
  properties: string[]   // 该规则包含的 CSS 属性名列表
}

type CssParseResult = Map<string, ClassDefinition[]>
// key 是类名，value 是所有定义该类名的规则数组（可能在多个文件/位置）

2. 实现 parseCssFile(filePath: string): Promise<CssParseResult>
   - 使用 postcss + postcss-scss 解析文件
   - 遍历所有 Rule 节点
   - 用正则从 selector 中提取所有 class 名称（格式：\.[\w-]+）
   - 使用 specificity 库计算权重
   - 正确处理嵌套 SCSS（&__element 需要解析为父级 + 子级的组合）
   - 跳过 @keyframes、@font-face 内部的 rule

3. 实现 parseCssFiles(filePaths: string[]): Promise<CssParseResult>
   - 并行处理多个文件（Promise.all）
   - 合并所有结果到一个 Map

4. 边界情况处理：
   - 文件解析失败时 → console.warn + 返回空结果（不 throw）
   - 选择器包含伪类（:hover, ::before）→ 正确提取基础类名
   - 多个选择器（.a, .b { }）→ 分别记录

5. 为该模块编写 vitest 单元测试（tests/parser/css-parser.test.ts），
   测试数据使用 inline 字符串，覆盖：
   - 普通 class 提取
   - SCSS 嵌套
   - 伪类处理
   - 多选择器
   - @keyframes 内部不提取
```

---

### 🟦 第 2 轮：Vue SFC 扫描器

```
现在实现 packages/core/src/parser/vue-parser.ts。

这个模块负责扫描 Vue 3 SFC 文件，提取所有被引用的 class 名称。

要求：

1. 定义并导出类型（追加到 src/types.ts）：

interface SourceScanResult {
  used: Set<string>        // 确定被使用的 class 名
  uncertain: Set<string>   // 可能被使用但无法静态确定的 class 名
  // 注意：uncertain 中的类名在未使用分析中会被"豁免"（不报告为未使用）
}

2. 实现 parseVueFile(filePath: string): Promise<SourceScanResult>

   使用 @vue/compiler-sfc 的 parse() 方法，分别处理：

   a) <template> 部分：
      - 使用 compileTemplate() 解析模板 AST
      - 遍历所有元素节点的 class 和 :class 属性
      - class="foo bar" → 提取 foo、bar 到 used
      - :class="{ active: flag }" → 提取 key 字符串 active 到 used
      - :class="['foo', condition ? 'bar' : 'baz']" → 提取字符串字面量到 used
      - :class="someVariable" → 提取到 uncertain（纯变量引用）
      - :class="getClass()" → 提取到 uncertain（函数调用）

   b) <script setup> 部分：
      - 扫描 useCssModule() 调用 → 如果存在，标记该文件使用 CSS Modules，跳过
      - 扫描字符串字面量中看起来像 class 名的值（次要，非必须精确）

3. 错误处理：
   - 解析失败 → console.warn + 返回 { used: new Set(), uncertain: new Set() }

4. 编写单元测试，fixtures 为内联 Vue SFC 字符串，覆盖：
   - 静态 class
   - 对象语法 :class
   - 数组语法 :class
   - 混合语法 :class="['static', { dynamic: flag }]"
   - 纯变量 :class 的处理（进入 uncertain）
```

---

### 🟦 第 3 轮：JSX/TSX 扫描器

```
现在实现 packages/core/src/parser/jsx-parser.ts。

这个模块负责扫描 React JSX/TSX 文件，提取所有被引用的 class 名称。

技术栈：@babel/parser + @babel/traverse

要求：

1. 实现 parseJsxFile(filePath: string): Promise<SourceScanResult>

   解析规则（className 属性的各种写法）：

   a) 字符串字面量：
      className="foo bar" → 提取 foo, bar 到 used
   
   b) 模板字符串：
      className={`btn ${active ? 'active' : ''}`}
      → 提取静态部分 btn → used
      → 提取条件分支 active → used（字符串字面量还是能静态提取）
   
   c) clsx / cn / classnames 调用：
      className={clsx('btn', { active: isActive }, condition && 'extra')}
      → 检测到这些函数调用时，特殊处理：
        - 字符串参数 → used
        - 对象 key（字符串）→ used
        - 条件表达式的字符串分支 → used
   
   d) 纯变量/表达式：
      className={styles.btn}   → 跳过（CSS Modules）
      className={getClass()}   → uncertain
      className={dynamicClass} → uncertain

2. 检测 clsx/cn/classnames 的方法：
   - 扫描 import 语句，如果有 import clsx from 'clsx' 等，记录函数名
   - 遍历调用表达式时检查 callee 是否在记录的函数名列表中

3. @babel/parser 配置：
   - plugins: ['typescript', 'jsx']
   - 同时支持 .jsx 和 .tsx 文件

4. 编写单元测试，覆盖上述所有场景
```

---

### 🟦 第 4 轮：HTML 扫描器 + 文件扫描器

```
现在实现两个相对简单的模块：

【模块 1】packages/core/src/parser/html-parser.ts

使用 node-html-parser 实现 parseHtmlFile(filePath: string): Promise<SourceScanResult>
- 提取所有元素的 class 属性值
- 按空格分割，全部加入 used
- 没有动态 class 的概念，无 uncertain

【模块 2】packages/core/src/scanner/index.ts

实现文件扫描器，对外暴露：

interface ScanOptions {
  root: string
  cssInclude: string[]
  cssExclude: string[]
  sourceInclude: string[]
  sourceExclude: string[]
}

interface ScanResult {
  cssFiles: string[]
  vueFiles: string[]
  jsxFiles: string[]
  htmlFiles: string[]
}

async function scanFiles(options: ScanOptions): Promise<ScanResult>

- 使用 fast-glob 并行扫描四类文件
- 自动排除 node_modules（在 exclude 中默认加上 **/node_modules/**）
- 返回绝对路径数组

【模块 3】packages/core/src/parser/index.ts

聚合入口，实现：

async function parseAll(scanResult: ScanResult): Promise<{
  cssResult: CssParseResult
  usedClasses: Set<string>
  uncertainClasses: Set<string>
}>

- 并行执行 CSS 解析和源文件解析
- 合并所有 Vue/JSX/HTML 的 SourceScanResult
```

---

### 🟦 第 5 轮：分析引擎

```
现在是核心算法部分。实现 packages/core/src/analyzer/。

【模块 1】packages/core/src/analyzer/unused.ts

实现未使用类名分析：

interface UnusedClass {
  name: string
  definitions: ClassDefinition[]  // 该类名的所有定义位置
}

interface UnusedAnalysisResult {
  unused: UnusedClass[]
  skipped: string[]  // 因为 safelist 或 uncertain 被跳过的类名
  stats: {
    totalCssClasses: number
    usedClasses: number
    unusedClasses: number
    uncertainClasses: number
    safelistedClasses: number
  }
}

function analyzeUnused(
  cssResult: CssParseResult,
  usedClasses: Set<string>,
  uncertainClasses: Set<string>,
  safelist: (string | RegExp)[]
): UnusedAnalysisResult

逻辑：
1. 遍历 cssResult 中每一个类名
2. 如果在 usedClasses 中 → 跳过
3. 如果匹配 safelist 中任意规则（字符串完全匹配 or RegExp.test）→ 加入 skipped
4. 如果在 uncertainClasses 中 → 加入 skipped
5. 否则 → 加入 unused

【模块 2】packages/core/src/analyzer/specificity.ts

实现优先级冲突检测：

interface SpecificityConflict {
  className: string
  property: string
  definitions: Array<{
    value: string
    specificity: [number, number, number]
    file: string
    line: number
    isImportant: boolean
  }>
}

interface SpecificityAnalysisResult {
  conflicts: SpecificityConflict[]
  importantUsage: ClassDefinition[]  // 所有用了 !important 的规则
  stats: {
    totalConflicts: number
    importantCount: number
  }
}

function analyzeSpecificity(cssResult: CssParseResult): SpecificityAnalysisResult

逻辑：
1. 对每个类名，如果它有多个定义（definitions.length > 1）
2. 收集所有定义中的 CSS properties
3. 如果同一个 property 出现在多个 specificity 不同的定义里 → 记录冲突
4. 按 specificity 降序排序，最高的是"winner"

【模块 3】packages/core/src/analyzer/index.ts

主入口：

async function analyze(options: ResolvedConfig): Promise<AnalysisResult>

整合扫描 → 解析 → 分析的完整流程，返回最终的 AnalysisResult 类型。
```

---

### 🟦 第 6 轮：Reporter（报告输出）

```
现在实现三种报告输出格式。

【模块 1】packages/core/src/reporter/console.ts

实现终端彩色报告输出。

要求：
- 使用 Node.js 内置的 util.styleText（Node 20+）或手写 ANSI 转义码，
  不引入 chalk 等第三方依赖
- 输出格式参考：

  ╔══════════════════════════════════╗
  ║  ReCSS Analysis Report           ║
  ╚══════════════════════════════════╝

  📊 Summary
  ─────────────────────────
  Total CSS classes:    120
  Used:                  73
  Unused:                47  ← 红色
  Uncertain (skipped):    8  ← 黄色
  Safelisted (skipped):   5

  🗑  Unused Classes (按文件分组)
  ─────────────────────────
  src/styles/card.scss
    Line 12 │ .card-header     (selector: .card .card-header)
    Line 28 │ .card-footer
  
  src/styles/button.scss
    Line 5  │ .btn-ghost

  ⚠  Specificity Conflicts
  ─────────────────────────
  .active → property: color
    [0,1,0] src/styles/base.scss:10   color: red
    [0,2,0] src/styles/theme.scss:45  color: blue  ← WINS

- 文件路径显示为相对路径（相对于 root）

【模块 2】packages/core/src/reporter/json.ts

输出完整的 AnalysisResult 为格式化 JSON，无特殊逻辑。

【模块 3】packages/core/src/reporter/html.ts

生成一个完整的 HTML 报告文件（单文件，所有样式内联）。

要求：
- 简洁现代的设计风格，dark mode 友好
- 包含汇总数字卡片（大字体显示 unused 数量）
- 文件树形式展示未使用类名（可折叠）
- 冲突列表，标出 winner 规则
- 零外部依赖（不引用 CDN，纯 HTML+CSS+内联 JS）
- 文件大小控制在 50KB 以内
```

---

### 🟦 第 7 轮：CLI 实现

```
现在实现 packages/cli/src/。

使用 citty 框架实现以下命令：

【命令 1】analyze（主命令）

src/commands/analyze.ts

import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'analyze', description: 'Detect unused CSS classes' },
  args: {
    dir: { type: 'positional', description: 'Project root', default: '.' },
    framework: { type: 'string', description: 'vue | react | html | auto', default: 'auto' },
    output: { type: 'string', description: 'console | json | html', default: 'console' },
    outfile: { type: 'string', description: 'Output file path' },
    safelist: { type: 'string', description: 'Comma-separated class patterns' },
    config: { type: 'string', description: 'Config file path' },
  },
  async run({ args }) {
    // 1. 加载配置（args 优先于 config 文件）
    // 2. 调用 @recss/core 的 analyze()
    // 3. 调用对应的 reporter
    // 4. 如果有 unused classes，process.exit(1)（方便 CI 使用）
  }
})

【命令 2】check

src/commands/check.ts

专注于 specificity 检测，args 包含 --threshold（默认 0，超过才报错退出）

【命令 3】init

src/commands/init.ts

在当前目录生成 recss.config.ts 模板文件，内容为注释完整的配置示例。
如果文件已存在，询问是否覆盖（使用 Node.js readline）。

【入口文件】

src/index.ts

import { defineCommand, runMain } from 'citty'
import analyze from './commands/analyze'
import check from './commands/check'
import init from './commands/init'

const main = defineCommand({
  meta: { name: 'recss', version: '0.1.0', description: 'CSS health analyzer' },
  subCommands: { analyze, check, init },
})

runMain(main)

【构建配置】

packages/cli/tsup.config.ts：
- entry: ['src/index.ts']
- format: ['esm']
- target: 'node18'
- banner: { js: '#!/usr/bin/env node' }（添加 shebang）
- sourcemap: true
```

---

### 🟦 第 8 轮：配置加载器

```
实现 packages/core/src/config/。

【模块 1】src/config/schema.ts

使用 Zod 定义配置 schema：

const ConfigSchema = z.object({
  root: z.string().default('.'),
  css: z.object({
    include: z.array(z.string()).default(['**/*.{css,scss}']),
    exclude: z.array(z.string()).default([]),
  }).default({}),
  sources: z.object({
    include: z.array(z.string()).default(['**/*.{vue,tsx,jsx,html}']),
    exclude: z.array(z.string()).default([]),
  }).default({}),
  framework: z.enum(['auto', 'vue', 'react', 'html']).default('auto'),
  safelist: z.array(
    z.union([z.string(), z.instanceof(RegExp)])
  ).default([]),
  report: z.object({
    format: z.enum(['console', 'json', 'html']).default('console'),
    outfile: z.string().optional(),
    minUnusedThreshold: z.number().default(0),
  }).default({}),
})

export type RecssCoreConfig = z.infer<typeof ConfigSchema>

【模块 2】src/config/loader.ts

实现 loadConfig(root: string, configPath?: string): Promise<RecssCoreConfig>

查找顺序：
1. 如果传入了 configPath，直接加载
2. 否则在 root 目录下查找：
   - recss.config.ts
   - recss.config.js
   - recss.config.mjs
   - package.json 中的 "recss" 字段
3. 如果都没找到，返回默认配置

加载 TypeScript 配置文件：使用 jiti 库（支持直接 require TS 文件）
如果不想引入 jiti，可以用 tsx --eval 的方式

配置合并优先级：默认值 < 配置文件 < CLI args（CLI 层面合并）
```

---

### 🟦 第 9 轮：测试夹具与端到端测试

```
现在创建测试夹具（fixtures），为项目建立可靠的测试基础。

在 packages/core/tests/fixtures/ 下创建以下测试项目结构：

【fixtures/vue-project/】 模拟一个有样式问题的 Vue 项目

创建以下文件：

src/styles/card.scss：
- 定义 .card, .card-header, .card-body, .card-footer, .card-title
- 其中 .card-ghost 和 .card-overlay 是未使用的

src/styles/button.scss：
- 定义 .btn, .btn-primary, .btn-secondary, .btn-ghost, .btn-disabled
- .btn-ghost 未使用
- .btn-primary 与 .btn-secondary 被组件实际使用

src/components/Card.vue：
- 使用 .card, .card-header, .card-body, .card-title
- 有一个 :class="{ active: isActive }" 使用了 active（在 safelist 中）
- 有一个 :class="dynamicClass" 变量引用

src/components/Button.vue：
- 使用 .btn, .btn-primary, .btn-secondary, .btn-disabled

【端到端测试】

tests/e2e/vue-project.test.ts：

import { analyze } from '../../src/index'

describe('Vue project analysis', () => {
  test('detects unused classes correctly', async () => {
    const result = await analyze({ root: './tests/fixtures/vue-project', ... })
    expect(result.unused.unused.map(u => u.name)).toContain('card-ghost')
    expect(result.unused.unused.map(u => u.name)).toContain('btn-ghost')
    expect(result.unused.unused.map(u => u.name)).not.toContain('btn-primary')
  })

  test('dynamic class goes to uncertain, not unused', async () => {
    // dynamicClass 引用的文件中，其他类名不应该被误报
  })

  test('detects specificity conflict on btn-primary', async () => {
    const conflict = result.specificity.conflicts.find(
      c => c.className === 'btn-primary'
    )
    expect(conflict).toBeDefined()
  })
})
```

---

### 🟦 第 10 轮：发布准备

```
帮我完成项目的发布前准备工作：

1. README.md（项目根目录）
   内容包括：
   - 项目介绍（一句话 + 核心卖点）
   - 安装方式（npx 和全局安装）
   - 快速开始（3步搞定）
   - 所有 CLI 命令的完整说明和参数表格
   - 配置文件完整示例
   - 和 PurgeCSS 的对比表格（定位差异化）
   - Contributing 指南
   风格：简洁、技术感强，面向英文读者

2. packages/core/package.json 补充：
   - 完整的 exports 字段（ESM + CJS）
   - peerDependencies（不需要）
   - files 字段（只发布 dist/ 和 README.md）
   - keywords: ["css", "scss", "unused", "linter", "refactor", "css-modules"]

3. packages/cli/package.json 补充：
   - bin 字段：{ "recss": "./dist/bin.js" }
   - engines: { "node": ">=18.0.0" }

4. tsup 构建配置（两个 package 各自的 tsup.config.ts）：
   - core: 输出 ESM + CJS，生成 .d.ts 类型文件
   - cli: library 入口输出 ESM + .d.ts，bin 入口输出带 shebang 的 ESM

5. GitHub Actions CI 配置（.github/workflows/ci.yml）：
   - 触发：push 到 main，PR
   - 步骤：setup pnpm → install → build → test
   - Node.js 版本：18.x 和 20.x

6. changeset 配置（用于版本管理和发布）：
   .changeset/config.json：
   - linked packages：@recss/core 和 recss 联动版本
```

---

### 🟦 第 11 轮（可选）：Vite 插件

```
现在实现 packages/vite-plugin/src/index.ts。

这是一个轻量的 Vite 插件，在开发模式下提供实时警告。

功能要求：
1. 仅在 development 模式下激活（build 时跳过）
2. 监听 CSS/SCSS 文件变化，触发重新分析（防抖 500ms）
3. 将分析结果注入到 HMR 消息中，在浏览器控制台显示警告
4. 提供 include/exclude 配置，默认只扫描 src/

插件 API：
import recss from '@recss/vite-plugin'

export default defineConfig({
  plugins: [
    recss({
      warnOnUnused: true,
      safelist: [/^js-/],
    })
  ]
})

实现方式：
- 使用 Vite 的 configureServer hook 拿到 dev server
- 使用 fs.watch 或 vite 的 server.watcher 监听文件
- 分析完成后通过 server.ws.send 推送消息
- 客户端通过 import.meta.hot.on 接收并 console.warn
```

---

## 7. CLAUDE.md 配置文件

> 将此文件放在项目根目录。Claude Code 会自动读取它作为上下文。

```markdown
# ReCSS Project — Claude Code Instructions

## Project Overview

ReCSS is a TypeScript CSS health analyzer. It statically analyzes projects to find unused CSS classes and specificity conflicts.

**Monorepo structure:**
- `packages/core` — Analysis engine (pure TypeScript, no side effects)
- `packages/cli` — CLI tool using citty
- `packages/vite-plugin` — Vite integration (Phase 2)

## Tech Stack

| Purpose | Library |
|---------|---------|
| CSS/SCSS parsing | postcss + postcss-scss |
| CSS selector analysis | css-tree |
| Vue SFC parsing | @vue/compiler-sfc |
| JSX/TSX parsing | @babel/parser + @babel/traverse |
| HTML parsing | node-html-parser |
| Specificity | specificity |
| File scanning | fast-glob |
| CLI | citty |
| Config validation | zod |
| Build | tsup |
| Test | vitest |
| Package manager | pnpm |

## Code Conventions

### TypeScript
- Strict mode enabled. No `any` unless absolutely necessary — use `unknown` + type guard.
- Prefer `type` over `interface` for pure data shapes; `interface` for extendable contracts.
- All public functions must have explicit return type annotations.
- Use `async/await` over `.then()` chains.

### Error Handling
- **Parsing errors should NEVER crash the process.** Catch, `console.warn`, and return an empty result.
- Use `Result<T, E>` pattern or `try/catch` — no uncaught promises.

### File/Module Organization
- Each module has a single responsibility.
- `index.ts` files only re-export, they contain no logic.
- Types live in `src/types.ts` at the package level.

### Testing
- Test files live in `tests/` mirroring the `src/` structure.
- Use inline string fixtures for parser tests (no file I/O in unit tests).
- E2E tests use the fixture project in `tests/fixtures/`.
- Test names follow: "should [do X] when [condition Y]"

### Performance
- Always use `Promise.all` for parallel file processing.
- Avoid synchronous file reads in hot paths.

## Key Design Decisions

1. **Conservative approach to dynamic classes**: When a class cannot be statically determined, it goes into `uncertainClasses` and is NEVER reported as unused. False positives are worse than false negatives.

2. **CSS Modules are out of scope**: If a file uses `useCssModule()` or `import styles from '*.module.css'`, skip it silently.

3. **No auto-fix for unused classes**: We report, we don't delete. Deletion requires human judgment.

4. **Safelist regex support**: Safelist entries can be strings (exact match) or RegExp.

## Common Patterns

### Adding a new file type parser
1. Create `src/parser/xxx-parser.ts`
2. Implement `parseXxxFile(filePath: string): Promise<SourceScanResult>`
3. Add it to `src/parser/index.ts`'s `parseAll()` function
4. Add the file extension to `src/scanner/index.ts`'s default include patterns

### Adding a new analysis module
1. Create `src/analyzer/xxx.ts`
2. Define input/output types in `src/types.ts`
3. Export from `src/analyzer/index.ts`

## Do NOT

- Do not install `chalk`, `ora`, or `inquirer` — keep deps minimal.
  Use Node.js built-ins for terminal output (ANSI codes, readline).
- Do not use `fs.readFileSync` in parsers — use `fs.promises.readFile`.
- Do not mutate function parameters — return new objects.
- Do not use `console.log` in library code (`packages/core`) — use the reporter system.
  `console.warn` is OK for non-fatal parse errors.
- Do not `process.exit()` in `packages/core` — only in `packages/cli`.
```

---

## 8. MCP 服务器配置

> 以下配置适用于 Claude Code / Continue / Cline 等支持 MCP 的 AI 编码工具。
> 配置文件路径：`~/.claude/claude_desktop_config.json`（桌面端）或工具对应的 settings.json。

### 8.1 推荐 MCP 服务器列表

#### 必配（核心开发效率）

**filesystem MCP** — 允许 AI 读写项目文件

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/your/recss"
      ]
    }
  }
}
```

> 将 `/path/to/your/recss` 替换为项目的实际绝对路径。
> 建议范围限定在项目目录，不要给整个系统权限。

**git MCP** — 允许 AI 查看 diff、提交历史，辅助 commit message 生成

```json
{
  "git": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-git"],
    "env": {
      "GIT_REPO_PATH": "/path/to/your/recss"
    }
  }
}
```

**sequential-thinking MCP** — 增强复杂问题的推理能力（强烈推荐用于算法设计轮次）

```json
{
  "sequential-thinking": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
  }
}
```

#### 选配（视工作流需要）

**github MCP** — 如果你的仓库在 GitHub，可以让 AI 直接操作 Issues 和 PR

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "your_token_here"
    }
  }
}
```

**memory MCP** — 跨对话保持项目背景（当一个功能需要多次对话时很有用）

```json
{
  "memory": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-memory"]
  }
}
```

### 8.2 完整配置文件示例

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/yourname/projects/recss"
      ]
    },
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git"],
      "env": {
        "GIT_REPO_PATH": "/Users/yourname/projects/recss"
      }
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
```

### 8.3 MCP 使用场景建议

| 开发阶段 | 推荐 MCP | 原因 |
|---------|---------|------|
| 算法设计（第 5 轮） | sequential-thinking | 分析引擎逻辑复杂，需要多步推理 |
| 写代码（所有轮次） | filesystem | AI 直接读写文件，减少粘贴复制 |
| 写完代码后 | git | AI 自动生成 Conventional Commit message |
| 调试测试 | filesystem + git | 查看失败 diff，定位问题 |
| 发布准备（第 10 轮） | github | 自动创建 Release Notes |

---

## 9. VSCode 环境配置

### 9.1 推荐插件

```json
// .vscode/extensions.json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "Vue.volar",
    "vitest.explorer",
    "antfu.goto-alias",
    "usernamehw.errorlens"
  ]
}
```

### 9.2 工作区设置

```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "eslint.useFlatConfig": true,
  "typescript.tsdk": "node_modules/typescript/lib",
  "vitest.enable": true,
  "vitest.commandLine": "pnpm test"
}
```

### 9.3 调试配置

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug CLI: analyze",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["exec", "tsx"],
      "program": "${workspaceFolder}/packages/cli/src/bin.ts",
      "args": ["analyze", "./examples/vue-demo", "--output", "console"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "name": "Debug: Current Test File",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["exec", "vitest", "run", "${relativeFile}"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal"
    }
  ]
}
```

---

## 附录：快速参考

### 每轮提示词使用顺序

```
Round 0  →  项目初始化（monorepo 脚手架）
Round 1  →  CSS 解析器（PostCSS AST）
Round 2  →  Vue SFC 扫描器
Round 3  →  JSX/TSX 扫描器
Round 4  →  HTML 扫描器 + 文件扫描器
Round 5  →  分析引擎（核心算法）★ 最复杂，建议开 sequential-thinking MCP
Round 6  →  Reporter（三种输出格式）
Round 7  →  CLI 实现
Round 8  →  配置加载器
Round 9  →  测试夹具 + E2E 测试
Round 10 →  发布准备
Round 11 →  Vite 插件（可选）
```

### 关键 npm 命令

```bash
# 安装所有依赖
pnpm install

# 构建所有包
pnpm -r build

# 运行所有测试
pnpm -r test

# 本地测试 CLI
node packages/cli/dist/bin.js analyze ./examples/vue-demo

# 发布前检查
pnpm -r build && pnpm -r test
```

### 常用 Git 约定

本项目使用 Conventional Commits：
- `feat(core): add vue parser` — 新功能
- `fix(cli): handle missing config gracefully` — 修复
- `test(core): add specificity conflict fixtures` — 测试
- `chore: update dependencies` — 维护
- `docs: update README CLI section` — 文档
```
