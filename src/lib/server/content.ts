import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CONTENT_DIR, SHOW_DRAFTS } from '$app/env/private';

/**
 * Articles live in <cwd>/contents/<slug>/{main.md,md.json,include/*}.
 * The path is read on every request, which is what makes adding or editing
 * an article possible without restarting the server.
 */
export const contentRoot = resolve(process.cwd(), CONTENT_DIR || 'contents');

export type ArticleMeta = {
	slug: string;
	title: string;
	date: string | null;
	updated: string | null;
	tags: string[];
	excerpt: string;
	readingMinutes: number;
	wordCount: number;
};

export type Article = ArticleMeta & {
	markdown: string;
	dir: string;
};

export type TagInfo = {
	name: string;
	count: number;
};

const SAFE_SLUG = /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u;

export function isSafeSlug(slug: string): boolean {
	return SAFE_SLUG.test(slug) && !slug.includes('..');
}

export function articlePath(slug: string, file = 'main.md'): string {
	return resolve(contentRoot, slug, file);
}

function firstNonEmptyLine(markdown: string): string {
	return markdown.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
}

export function extractTitle(markdown: string): string {
	const line = firstNonEmptyLine(markdown)
		.replace(/^\s{0,3}#{1,6}\s*/, '')
		.replace(/\s+#{1,6}\s*$/, '')
		.trim();

	return line || 'Untitled';
}

function stripInlineMarkdown(value: string): string {
	return value
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
		.replace(/<[^>]+>/g, ' ')
		.replace(/[`*_~]/g, '')
		.replace(/\\([\\`*_[\]{}()#+\-.!>])/g, '$1')
		.replace(/\s+/g, ' ')
		.trim();
}

function trimExcerpt(value: string, limit = 190): string {
	if (value.length <= limit) return value;
	const cut = value.slice(0, limit - 1);
	const lastSpace = cut.lastIndexOf(' ');
	return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function extractExcerpt(markdown: string): string {
	const withoutCode = markdown
		.replace(/```[\s\S]*?```/g, '\n\n')
		.replace(/~~~[\s\S]*?~~~/g, '\n\n');

	for (const block of withoutCode.split(/\n\s*\n/)) {
		const value = block.trim();
		if (!value) continue;
		if (/^(#{1,6}\s|!\[|<|\||-{3,}|\+{3,}|\*{3,})/.test(value)) continue;

		const text = stripInlineMarkdown(value);
		if (text.length >= 16) return trimExcerpt(text);
	}

	return trimExcerpt(stripInlineMarkdown(withoutCode));
}

export function countWords(markdown: string): number {
	const text = markdown
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/[#>*_`~|]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	return text ? text.split(' ').length : 0;
}

type RawMetadata = {
	created_at?: unknown;
	date?: unknown;
	updated_at?: unknown;
	tags?: unknown;
	draft?: unknown;
};

function normalizeTags(value: unknown): string[] {
	const values = Array.isArray(value)
		? value
		: typeof value === 'string'
			? value.split(',')
			: [];

	const seen = new Set<string>();
	const tags: string[] = [];

	for (const item of values) {
		if (typeof item !== 'string') continue;
		const tag = item.trim();
		if (!tag || seen.has(tag.toLowerCase())) continue;
		seen.add(tag.toLowerCase());
		tags.push(tag);
	}

	return tags;
}

function normalizeDate(value: unknown): string | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	return value.trim();
}

async function readMetadata(dir: string): Promise<RawMetadata> {
	try {
		const raw = await readFile(resolve(dir, 'md.json'), 'utf8');
		const parsed: unknown = JSON.parse(raw);
		return parsed && typeof parsed === 'object' ? (parsed as RawMetadata) : {};
	} catch {
		return {};
	}
}

function buildMeta(slug: string, markdown: string, metadata: RawMetadata): ArticleMeta {
	const wordCount = countWords(markdown);

	return {
		slug,
		title: extractTitle(markdown),
		date: normalizeDate(metadata.created_at) ?? normalizeDate(metadata.date),
		updated: normalizeDate(metadata.updated_at),
		tags: normalizeTags(metadata.tags),
		excerpt: extractExcerpt(markdown),
		readingMinutes: Math.max(1, Math.round(wordCount / 220)),
		wordCount
	};
}

function isDraft(metadata: RawMetadata): boolean {
	return metadata.draft === true || metadata.draft === 'true';
}

export async function getArticle(slug: string): Promise<Article | null> {
	if (!isSafeSlug(slug) || slug.startsWith('.') || slug.startsWith('_')) return null;

	const dir = resolve(contentRoot, slug);
	let markdown: string;

	try {
		markdown = await readFile(resolve(dir, 'main.md'), 'utf8');
	} catch {
		return null;
	}

	const metadata = await readMetadata(dir);
	if (isDraft(metadata) && !SHOW_DRAFTS) return null;

	return {
		...buildMeta(slug, markdown, metadata),
		markdown,
		dir
	};
}

export async function listArticles(): Promise<ArticleMeta[]> {
	let entries;

	try {
		entries = await readdir(contentRoot, { withFileTypes: true });
	} catch {
		return [];
	}

	const articles: ArticleMeta[] = [];

	await Promise.all(
		entries.map(async (entry) => {
			if (!entry.isDirectory()) return;
			if (entry.name.startsWith('.') || entry.name.startsWith('_')) return;
			if (!isSafeSlug(entry.name)) return;

			const dir = resolve(contentRoot, entry.name);

			try {
				const [markdown, metadata] = await Promise.all([
					readFile(resolve(dir, 'main.md'), 'utf8'),
					readMetadata(dir)
				]);

				if (isDraft(metadata) && !SHOW_DRAFTS) return;
				articles.push(buildMeta(entry.name, markdown, metadata));
			} catch {
				// A half-written article should not take the whole list down.
			}
		})
	);

	return articles.sort((a, b) => {
		const aTime = a.date ? Date.parse(`${a.date}T00:00:00Z`) : 0;
		const bTime = b.date ? Date.parse(`${b.date}T00:00:00Z`) : 0;
		if (aTime !== bTime) return bTime - aTime;
		return a.title.localeCompare(b.title);
	});
}

export async function listTags(): Promise<TagInfo[]> {
	const articles = await listArticles();
	const counts = new Map<string, number>();

	for (const article of articles) {
		for (const tag of article.tags) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}

	return [...counts.entries()]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function getArticleNeighbors(slug: string): Promise<{
	older: ArticleMeta | null;
	newer: ArticleMeta | null;
}> {
	const articles = await listArticles();
	const index = articles.findIndex((article) => article.slug === slug);

	if (index === -1) return { older: null, newer: null };

	return {
		older: articles[index + 1] ?? null,
		newer: articles[index - 1] ?? null
	};
}

