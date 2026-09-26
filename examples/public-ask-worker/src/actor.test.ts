import assert from "node:assert/strict";
import test from "node:test";
import { deriveAnonymousActor, MissingActorKeyError } from "./actor.ts";

test("keeps an actor stable within an ISO week and rotates it across weeks", async () => {
  const first = await deriveAnonymousActor("203.0.113.7", "test-secret", new Date("2026-07-01"));
  const sameWeek = await deriveAnonymousActor("203.0.113.7", "test-secret", new Date("2026-07-05"));
  const nextWeek = await deriveAnonymousActor("203.0.113.7", "test-secret", new Date("2026-07-06"));
  assert.equal(first, sameWeek);
  assert.notEqual(first, nextWeek);
});

test("refuses to hash an actor with a missing or blank secret", async () => {
  for (const secret of [undefined, null, "", "   "]) {
    await assert.rejects(
      () => deriveAnonymousActor("203.0.113.7", secret as unknown as string, new Date("2026-07-01")),
      (error: unknown) => error instanceof MissingActorKeyError,
    );
  }
});

