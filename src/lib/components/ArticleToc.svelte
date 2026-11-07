<script lang="ts">
	import { onMount } from 'svelte';
	import type { Heading } from '#lib/types';

	let { headings }: { headings: Heading[] } = $props();

	let activeId = $state('');

	onMount(() => {
		let frame = 0;

		const update = () => {
			frame = 0;
			const offset = 150;
			let current = headings[0]?.id ?? '';

			for (const heading of headings) {
				const element = document.getElementById(heading.id);
				if (!element) continue;
				if (element.getBoundingClientRect().top <= offset) current = heading.id;
				else break;
			}

			activeId = current;
		};

		const onScroll = () => {
			if (frame) return;
			frame = requestAnimationFrame(update);
		};

		update();
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll);

		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onScroll);
		};
	});
</script>

<aside class="toc" aria-label="Table of contents">
	<p class="toc-title">On this page</p>
	<ol>
		{#each headings as heading}
			<li class:sub={heading.level === 3} class:active={activeId === heading.id}>
				<a href={`#${heading.id}`}>{heading.text}</a>
			</li>
		{/each}
	</ol>
</aside>

<style>
	.toc {
		position: sticky;
		top: 6.5rem;
		max-height: calc(100vh - 8.5rem);
		overflow-y: auto;
		padding: 0.25rem 0 1rem 1.4rem;
		border-left: 1px solid var(--rule);
		scrollbar-width: thin;
		scrollbar-color: var(--rule-strong) transparent;
	}

	.toc-title {
		margin: 0 0 1rem;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		font-weight: 500;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted);
	}

	ol {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		position: relative;
		line-height: 1.35;
	}

	li::before {
		content: '';
		position: absolute;
		left: -1.46rem;
		top: 0.58em;
		width: 2px;
		height: 0;
		background: var(--accent);
		transition: height 180ms var(--ease-out);
	}

	li.active::before {
		height: 1.1em;
	}

	a {
		display: block;
		padding: 0.3rem 0;
		font-size: 0.76rem;
		line-height: 1.4;
		color: var(--muted);
		text-decoration: none;
		transition:
			color 160ms ease,
			transform 160ms var(--ease-out);
	}

	li.sub a {
		padding-left: 0.8rem;
		font-size: 0.72rem;
	}

	a:hover {
		color: var(--ink);
		transform: translateX(2px);
	}

	li.active a {
		color: var(--ink);
		font-weight: 500;
	}
</style>
