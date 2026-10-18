import { constants, existsSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { delimiter, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { publicSourceUrl } from './public-source-url';
import { ElectronStdioClientTransport } from './electron-stdio-transport';

const MCP_PACKAGE = '@playwright/mcp@0.0.83';
const MAX_RENDERED_HTML = 4_000_000;
const MCP_TIMEOUT_MS = 22_000;

function npxCommand(): string {
  const name = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const directories = (process.env.PATH ?? '').split(delimiter);
  if (process.platform === 'darwin') directories.push('/opt/homebrew/bin', '/usr/local/bin');
  for (const directory of directories) {
    if (!directory) continue;
    const candidate = join(directory, name);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('Для Playwright MCP нужен установленный Node.js с npx');
}

function resultJson(result: Awaited<ReturnType<Client['callTool']>>): unknown {
  const content: unknown = 'content' in result ? result.content : [];
  if (!Array.isArray(content)) throw new Error('Playwright MCP не вернул текст страницы');
  const output: unknown = content.find((part: unknown) => {
    return typeof part === 'object' && part !== null && 'type' in part && part.type === 'text';
  });
  if (!output || typeof output !== 'object' || !('text' in output) || typeof output.text !== 'string') {
    throw new Error('Playwright MCP не вернул текст страницы');
  }
  if (result.isError) throw new Error(output.text.slice(0, 400));
  const match = output.text.match(/^### Result\n([\s\S]*?)(?:\n### Ran Playwright code|$)/);
  if (!match?.[1]) throw new Error('Playwright MCP вернул неожиданный ответ');
  try { return JSON.parse(match[1]); }
  catch { throw new Error('Playwright MCP вернул некорректный HTML'); }
}

/** Opens one public press-centre page in an isolated browser and returns its rendered DOM. */
export async function readRenderedCompanyPage(url: string): Promise<string> {
  const validUrl = publicSourceUrl(url);
  if (!validUrl) throw new Error('Некорректный публичный адрес пресс-центра');
  const command = npxCommand();
  await access(command, constants.X_OK);
  const client = new Client({ name: 'invest-manager', version: '0.1.0' });
  const environment = getDefaultEnvironment();
  environment.PATH = `${dirname(command)}${delimiter}${environment.PATH ?? ''}`;
  const transport = new ElectronStdioClientTransport({
    command,
    args: ['-y', MCP_PACKAGE, '--headless', '--isolated', '--no-webmcp', '--block-service-workers',
      '--snapshot-mode', 'none', '--image-responses', 'omit', '--timeout-navigation', '15000'],
    cwd: tmpdir(),
    env: environment,
    stderr: 'pipe',
    maxBufferSize: MAX_RENDERED_HTML + 500_000,
  });
  transport.stderr?.on('data', () => undefined);
  try {
    await client.connect(transport, { timeout: MCP_TIMEOUT_MS });
    const navigation = await client.callTool({ name: 'browser_navigate', arguments: { url: validUrl } }, undefined,
      { timeout: MCP_TIMEOUT_MS });
    if (navigation.isError) throw new Error('Браузер не смог открыть пресс-центр');
    const evaluated = await client.callTool({ name: 'browser_evaluate', arguments: {
      function: `async () => {
        for (let i = 0; i < 3; i++) {
          window.scrollTo(0, document.body.scrollHeight);
          await new Promise(resolve => setTimeout(resolve, 350));
        }
        const html = document.documentElement.outerHTML;
        return { url: location.href, html: html.length <= ${MAX_RENDERED_HTML} ? html : null };
      }`,
    } }, undefined, { timeout: MCP_TIMEOUT_MS });
    const value = resultJson(evaluated);
    if (!value || typeof value !== 'object') throw new Error('Playwright MCP не вернул страницу');
    const page = value as { url?: unknown; html?: unknown };
    if (typeof page.url !== 'string' || !publicSourceUrl(page.url)
      || new URL(page.url).hostname.replace(/^www\./, '') !== new URL(validUrl).hostname.replace(/^www\./, '')) {
      throw new Error('Пресс-центр перенаправил браузер на другой сайт');
    }
    if (page.html === null) throw new Error('Страница пресс-центра слишком велика');
    if (typeof page.html !== 'string' || !page.html) throw new Error('Playwright MCP не вернул HTML страницы');
    return page.html;
  } finally {
    await client.close();
  }
}
