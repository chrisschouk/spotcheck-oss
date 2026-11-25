/**
 * Local stdio MCP server. It runs on your machine with your own Spotify
 * credentials; nothing is sent to anyone else. Stdout carries JSON-RPC only.
 * The server starts and lists its tools without credentials and fails at call
 * time with a clear message.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare function createServer(): McpServer;
export declare function runMcpServer(): Promise<void>;
