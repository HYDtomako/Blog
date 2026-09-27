import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SIGNAL_DEPTH,
  MIN_SIGNAL_DEPTH,
  domainOf,
  formatDepth,
  mergeLinkMetadata,
  normalizeSubmittedUrl,
  parseHtmlMetadata,
  signalDepth,
} from "./link-metadata.ts";

test("submitted url normalizes to an absolute http(s) address", () => {
  assert.equal(normalizeSubmittedUrl("example.com")?.href, "https://example.com/");
  assert.equal(normalizeSubmittedUrl("  https://example.com/blog  ")?.href, "https://example.com/blog");
  assert.equal(normalizeSubmittedUrl("http://example.com/")?.href, "http://example.com/");
  assert.equal(normalizeSubmittedUrl("https://example.com/a?b=1#frag")?.href, "https://example.com/a?b=1");
  assert.equal(normalizeSubmittedUrl("https://Example.COM/Path")?.href, "https://example.com/Path");
  assert.equal(normalizeSubmittedUrl("例え.jp")?.hostname, "xn--r8jz45g.jp");
});

test("submitted url rejects anything that is not a public site", () => {
  const rejected = [
    "",
    "   ",
    "localhost",
    "http://localhost:8787/",
    "http://127.0.0.1/",
    "http://10.0.0.7/",
    "http://192.168.1.10/admin",
    "http://service.local/",
    "http://box.internal/",
    "http://intranet/",
    "javascript:alert(1)",
    "mailto:hi@example.com",
    "ftp://example.com/file",
    "https://user:secret@example.com/",
    "https://[::1]/",
    `https://example.com/${"a".repeat(3000)}`,
  ];
  for (const value of rejected) assert.equal(normalizeSubmittedUrl(value), null, value);
  assert.equal(normalizeSubmittedUrl(42), null);
  assert.equal(normalizeSubmittedUrl(undefined), null);
});

test("signal depth is stable per url and stays inside the world range", () => {
  const urls = ["https://astro.build/", "https://vite.dev/", "https://example.com/"];
  for (const url of urls) {
    const depth = signalDepth(url);
    assert.equal(depth, signalDepth(url));
    assert.ok(depth >= MIN_SIGNAL_DEPTH && depth <= MAX_SIGNAL_DEPTH, `${url} → ${depth}`);
    assert.ok(Number.isSafeInteger(depth));
  }
  assert.notEqual(signalDepth("https://astro.build/"), signalDepth("https://astro.build"));
  assert.equal(formatDepth(86), "086m");
  assert.equal(formatDepth(900), "900m");
});

test("domain drops the www prefix and survives junk", () => {
  assert.equal(domainOf("https://www.example.com/a"), "example.com");
  assert.equal(domainOf("https://blog.example.com/"), "blog.example.com");
  assert.equal(domainOf("not a url"), "not a url");
});

test("html metadata prefers og tags over the title tag", () => {
  const html = `
    <html><head>
      <title>Plain title</title>
      <meta property="og:title" content="Open Graph title">
      <meta name="description" content="Meta description">
    </head></html>`;
  const metadata = parseHtmlMetadata(html, "https://example.com/post");
  assert.equal(metadata.title, "Open Graph title");
  assert.equal(metadata.description, "Meta description");
  assert.equal(metadata.icon, "https://example.com/favicon.ico");
});

test("html metadata falls back to title and hides a missing description", () => {
  const metadata = parseHtmlMetadata(
    "<html><head><title>  Only  a  title </title></head></html>",
    "https://example.com/",
  );
  assert.equal(metadata.title, "Only a title");
  assert.equal(metadata.description, undefined);
  assert.deepEqual(parseHtmlMetadata("", "https://example.com/").title, undefined);
});

test("html metadata tolerates attribute order, single quotes, and entities", () => {
  const html = `<head>
    <meta content='A &amp; B &#8212; c' name='description'>
    <meta content="og first" property="og:description">
    <meta property="og:title" content='Caf&#233; &quot;notes&quot;'>
  </head>`;
  const metadata = parseHtmlMetadata(html, "https://example.com/");
  assert.equal(metadata.title, "Café \"notes\"");
  assert.equal(metadata.description, "og first");
});

test("icon rel priority walks icon, shortcut icon, apple-touch-icon and resolves relative hrefs", () => {
  const apple = `<link rel="apple-touch-icon" href="/touch.png"><link rel="icon" href="icons/small.svg">`;
  assert.equal(parseHtmlMetadata(apple, "https://example.com/deep/page").icon, "https://example.com/deep/icons/small.svg");

  const shortcut = `<link rel="shortcut icon" href="//cdn.example.com/fav.ico">`;
  assert.equal(parseHtmlMetadata(shortcut, "https://example.com/").icon, "https://cdn.example.com/fav.ico");

  const touchOnly = `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`;
  assert.equal(parseHtmlMetadata(touchOnly, "https://example.com/").icon, "https://example.com/apple-touch-icon.png");

  const none = `<link rel="stylesheet" href="/style.css">`;
  assert.equal(parseHtmlMetadata(none, "https://example.com/x").icon, "https://example.com/favicon.ico");

  const inline = `<link rel="icon" href="data:image/svg+xml,<svg/>">`;
  assert.equal(parseHtmlMetadata(inline, "https://example.com/").icon, "https://example.com/favicon.ico");
});

test("merge keeps authored fields and only fills the gaps", () => {
  const authored = {
    url: "https://example.com/",
    name: "手写的名字",
    description: "",
  };
  const merged = mergeLinkMetadata(authored, {
    title: "Fetched title",
    description: "Fetched description",
    icon: "https://example.com/icon.png",
  });
  assert.deepEqual(merged, {
    url: "https://example.com/",
    name: "手写的名字",
    description: "Fetched description",
    icon: "https://example.com/icon.png",
  });

  const empty = mergeLinkMetadata({ url: "https://example.com/" }, {});
  assert.deepEqual(empty, { url: "https://example.com/" });
  assert.deepEqual(Object.keys(empty), ["url"]);
});
