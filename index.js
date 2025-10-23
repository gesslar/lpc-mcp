#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import { createConnection } from "vscode-languageserver-protocol/node.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    );

    this.lspProcess = null;
    this.lspConnection = null;
    this.setupHandlers();
  }

  async startLSP() {
    // Path to the LPC language server
    const lspPath = path.join(
      process.env.HOME,
      ".vscode/extensions/jlchmura.lpc-1.1.42/out/server/src/bin.js"
    );

    // Spawn the LSP server
    this.lspProcess = spawn("node", [lspPath, "--stdio"], {
      stdio: ["pipe", "pipe", "inherit"],
    });

    // Create LSP connection
    this.lspConnection = createConnection(
      this.lspProcess.stdin,
      this.lspProcess.stdout
    );

    // Initialize the LSP
    await this.lspConnection.sendRequest("initialize", {
      processId: process.pid,
      rootUri: null,
      capabilities: {},
    });

    await this.lspConnection.sendNotification("initialized");

    console.error("LPC Language Server started successfully");
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
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
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!this.lspConnection) {
        throw new Error("LSP not initialized");
      }

      const uri = `file://${args.file}`;

      try {
        switch (name) {
          case "lpc_hover": {
            const result = await this.lspConnection.sendRequest(
              "textDocument/hover",
              {
                textDocument: { uri },
                position: { line: args.line, character: args.character },
              }
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "lpc_definition": {
            const result = await this.lspConnection.sendRequest(
              "textDocument/definition",
              {
                textDocument: { uri },
                position: { line: args.line, character: args.character },
              }
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "lpc_references": {
            const result = await this.lspConnection.sendRequest(
              "textDocument/references",
              {
                textDocument: { uri },
                position: { line: args.line, character: args.character },
                context: { includeDeclaration: true },
              }
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    await this.startLSP();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error("LPC MCP Server running on stdio");
  }
}

const server = new LPCMCPServer();
server.run().catch(console.error);
