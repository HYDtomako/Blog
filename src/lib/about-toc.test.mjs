import assert from 'node:assert/strict';
import test from 'node:test';
import { ABOUT_TOC, resumeHeadingId } from './about-toc.mjs';

test('the about rail lists the five body sections and not collaboration', () => {
	assert.deepEqual(
		ABOUT_TOC.map((item) => item.title),
		['About Me', 'Hobbies', 'Social Networks', 'About Blog', 'Contact Me'],
	);
	assert.equal(ABOUT_TOC.some((item) => item.id === 'about-cooperation'), false);
	assert.equal(ABOUT_TOC.at(-1)?.id, 'about-contact');
});

test('resume headings keep stable ids', () => {
	assert.equal(resumeHeadingId('About Me'), 'about-me');
	assert.equal(resumeHeadingId(' Social Networks '), 'social-networks');
	assert.equal(resumeHeadingId('合作交流'), undefined);
	assert.equal(resumeHeadingId('Contact Me'), undefined);
});
