# VSCode 环境配置

## 推荐插件

```json
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

## 工作区设置

```json
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

## 调试配置

```json
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
