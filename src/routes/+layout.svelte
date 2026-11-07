<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import SiteFooter from '#lib/components/SiteFooter.svelte';
	import SiteHeader from '#lib/components/SiteHeader.svelte';
	import { site } from '#lib/config';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<meta property="og:site_name" content={site.name} />
</svelte:head>

<a class="skip-link" href="#main-content">Skip to content</a>

<SiteHeader />

<main id="main-content">
	{@render children()}
</main>

<SiteFooter />
