# LPC MCP Server

Model Context Protocol (MCP) server that wraps the LPC language server, providing LPC code intelligence to AI assistants.

## What This Does

This MCP server connects to the [jlchmura/lpc-language-server](https://github.com/jlchmura/lpc-language-server) and exposes its capabilities as MCP tools that can be used by AI assistants like Claude in Warp.

## Features

- **lpc_hover**: Get documentation/hover information for symbols
- **lpc_definition**: Go to definition of symbols
- **lpc_references**: Find all references to a symbol

## Prerequisites

1. Install the LPC extension in VS Code:
   ```bash
   code --install-extension jlchmura.lpc
   ```

2. Install Node.js dependencies:
   ```bash
   npm install
   ```

## Usage

The server communicates over stdio (standard input/output) following the MCP protocol.

### Testing Locally

```bash
node index.js
```

### Using with Warp/Claude

Add to your MCP configuration (e.g., in Warp settings):

```json
{
  "mcpServers": {
    "lpc": {
      "command": "node",
      "args": ["/projects/git/lpc-mcp/index.js"]
    }
  }
}
```

## Example Tool Calls

### Get Hover Information

```javascript
{
  "name": "lpc_hover",
  "arguments": {
    "file": "/path/to/file.c",
    "line": 10,
    "character": 5
  }
}
```

### Go to Definition

```javascript
{
  "name": "lpc_definition",
  "arguments": {
    "file": "/path/to/file.c",
    "line": 10,
    "character": 5
  }
}
```

### Find References

```javascript
{
  "name": "lpc_references",
  "arguments": {
    "file": "/path/to/file.c",
    "line": 10,
    "character": 5
  }
}
```

## How It Works

1. Spawns the LPC language server as a subprocess
2. Creates a JSON-RPC connection to communicate with the LSP
3. Translates MCP tool calls into LSP requests
4. Returns LSP responses as MCP tool results

## Future Enhancements

- Add more LSP features (completion, diagnostics, etc.)
- Support workspace-aware operations
- Add caching for better performance
- Support multiple concurrent file operations

## License

MIT