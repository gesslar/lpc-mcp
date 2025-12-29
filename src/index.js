#!/usr/bin/env node

import {Server} from "@modelcontextprotocol/sdk/server/index.js"
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import {spawn} from "child_process"
import * as rpc from "vscode-jsonrpc/node.js"
import path from "path"
// ...existing code...
import {Transform} from "stream"

class LPCMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: "lpc-mcp-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    )

    this.lspProcess = null
    this.lspConnection = null
    this.diagnosticsCache = new Map() // Map of file URI -> diagnostics array
    this.setupHandlers()
  }

  async startLSP() {
    // Path to the LPC language server
    const lspPath = path.join(
      process.env.HOME,
      ".vscode/extensions/jlchmura.lpc-1.1.42/out/server/src/server.js"
    )

    console.error("Starting LPC Language Server from:", lspPath)

    // Spawn the LSP server
    // Redirect stderr to /dev/null to prevent log messages from contaminating JSON-RPC
    this.lspProcess = spawn("node", [lspPath, "--stdio"], {
      stdio: ["pipe", "pipe", "ignore"],
    })

    this.lspProcess.on("error", err => {
      console.error("LSP Process error:", err)
    })

    this.lspProcess.on("exit", code => {
      console.error("LSP Process exited with code:", code)
    })

    // Create a transform stream to filter out non-JSON-RPC output
    const cleanStream = new Transform({
      transform(chunk, encoding, callback) {
        const data = chunk.toString()
        // Filter out lines that don't look like JSON-RPC
        // JSON-RPC messages start with "Content-Length: "
        const lines = data.split("\n")
        const filtered = lines.filter(line => {
          const trimmed = line.trim()

          // Keep Content-Length headers and JSON lines
          return trimmed.startsWith("Content-Length:") ||
                 trimmed.startsWith("{") ||
                 trimmed === ""
        }).join("\n")

        if(filtered) {
          this.push(filtered)
        }

        callback()
      }
    })

    // Pipe stdout through the cleaner
    this.lspProcess.stdout.pipe(cleanStream)

    // Create JSON-RPC connection
    const reader = new rpc.StreamMessageReader(cleanStream)
    const writer = new rpc.StreamMessageWriter(this.lspProcess.stdin)
    this.lspConnection = rpc.createMessageConnection(reader, writer)

    this.lspConnection.onError(error => {
      console.error("LSP Connection error:", error)
    })

    this.lspConnection.onClose(() => {
      console.error("LSP Connection closed")
    })

    // Listen for diagnostic notifications
    this.lspConnection.onNotification("textDocument/publishDiagnostics", params => {
      console.error(`Received diagnostics for ${params.uri}: ${params.diagnostics.length} issues`)
      this.diagnosticsCache.set(params.uri, params.diagnostics)
    })

    // Start listening
    this.lspConnection.listen()

    console.error("Initializing LSP...")

    // Get workspace root from environment variable
    const workspaceRoot = process.env.LPC_WORKSPACE_ROOT || null
    const rootUri = workspaceRoot ? `file://${workspaceRoot}` : null

    console.error("Using workspace root:", rootUri)

    // Initialize the LSP with timeout
    try {
      const initResult = await Promise.race([
        this.lspConnection.sendRequest("initialize", {
          processId: process.pid,
          rootUri: rootUri,
          capabilities: {
            textDocument: {
              hover: {dynamicRegistration: true},
              definition: {dynamicRegistration: true},
              references: {dynamicRegistration: true},
            },
          },
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("LSP init timeout")), 5000)
        ),
      ])

      console.error("LSP initialized:", JSON.stringify(initResult, null, 2))

      await this.lspConnection.sendNotification("initialized", {})

      console.error("LPC Language Server started successfully")
    } catch(error) {
      console.error("Failed to initialize LSP:", error)
      throw error
    }
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async() => ({
      tools: [
        {
          name: "lpc_hover",
          description:
            "Get hover information (documentation) for a symbol at a specific position in an LPC file",
          inputSchema: {
            type: "object",
            properties: {
              file: {
                type: "string",
                description: "Absolute path to the LPC file",
              },
              line: {
                type: "number",
                description: "Line number (0-indexed)",
              },
              character: {
                type: "number",
                description: "Character position (0-indexed)",
              },
            },
            required: ["file", "line", "character"],
          },
        },
        {
          name: "lpc_definition",
          description:
            "Go to definition of a symbol at a specific position in an LPC file",
          inputSchema: {
            type: "object",
            properties: {
              file: {
                type: "string",
                description: "Absolute path to the LPC file",
              },
              line: {
                type: "number",
                description: "Line number (0-indexed)",
              },
              character: {
                type: "number",
                description: "Character position (0-indexed)",
              },
            },
            required: ["file", "line", "character"],
          },
        },
        {
          name: "lpc_references",
          description:
            "Find all references to a symbol at a specific position in an LPC file",
          inputSchema: {
            type: "object",
            properties: {
              file: {
                type: "string",
                description: "Absolute path to the LPC file",
              },
              line: {
                type: "number",
                description: "Line number (0-indexed)",
              },
              character: {
                type: "number",
                description: "Character position (0-indexed)",
              },
            },
            required: ["file", "line", "character"],
          },
        },
        {
          name: "lpc_diagnostics",
          description:
            "Get diagnostics (errors, warnings, hints) for an LPC file. This reveals LPC language rules and syntax errors.",
          inputSchema: {
            type: "object",
            properties: {
              file: {
                type: "string",
                description: "Absolute path to the LPC file",
              },
            },
            required: ["file"],
          },
        },
      ],
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const {name, arguments: args} = request.params

      if(!this.lspConnection) {
        throw new Error("LSP not initialized")
      }

      const uri = `file://${args.file}`

      try {
        // Read the file and send didOpen notification
        const fs = await import("fs/promises")
        const fileContent = await fs.readFile(args.file, "utf-8")

        await this.lspConnection.sendNotification("textDocument/didOpen", {
          textDocument: {
            uri,
            languageId: "lpc",
            version: 1,
            text: fileContent,
          },
        })

        switch(name) {
          case "lpc_hover": {
            const result = await this.lspConnection.sendRequest(
              "textDocument/hover",
              {
                textDocument: {uri},
                position: {line: args.line, character: args.character},
              }
            )

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            }
          }

          case "lpc_definition": {
            const result = await this.lspConnection.sendRequest(
              "textDocument/definition",
              {
                textDocument: {uri},
                position: {line: args.line, character: args.character},
              }
            )

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            }
          }

          case "lpc_references": {
            const result = await this.lspConnection.sendRequest(
              "textDocument/references",
              {
                textDocument: {uri},
                position: {line: args.line, character: args.character},
                context: {includeDeclaration: true},
              }
            )

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            }
          }

          case "lpc_diagnostics": {
            // Just open the file to trigger diagnostics
            // Wait a bit for diagnostics to come through
            await new Promise(resolve => setTimeout(resolve, 500))

            const diagnostics = this.diagnosticsCache.get(uri) || []

            if(diagnostics.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: "No diagnostics found for this file. The code appears to be valid.",
                  },
                ],
              }
            }

            // Format diagnostics in a readable way
            const formatted = diagnostics.map(d => {
              const severity = ["Error", "Warning", "Information", "Hint"][d.severity - 1] || "Unknown"
              const line = d.range.start.line + 1 // Convert to 1-indexed
              const char = d.range.start.character + 1

              return `[${severity}] Line ${line}:${char} - ${d.message}`
            }).join("\n")

            return {
              content: [
                {
                  type: "text",
                  text: `Found ${diagnostics.length} diagnostic(s):\n\n${formatted}\n\nRaw diagnostics:\n${JSON.stringify(diagnostics, null, 2)}`,
                },
              ],
            }
          }

          default:
            throw new Error(`Unknown tool: ${name}`)
        }
      } catch(error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        }
      }
    })
  }

  async run() {
    await this.startLSP()

    const transport = new StdioServerTransport()
    await this.server.connect(transport)

    console.error("LPC MCP Server running on stdio")
  }
}

const server = new LPCMCPServer()
server.run().catch(console.error)
