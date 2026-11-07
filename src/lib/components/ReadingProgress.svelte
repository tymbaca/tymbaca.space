<script lang="ts">
	import { onMount } from 'svelte';

	let progress = $state(0);

	onMount(() => {
		let frame = 0;

		const update = () => {
			frame = 0;
			const scrollable = document.documentElement.scrollHeight - window.innerHeight;
			progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
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

<div class="reading-progress" aria-hidden="true">
	<span style:transform={`scaleX(${progress})`}></span>
</div>

<style>
	.reading-progress {
		position: fixed;
		inset: 0 0 auto;
		z-index: 60;
		height: 1px;
		pointer-events: none;
	}

	span {
		display: block;
		width: 100%;
		height: 100%;
		background: var(--accent);
		transform-origin: left;
		transition: transform 80ms linear;
	}

	@media (prefers-reduced-motion: reduce) {
		span {
			transition: none;
		}
	}
</style>
