<script lang="ts">
	import { page } from '$app/state';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import { site } from '#lib/config';

	const pathname = $derived(page.url.pathname);
</script>

<header class="site-header">
	<div class="shell header-inner">
		<a class="wordmark" href="/articles" aria-label={`${site.name} home`}>
			<span class="mark" aria-hidden="true"></span>
			<span class="wordmark-name">tymbaca</span><span class="wordmark-tld">.space</span>
		</a>

		<div class="header-actions">
			<nav class="site-nav" aria-label="Main navigation">
				{#each site.nav as item}
					{@const active = pathname === item.href || pathname.startsWith(`${item.href}/`) || (item.href === '/articles' && pathname.startsWith('/article/'))}
					<a href={item.href} class:active aria-current={active ? 'page' : undefined}>
						{item.label}
					</a>
				{/each}
			</nav>

			<ThemeToggle />
		</div>
	</div>
</header>

<style>
	.site-header {
		position: sticky;
		top: 0;
		z-index: 30;
		border-bottom: 1px solid var(--line);
		background: color-mix(in srgb, var(--bg) 88%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
	}

	.header-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 2rem;
		min-height: 3.5rem;
	}

	.wordmark {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		color: var(--text);
		font-size: 0.84rem;
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 1;
	}

	.mark {
		width: 6px;
		height: 6px;
		border-radius: 1px;
		background: var(--accent);
	}

	.wordmark-tld {
		color: var(--muted);
		font-weight: 400;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 1.25rem;
	}

	.site-nav {
		display: flex;
		align-items: center;
		gap: 1.1rem;
	}

	.site-nav a {
		position: relative;
		padding: 0.3rem 0;
		color: var(--muted);
		font-size: 0.72rem;
		letter-spacing: 0.02em;
		transition: color 140ms ease;
	}

	.site-nav a::before {
		content: '';
		position: absolute;
		left: -0.7rem;
		top: 50%;
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: var(--accent);
		opacity: 0;
		transform: translateY(-50%);
		transition: opacity 140ms ease;
	}

	.site-nav a:hover {
		color: var(--text);
	}

	.site-nav a.active {
		color: var(--accent);
	}

	.site-nav a.active::before {
		opacity: 1;
	}

	@media (max-width: 520px) {
		.header-inner {
			min-height: 3.25rem;
		}

		.header-actions {
			gap: 1rem;
		}

		.mark {
			display: none;
		}
	}
</style>
