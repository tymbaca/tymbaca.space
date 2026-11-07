import type { PageServerLoad } from './$types';
import { listArticles, listTags } from '#lib/server/content';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
	const [allArticles, tags] = await Promise.all([listArticles(), listTags()]);
	const requestedTag = url.searchParams.get('tag')?.trim() ?? '';
	const activeTag = requestedTag
		? (tags.find((tag) => tag.name.toLowerCase() === requestedTag.toLowerCase())?.name ?? requestedTag)
		: null;

	const articles = activeTag
		? allArticles.filter((article) =>
				article.tags.some((tag) => tag.toLowerCase() === activeTag.toLowerCase())
			)
		: allArticles;

	setHeaders({ 'cache-control': 'no-cache' });

	return {
		articles,
		tags,
		activeTag,
		total: allArticles.length
	};
};
