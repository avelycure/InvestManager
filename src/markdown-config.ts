export type ConfigRow = { line: number; cells: Record<string, string> };

function listValue(line: string): string | undefined {
  const match = line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+?)\s*$/);
  return match?.[1]?.trim();
}

export function parseConfigRows(content: string, path: string, required: string[], simpleKey?: string): ConfigRow[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let headers: string[] | undefined;
  const rows: ConfigRow[] = [];
  let firstList: { line: number; value: string } | undefined;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]?.trim() ?? '';
    if (!line.startsWith('|') || !line.endsWith('|')) {
      headers = undefined;
      const value = listValue(line);
      if (value) {
        firstList ??= { line: index + 1, value };
        if (simpleKey) rows.push({ line: index + 1, cells: { [simpleKey]: value } });
      }
      continue;
    }
    const parts = line.slice(1, -1).split('|').map((cell) => cell.trim());
    if (parts.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    if (!headers) {
      headers = parts;
      const missing = required.filter((key) => !headers?.includes(key));
      if (missing.length) throw new Error(`${path}:${index + 1}: нет столбцов ${missing.join(', ')}`);
      continue;
    }
    if (parts.length !== headers.length) throw new Error(`${path}:${index + 1}: число ячеек не совпадает с заголовком таблицы`);
    const cells: Record<string, string> = {};
    headers.forEach((key, cellIndex) => { cells[key] = parts[cellIndex] ?? ''; });
    for (const key of required) if (!cells[key]) throw new Error(`${path}:${index + 1}: пустое поле «${key}»`);
    rows.push({ line: index + 1, cells });
  }
  if (!rows.length && firstList) {
    const missing = required.filter((key) => key !== simpleKey);
    throw new Error(`${path}:${firstList.line}: найден список, но для каждой строки нужны поля «${missing.join('», «')}». Используйте таблицу из документации.`);
  }
  if (!rows.length) throw new Error(`${path}: нет записей; добавьте Markdown-таблицу${simpleKey ? ' или нумерованный список' : ''}`);
  return rows;
}
