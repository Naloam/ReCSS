# MCP 服务器配置

以下配置适用于 Claude Code / Continue / Cline 等支持 MCP 的 AI 编码工具。
配置文件路径：~/.claude/claude_desktop_config.json（桌面端）或工具对应的 settings.json。

## 推荐 MCP 服务器列表

### 必配（核心开发效率）

filesystem MCP - 允许 AI 读写项目文件

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

git MCP - 允许 AI 查看 diff、提交历史，辅助 commit message 生成

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

sequential-thinking MCP - 增强复杂问题的推理能力

```json
{
  "sequential-thinking": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
  }
}
```

### 选配

github MCP

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

memory MCP

```json
{
  "memory": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-memory"]
  }
}
```

## 完整配置示例

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
