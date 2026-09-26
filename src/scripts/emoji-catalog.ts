/** Curated monochrome-chrome emoji picker content. Group labels live in `src/i18n`, keyed by these ids. */

export type EmojiGroupId = 'faces' | 'gestures' | 'hearts' | 'nature' | 'objects';

export type EmojiGroup = {
	id: EmojiGroupId;
	items: readonly string[];
};

export const EMOJI_GROUPS: readonly EmojiGroup[] = [
	{
		id: 'faces',
		items: [
			'😀', '😄', '😁', '😆', '😂', '🙂', '🙃', '😉', '😊', '😇',
			'🥰', '😍', '😘', '😜', '🤪', '🤔', '🤨', '😐', '😴', '🥳',
		],
	},
	{
		id: 'gestures',
		items: [
			'👍', '👎', '👌', '👏', '🙌', '🙏', '💪', '👋', '🤝', '🤙',
			'✊', '✋', '🖖', '🤟', '🤘', '🤞', '🙇', '💁', '🙋', '🤷',
		],
	},
	{
		id: 'hearts',
		items: [
			'🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💖', '💗',
			'💓', '💞', '💕', '💘', '💝', '💟', '💔', '💌', '🩷', '🫶',
		],
	},
	{
		id: 'nature',
		items: [
			'🌿', '🍀', '🌱', '🌳', '🌲', '🌴', '🌵', '🌸', '🌹', '🌻',
			'🌼', '🌷', '🌈', '🌙', '⭐', '🌟', '✨', '🔥', '🌊', '🍃',
		],
	},
	{
		id: 'objects',
		items: [
			'📚', '📖', '📝', '💡', '🔍', '🎯', '🎵', '🎶', '🎁', '🏆',
			'🥇', '⏰', '📷', '🎨', '🧩', '🔔', '📌', '🚀', '☕', '🍵',
		],
	},
];
