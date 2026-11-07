<script lang="ts">
	function toggleTheme() {
		const root = document.documentElement;
		const next = root.dataset.theme === 'light' ? 'dark' : 'light';

		root.dataset.theme = next;

		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute('content', next === 'dark' ? '#0b0b0b' : '#f5f4f0');

		try {
			localStorage.setItem('theme', next);
		} catch {
			/* ignore unavailable storage */
		}
	}
</script>

<button
	type="button"
	class="theme-toggle"
	onclick={toggleTheme}
	aria-label="Toggle color theme"
	title="Toggle color theme"
>
	<svg
		class="icon sun"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		aria-hidden="true"
	>
		<circle cx="12" cy="12" r="4"></circle>
		<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>
	</svg>

	<svg
		class="icon moon"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"></path>
	</svg>
</button>

<style>
	.theme-toggle {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease,
			background 140ms ease;
	}

	.theme-toggle:hover {
		color: var(--text);
		border-color: var(--line-strong);
		background: var(--bg-soft);
	}

	.icon {
		display: none;
		width: 14px;
		height: 14px;
	}

	:global(html[data-theme='dark']) .sun {
		display: block;
	}

	:global(html[data-theme='light']) .moon {
		display: block;
	}
</style>
