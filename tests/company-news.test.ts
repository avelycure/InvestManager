import assert from 'node:assert/strict';
import test from 'node:test';
import { DOMParser as TestDOMParser } from 'linkedom';
import { parseCompanyNewsPage } from '../src/company-news.ts';

// Node has no DOMParser; the plugin itself uses Obsidian's browser DOM.
const parseDocument = (html: string): Document => new TestDOMParser().parseFromString(html, 'text/html') as unknown as Document;

void test('press center page selects dated official links within the exact window', () => {
  const html = `<html><body>
    <article><time datetime="2026-10-17T10:15:00+03:00"></time><h2><a href="/news/one">Совет директоров утвердил дивиденды</a></h2></article>
    <article><time datetime="2026-10-16T08:30:00+03:00"></time><h2><a href="/news/old">Старая новость компании</a></h2></article>
    <article><time datetime="2026-10-17T11:00:00+03:00"></time><h2><a href="https://other.example/news">Новость другого сайта</a></h2></article>
    <article><h2><a href="/news/undated">Публикация без даты</a></h2></article>
  </body></html>`;
  const result = parseCompanyNewsPage(html, 'https://company.example/press/', 'Компания', new Date('2026-10-16T06:00:00Z'), new Date('2026-10-17T09:00:00Z'), parseDocument);
  assert.deepEqual(result.items.map((item) => item.url), ['https://company.example/news/one']);
  assert.equal(result.items[0]?.companySource, 'Компания');
  assert.match(result.issue ?? '', /без проверяемой даты/);
});

void test('date-only press center entries require the whole day inside the window', () => {
  const html = `<article><div class="date">17 октября 2026</div><a href="/news/today">Новая публикация компании</a></article>
    <article><div class="date">16 октября 2026</div><a href="/news/yesterday">Вчерашняя публикация компании</a></article>`;
  const early = parseCompanyNewsPage(html, 'https://company.example/press/', 'Компания', new Date('2026-10-16T06:00:00Z'), new Date('2026-10-17T09:00:00Z'), parseDocument);
  assert.deepEqual(early.items, []);
  assert.ok(early.issue);
  const complete = parseCompanyNewsPage(html, 'https://company.example/press/', 'Компания', new Date('2026-10-16T06:00:00Z'), new Date('2026-10-18T09:00:00Z'), parseDocument);
  assert.deepEqual(complete.items.map((item) => item.url), ['https://company.example/news/today']);
});

void test('press center cards with Russian dates and links wrapping the headline are read', () => {
  const html = `<html><body><a href="/press/company/new-story/" class="press__card">
    <div class="press__card-top"><h4>ФосАгро опубликовала операционные результаты</h4></div>
    <footer class="press__card-footer"><div class="press__card-date">17 октября</div></footer>
  </a></body></html>`;
  const result = parseCompanyNewsPage(html, 'https://www.phosagro.ru/press/', 'Фосагро', new Date('2026-10-16T06:00:00Z'), new Date('2026-10-18T09:00:00Z'), parseDocument);
  assert.equal(result.items[0]?.title, 'ФосАгро опубликовала операционные результаты');
  assert.equal(result.items[0]?.url, 'https://www.phosagro.ru/press/company/new-story/');
  assert.ok(result.issue);
});

void test('press center list cards with a separate Russian date are read', () => {
  const html = `<div class="lenta-item news"><span class="date">17 октября 2026</span>
    <a href="/press-room/lenta/results/">Операционные результаты за девять месяцев</a></div>`;
  const result = parseCompanyNewsPage(html, 'https://novabev.com/press-room/lenta/', 'Новабев', new Date('2026-10-16T06:00:00Z'), new Date('2026-10-18T09:00:00Z'), parseDocument);
  assert.equal(result.items[0]?.title, 'Операционные результаты за девять месяцев');
  assert.equal(result.items[0]?.source, 'Новабев · Пресс центр компании');
});

void test('old dated press releases do not create false coverage warnings', () => {
  const html = `<div class="news-post"><div class="news-post__date">30 сентября 2026</div>
    <a class="news-post__name" href="/media/news/old/">ГК МД Медикал выплатила дивиденды</a></div>`;
  const result = parseCompanyNewsPage(html, 'https://www.mcclinics.ru/media/news/', 'Мать и дитя',
    new Date('2026-10-16T19:31:00Z'), new Date('2026-10-17T19:31:00Z'), parseDocument);
  assert.deepEqual(result.items, []);
  assert.equal(result.issue, undefined);
});

void test('MOEX page dates and adjacent times are parsed together', () => {
  const html = `<div class="new-moex-news-list__record"><div class="new-moex-news-list__info">
    <div class="new-moex-news-list__date">17.10.2026</div>
    <div class="new-moex-news-list__time">10:10</div></div>
    <div class="new-moex-news-list__body"><a href="/n105171?nt=106" class="new-moex-news-list__link">Московская биржа начала торги паями фонда</a></div></div>`;
  const result = parseCompanyNewsPage(html, 'https://www.moex.com/RU/NEWS/?ncat=106', 'Московская биржа',
    new Date('2026-10-16T19:31:00Z'), new Date('2026-10-17T19:31:00Z'), parseDocument);
  assert.equal(result.items[0]?.publishedAt.toISOString(), '2026-10-17T07:10:00.000Z');
  assert.equal(result.issue, undefined);
});

void test('nested card elements do not become separate undated publications', () => {
  const html = `<article class="news-item"><h3 class="news-item__title">
    <a href="/ru/media/press-releases/story/">Полюс опубликовал сообщение</a></h3>
    <time class="news-item__time" datetime="2026-10-13">13 октября 2026 г., 16:02</time></article>`;
  const result = parseCompanyNewsPage(html, 'https://www.polyus.com/ru/media/press-releases', 'Полюс',
    new Date('2026-10-16T19:31:00Z'), new Date('2026-10-17T19:31:00Z'), parseDocument);
  assert.deepEqual(result.items, []);
  assert.equal(result.issue, undefined);
});

void test('Lukoil press release list reads dated timeline cards', () => {
  const html = `<div class="panel-default panel-time-line panel-collapsible">
    <div class="panel-heading"><a href="/PressCenter/Pressreleases/Pressrelease/story" class="wrap-link">
    <h2><span class="date">17.10.2026 - </span><span class="title">ЛУКОЙЛ сообщил о результатах деятельности</span></h2></a></div></div>`;
  const result = parseCompanyNewsPage(html, 'https://lukoil.ru/PressCenter/Pressreleases', 'Лукойл',
    new Date('2026-10-16T19:31:00Z'), new Date('2026-10-18T19:31:00Z'), parseDocument);
  assert.equal(result.items[0]?.title.includes('ЛУКОЙЛ'), true);
  assert.equal(result.items[0]?.url, 'https://lukoil.ru/PressCenter/Pressreleases/Pressrelease/story');
});
