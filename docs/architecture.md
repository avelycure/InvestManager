# Структура проекта

Invest Manager — десктопный плагин Obsidian на TypeScript. Точка входа — `src/main.ts`: она регистрирует вкладку, команды, расписание и связывает сбор данных с сохранением отчёта. Сборка `esbuild.config.mjs` упаковывает код и документацию для помощи в `main.js`; установленному плагину не нужен исходный репозиторий.

## Интерфейс и настройки

- `src/view.ts` — вкладка Invest Manager: запуск сводки, последний отчёт, оценки новостей и меню «⋯». `src/help-modal.ts` показывает справку в виде чата; последние реплики передаются модели для уточняющих вопросов.
- `src/settings.ts` — настройки путей, модели, Telegram и источников рынка.
- `src/help.ts` — разбор вопросов и подбор релевантных фрагментов документации; `src/help-documents.ts` включает README и документы из `docs` в сборку. На вопросы отвечает выбранная модель. Для помощи не читаются заметки хранилища.

## Сбор новостей, данных и отчёт

- `src/config.ts`, `src/markdown-config.ts`, `src/topic-config.ts` — чтение четырёх входных Markdown-файлов. Их формат описан в `docs/config-formats.md`.
- Новости собирают `src/news.ts`, `src/company-news.ts` и `src/telegram-mtproto.ts` из RSS, пресс-центров и Telegram. `src/playwright-company.ts` запускает Playwright MCP как резервный источник отрендеренного HTML пресс-центров; результаты проходят тот же парсер дат и ссылок. `src/rss-cache.ts` и `src/rss-cache-store.ts` хранят историю RSS.
- `src/selection.ts`, `src/semantic-topics.ts`, `src/feedback-policy.ts` — тематический отбор, устранение дублей и учёт оценок.
- `src/market.ts`, `src/imoex.ts`, `src/moex-company-market.ts` — рыночные значения, IMOEX и данные акций.
- `src/digest.ts` объединяет результаты, а `src/report-render.ts` оформляет Markdown. `src/report.ts` сохраняет ежедневную заметку.
- `src/imoex-chart-view.ts` и `src/stock-chart-view.ts` отображают интерактивные графики в заметке.

## Данные и проверки

Плагин создаёт отчёты и свои служебные данные только в `Статистика`. `src/report-guard.ts` проверяет пути записи и символические ссылки. Секреты модели и Telegram используются через хранилище секретов Obsidian. `tests/` содержит модульные тесты; `.github/workflows/ci.yml` запускает линтер, тесты и сборку.
