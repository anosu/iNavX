import { sql } from 'drizzle-orm'
import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import type { Application, Engine, Settings } from '../../shared/catalog.js'

export const categories = sqliteTable('categories', {
	id: text('id').primaryKey(),
	name: text('name').notNull().unique(),
	sortOrder: integer('sort_order').notNull(),
})
export const sites = sqliteTable(
	'sites',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		url: text('url').notNull(),
		normalizedUrl: text('normalized_url').notNull(),
		description: text('description').notNull(),
		categoryId: text('category_id')
			.notNull()
			.references(() => categories.id),
		iconUrl: text('icon_url').notNull(),
		pinned: integer('pinned', { mode: 'boolean' }).notNull(),
		tags: text('tags', { mode: 'json' }).$type<string[]>().notNull(),
		sortOrder: integer('sort_order').notNull(),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull(),
		deletedAt: text('deleted_at'),
	},
	(table) => [
		uniqueIndex('sites_active_url')
			.on(table.normalizedUrl)
			.where(sql`${table.deletedAt} IS NULL`),
	],
)
export const configuration = sqliteTable('configuration', {
	id: integer('id').primaryKey(),
	settings: text('settings', { mode: 'json' }).$type<Settings>().notNull(),
	engines: text('engines', { mode: 'json' }).$type<Engine[]>().notNull(),
	revision: integer('revision').notNull(),
})
export const admin = sqliteTable('admin', {
	id: integer('id').primaryKey(),
	username: text('username').notNull(),
	passwordHash: text('password_hash').notNull(),
})
export const sessions = sqliteTable('sessions', {
	tokenHash: text('token_hash').primaryKey(),
	csrf: text('csrf').notNull(),
	expiresAt: integer('expires_at').notNull(),
})
export const applications = sqliteTable(
	'applications',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		url: text('url').notNull(),
		normalizedUrl: text('normalized_url').notNull(),
		description: text('description').notNull(),
		suggestedCategory: text('suggested_category').notNull(),
		status: text('status').$type<Application['status']>().notNull(),
		reviewNote: text('review_note').notNull(),
		siteId: text('site_id').references(() => sites.id),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull(),
		reviewedAt: text('reviewed_at'),
	},
	(table) => [
		uniqueIndex('applications_pending_url')
			.on(table.normalizedUrl)
			.where(sql`${table.status} = 'pending'`),
	],
)
