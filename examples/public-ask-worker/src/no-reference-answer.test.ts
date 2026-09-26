import assert from "node:assert/strict";
import test from "node:test";
import {
  NO_REFERENCE_ANSWER_VARIANTS,
  NO_REFERENCE_ANSWER_VARIANTS_EN,
  selectNoReferenceAnswer,
} from "./no-reference-answer.ts";

const APPROVED_VARIANTS = [
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

/** Resolve the guide tokens the way the worker does for a deployment origin. */
const resolveGuides = (text: string, prefix = "") =>
  text
    .replace(/\{answers\}/g, `${prefix}/answers/`)
    .replace(/\{topics\}/g, `${prefix}/topics/`);

test("no-reference answers are exactly the approved variants", () => {
  assert.deepEqual(NO_REFERENCE_ANSWER_VARIANTS, APPROVED_VARIANTS);
});

test("no-reference selection is injectable and deterministic in tests", () => {
  assert.equal(selectNoReferenceAnswer(() => 0), resolveGuides(APPROVED_VARIANTS[0]));
  assert.equal(selectNoReferenceAnswer(() => 0.999999), resolveGuides(APPROVED_VARIANTS[9]));
  assert.equal(selectNoReferenceAnswer(() => 1), resolveGuides(APPROVED_VARIANTS[9]));
});

test("every variant tells the visitor what to try next", () => {
  for (const variant of NO_REFERENCE_ANSWER_VARIANTS) {
    assert.match(variant, /英文关键词/, variant);
    assert.match(variant, /\{answers\}|\{topics\}/, variant);
  }
  for (const variant of NO_REFERENCE_ANSWER_VARIANTS_EN) {
    assert.match(variant, /English keywords/, variant);
    assert.match(variant, /\{answers\}|\{topics\}/, variant);
  }
});

test("guide links follow the site locale routing and deployment origin", () => {
  assert.equal(
    selectNoReferenceAnswer(() => 0, "zh-CN", "https://refined-x.com/"),
    resolveGuides(APPROVED_VARIANTS[0], "https://refined-x.com"),
  );
  assert.equal(
    selectNoReferenceAnswer(() => 0, "en", "https://refined-x.com"),
    resolveGuides(NO_REFERENCE_ANSWER_VARIANTS_EN[0], "https://refined-x.com/en"),
  );
  assert.match(selectNoReferenceAnswer(() => 0, "en", "https://refined-x.com"), /https:\/\/refined-x\.com\/en\/answers\//);
});

test("returns localized English no-reference answers", () => {
  assert.equal(selectNoReferenceAnswer(() => 0, "en"), resolveGuides(NO_REFERENCE_ANSWER_VARIANTS_EN[0], "/en"));
  assert.match(selectNoReferenceAnswer(() => 0, "en"), /public evidence/);
});
