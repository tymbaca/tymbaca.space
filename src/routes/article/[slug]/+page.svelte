<script lang="ts">
	import ArticleBody from '#lib/components/ArticleBody.svelte';
	import ArticleToc from '#lib/components/ArticleToc.svelte';
	import ReadingProgress from '#lib/components/ReadingProgress.svelte';
	import { formatLongDate } from '#lib/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const article = $derived(data.article);
	const description = $derived(
		article.excerpt || `An article by tymbaca, published ${formatLongDate(article.date)}.`
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
		<a href="/articles"><span aria-hidden="true">←</span> Index</a>
	</nav>

	<header class="article-header">
		<div class="header-main">
			{#if article.tags.length > 0}
				<ul class="header-tags" aria-label="Tags">
					{#each article.tags as tag}
						<li>
							<a href={`/articles?tag=${encodeURIComponent(tag)}`}>#{tag}</a>
						</li>
					{/each}
				</ul>
			{/if}

			<h1>{article.title}</h1>
		</div>

		<dl class="header-meta">
			<div>
				<dt>Published</dt>
				<dd><time datetime={article.date ?? undefined}>{formatLongDate(article.date)}</time></dd>
			</div>
			{#if article.updated && article.updated !== article.date}
				<div>
					<dt>Updated</dt>
					<dd><time datetime={article.updated}>{formatLongDate(article.updated)}</time></dd>
				</div>
			{/if}
			<div>
				<dt>Reading</dt>
				<dd>{article.readingMinutes} min</dd>
			</div>
			<div>
				<dt>Words</dt>
				<dd>{article.wordCount.toLocaleString('en-US')}</dd>
			</div>
		</dl>
	</header>

	<div class="article-rule" aria-hidden="true"></div>

	{#if data.headings.length > 1}
		<details class="toc-mobile">
			<summary>On this page <span>{data.headings.length}</span></summary>
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

	<div class="endmark" aria-hidden="true">
		<span></span>
		<i>∎</i>
		<span></span>
	</div>

	{#if data.older || data.newer}
		<nav class="pager" aria-label="Article navigation">
			{#if data.older}
				<a class="pager-link" href={`/article/${data.older.slug}`}>
					<span class="pager-label"><span aria-hidden="true">←</span> Older</span>
					<span class="pager-title">{data.older.title}</span>
				</a>
			{/if}
			{#if data.newer}
				<a class="pager-link newer" href={`/article/${data.newer.slug}`}>
					<span class="pager-label">Newer <span aria-hidden="true">→</span></span>
					<span class="pager-title">{data.newer.title}</span>
				</a>
			{/if}
		</nav>
	{/if}
</article>

<style>
	.article-page {
		padding-top: 2.25rem;
	}

	.breadcrumb a {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-family: var(--font-mono);
		font-size: 0.65rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--muted);
		text-decoration: none;
		transition: color 160ms ease;
	}

	.breadcrumb a:hover {
		color: var(--accent);
	}

	.article-header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 13.5rem;
		gap: clamp(2rem, 6vw, 5rem);
		align-items: end;
		margin-top: clamp(2.5rem, 6vw, 4.5rem);
		animation: rise 650ms var(--ease-out) both;
	}

	.header-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin: 0 0 1.5rem;
		padding: 0;
		list-style: none;
	}

	.header-tags a {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		letter-spacing: 0.06em;
		color: var(--accent-ink);
		text-decoration: none;
		padding-bottom: 0.1rem;
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
		transition: border-color 160ms ease;
	}

	.header-tags a:hover {
		border-color: var(--accent);
	}

	h1 {
		max-width: 17ch;
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2.9rem, 7vw, 6.1rem);
		font-weight: 400;
		line-height: 0.94;
		letter-spacing: -0.033em;
		color: var(--ink);
		text-wrap: balance;
	}

	.header-meta {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		margin: 0;
		padding-top: 0.85rem;
		border-top: 1px solid var(--ink);
	}

	.header-meta div {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}

	.header-meta dt {
		font-family: var(--font-mono);
		font-size: 0.58rem;
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.header-meta dd {
		margin: 0;
		font-size: 0.78rem;
		text-align: right;
		color: var(--ink-soft);
	}

	.article-rule {
		height: 1px;
		margin-top: clamp(2.5rem, 6vw, 4.5rem);
		background: var(--ink);
	}

	.article-grid {
		display: grid;
		grid-template-columns: minmax(0, 46rem) 13.5rem;
		justify-content: space-between;
		gap: clamp(2rem, 5vw, 5rem);
		padding-top: clamp(2.5rem, 5vw, 3.5rem);
	}

	.toc-mobile {
		display: none;
	}

	.endmark {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1.1rem;
		max-width: 46rem;
		margin: clamp(3.5rem, 7vw, 5rem) 0 0;
		color: var(--accent);
	}

	.endmark span {
		width: 2.5rem;
		height: 1px;
		background: var(--rule-strong);
	}

	.endmark i {
		font-style: normal;
		font-size: 0.55rem;
	}

	.pager {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin-top: clamp(4rem, 9vw, 7rem);
		border-top: 1px solid var(--ink);
		border-bottom: 1px solid var(--rule);
	}

	.pager-link {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		padding: 1.4rem 1.5rem 1.5rem 0;
		text-decoration: none;
		color: inherit;
		transition: background 180ms ease;
	}

	.pager-link.newer {
		align-items: flex-end;
		padding: 1.4rem 0 1.5rem 1.5rem;
		text-align: right;
		border-left: 1px solid var(--rule);
	}

	.pager-link:hover {
		background: color-mix(in srgb, var(--paper-raised) 70%, transparent);
	}

	.pager-label {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		letter-spacing: 0.11em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.pager-title {
		font-family: var(--font-display);
		font-size: clamp(1.3rem, 2.4vw, 1.7rem);
		line-height: 1.08;
		color: var(--ink);
		transition: color 160ms ease;
	}

	.pager-link:hover .pager-title {
		color: var(--accent);
	}

	@media (max-width: 1100px) {
		.article-header {
			grid-template-columns: minmax(0, 1fr) 12rem;
		}

		.article-grid {
			grid-template-columns: minmax(0, 46rem);
		}

		.article-grid > :global(.toc) {
			display: none;
		}

		.toc-mobile {
			display: block;
			max-width: 46rem;
			margin-top: 2rem;
			border: 1px solid var(--rule);
			border-radius: var(--radius);
			background: color-mix(in srgb, var(--paper-raised) 55%, transparent);
		}

		.toc-mobile summary {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 0.85rem 1rem;
			font-family: var(--font-mono);
			font-size: 0.64rem;
			letter-spacing: 0.1em;
			text-transform: uppercase;
			color: var(--ink-soft);
			cursor: pointer;
			list-style: none;
		}

		.toc-mobile summary::-webkit-details-marker {
			display: none;
		}

		.toc-mobile summary span {
			color: var(--muted);
		}

		.toc-mobile ol {
			margin: 0;
			padding: 0 1rem 1rem;
			list-style: none;
			border-top: 1px solid var(--rule);
		}

		.toc-mobile li a {
			display: block;
			padding: 0.4rem 0;
			font-size: 0.82rem;
			color: var(--ink-soft);
			text-decoration: none;
		}

		.toc-mobile li.sub a {
			padding-left: 1rem;
			font-size: 0.78rem;
			color: var(--muted);
		}
	}

	@media (max-width: 760px) {
		.article-header {
			grid-template-columns: 1fr;
			gap: 2rem;
		}

		.header-meta {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.75rem 2rem;
		}

		.header-meta div {
			justify-content: flex-start;
			gap: 0.6rem;
		}

		.header-meta dd {
			text-align: left;
		}
	}

	@media (max-width: 600px) {
		.pager {
			grid-template-columns: 1fr;
		}

		.pager-link.newer {
			align-items: flex-start;
			padding: 1.4rem 0 1.5rem;
			text-align: left;
			border-left: 0;
			border-top: 1px solid var(--rule);
		}
	}
</style>
