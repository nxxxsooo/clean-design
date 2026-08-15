import readline from 'node:readline';
import { writeFile } from 'node:fs/promises';

const write = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

export async function runPiRpcMock({
  reportFile = null,
  responseText = 'Mock pi response.',
} = {}) {
  const input = readline.createInterface({ input: process.stdin });
  for await (const line of input) {
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      continue;
    }

    if (request.type === 'abort') {
      write({ type: 'agent_end' });
      input.close();
      break;
    }

    if (request.type === 'new_session') {
      write({ type: 'response', id: request.id, success: true });
      continue;
    }

    if (request.type !== 'prompt') continue;

    write({ type: 'response', id: request.id, success: true });
    write({ type: 'agent_start' });
    write({ type: 'turn_start' });
    write({
      type: 'tool_execution_start',
      toolCallId: 'mock-tool-1',
      toolName: 'Read',
      args: { file_path: 'DESIGN.md' },
    });
    write({
      type: 'tool_execution_end',
      toolCallId: 'mock-tool-1',
      result: { content: [{ type: 'text', text: 'Deterministic mock file content.' }] },
      isError: false,
    });
    write({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'text_delta',
        delta: responseText,
      },
    });
    write({
      type: 'turn_end',
      message: {
        stopReason: 'stop',
        usage: { input: 0, output: 8, cacheRead: 0, cacheWrite: 0, totalTokens: 8 },
      },
    });
    if (reportFile) await writeFile(reportFile, responseText).catch(() => {});
    write({ type: 'agent_end' });
    input.close();
    break;
  }
}
