#!/usr/bin/env node

import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js"
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js"
import * as z from "zod/v4"
import {spawn} from "child_process"
import * as rpc from "vscode-jsonrpc/node.js"
import path from "path"
import {DirectoryObject} from "@gesslar/toolkit"
import {Transform} from "stream"
import pkg from "../package.json" with {type: "json"}

class LPCMCPServer {
  constructor() {
    this.server = new McpServer(
      {
        name: pkg.name,
        version: pkg.version,
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
    this.openDocuments = new Map() // Map of URI -> insertion order (LRU tracking)
    this.openDocumentsMaxSize = 10 // Maximum number of documents to keep open
    this.diagnosticsWaiters = new Map() // Map of file URI -> {resolve, timer}
    this.setupTools()
  }

  async startLSP() {
    let lspPath

    // Check for debug mode
    const debugMode = process.env.LPC_DEBUG === "true" || process.env.LPC_DEBUG === "1"

    if(debugMode) {
      // In debug mode, prefer an explicit path if provided, otherwise use a path relative to the current working directory
      const envLspPath = process.env.LPC_LSP_PATH
      if(envLspPath && envLspPath.trim() !== "") {
        lspPath = envLspPath
        console.error("DEBUG MODE: Using local development server from LPC_LSP_PATH:", lspPath)
      } else {
        lspPath = path.resolve(process.cwd(), "out/server/src/server.js")
        console.error("DEBUG MODE: Using local development server relative to CWD:", lspPath)
      }
    } else {
      // Find the latest LPC language server extension
      const extensionsDir = new DirectoryObject(path.join(process.env.HOME, ".vscode/extensions"))
      const {directories} = await extensionsDir.read("jlchmura.lpc-*")

      if(directories.length === 0) {
        throw new Error("LPC language server extension not found. Please install the jlchmura.lpc extension.")
      }

      // Sort by name to get the latest version (highest version number last)
      const latestExtension = directories
        .map(dir => dir.name)
        .sort()
        .reverse()[0]

      lspPath = path.join(extensionsDir.path, latestExtension, "out/server/src/server.js")
    }

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

      // Resolve any pending waiter for this URI
      const waiter = this.diagnosticsWaiters.get(params.uri)
      if(waiter) {
        clearTimeout(waiter.timer)
        this.diagnosticsWaiters.delete(params.uri)
        waiter.resolve(params.diagnostics)
      }
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

  async ensureDocumentOpen(uri, fileContent) {
    // Close the document first if already open, so the LSP re-processes it
    if(this.openDocuments.has(uri)) {
      await this.lspConnection.sendNotification("textDocument/didClose", {
        textDocument: {uri},
      })
      this.openDocuments.delete(uri)
      this.diagnosticsCache.delete(uri)
    }

    // If we've reached the document limit, close the least recently used document
    if(this.openDocuments.size >= this.openDocumentsMaxSize) {
      const lruUri = this.openDocuments.keys().next().value
      await this.lspConnection.sendNotification("textDocument/didClose", {
        textDocument: {uri: lruUri},
      })
      this.openDocuments.delete(lruUri)
      this.diagnosticsCache.delete(lruUri)
    }

    await this.lspConnection.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: "lpc",
        version: 1,
        text: fileContent,
      },
    })
    this.openDocuments.set(uri, Date.now())
  }

  waitForDiagnostics(uri, timeoutMs = 5000) {
    // If we already have cached diagnostics from the notification firing
    // during ensureDocumentOpen, return them immediately
    const cached = this.diagnosticsCache.get(uri)
    if(cached !== undefined) {
      return Promise.resolve(cached)
    }

    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.diagnosticsWaiters.delete(uri)
        resolve(this.diagnosticsCache.get(uri) || [])
      }, timeoutMs)

      this.diagnosticsWaiters.set(uri, {resolve, timer})
    })
  }

  setupTools() {
    // Register hover tool
    this.server.registerTool("lpc_hover", {
      description: "Get hover information (documentation) for a symbol at a specific position in an LPC file",
      inputSchema: z.object({
        file: z.string().describe("Absolute path to the LPC file"),
        line: z.number().describe("Line number (0-indexed)"),
        character: z.number().describe("Character position (0-indexed)"),
      }),
    }, async({file, line, character}) => {
      if(!this.lspConnection) {
        throw new Error("LSP not initialized")
      }

      const uri = `file://${file}`

      try {
        const fs = await import("fs/promises")
        const fileContent = await fs.readFile(file, "utf-8")

        await this.ensureDocumentOpen(uri, fileContent)

        const result = await this.lspConnection.sendRequest(
          "textDocument/hover",
          {
            textDocument: {uri},
            position: {line, character},
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

    // Register definition tool
    this.server.registerTool("lpc_definition", {
      description: "Go to definition of a symbol at a specific position in an LPC file",
      inputSchema: z.object({
        file: z.string().describe("Absolute path to the LPC file"),
        line: z.number().describe("Line number (0-indexed)"),
        character: z.number().describe("Character position (0-indexed)"),
      }),
    }, async({file, line, character}) => {
      if(!this.lspConnection) {
        throw new Error("LSP not initialized")
      }

      const uri = `file://${file}`

      try {
        const fs = await import("fs/promises")
        const fileContent = await fs.readFile(file, "utf-8")

        await this.ensureDocumentOpen(uri, fileContent)

        const result = await this.lspConnection.sendRequest(
          "textDocument/definition",
          {
            textDocument: {uri},
            position: {line, character},
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

    // Register references tool
    this.server.registerTool("lpc_references", {
      description: "Find all references to a symbol at a specific position in an LPC file",
      inputSchema: z.object({
        file: z.string().describe("Absolute path to the LPC file"),
        line: z.number().describe("Line number (0-indexed)"),
        character: z.number().describe("Character position (0-indexed)"),
      }),
    }, async({file, line, character}) => {
      if(!this.lspConnection) {
        throw new Error("LSP not initialized")
      }

      const uri = `file://${file}`

      try {
        const fs = await import("fs/promises")
        const fileContent = await fs.readFile(file, "utf-8")

        await this.ensureDocumentOpen(uri, fileContent)

        const result = await this.lspConnection.sendRequest(
          "textDocument/references",
          {
            textDocument: {uri},
            position: {line, character},
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

    // Register diagnostics tool
    this.server.registerTool("lpc_diagnostics", {
      description: "Get diagnostics (errors, warnings, hints) for an LPC file. This reveals LPC language rules and syntax errors.",
      inputSchema: z.object({
        file: z.string().describe("Absolute path to the LPC file"),
      }),
    }, async({file}) => {
      if(!this.lspConnection) {
        throw new Error("LSP not initialized")
      }

      const uri = `file://${file}`

      try {
        const fs = await import("fs/promises")
        const fileContent = await fs.readFile(file, "utf-8")

        await this.ensureDocumentOpen(uri, fileContent)

        const diagnostics = await this.waitForDiagnostics(uri)

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
