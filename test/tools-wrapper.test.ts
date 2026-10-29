import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentTool } from '@nrouter_ai/sdk';

// Capture the wrapped tools runToolPhase hands to the SDK, so each wrapper can be
// driven directly with the result and call shapes under test.
const captured: { tools: AgentTool[] } = { tools: [] };
vi.mock('@nrouter_ai/sdk', () => ({
  runTools: vi.fn(async (_nr: unknown, opts: { tools: AgentTool[]; messages: unknown[] }) => {
    captured.tools = opts.tools;
    return { messages: opts.messages, text: '' };
  }),
}));

const { runToolPhase } = await import('../src/tools.js');

async function wrap(execute: AgentTool['execute']) {
  const tool: AgentTool = { definition: { type: 'function', function: { name: 'my_tool' } }, execute };
  const emit = vi.fn();
  const cfg = { client: { nr: {} }, models: ['m'], tools: [tool], maxToolSteps: 1 } as any;
  await runToolPhase(cfg, [{ role: 'user', content: 'hi' }], emit);
  return { wrapped: captured.tools[0]!, emit };
}

describe('runToolPhase tool wrapper', () => {
  beforeEach(() => {
    captured.tools = [];
  });

  it('keeps the payload fields of an error result and fills error and message', async () => {
    const { wrapped, emit } = await wrap(
      vi.fn().mockResolvedValue({ status: 'error', error: 'bad input', code: 'E_INPUT', data: [1] }),
    );
    const out = await wrapped.execute({}, { id: 'c1', type: 'function', function: { name: 'my_tool', arguments: '{}' } } as any);
    expect(out).toEqual({
      toolName: 'my_tool',
      status: 'error',
      error: 'bad input',
      message: 'bad input',
      code: 'E_INPUT',
      data: [1],
    });
    expect(emit).toHaveBeenLastCalledWith({ tool: 'my_tool', title: 'my_tool', status: 'error' });
  });

  it('falls back to a generic error text when the result names none', async () => {
    const { wrapped } = await wrap(vi.fn().mockResolvedValue({ status: 'error' }));
    const out: any = await wrapped.execute({}, { id: 'c1', type: 'function', function: { name: 'my_tool', arguments: '{}' } } as any);
    expect(out.error).toBe('Tool execution failed');
    expect(out.message).toBe('Tool execution failed');
  });

  it('uses the tool definition name when the call carries no function name', async () => {
    const { wrapped, emit } = await wrap(vi.fn().mockResolvedValue('ok'));
    await expect(wrapped.execute({}, {} as any)).resolves.toBe('ok');
    await expect(wrapped.execute({}, undefined as any)).resolves.toBe('ok');
    expect(emit).toHaveBeenCalledWith({ tool: 'my_tool', title: 'my_tool', status: 'done' });
  });
});
