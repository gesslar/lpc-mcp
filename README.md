# LPC MCP Server

**Bring LPC development into 2025** with AI-powered code intelligence.

This MCP (Model Context Protocol) server wraps the [jlchmura/lpc-language-server](https://github.com/jlchmura/lpc-language-server) and exposes it to AI assistants, enabling natural language queries about your LPC codebase with real language server-powered understanding.

## What This Enables

✨ **AI assistants can now:**

- Understand your LPC code structure through the language server
- Get real documentation from hover information
- Jump to definitions and find references
- Answer natural language questions about your mudlib
- Trace inheritance chains and function calls
- Explain complex code patterns

All through conversation, powered by actual code intelligence instead of pattern matching.

## Features

- 🔍 **`lpc_hover`**: Get documentation/hover information for symbols
- 🎯 **`lpc_definition`**: Jump to definition of symbols
- 🔗 **`lpc_references`**: Find all references to a symbol
- 🐛 **`lpc_diagnostics`**: Get real-time errors, warnings, and hints from the language server
- 📁 **Workspace-aware**: Reads your `lpc-config.json` for proper symbol resolution
- 🚀 **Fast**: Direct JSON-RPC communication with the language server

## Prerequisites

### 1. Install Node.js

Node.js 16+ required:

```bash
node --version  # Should be v16.0.0 or higher
```

### 2. Install the LPC Language Server Extension

The extension must be installed in VS Code (the server binary is bundled with it):

```bash
code --install-extension jlchmura.lpc
```

Verify installation:

```bash
ls ~/.vscode/extensions/jlchmura.lpc-*/out/server/src/server.js
```

### 3. Install Dependencies

```bash
cd /path/to/lpc-mcp
npm install
```

### 4. Create `lpc-config.json` in Your Mudlib

The language server needs this config file at your mudlib root to understand includes, simul_efuns, etc.

Example `/path/to/your/mudlib/lpc-config.json`:

```json
{
  "driver": {
    "type": "fluffos"
  },
  "libFiles": {
    "master": "adm/obj/master.c",
    "simul_efun": "adm/obj/simul_efun.c",
    "global_include": "include/global.h"
  },
  "libInclude": [
    "include",
    "include/driver",
    "adm/include"
  ],
  "exclude": [
    ".git/",
    "tmp/"
  ]
}
```

## Setup for Different AI Tools

### Warp (Terminal)

Add to your Warp MCP configuration:

**Location**: Settings → AI → Model Context Protocol

```json
{
  "lpc": {
    "command": "node",
    "args": ["/absolute/path/to/lpc-mcp/index.js"],
    "env": {
      "LPC_WORKSPACE_ROOT": "/path/to/your/mudlib"
    }
  }
}
```

**Important**: Use absolute paths! Replace:

- `/absolute/path/to/lpc-mcp/index.js` with the actual path to this repo
- `/path/to/your/mudlib` with the directory containing your `lpc-config.json`

Restart Warp after adding the configuration.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or equivalent:

```json
{
  "mcpServers": {
    "lpc": {
      "command": "node",
      "args": ["/absolute/path/to/lpc-mcp/index.js"],
      "env": {
        "LPC_WORKSPACE_ROOT": "/path/to/your/mudlib"
      }
    }
  }
}
```

Restart Claude Desktop after configuration.

### Cline (VS Code Extension)

Add to your Cline MCP settings:

```json
{
  "mcpServers": {
    "lpc": {
      "command": "node",
      "args": ["/absolute/path/to/lpc-mcp/index.js"],
      "env": {
        "LPC_WORKSPACE_ROOT": "/path/to/your/mudlib"
      }
    }
  }
}
```

### GitHub Copilot (VS Code)

**Prerequisites:**
- Install the [Copilot MCP extension](https://marketplace.visualstudio.com/items?itemName=automatalabs.copilot-mcp): `code --install-extension automatalabs.copilot-mcp`

**Configuration:**
Add to `~/Library/Application Support/Code/User/mcp.json` (macOS) or equivalent:

```json
{
  "servers": {
    "lpc": {
      "type": "node",
      "command": "node", 
      "args": ["/absolute/path/to/lpc-mcp/index.js"],
      "env": {
        "LPC_WORKSPACE_ROOT": "/path/to/your/mudlib"
      }
    }
  },
  "inputs": []
}
```

### Other MCP-Compatible Tools

The configuration is the same for any MCP-compatible tool:

1. Add the server to your MCP configuration
2. Provide the Node.js command and path to `index.js`
3. Set `LPC_WORKSPACE_ROOT` environment variable to your mudlib root

## Usage Examples

Once configured, you can ask your AI assistant natural language questions:

**"What does the `query_short()` function do in room.c?"**
→ AI uses `lpc_hover` to get documentation

**"Where is `STD_OBJECT` defined?"**
→ AI uses `lpc_definition` to find the file

**"Find all places that call `set_room_size()`"**
→ AI uses `lpc_references` to locate all callers

**"Explain how the maze generation algorithm works"**
→ AI reads code and uses hover info to understand functions

**"What's the inheritance tree for rooms?"**
→ AI traces `inherit` statements and jumps to definitions

**"Check if this LPC file has any syntax errors"**
→ AI uses `lpc_diagnostics` to validate the code

**"Why won't this LPC code compile?"**
→ AI checks diagnostics for errors like undeclared variables or type mismatches

## Testing

To verify the server works:

```bash
# Set workspace root for testing
export LPC_WORKSPACE_ROOT=/path/to/your/mudlib

# Start the server (it will wait for MCP protocol messages)
node index.js
```

The server should output:

```
Starting LPC Language Server...
Initializing LSP...
LPC Language Server started successfully
LPC MCP Server running on stdio
```

## Troubleshooting

### Server won't start

**Check the LPC extension is installed:**

```bash
code --list-extensions | grep jlchmura.lpc
```

**Check logs** (for Warp):

```bash
tail -f ~/.local/state/warp-terminal/mcp/*.log
```

### Language server not resolving symbols

**Verify workspace root:**

- Make sure `LPC_WORKSPACE_ROOT` points to the directory with `lpc-config.json`
- Use absolute paths, not relative

**Check your lpc-config.json:**

```bash
cat $LPC_WORKSPACE_ROOT/lpc-config.json
```

### Extension version mismatch

If the extension path doesn't match, update line 40 in `index.js`:

```javascript
const lspPath = path.join(
  process.env.HOME,
  ".vscode/extensions/jlchmura.lpc-VERSION/out/server/src/server.js"
);
```

Find your version:

```bash
ls ~/.vscode/extensions/ | grep jlchmura.lpc
```

## How It Works

```
AI Assistant
    ↓ (natural language)
  MCP Protocol
    ↓ (tool calls: lpc_hover, lpc_definition, lpc_references)
  This Server
    ↓ (JSON-RPC: textDocument/hover, etc.)
  LPC Language Server
    ↓ (parses LPC, reads lpc-config.json)
  Your Mudlib
```

1. AI assistant sends MCP tool requests
2. Server reads the file and sends `textDocument/didOpen` to LSP
3. Server translates MCP → LSP JSON-RPC requests
4. LSP analyzes code using your `lpc-config.json`
5. Server returns LSP response as MCP result
6. AI understands your code structure!

## Roadmap

- [ ] Add completion support
- [x] Add diagnostics (errors/warnings)
- [ ] Support signature help
- [ ] Cache opened documents
- [ ] Support multiple workspace roots
- [ ] Add rename symbol support
- [ ] Add document symbols (outline)
- [ ] Add workspace symbol search

## Contributing

PRs welcome! This is a proof-of-concept that can be extended with more LSP features.

## Credits

- **John (jlchmura)** - The INCOMPARABLY SKILLED MASTER PROGRAMMER whose [LPC language server](https://github.com/jlchmura/lpc-language-server) rescued LPC development from 1995. Without his greatness, kindness, and all-around hunk demeanour, we would still be `grep`-ing through mudlibs like cavemen. This MCP server is merely a humble wrapper around his genius. 🙇
- [Model Context Protocol](https://modelcontextprotocol.io/) - The protocol making this possible
- Built in an hour of inspired hacking in 2025

## License

Unlicense - Public Domain. Do whatever you want with this code.

Note: The LPC language server itself (jlchmura/lpc-language-server) is under its own license.
