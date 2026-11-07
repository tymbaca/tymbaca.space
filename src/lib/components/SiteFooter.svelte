<script lang="ts">
	import { site } from '#lib/config';

	const year = new Date().getFullYear();
</script>

<footer class="site-footer">
	<div class="shell footer-inner">
		<p class="copyright">© {year} {site.name}</p>
		<p class="colophon">
			<span>Content lives in Git</span>
			<span class="sep" aria-hidden="true">·</span>
			<span>Rendered with SvelteKit</span>
		</p>
	</div>
</footer>

<style>
	.site-footer {
		margin-top: clamp(4rem, 10vw, 8rem);
		border-top: 1px solid var(--rule);
	}

	.footer-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-block: 1.75rem 2rem;
	}

	p {
		margin: 0;
		font-size: 0.72rem;
		letter-spacing: 0.02em;
		color: var(--muted);
	}

	.colophon {
		display: flex;
		gap: 0.55rem;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.07em;
	}

	.sep {
		color: var(--rule-strong);
	}

	@media (max-width: 620px) {
		.footer-inner {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.4rem;
		}
	}
</style>
