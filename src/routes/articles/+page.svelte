<script lang="ts">
	import { pluralize } from '#lib/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const title = $derived(data.activeTag ? `#${data.activeTag} — Articles` : 'Articles');
	const description = $derived(
		data.activeTag
			? `Articles tagged “${data.activeTag}” on tymbaca.space.`
			: 'A running collection of things I build, break, and figure out.'
	);
</script>

<svelte:head>
	<title>{title} — tymbaca.space</title>
	<meta name="description" content={description} />
	<meta property="og:title" content={`${title} — tymbaca.space`} />
	<meta property="og:description" content={description} />
	<meta property="og:type" content="website" />
</svelte:head>

<section class="listing shell">
	<header class="page-head">
		<div class="head-top">
			<p class="eyebrow">index</p>
			<p class="stats">{pluralize(data.total, 'entry', 'entries')} / {pluralize(data.tags.length, 'tag', 'tags')}</p>
		</div>

		<h1>Articles</h1>
		<p class="intro">A running collection of things I build, break, and figure out.</p>
	</header>

	<nav class="filters" aria-label="Filter articles by tag">
		<span class="filter-label">filter</span>
		<a href="/articles" class:active={!data.activeTag}>
			all <span>{data.total}</span>
		</a>
		{#each data.tags as tag}
			<a
				href={`/articles?tag=${encodeURIComponent(tag.name)}`}
				class:active={data.activeTag?.toLowerCase() === tag.name.toLowerCase()}
			>
				{tag.name} <span>{tag.count}</span>
			</a>
		{/each}
	</nav>

	{#if data.articles.length > 0}
		<ol class="article-list">
			{#each data.articles as article (article.slug)}
				<li class="article-row">
					<a href={`/article/${article.slug}`} class="article-link">
						<time class="date" datetime={article.date ?? undefined}>
							{article.date ?? '——————'}
						</time>

						<div class="row-main">
							<h2>{article.title}</h2>

							<div class="row-meta">
								{#if article.tags.length > 0}
									<span class="tags" aria-label="Tags">
										{#each article.tags as tag}
											<span>#{tag}</span>
										{/each}
									</span>
								{/if}
								<span class="reading">{article.readingMinutes} min</span>
							</div>
						</div>

						<span class="arrow" aria-hidden="true">→</span>
					</a>
				</li>
			{/each}
		</ol>
	{:else}
		<div class="empty">
			<p class="empty-label">empty</p>
			<p>
				{#if data.activeTag}
					No entries tagged <span class="inline-accent">#{data.activeTag}</span>.
				{:else}
					Nothing has been published yet.
				{/if}
			</p>
			{#if data.activeTag}
				<a class="clear" href="/articles">← clear filter</a>
			{/if}
		</div>
	{/if}
</section>

<style>
	.listing {
		padding-top: clamp(4rem, 8vw, 6.5rem);
	}

	.page-head {
		padding-bottom: 2.5rem;
		border-bottom: 1px solid var(--line);
	}

	.head-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 2.75rem;
	}

	.eyebrow,
	.stats {
		margin: 0;
		color: var(--muted);
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		font-size: clamp(2rem, 4vw, 2.75rem);
		font-weight: 500;
		line-height: 1.1;
		letter-spacing: -0.045em;
		color: var(--text);
	}

	.intro {
		max-width: 54ch;
		margin: 1rem 0 0;
		color: var(--text-soft);
		font-size: 0.82rem;
		line-height: 1.65;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.2rem 0.95rem;
		padding: 0.8rem 0;
		border-bottom: 1px solid var(--line);
		font-size: 0.72rem;
	}

	.filter-label {
		margin-right: 0.35rem;
		color: var(--muted);
		font-size: 0.58rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.filters a {
		display: inline-flex;
		align-items: baseline;
		gap: 0.35rem;
		padding-block: 0.1rem;
		border-bottom: 1px solid transparent;
		color: var(--muted);
		transition:
			color 140ms ease,
			border-color 140ms ease;
	}

	.filters a span {
		color: var(--muted);
		font-size: 0.6rem;
	}

	.filters a:hover {
		color: var(--text);
	}

	.filters a.active {
		color: var(--accent);
		border-bottom-color: color-mix(in srgb, var(--accent) 50%, transparent);
	}

	.filters a.active span {
		color: var(--accent-dim);
	}

	.article-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.article-row {
		border-bottom: 1px solid var(--line);
	}

	.article-link {
		display: grid;
		grid-template-columns: 7.5rem minmax(0, 1fr) 1.5rem;
		gap: 1.25rem;
		align-items: start;
		margin-inline: -0.75rem;
		padding: 1.3rem 0.75rem;
		transition: background 140ms ease;
	}

	.article-link:hover {
		background: var(--bg-soft);
	}

	.date {
		padding-top: 0.28rem;
		color: var(--muted);
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.01em;
	}

	h2 {
		margin: 0;
		color: var(--text);
		font-size: 0.98rem;
		font-weight: 500;
		line-height: 1.5;
		letter-spacing: -0.015em;
		transition: color 140ms ease;
	}

	.article-link:hover h2 {
		color: var(--accent);
	}

	.row-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.8rem;
		margin-top: 0.45rem;
		color: var(--muted);
		font-size: 0.68rem;
	}

	.tags {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0.55rem;
	}

	.reading {
		color: var(--muted);
	}

	.arrow {
		justify-self: end;
		padding-top: 0.2rem;
		color: var(--line-strong);
		font-size: 0.85rem;
		transition:
			color 140ms ease,
			transform 180ms var(--ease-out);
	}

	.article-link:hover .arrow {
		color: var(--accent);
		transform: translateX(3px);
	}

	.empty {
		padding: clamp(3rem, 8vw, 5rem) 0;
		border-bottom: 1px solid var(--line);
	}

	.empty-label {
		margin: 0 0 0.75rem;
		color: var(--muted);
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.empty p:not(.empty-label) {
		margin: 0;
		color: var(--text-soft);
		font-size: 0.84rem;
	}

	.inline-accent {
		color: var(--accent);
	}

	.clear {
		display: inline-block;
		margin-top: 1rem;
		color: var(--accent);
		font-size: 0.7rem;
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
	}

	.clear:hover {
		border-color: var(--accent);
	}

	@media (max-width: 700px) {
		.head-top {
			margin-bottom: 2rem;
		}

		.article-link {
			grid-template-columns: minmax(0, 1fr) 1.5rem;
			gap: 0.6rem;
			padding-block: 1.1rem;
		}

		.date {
			grid-column: 1 / -1;
			padding-top: 0;
		}

		.row-main {
			grid-column: 1;
		}

		.arrow {
			grid-column: 2;
			grid-row: 2;
			align-self: center;
			padding-top: 0;
		}

		h2 {
			font-size: 0.96rem;
		}
	}
</style>
