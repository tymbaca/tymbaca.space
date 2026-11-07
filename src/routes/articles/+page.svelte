<script lang="ts">
	import { formatDate, pluralize } from '#lib/format';
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
	<header class="masthead">
		<div class="masthead-title">
			<p class="eyebrow"><span class="eyebrow-rule" aria-hidden="true"></span> A personal notebook</p>
			<h1>Articles <em>&amp;</em><br />field notes.</h1>
		</div>

		<div class="masthead-aside">
			<p class="lede">A running collection of things I build, break, and figure out.</p>

			<dl class="stats">
				<div>
					<dt>Entries</dt>
					<dd>{data.total.toString().padStart(2, '0')}</dd>
				</div>
				<div>
					<dt>Topics</dt>
					<dd>{data.tags.length.toString().padStart(2, '0')}</dd>
				</div>
			</dl>
		</div>
	</header>

	<div class="index-bar">
		<div class="index-label">
			<span>Index</span>
			<span class="index-line" aria-hidden="true"></span>
		</div>

		<nav class="filters" aria-label="Filter articles by tag">
			<a href="/articles" class:active={!data.activeTag}>
				All <span>{data.total}</span>
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
	</div>

	{#if data.articles.length > 0}
		<ol class="article-list">
			{#each data.articles as article, index (article.slug)}
				<li class="article-row" style={`--i: ${index}`}>
					<a href={`/article/${article.slug}`} class="article-link">
						<span class="row-index" aria-hidden="true">
							{String(index + 1).padStart(2, '0')}
						</span>

						<div class="row-body">
							<div class="row-meta">
								<time datetime={article.date ?? undefined}>{formatDate(article.date)}</time>
								<span class="dot" aria-hidden="true"></span>
								<span>{article.readingMinutes} min read</span>
							</div>

							<h2>{article.title}</h2>
							{#if article.excerpt && article.excerpt !== article.title}
								<p class="excerpt">{article.excerpt}</p>
							{/if}

							{#if article.tags.length > 0}
								<ul class="tag-list" aria-label="Tags">
									{#each article.tags as tag}
										<li>#{tag}</li>
									{/each}
								</ul>
							{/if}
						</div>

						<span class="row-arrow" aria-hidden="true">↗</span>
					</a>
				</li>
			{/each}
		</ol>

		<p class="list-footnote">
			Showing {pluralize(data.articles.length, 'entry', 'entries')}{#if data.activeTag}
				in <strong>#{data.activeTag}</strong>{/if}.
		</p>
	{:else}
		<div class="empty">
			<p class="empty-mark" aria-hidden="true">∅</p>
			<h2>Nothing here yet.</h2>
			<p>
				{#if data.activeTag}
					No articles are tagged <strong>#{data.activeTag}</strong> right now.
				{:else}
					The first article is still being written.
				{/if}
			</p>
			{#if data.activeTag}
				<a class="text-link" href="/articles">Show every article</a>
			{/if}
		</div>
	{/if}
</section>

<style>
	.listing {
		padding-top: clamp(3.5rem, 8vw, 7rem);
	}

	.masthead {
		display: grid;
		grid-template-columns: minmax(0, 1.35fr) minmax(16rem, 0.65fr);
		gap: clamp(2rem, 5vw, 6rem);
		align-items: end;
	}

	.masthead-title {
		animation: rise 700ms var(--ease-out) both;
	}

	.eyebrow {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		margin: 0 0 clamp(1.5rem, 3vw, 2.5rem);
		font-family: var(--font-mono);
		font-size: 0.66rem;
		font-weight: 500;
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.eyebrow-rule {
		width: 2.25rem;
		height: 1px;
		background: var(--accent);
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(3.6rem, 9.6vw, 8.2rem);
		font-weight: 400;
		line-height: 0.86;
		letter-spacing: -0.035em;
		color: var(--ink);
	}

	h1 em {
		font-style: italic;
		color: var(--accent);
	}

	.masthead-aside {
		display: flex;
		flex-direction: column;
		gap: clamp(2rem, 4vw, 3.5rem);
		padding-bottom: 0.5rem;
		animation: rise 700ms 120ms var(--ease-out) both;
	}

	.lede {
		max-width: 28ch;
		margin: 0;
		font-size: clamp(1rem, 1.4vw, 1.12rem);
		line-height: 1.55;
		color: var(--ink-soft);
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		margin: 0;
		padding-top: 1rem;
		border-top: 1px solid var(--rule);
	}

	.stats div {
		display: flex;
		flex-direction: column-reverse;
		gap: 0.25rem;
	}

	.stats dt {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.stats dd {
		margin: 0;
		font-family: var(--font-display);
		font-size: 2rem;
		line-height: 1;
		color: var(--ink);
	}

	.index-bar {
		display: flex;
		align-items: flex-start;
		gap: clamp(1.5rem, 4vw, 4rem);
		margin-top: clamp(3.5rem, 8vw, 6rem);
		padding-block: 1rem;
		border-top: 1px solid var(--ink);
		border-bottom: 1px solid var(--rule);
	}

	.index-label {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 5rem;
		padding-top: 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.index-line {
		display: none;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.5rem;
	}

	.filters a {
		display: inline-flex;
		align-items: baseline;
		gap: 0.4rem;
		padding: 0.35rem 0.65rem;
		border: 1px solid transparent;
		border-radius: 999px;
		font-size: 0.78rem;
		color: var(--ink-soft);
		text-decoration: none;
		transition:
			color 160ms ease,
			background 160ms ease,
			border-color 160ms ease;
	}

	.filters a span {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--muted);
	}

	.filters a:hover {
		color: var(--ink);
		background: var(--paper-raised);
	}

	.filters a.active {
		color: var(--paper);
		background: var(--ink);
		border-color: var(--ink);
	}

	.filters a.active span {
		color: color-mix(in srgb, var(--paper) 62%, transparent);
	}

	.article-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.article-row {
		border-bottom: 1px solid var(--rule);
		animation: rise 600ms min(calc(60ms + var(--i) * 55ms), 500ms) var(--ease-out) both;
	}

	.article-link {
		display: grid;
		grid-template-columns: 4.5rem minmax(0, 1fr) 3rem;
		gap: clamp(1rem, 3vw, 2.5rem);
		align-items: start;
		padding-block: clamp(1.75rem, 3.5vw, 2.75rem);
		text-decoration: none;
		color: inherit;
		transition: background 200ms ease;
	}

	.article-link:hover {
		background: color-mix(in srgb, var(--paper-raised) 70%, transparent);
	}

	.row-index {
		padding-top: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		color: var(--muted);
	}

	.row-body {
		max-width: 52rem;
	}

	.row-meta {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin-bottom: 0.65rem;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.dot {
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: var(--rule-strong);
	}

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.8rem, 3.6vw, 2.8rem);
		font-weight: 400;
		line-height: 1.02;
		letter-spacing: -0.025em;
		color: var(--ink);
		transition: color 180ms ease;
	}

	.article-link:hover h2 {
		color: var(--accent);
	}

	.excerpt {
		max-width: 62ch;
		margin: 0.8rem 0 0;
		font-size: 0.94rem;
		line-height: 1.6;
		color: var(--ink-soft);
	}

	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin: 1rem 0 0;
		padding: 0;
		list-style: none;
	}

	.tag-list li {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.04em;
		color: var(--accent-ink);
	}

	.row-arrow {
		align-self: center;
		justify-self: end;
		font-size: 1.25rem;
		color: var(--rule-strong);
		transition:
			color 180ms ease,
			transform 240ms var(--ease-out);
	}

	.article-link:hover .row-arrow {
		color: var(--accent);
		transform: translate(3px, -3px);
	}

	.list-footnote {
		margin: 1.25rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.65rem;
		letter-spacing: 0.04em;
		color: var(--muted);
	}

	.list-footnote strong {
		font-weight: 500;
		color: var(--ink-soft);
	}

	.empty {
		padding: clamp(3rem, 8vw, 6rem) 0;
		text-align: center;
	}

	.empty-mark {
		margin: 0 0 1rem;
		font-family: var(--font-display);
		font-size: 4rem;
		line-height: 1;
		color: var(--rule-strong);
	}

	.empty h2 {
		font-size: 2rem;
	}

	.empty > p:not(.empty-mark) {
		margin: 0.5rem auto 1.5rem;
		color: var(--ink-soft);
	}

	@media (max-width: 860px) {
		.masthead {
			grid-template-columns: 1fr;
			gap: 2rem;
		}

		.masthead-aside {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(12rem, 0.7fr);
			align-items: end;
			gap: 2rem;
		}
	}

	@media (max-width: 640px) {
		.masthead-aside {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}

		.stats {
			max-width: 18rem;
		}

		.index-bar {
			flex-direction: column;
			gap: 0.6rem;
		}

		.index-label {
			padding-top: 0;
		}

		.article-link {
			grid-template-columns: 1fr 2rem;
			gap: 1rem;
		}

		.row-index {
			display: none;
		}

		.row-arrow {
			font-size: 1rem;
		}
	}
</style>
