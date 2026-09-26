import assert from "node:assert/strict";
import test from "node:test";
import {
  aiSearchOptions,
  FALLBACK_GROUNDING_SCORE,
  MIN_GROUNDING_SCORE,
  resolveMinGroundingScore,
  sourceResults,
} from "./retrieval.ts";

test("sourceResults drops chunks below the minimum grounding score", () => {
  const results = sourceResults({
    search_query: "test",
    chunks: [
      {
        id: "weak",
        type: "chunk",
        score: 0.46,
        text: "irrelevant",
        item: { key: "/weak", metadata: { title: "Weak" } },
      },
      {
        id: "strong",
        type: "chunk",
        score: 0.55,
        text: "relevant",
        item: { key: "/strong", metadata: { title: "Strong" } },
      },
    ],
  }, "https://refined-x.com");
  assert.equal(results.length, 1);
  assert.equal(results[0].name, "Strong");
  const grounding = results[0].grounding as { score?: number };
  assert.equal(grounding.score, 0.55);
});

test("sourceResults returns empty when every chunk is below threshold", () => {
  const results = sourceResults({
    search_query: "noise",
    chunks: [{
      id: "weak",
      type: "chunk",
      score: MIN_GROUNDING_SCORE - 0.01,
      text: "noise",
      item: { key: "/noise", metadata: { title: "Noise" } },
    }],
  }, "https://refined-x.com");
  assert.deepEqual(results, []);
});

test("resolveMinGroundingScore reads the deployment var and falls back to the constant", () => {
  assert.equal(resolveMinGroundingScore({}), MIN_GROUNDING_SCORE);
  assert.equal(resolveMinGroundingScore({ MIN_GROUNDING_SCORE: "" }), MIN_GROUNDING_SCORE);
  assert.equal(resolveMinGroundingScore({ MIN_GROUNDING_SCORE: "not-a-number" }), MIN_GROUNDING_SCORE);
  assert.equal(resolveMinGroundingScore({ MIN_GROUNDING_SCORE: "0" }), MIN_GROUNDING_SCORE);
  assert.equal(resolveMinGroundingScore({ MIN_GROUNDING_SCORE: "1" }), MIN_GROUNDING_SCORE);
  assert.equal(resolveMinGroundingScore({ MIN_GROUNDING_SCORE: "0.36" }), 0.36);
});

test("aiSearchOptions keeps the index filter at or below the caller's floor", () => {
  assert.equal(aiSearchOptions().retrieval.match_threshold, 0.45);
  assert.equal(aiSearchOptions(0.36).retrieval.match_threshold, 0.36);
  assert.equal(aiSearchOptions(FALLBACK_GROUNDING_SCORE).retrieval.match_threshold, FALLBACK_GROUNDING_SCORE);
  assert.equal(aiSearchOptions(0.6).retrieval.match_threshold, 0.45);
});
