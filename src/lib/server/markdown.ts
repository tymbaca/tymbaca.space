import { stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeStringify from 'rehype-stringify';
import rehypeShiki from '@shikijs/rehype';
import { visit } from 'unist-util-visit';
import { toString as hastToString } from 'hast-util-to-string';
import type { Root as MdastRoot, Image, Link, Parent, RootContent } from 'mdast';
import type { Element, Root as HastRoot } from 'hast';
import type { BuiltinLanguage } from 'shiki';
import { contentRoot, type Article } from './content';

export type SvelteInclude = {
	id: string;
	url: string;
	props: Record<string, unknown>;
	name: string;
};

export type Heading = {
	id: string;
	text: string;
	level: 2 | 3;
};

export type RenderedArticle = {
	html: string;
	headings: Heading[];
	includes: SvelteInclude[];
};

type IncludeContext = {
	articleDir: string;
	includes: SvelteInclude[];
};

const SHIKI_LANGUAGES: BuiltinLanguage[] = [
	'javascript',
	'js',
	'typescript',
	'ts',
	'svelte',
	'html',
	'css',
	'scss',
	'json',
	'jsonc',
	'bash',
	'shell',
	'shellscript',
	'markdown',
	'md',
	'python',
	'py',
	'rust',
	'go',
	'sql',
	'yaml',
	'yml',
	'diff',
	'toml'
];

function isExternalOrAbsoluteUrl(url: string): boolean {
	return /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(url);
}

function splitIncludeUrl(rawUrl: string): URL | null {
	if (!rawUrl || isExternalOrAbsoluteUrl(rawUrl)) return null;

	try {
		return new URL(rawUrl, 'http://content.local');
	} catch {
		return null;
	}
}

function resolveLocalFile(rawUrl: string, baseDir: string): string | null {
	const pathPart = rawUrl.split(/[?#]/, 1)[0];
	let decoded: string;

	try {
		decoded = decodeURIComponent(pathPart);
	} catch {
		return null;
	}

	const file = resolve(baseDir, decoded);
	const rel = relative(baseDir, file);

	if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null;
	return file;
}

async function isFile(path: string): Promise<boolean> {
	try {
		const info = await stat(path);
		return info.isFile();
	} catch {
		return false;
	}
}

function publicUrlFor(file: string): string {
	return `/content/${relative(contentRoot, file)
		.split(sep)
		.filter(Boolean)
		.map((part) => encodeURIComponent(part))
		.join('/')}`;
}

function componentUrlFor(file: string, version: string): string {
	return `/components/${relative(contentRoot, file)
		.split(sep)
		.filter(Boolean)
		.map((part) => encodeURIComponent(part))
		.join('/')}?v=${version}`;
}

function coerceProp(value: string): unknown {
	if (value === 'true') return true;
	if (value === 'false') return false;
	if (value === 'null') return null;
	if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return Number(value);
	if (value.startsWith('{') || value.startsWith('[')) {
		try {
			return JSON.parse(value);
		} catch {
			return value;
		}
	}
	return value;
}

function componentProps(url: URL, alt: string | null | undefined): Record<string, unknown> {
	const props: Record<string, unknown> = {};

	for (const [key, value] of url.searchParams) {
		if (key.startsWith('_')) continue;
		props[key] = coerceProp(value);
	}

	if (alt && alt.trim() && !('label' in props)) {
		props.label = alt.trim();
	}

	return props;
}

function placeholderFor(include: SvelteInclude): string {
	return `<span class="svelte-include" data-svelte-include="${include.id}"><span class="svelte-include__fallback"><span class="svelte-include__dot"></span><span>Interactive component</span></span></span>`;
}

function remarkContentIncludes(context: IncludeContext) {
	return async (tree: MdastRoot) => {
		const pending: Array<{
			node: Image | Link;
			parent: Parent;
			index: number;
			replacement?: RootContent;
		}> = [];

		visit(tree, (node, index, parent) => {
			if (node.type !== 'image' && node.type !== 'link') return;
			if (!parent || typeof index !== 'number') return;

			pending.push({
				node: node as Image | Link,
				parent: parent as Parent,
				index
			});
		});

		await Promise.all(
			pending.map(async (entry) => {
				const url = splitIncludeUrl(entry.node.url);
				if (!url) return;

				const file = resolveLocalFile(entry.node.url, context.articleDir);
				if (!file || !(await isFile(file))) return;

				const extension = extname(file).toLowerCase();

				if (extension === '.svelte') {
					const info = await stat(file);
					const version = `${Math.trunc(info.mtimeMs).toString(36)}${info.size.toString(36)}`;
					const id = String(context.includes.length);
					const alt = entry.node.type === 'image' ? entry.node.alt : null;

					const include: SvelteInclude = {
						id,
						url: componentUrlFor(file, version),
						props: componentProps(url, alt),
						name: basename(file)
					};

					context.includes.push(include);
					entry.replacement = {
						type: 'html',
						value: placeholderFor(include)
					} as RootContent;
					return;
				}

				// Ordinary files (images, PDFs, …) are served by the content route.
				if (entry.node.type === 'image') {
					entry.node.url = publicUrlFor(file);
					return;
				}

				entry.node.url = publicUrlFor(file);
			})
		);

		for (const entry of pending) {
			if (entry.replacement) {
				entry.parent.children[entry.index] = entry.replacement;
			}
		}
	};
}

function rehypeCollectHeadings(headings: Heading[]) {
	return (tree: HastRoot) => {
		visit(tree, 'element', (node: Element) => {
			if (node.tagName !== 'h2' && node.tagName !== 'h3') return;

			const id = node.properties?.id;
			if (typeof id !== 'string') return;

			const text = hastToString(node).trim();
			if (!text) return;

			headings.push({
				id,
				text,
				level: node.tagName === 'h2' ? 2 : 3
			});
		});
	};
}

function rehypeExternalLinks() {
	return (tree: HastRoot) => {
		visit(tree, 'element', (node: Element) => {
			if (node.tagName !== 'a') return;

			const href = node.properties?.href;
			if (typeof href !== 'string' || !/^https?:\/\//i.test(href)) return;

			node.properties.target = '_blank';
			node.properties.rel = ['noreferrer', 'noopener'];
		});
	};
}

function rehypeImageAttributes() {
	return (tree: HastRoot) => {
		visit(tree, 'element', (node: Element) => {
			if (node.tagName !== 'img') return;
			node.properties.loading = 'lazy';
			node.properties.decoding = 'async';
		});
	};
}

function buildProcessor(context: IncludeContext, headings: Heading[]) {
	return unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkContentIncludes, context)
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeRaw)
		.use(rehypeSlug)
		.use(rehypeCollectHeadings, headings)
		.use(rehypeAutolinkHeadings, {
			behavior: 'append',
			properties: {
				className: ['heading-anchor'],
				ariaHidden: 'true',
				tabIndex: -1
			},
			content: {
				type: 'element',
				tagName: 'span',
				properties: {},
				children: [{ type: 'text', value: '#' }]
			}
		})
		.use(rehypeExternalLinks)
		.use(rehypeImageAttributes)
		.use(rehypeShiki, {
			theme: 'rose-pine-dawn',
			langs: SHIKI_LANGUAGES,
			defaultLanguage: 'text',
			lazy: true,
			addLanguageClass: true,
			onError: (error: unknown) => {
				console.warn('[markdown] shiki:', error instanceof Error ? error.message : error);
			}
		})
		.use(rehypeStringify);
}

function stripTitleLine(markdown: string): string {
	const lines = markdown.split(/\r?\n/);
	const index = lines.findIndex((line) => line.trim().length > 0);
	if (index === -1) return markdown;

	// The first non-empty line is the article title. It is rendered in the
	// page header, so remove it here to avoid showing it twice.
	lines.splice(index, 1);
	return lines.join('\n');
}

export async function renderArticle(article: Article): Promise<RenderedArticle> {
	const includes: SvelteInclude[] = [];
	const headings: Heading[] = [];

	const context: IncludeContext = {
		articleDir: dirname(resolve(article.dir, 'main.md')),
		includes
	};

	const processor = buildProcessor(context, headings);
	const result = await processor.process(stripTitleLine(article.markdown));

	return {
		html: String(result),
		headings,
		includes
	};
}
