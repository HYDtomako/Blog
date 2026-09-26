import type { SupportedLanguage } from "./instance-policy.ts";

/** Entry points the canned answer points visitors at when retrieval grounds nothing. */
const GUIDE_TOKENS = /\{answers\}|\{topics\}/g;

export const NO_REFERENCE_ANSWER_VARIANTS = [
  "我在当前公开资料里没有找到足够依据回答这个问题。可以换一个更具体的关键词再问一次，英文关键词通常比中文更容易命中站内索引。也可以直接浏览站内入口：{answers} · {topics}",
  "这个问题暂时没有可引用的公开资料支撑，我不会编造作者没有公开表达过的观点。建议换成更贴近文章标题的说法，或直接改用英文关键词再问一次。站内入口：{answers} · {topics}",
  "站内公开内容还不足以回答这个问题。可以把问题缩小到像 AI Agent、前端工程、个人知识管理这样的具体主题，英文关键词的命中率通常更高；先翻翻 {answers} 和 {topics} 也常能找到线索。",
  "我没有检索到能支撑结论的公开资料，所以先不强答。给我一个更具体的关键词或文章线索会好很多，英文关键词尤其有效。站内入口：{answers} · {topics}",
  "这个问题在现有公开资料中没有足够证据。可以把它拆成一个更窄的问题，或者换成英文关键词再试一次；也可以先去 {answers} 与 {topics} 看看有没有现成答案。",
  "公开资料里暂时看不到明确答案。试着限定一个具体主题或时间范围，英文关键词往往更容易命中索引。站内入口：{answers} · {topics}",
  "我没有找到可靠的站内参考来回答它。当前问答只基于已公开内容，不会用猜测补齐空白；换一组关键词（英文关键词更容易命中的）或先浏览 {answers} 会更有帮助。",
  "这个问题可能超出了当前公开语料覆盖范围。换成具体文章、项目、技术方向或作者经历相关的问题会更容易有依据，英文关键词的命中率同样更高。站内入口：{answers} · {topics}",
  "现有公开内容不足以形成回答。可以补一个关键词，或者问“有哪些文章提到过这个主题”；英文关键词更容易命中站内索引。站内入口：{answers} · {topics}",
  "我暂时找不到足够材料支撑这个答案，为了准确不会硬凑结论。换一个角度再问，或改用英文关键词试试；也可以先从 {topics} 里挑一个主题。",
] as const;

export const NO_REFERENCE_ANSWER_VARIANTS_EN = [
  "I could not find enough public evidence on this site to answer that reliably. Try different or more specific keywords — English keywords often match this index better — or browse the on-site entry points: {answers} · {topics}",
  "The current public content does not support a confident answer, and I will not fill the gap with guesses. Rephrase it closer to an article title, or try English keywords. On-site entry points: {answers} · {topics}",
  "There is not enough relevant material on this site to answer that yet. Narrow it to a concrete topic or project; English keywords usually retrieve better from this index. {answers} and {topics} are good places to look.",
  "I did not find a reliable source for that question, so I will stop rather than invent an answer. A more specific clue helps, and English keywords retrieve better. On-site entry points: {answers} · {topics}",
  "This appears to be outside the current public corpus. Ask about a concrete article, project, topic, or published experience instead, ideally with English keywords. Start from {answers} or {topics}.",
] as const;

/**
 * The static site serves the default locale at the root and every other locale
 * under `/<locale>/`, so guide links follow the same rule.
 */
function guideTargets(siteUrl: string | undefined, language: SupportedLanguage) {
  const prefix = language === "zh-CN" ? "" : `/${language}`;
  const base = siteUrl ? siteUrl.replace(/\/+$/, "") : "";
  return {
    "{answers}": `${base}${prefix}/answers/`,
    "{topics}": `${base}${prefix}/topics/`,
  };
}

function fillGuides(text: string, language: SupportedLanguage, siteUrl?: string): string {
  const targets = guideTargets(siteUrl, language);
  return text.replace(GUIDE_TOKENS, (token) => targets[token as keyof typeof targets]);
}

export function selectNoReferenceAnswer(
  random = Math.random,
  language: SupportedLanguage = "zh-CN",
  siteUrl?: string,
): string {
  const variants = language === "zh-CN"
    ? NO_REFERENCE_ANSWER_VARIANTS
    : NO_REFERENCE_ANSWER_VARIANTS_EN;
  const index = Math.min(
    variants.length - 1,
    Math.floor(random() * variants.length),
  );
  return fillGuides(variants[Math.max(0, index)], language, siteUrl);
}
