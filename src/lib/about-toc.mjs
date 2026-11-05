/** Right-rail sections on /about/. Titles match the English h2s. Collaboration is not listed. */
export const ABOUT_TOC = [
	{ id: 'about-me', title: 'About Me' },
	{ id: 'hobbies', title: 'Hobbies' },
	{ id: 'social-networks', title: 'Social Networks' },
	{ id: 'about-blog', title: 'About Blog' },
	{ id: 'about-contact', title: 'Contact Me' },
];

const RESUME_HEADING_IDS = Object.fromEntries(
	ABOUT_TOC.filter((item) => item.id !== 'about-contact').map((item) => [item.title, item.id]),
);

/** Stable id for a resume h2, or undefined when the heading is not one of the four body sections. */
export function resumeHeadingId(text) {
	return RESUME_HEADING_IDS[String(text ?? '').trim()];
}
