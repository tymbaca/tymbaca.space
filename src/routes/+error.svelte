<script lang="ts">
	import { page } from '$app/state';

	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? 'Something went wrong.');
</script>

<svelte:head>
	<title>{status} — tymbaca.space</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="error-page shell">
	<p class="eyebrow">Error {status}</p>
	<h1>{status === 404 ? 'Lost in the margins.' : 'A page went sideways.'}</h1>
	<p class="message">{message}</p>
	<a class="back" href="/articles"><span aria-hidden="true">←</span> Back to all articles</a>
</section>

<style>
	.error-page {
		padding-block: clamp(5rem, 14vw, 11rem);
	}

	.eyebrow {
		margin: 0 0 1.5rem;
		font-family: var(--font-mono);
		font-size: 0.65rem;
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: var(--accent-ink);
	}

	h1 {
		max-width: 16ch;
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(3rem, 8vw, 6.5rem);
		font-weight: 400;
		line-height: 0.92;
		letter-spacing: -0.03em;
	}

	.message {
		max-width: 48ch;
		margin: 1.5rem 0 2.5rem;
		color: var(--ink-soft);
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		text-decoration: none;
		color: var(--accent-ink);
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
		padding-bottom: 0.2rem;
	}

	.back:hover {
		border-color: var(--accent);
	}
</style>
