<script lang="ts">
	import { page } from '$app/state';
	import { site } from '#lib/config';

	const pathname = $derived(page.url.pathname);
</script>

<header class="site-header">
	<div class="shell header-inner">
		<a class="wordmark" href="/articles" aria-label={`${site.name} home`}>
			<span class="wordmark-name">tymbaca</span><span class="wordmark-tld">.space</span>
		</a>

		<nav class="site-nav" aria-label="Main navigation">
			{#each site.nav as item}
				{@const active = pathname === item.href || pathname.startsWith(`${item.href}/`) || (item.href === '/articles' && pathname.startsWith('/article/'))}
				<a href={item.href} class:active aria-current={active ? 'page' : undefined}>
					{item.label}
				</a>
			{/each}
			<span class="nav-mark" aria-hidden="true"></span>
		</nav>
	</div>
</header>

<style>
	.site-header {
		position: sticky;
		top: 0;
		z-index: 30;
		border-bottom: 1px solid var(--rule);
		background: color-mix(in srgb, var(--paper) 86%, transparent);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
	}

	.header-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 2rem;
		min-height: 4.5rem;
	}

	.wordmark {
		display: inline-flex;
		align-items: baseline;
		gap: 0.12em;
		color: var(--ink);
		text-decoration: none;
		line-height: 1;
	}

	.wordmark-name {
		font-family: var(--font-display);
		font-size: 1.75rem;
		letter-spacing: -0.025em;
	}

	.wordmark-tld {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		font-weight: 500;
		letter-spacing: 0.08em;
		color: var(--muted);
		transform: translateY(-0.08em);
	}

	.site-nav {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.site-nav a {
		position: relative;
		font-size: 0.82rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		color: var(--ink-soft);
		text-decoration: none;
		padding: 0.35rem 0;
		transition: color 160ms ease;
	}

	.site-nav a::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 1px;
		background: var(--accent);
		transform: scaleX(0);
		transform-origin: right;
		transition: transform 220ms var(--ease-out);
	}

	.site-nav a:hover,
	.site-nav a.active {
		color: var(--ink);
	}

	.site-nav a:hover::after,
	.site-nav a.active::after {
		transform: scaleX(1);
		transform-origin: left;
	}

	.nav-mark {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 12%, transparent);
	}

	@media (max-width: 540px) {
		.header-inner {
			min-height: 4rem;
		}

		.wordmark-name {
			font-size: 1.55rem;
		}

		.site-nav {
			gap: 1rem;
		}

		.nav-mark {
			display: none;
		}
	}
</style>
