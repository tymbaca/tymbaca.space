<script lang="ts">
	import { onMount } from 'svelte';
	import type { Heading } from '#lib/types';

	let { headings }: { headings: Heading[] } = $props();

	let activeId = $state('');

	onMount(() => {
		let frame = 0;

		const update = () => {
			frame = 0;
			const offset = 130;
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
	<p class="toc-title">on this page</p>
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
		top: 5rem;
		max-height: calc(100vh - 7rem);
		overflow-y: auto;
		padding-left: 1rem;
		border-left: 1px solid var(--line);
		scrollbar-width: thin;
		scrollbar-color: var(--line-strong) transparent;
	}

	.toc-title {
		margin: 0 0 0.9rem;
		color: var(--muted);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	ol {
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	a {
		display: block;
		padding: 0.22rem 0;
		color: var(--muted);
		font-size: 0.72rem;
		line-height: 1.5;
		transition: color 140ms ease;
	}

	li.sub a {
		padding-left: 0.7rem;
		font-size: 0.68rem;
	}

	a:hover {
		color: var(--text);
	}

	li.active a {
		color: var(--accent);
	}
</style>
