// Pure TypeScript / Edge-safe: no node: imports.
import { NRouterMCP, type AgentTool, type nRouter } from '@nrouter_ai/sdk';

export interface McpClientConfig {
  claudeDesktop: {
    mcpServers: Record<string, {
      command: string;
      args: string[];
      env?: Record<string, string>;
    }>;
  };
  cursor: {
    url: string;
    headers: Record<string, string>;
  };
}

/**
 * Generate client configuration for connecting Claude Desktop or Cursor
 * to an MCP server fronted by the nRouter reverse proxy.
 */
export function formatMcpClientConfig(
  serverName: string,
  apiKey: string,
  gatewayUrl = 'https://api.nrouter.ai',
): McpClientConfig {
  const cleanServer = (serverName || 'company-tools').trim();
  const endpoint = `${gatewayUrl.replace(/\/$/, '')}/mcp/${cleanServer}`;

  return {
    claudeDesktop: {
      mcpServers: {
        [cleanServer]: {
          command: 'npx',
          args: [
            '-y',
            'mcp-remote',
            endpoint,
            '--header',
            // mcp-remote expands ${AUTH_HEADER} from env itself, so the key never
            // appears in the process arguments (readable from the process list).
            'Authorization:${AUTH_HEADER}',
          ],
          env: {
            AUTH_HEADER: `Bearer ${apiKey}`,
          },
        },
      },
    },
    cursor: {
      url: endpoint,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  };
}

/**
 * Creates built-in AgentTool definitions that enable the customer support agent
 * to manage, inspect, and invoke MCP servers through nRouter's MCP gateway.
 */
export function createMcpTools(client: nRouter): AgentTool[] {
  const mcp = new NRouterMCP(client.nr);

  const listToolsTool: AgentTool = {
    definition: {
      type: 'function',
      function: {
        name: 'mcp_list_tools',
        description: 'List all tools exposed by an MCP server connected to nRouter. Omit serverId if only one server is configured.',
        parameters: {
          type: 'object',
          properties: {
            serverId: {
              type: 'string',
              description: 'Optional MCP server identifier or slug in nRouter.',
            },
          },
        },
      },
    },
    execute: async (args: { serverId?: string }) => {
      try {
        const tools = await mcp.list(args.serverId);
        return {
          status: 'ok',
          count: tools.length,
          tools: tools.map(t => ({
            name: t.name,
            description: t.description ?? '',
            inputSchema: t.inputSchema ?? {},
          })),
        };
      } catch (err: any) {
        return {
          status: 'error',
          error: err?.message || 'Failed to list MCP tools from nRouter gateway',
          message: err?.message || 'Failed to list MCP tools from nRouter gateway',
        };
      }
    },
  };

  const callToolTool: AgentTool = {
    definition: {
      type: 'function',
      function: {
        name: 'mcp_call_tool',
        description: 'Invoke a tool on an MCP server through the nRouter reverse proxy.',
        parameters: {
          type: 'object',
          properties: {
            serverId: {
              type: 'string',
              description: 'Optional MCP server identifier or slug in nRouter.',
            },
            toolName: {
              type: 'string',
              description: 'The name of the tool to invoke.',
            },
            arguments: {
              type: 'object',
              description: 'JSON arguments matching the tool inputSchema.',
            },
          },
          required: ['toolName'],
        },
      },
    },
    execute: async (args: { serverId?: string; toolName: string; arguments?: Record<string, unknown> | string }) => {
      try {
        const invalidArgs = {
          status: 'error',
          error: 'Invalid JSON in tool arguments',
          message: 'Invalid JSON in tool arguments',
        };
        const rawArgs = args.arguments;
        let candidate: unknown = rawArgs ?? {};
        if (typeof rawArgs === 'string') {
          try {
            candidate = JSON.parse(rawArgs);
          } catch {
            return invalidArgs;
          }
        }
        // Only a plain object is a valid argument map: a primitive, array or null is refused.
        if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
          return invalidArgs;
        }
        const parsedArgs = candidate as Record<string, unknown>;
        const result = await mcp.call(args.serverId, args.toolName, parsedArgs);
        return {
          status: 'ok',
          result,
        };
      } catch (err: any) {
        return {
          status: 'error',
          error: err?.message || 'Failed to call MCP tool via nRouter',
          message: err?.message || 'Failed to call MCP tool via nRouter',
        };
      }
    },
  };

  const configTool: AgentTool = {
    definition: {
      type: 'function',
      function: {
        name: 'mcp_client_config',
        description: 'Generate standard client configuration for connecting Claude Desktop or Cursor through nRouter MCP reverse proxy.',
        parameters: {
          type: 'object',
          properties: {
            serverName: {
              type: 'string',
              description: 'Name of the MCP server registered in the dashboard.',
            },
          },
          required: ['serverName'],
        },
      },
    },
    execute: async (args: { serverName: string }) => {
      const cfg = formatMcpClientConfig(args.serverName, 'sk-nrouter-your-key-here');
      return {
        status: 'ok',
        config: cfg,
      };
    },
  };

  return [listToolsTool, callToolTool, configTool];
}
