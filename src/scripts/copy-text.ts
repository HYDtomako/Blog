/** How long the "copied" label stays before the original text returns. */
export const COPY_FEEDBACK_MS = 1600;

/** Bare address or id. Strips a mailto: prefix so the clipboard never receives a link. */
export function copyValueFromContact(raw: string | undefined): string {
	return (raw ?? '').trim().replace(/^mailto:/i, '');
}

/** Copy `text` with the provided writer. Empty text and a rejected writer both fail. */
export async function copyText(text: string, writeText: (value: string) => Promise<void>): Promise<boolean> {
	const value = text.trim();
	if (!value) return false;
	try {
		await writeText(value);
		return true;
	} catch {
		return false;
	}
}

async function writeClipboard(text: string): Promise<void> {
	const clipboard = navigator.clipboard;
	if (clipboard?.writeText) {
		try {
			await clipboard.writeText(text);
			return;
		} catch {
			// Fall through to the selection fallback when the async API is blocked.
		}
	}
	const area = document.createElement('textarea');
	area.value = text;
	area.setAttribute('readonly', '');
	area.style.position = 'fixed';
	area.style.top = '0';
	area.style.left = '-9999px';
	document.body.append(area);
	area.select();
	const ok = document.execCommand('copy');
	area.remove();
	if (!ok) throw new Error('copy failed');
}

const feedbackTimers = new WeakMap<HTMLButtonElement, number>();

function showCopyFeedback(button: HTMLButtonElement, message: string) {
	const label = button.querySelector<HTMLElement>('[data-copy-label]');
	const live = button.querySelector<HTMLElement>('[data-copy-live]');
	if (!label) return;
	if (!label.dataset.copyOriginal) label.dataset.copyOriginal = label.textContent ?? '';
	label.textContent = message;
	if (live) live.textContent = message;
	button.dataset.copied = 'true';
	const previous = feedbackTimers.get(button);
	if (previous) window.clearTimeout(previous);
	const timer = window.setTimeout(() => {
		label.textContent = label.dataset.copyOriginal ?? '';
		if (live) live.textContent = '';
		delete button.dataset.copied;
		feedbackTimers.delete(button);
	}, COPY_FEEDBACK_MS);
	feedbackTimers.set(button, timer);
}

/** Buttons with `data-copy-text` copy that value and briefly show `data-copied-label`. */
export function initCopyButtons(root: ParentNode = document) {
	for (const button of root.querySelectorAll<HTMLButtonElement>('[data-copy-text]')) {
		if (button.dataset.copyBound === 'true') continue;
		button.dataset.copyBound = 'true';
		button.addEventListener('click', (event) => {
			event.preventDefault();
			const value = button.dataset.copyText ?? '';
			const copied = button.dataset.copiedLabel ?? 'Copied';
			const failed = button.dataset.copyFailedLabel ?? copied;
			void copyText(value, writeClipboard).then((ok) => {
				showCopyFeedback(button, ok ? copied : failed);
			});
		});
	}
}
