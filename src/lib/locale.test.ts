import assert from 'node:assert/strict';
import test from 'node:test';
import {
	DEFAULT_LOCALE,
	LOCALES,
	PREFIXED_LOCALES,
	alternateLocale,
	localeFromPath,
	localeLabel,
	localePath,
	localePrefix,
	localizedHref,
	localizedSitePath,
	stripLocalePrefix,
} from './locale.ts';

test('locale configuration exposes the default locale and its prefixed siblings', () => {
	assert.equal(DEFAULT_LOCALE, 'zh-CN');
	assert.deepEqual([...LOCALES], ['zh-CN', 'en']);
	assert.deepEqual([...PREFIXED_LOCALES], ['en']);
});

test('localePrefix only prefixes non-default locales', () => {
	assert.equal(localePrefix('zh-CN'), '');
	assert.equal(localePrefix('en'), '/en');
});

test('localeFromPath reads the locale from a request pathname', () => {
	assert.equal(localeFromPath('/'), 'zh-CN');
	assert.equal(localeFromPath('/writing/'), 'zh-CN');
	assert.equal(localeFromPath('/en'), 'en');
	assert.equal(localeFromPath('/en/'), 'en');
	assert.equal(localeFromPath('/en/2026/07/01/slug/'), 'en');
	assert.equal(localeFromPath('/english/'), 'zh-CN');
	assert.equal(localeFromPath(undefined), 'zh-CN');
});

test('stripLocalePrefix removes only the locale segment', () => {
	assert.equal(stripLocalePrefix('/en/writing/'), '/writing/');
	assert.equal(stripLocalePrefix('/en'), '/');
	assert.equal(stripLocalePrefix('/en/'), '/');
	assert.equal(stripLocalePrefix('/writing/'), '/writing/');
	assert.equal(stripLocalePrefix('/en/2026/07/01/slug/'), '/2026/07/01/slug/');
});

test('localePath and localizedHref keep query, hash, and deploy base', () => {
	assert.equal(localePath('zh-CN', '/'), '/');
	assert.equal(localePath('en', '/'), '/en/');
	assert.equal(localePath('en', '/writing/'), '/en/writing/');
	assert.equal(localePath('zh-CN', '/ask?q=hi'), '/ask?q=hi');
	assert.equal(localePath('en', '/ask?q=hi'), '/en/ask?q=hi');
	assert.equal(localizedHref('en', '/writing/'), '/en/writing/');
	assert.equal(localizedHref('en', '/writing/', '/blog/'), '/blog/en/writing/');
	assert.equal(localizedSitePath('en', '/writing/'), '/en/writing/');
	assert.equal(localizedSitePath('zh-CN', '/writing/'), '/writing/');
});

test('alternateLocale and localeLabel support the header language switch', () => {
	assert.equal(alternateLocale('zh-CN'), 'en');
	assert.equal(alternateLocale('en'), 'zh-CN');
	assert.equal(localeLabel('en'), 'EN');
	assert.equal(localeLabel('zh-CN'), '中文');
});
