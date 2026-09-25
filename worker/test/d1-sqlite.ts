import { readFileSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import type { D1Database, D1PreparedStatement, D1Result } from '../env.ts'

const MIGRATION_PATH = fileURLToPath(new URL('../migrations/0001_page_stats.sql', import.meta.url))

type Row = Record<string, unknown>

/** D1 stand-in over node:sqlite so the worker tests exercise the real schema and SQL. */
export function createStatsDatabase(): D1Database {
	const db = new DatabaseSync(':memory:')
	db.exec(readFileSync(MIGRATION_PATH, 'utf8'))

	const statement = (sql: string, values: unknown[] = []): D1PreparedStatement => {
		const params = () => values as SQLInputValue[]
		return {
			bind: (...next: unknown[]) => statement(sql, next),
			async run(): Promise<D1Result> {
				const { changes } = db.prepare(sql).run(...params())
				return { success: true, meta: { changes: Number(changes) }, results: [] }
			},
			async first<T = Row>(): Promise<T | null> {
				const row = db.prepare(sql).get(...params())
				return row === undefined ? null : ({ ...row } as T)
			},
			async all<T = Row>(): Promise<{ results: T[] }> {
				const rows = db.prepare(sql).all(...params())
				return { results: rows.map((row) => ({ ...row })) as T[] }
			},
		}
	}

	return {
		prepare: (query: string) => statement(query),
		async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
			db.exec('BEGIN')
			try {
				const results: D1Result[] = []
				for (const item of statements) results.push(await item.run())
				db.exec('COMMIT')
				return results
			} catch (error) {
				db.exec('ROLLBACK')
				throw error
			}
		},
		async exec(query: string) {
			db.exec(query)
			return null
		},
	}
}
