<script lang="ts">
	import { site } from '#lib/config';
</script>

<footer class="site-footer">
	<div class="shell footer-inner">
		<p>{site.name}</p>
	</div>
</footer>

<style>
	.site-footer {
		margin-top: clamp(4rem, 10vw, 7rem);
		border-top: 1px solid var(--line);
	}

	.footer-inner {
		padding-block: 1.5rem 1.75rem;
	}

	p {
		margin: 0;
		color: var(--muted);
		font-size: 0.64rem;
		letter-spacing: 0.03em;
	}
</style>
