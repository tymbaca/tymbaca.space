import { error } from '@sveltejs/kit';
import { getArticle, getArticleNeighbors, isSafeSlug } from '#lib/server/content';
import { renderArticle } from '#lib/server/markdown';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	if (!isSafeSlug(params.slug)) {
		error(404, 'Article not found');
	}

	const article = await getArticle(params.slug);
	if (!article) {
		error(404, 'Article not found');
	}

	const [rendered, neighbors] = await Promise.all([
		renderArticle(article),
		getArticleNeighbors(article.slug)
	]);

	const { markdown: _markdown, dir: _dir, ...meta } = article;

	setHeaders({ 'cache-control': 'no-cache' });

	return {
		article: meta,
		html: rendered.html,
		headings: rendered.headings,
		includes: rendered.includes,
		older: neighbors.older,
		newer: neighbors.newer
	};
};
