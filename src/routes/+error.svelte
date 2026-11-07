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
	<p class="eyebrow">error / {status}</p>
	<h1>{status === 404 ? 'Not found.' : 'Something went wrong.'}</h1>
	<p class="message">{message}</p>
	<a class="back" href="/articles"><span aria-hidden="true">←</span> index</a>
</section>

<style>
	.error-page {
		padding-block: clamp(5rem, 12vw, 9rem);
	}

	.eyebrow {
		margin: 0 0 1.5rem;
		color: var(--muted);
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		font-size: clamp(1.8rem, 4vw, 2.6rem);
		font-weight: 500;
		line-height: 1.2;
		letter-spacing: -0.04em;
	}

	.message {
		max-width: 48ch;
		margin: 1rem 0 2.25rem;
		color: var(--text-soft);
		font-size: 0.84rem;
	}

	.back {
		display: inline-block;
		padding-bottom: 0.15rem;
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
		color: var(--accent);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.back:hover {
		border-color: var(--accent);
	}
</style>
