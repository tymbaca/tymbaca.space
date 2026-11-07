<script lang="ts">
	import ArticleBody from '#lib/components/ArticleBody.svelte';
	import ArticleToc from '#lib/components/ArticleToc.svelte';
	import ReadingProgress from '#lib/components/ReadingProgress.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const article = $derived(data.article);
	const description = $derived(
		article.excerpt || `${article.title} — a note on tymbaca.space.`
	);
</script>

<svelte:head>
	<title>{article.title} — tymbaca.space</title>
	<meta name="description" content={description} />
	<meta property="og:title" content={article.title} />
	<meta property="og:description" content={description} />
	<meta property="og:type" content="article" />
	{#if article.date}<meta property="article:published_time" content={article.date} />{/if}
	{#each article.tags as tag}
		<meta property="article:tag" content={tag} />
	{/each}
</svelte:head>

<ReadingProgress />

<article class="article-page shell">
	<nav class="breadcrumb" aria-label="Breadcrumb">
		<a href="/articles"><span aria-hidden="true">←</span> index</a>
	</nav>

	<header class="article-header">
		<div class="meta">
			<time datetime={article.date ?? undefined}>{article.date ?? 'undated'}</time>
			<span class="sep" aria-hidden="true">/</span>
			<span>{article.readingMinutes} min read</span>
			{#if article.updated && article.updated !== article.date}
				<span class="sep" aria-hidden="true">/</span>
				<span>updated {article.updated}</span>
			{/if}
			{#if article.tags.length > 0}
				<span class="sep" aria-hidden="true">/</span>
				<span class="tags" aria-label="Tags">
					{#each article.tags as tag}
						<a href={`/articles?tag=${encodeURIComponent(tag)}`}>#{tag}</a>
					{/each}
				</span>
			{/if}
		</div>

		<h1>{article.title}</h1>
	</header>

	{#if data.headings.length > 1}
		<details class="toc-mobile">
			<summary>
				<span>on this page</span>
				<span class="toc-count">{data.headings.length}</span>
			</summary>
			<ol>
				{#each data.headings as heading}
					<li class:sub={heading.level === 3}>
						<a href={`#${heading.id}`}>{heading.text}</a>
					</li>
				{/each}
			</ol>
		</details>
	{/if}

	<div class="article-grid">
		<ArticleBody html={data.html} includes={data.includes} />

		{#if data.headings.length > 1}
			<ArticleToc headings={data.headings} />
		{/if}
	</div>

	{#if data.older || data.newer}
		<nav class="pager" aria-label="Article navigation">
			{#if data.older}
				<a class="pager-link older" href={`/article/${data.older.slug}`}>
					<span class="pager-label"><span aria-hidden="true">←</span> older</span>
					<span class="pager-title">{data.older.title}</span>
				</a>
			{/if}
			{#if data.newer}
				<a class="pager-link newer" href={`/article/${data.newer.slug}`}>
					<span class="pager-label">newer <span aria-hidden="true">→</span></span>
					<span class="pager-title">{data.newer.title}</span>
				</a>
			{/if}
		</nav>
	{/if}
</article>

<style>
	.article-page {
		padding-top: 1.5rem;
	}

	.breadcrumb {
		margin-bottom: clamp(3rem, 7vw, 5rem);
	}

	.breadcrumb a {
		color: var(--muted);
		font-size: 0.64rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		transition: color 140ms ease;
	}

	.breadcrumb a:hover {
		color: var(--accent);
	}

	.article-header {
		padding-bottom: clamp(2.5rem, 5vw, 3.5rem);
		border-bottom: 1px solid var(--line);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 1.4rem;
		color: var(--muted);
		font-size: 0.68rem;
	}

	.sep {
		color: var(--line-strong);
	}

	.tags {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0.65rem;
	}

	.tags a {
		color: var(--accent-dim);
		transition: color 140ms ease;
	}

	.tags a:hover {
		color: var(--accent);
	}

	h1 {
		max-width: 46rem;
		margin: 0;
		color: var(--text);
		font-size: clamp(1.8rem, 3.4vw, 2.6rem);
		font-weight: 500;
		line-height: 1.2;
		letter-spacing: -0.04em;
		text-wrap: balance;
	}

	.article-grid {
		display: grid;
		grid-template-columns: minmax(0, 46rem) 11rem;
		justify-content: space-between;
		gap: clamp(2rem, 5vw, 4.5rem);
		padding-top: clamp(2rem, 4vw, 3rem);
	}

	.toc-mobile {
		display: none;
	}

	.pager {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin-top: clamp(3.5rem, 8vw, 6rem);
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
	}

	.pager-link {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 1rem 0;
	}

	.pager-link.older {
		padding-right: 1rem;
	}

	.pager-link.newer {
		align-items: flex-end;
		padding-left: 1rem;
		border-left: 1px solid var(--line);
		text-align: right;
	}

	.pager-label {
		color: var(--muted);
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.pager-title {
		color: var(--text);
		font-size: 0.82rem;
		line-height: 1.45;
		transition: color 140ms ease;
	}

	.pager-link:hover .pager-title {
		color: var(--accent);
	}

	@media (max-width: 1024px) {
		.article-grid {
			grid-template-columns: minmax(0, 46rem);
		}

		.article-grid > :global(.toc) {
			display: none;
		}

		.toc-mobile {
			display: block;
			max-width: 46rem;
			margin-top: 1.5rem;
			border: 1px solid var(--line);
			border-radius: var(--radius);
			background: var(--bg-soft);
		}

		.toc-mobile summary {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 0.7rem 0.85rem;
			color: var(--muted);
			font-size: 0.6rem;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			cursor: pointer;
			list-style: none;
		}

		.toc-mobile summary::-webkit-details-marker {
			display: none;
		}

		.toc-count {
			color: var(--muted);
		}

		.toc-mobile ol {
			margin: 0;
			padding: 0.25rem 0.85rem 0.8rem;
			list-style: none;
			border-top: 1px solid var(--line);
		}

		.toc-mobile li a {
			display: block;
			padding: 0.28rem 0;
			color: var(--muted);
			font-size: 0.72rem;
		}

		.toc-mobile li.sub a {
			padding-left: 0.8rem;
			font-size: 0.68rem;
			color: var(--muted);
		}

		.toc-mobile li a:hover {
			color: var(--accent);
		}
	}

	@media (max-width: 600px) {
		.pager {
			grid-template-columns: 1fr;
		}

		.pager-link.newer {
			align-items: flex-start;
			padding-left: 0;
			border-left: 0;
			border-top: 1px solid var(--line);
			text-align: left;
		}
	}
</style>
