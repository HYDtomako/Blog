import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveAnonymousActor } from './actor.ts'

const SECRET = 'test-actor-secret'

test('deriveAnonymousActor is a stable 64-character hex pseudonym within one ISO week', async () => {
	const monday = new Date('2026-09-21T00:00:00Z')
	const friday = new Date('2026-09-25T23:59:59Z')
	const actor = await deriveAnonymousActor('203.0.113.7', SECRET, monday)
	assert.match(actor, /^[0-9a-f]{64}$/)
	assert.equal(actor, await deriveAnonymousActor('203.0.113.7', SECRET, friday))
})

test('deriveAnonymousActor separates visitors, secrets, and weeks', async () => {
	const now = new Date('2026-09-25T12:00:00Z')
	const actor = await deriveAnonymousActor('203.0.113.7', SECRET, now)
	assert.notEqual(actor, await deriveAnonymousActor('198.51.100.9', SECRET, now))
	assert.notEqual(actor, await deriveAnonymousActor('203.0.113.7', 'other-secret', now))
	assert.notEqual(actor, await deriveAnonymousActor('203.0.113.7', SECRET, new Date('2026-10-02T12:00:00Z')))
})

test('deriveAnonymousActor never exposes the raw address', async () => {
	const actor = await deriveAnonymousActor('203.0.113.7', SECRET)
	assert.equal(actor.includes('203.0.113.7'), false)
	assert.equal(actor.includes('203'), false)
})
