import { describe, it, expect, vi } from 'vitest';
import { formatMcpClientConfig, createMcpTools } from '../src/mcp.js';
import type { nRouter } from '@nrouter_ai/sdk';

describe('mcp module', () => {
  it('formats client config for Claude Desktop and Cursor', () => {
    const config = formatMcpClientConfig('my-server', 'sk-nrouter-sample');
    expect(config.claudeDesktop.mcpServers['my-server']).toBeDefined();
    const desktop = config.claudeDesktop.mcpServers['my-server']!;
    expect(desktop.command).toBe('npx');
    expect(desktop.args).toEqual([
      '-y',
      'mcp-remote',
      'https://api.nrouter.ai/mcp/my-server',
      '--header',
      'Authorization:${AUTH_HEADER}',
    ]);
    expect(desktop.env).toEqual({ AUTH_HEADER: 'Bearer sk-nrouter-sample' });
    // The key is readable from the process list if it sits in argv; it must live only in env.
    expect(JSON.stringify(desktop.args)).not.toContain('sk-nrouter-sample');

    expect(config.cursor.url).toBe('https://api.nrouter.ai/mcp/my-server');
    expect(config.cursor.headers.Authorization).toBe('Bearer sk-nrouter-sample');
  });

  it('creates MCP agent tools that execute via SDK NRouterMCP', async () => {
    const fakeClient = {
      nr: {
        request: vi.fn().mockImplementation(async (opts: any) => {
          if (opts.path?.includes('/tools/call')) {
            return {
              status: 200,
              contentType: 'application/json',
              text: JSON.stringify({ result: { content: [{ type: 'text', text: 'call success' }] } }),
              headers: { get: () => null },
            };
          }
          // list
          return {
            status: 200,
            contentType: 'application/json',
            text: JSON.stringify({
              result: {
                tools: [
                  { name: 'query_db', description: 'Query database', inputSchema: {} },
                ],
              },
            }),
            headers: { get: () => null },
          };
        }),
      },
    } as unknown as nRouter;

    const tools = createMcpTools(fakeClient);
    expect(tools).toHaveLength(3);

    const listTool = tools.find(t => t.definition.function.name === 'mcp_list_tools');
    expect(listTool).toBeDefined();

    const listResult: any = await listTool!.execute({ serverId: 'db-server' }, {} as any);
    expect(listResult.status).toBe('ok');
    expect(listResult.count).toBe(1);
    expect(listResult.tools[0].name).toBe('query_db');

    const callTool = tools.find(t => t.definition.function.name === 'mcp_call_tool');
    expect(callTool).toBeDefined();

    const callResult: any = await callTool!.execute({ serverId: 'db-server', toolName: 'query_db' }, {} as any);
    expect(callResult.status).toBe('ok');

    const configTool = tools.find(t => t.definition.function.name === 'mcp_client_config');
    expect(configTool).toBeDefined();

    const configResult: any = await configTool!.execute({ serverName: 'analytics' }, {} as any);
    expect(configResult.status).toBe('ok');
    expect(configResult.config.cursor.url).toContain('/mcp/analytics');
  });

  it('handles MCP error responses gracefully without throwing', async () => {
    const fakeClient = {
      nr: {
        request: vi.fn().mockRejectedValue(new Error('Gateway 503 unavailable')),
      },
    } as unknown as nRouter;

    const tools = createMcpTools(fakeClient);
    const listTool = tools.find(t => t.definition.function.name === 'mcp_list_tools')!;
    const res: any = await listTool.execute({}, {} as any);
    expect(res.status).toBe('error');
    expect(res.message).toContain('Gateway 503');
    expect(res.error).toContain('Gateway 503');

    const callTool = tools.find(t => t.definition.function.name === 'mcp_call_tool')!;
    const callRes: any = await callTool.execute({ serverId: 's', toolName: 't' }, {} as any);
    expect(callRes.status).toBe('error');
    expect(callRes.error).toContain('Gateway 503');
    expect(callRes.message).toContain('Gateway 503');
  });

  it('parses tool arguments passed as a JSON string', async () => {
    const request = vi.fn().mockResolvedValue({
      status: 200,
      contentType: 'application/json',
      text: JSON.stringify({ result: { content: [] } }),
      headers: { get: () => null },
    });
    const tools = createMcpTools({ nr: { request } } as unknown as nRouter);
    const callTool = tools.find(t => t.definition.function.name === 'mcp_call_tool')!;

    const res: any = await callTool.execute(
      { serverId: 'db-server', toolName: 'query_db', arguments: '{"sql":"select 1"}' },
      {} as any,
    );
    expect(res.status).toBe('ok');
    expect(JSON.stringify(request.mock.calls[0])).toContain('select 1');
  });

  it.each(['42', '"text"', 'null', '[1,2]', 'true'])(
    'refuses JSON tool arguments that are not an object (%s) without calling the gateway',
    async (raw) => {
      const request = vi.fn();
      const tools = createMcpTools({ nr: { request } } as unknown as nRouter);
      const callTool = tools.find(t => t.definition.function.name === 'mcp_call_tool')!;

      const res: any = await callTool.execute(
        { serverId: 'db-server', toolName: 'query_db', arguments: raw },
        {} as any,
      );
      expect(res).toEqual({
        status: 'error',
        error: 'Invalid JSON in tool arguments',
        message: 'Invalid JSON in tool arguments',
      });
      expect(request).not.toHaveBeenCalled();
    },
  );

  it('refuses tool arguments that are not valid JSON without calling the gateway', async () => {
    const request = vi.fn();
    const tools = createMcpTools({ nr: { request } } as unknown as nRouter);
    const callTool = tools.find(t => t.definition.function.name === 'mcp_call_tool')!;

    const res: any = await callTool.execute(
      { serverId: 'db-server', toolName: 'query_db', arguments: '{not json' },
      {} as any,
    );
    expect(res).toEqual({
      status: 'error',
      error: 'Invalid JSON in tool arguments',
      message: 'Invalid JSON in tool arguments',
    });
    expect(request).not.toHaveBeenCalled();
  });
});
