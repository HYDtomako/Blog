---
title: How do search and asking work here?
description: Curated answers, full-text retrieval, and live AI answers from a same-origin service.
contentType: answer
slug: live-ask
tags: [ask, retrieval]
llmSummary: Asking a question here first matches pre-generated curated answers; when nothing matches, it runs a full-text search over published articles, notes, and answers. Anything still unmatched goes to a live same-origin service that retrieves public content and returns a source-cited, single-turn, quota-limited answer.
question: How do search and asking work here?
shortAnswer: A question matches pre-generated curated answers first; then it searches the published articles, notes, and answers; anything still unmatched goes to a live service that answers from retrieved public content, single-turn and source-cited.
---

**Asking works without a model.** The common questions have pre-generated curated answers that appear as soon as they match; anything else runs a full-text search across the published articles, notes, and answers.

If nothing matches, the question goes to a live same-origin service: it retrieves this site's public content, hands the retrieved passages to a model for a source-grounded answer, and gates the browser entry point with a challenge and quotas. Answers stay single-turn and cite the pages they came from.

Either way there is no long-term memory and no speaking on the author's behalf; when in doubt, trust the linked public page.
