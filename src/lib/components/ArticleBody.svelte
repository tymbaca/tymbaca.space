<script lang="ts">
	import { onMount } from 'svelte';
	import type { SvelteInclude } from '#lib/types';

	let { html, includes }: { html: string; includes: SvelteInclude[] } = $props();

	let root: HTMLDivElement;

	type MountableModule = {
		mountInto: (target: Element, props: Record<string, unknown>) => unknown;
		destroy: (instance: unknown) => void;
	};

	function markError(element: HTMLElement) {
		element.classList.remove('is-loading');
		element.classList.add('is-error');
		element.setAttribute('aria-busy', 'false');
		element.replaceChildren();

		const message = document.createElement('span');
		message.className = 'svelte-include__error';
		message.textContent = 'This interactive component failed to load.';
		element.append(message);
	}

	async function copyText(text: string) {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return;
		}

		const area = document.createElement('textarea');
		area.value = text;
		area.style.position = 'fixed';
		area.style.opacity = '0';
		document.body.append(area);
		area.select();
		document.execCommand('copy');
		area.remove();
	}

	onMount(() => {
		let active = true;
		const cleanups: Array<() => void> = [];

		for (const include of includes) {
			const element = root.querySelector<HTMLElement>(
				`[data-svelte-include="${include.id}"]`
			);
			if (!element) continue;

			element.setAttribute('aria-busy', 'true');
			element.classList.add('is-loading');

			import(/* @vite-ignore */ include.url)
				.then((module: MountableModule) => {
					if (!active) return;

					element.replaceChildren();
					element.classList.remove('is-loading');
					element.classList.add('is-ready');
					element.setAttribute('aria-busy', 'false');

					try {
						const instance = module.mountInto(element, include.props);
						cleanups.push(() => module.destroy(instance));
					} catch (error) {
						console.error(`[svelte-include] ${include.name}`, error);
						markError(element);
					}
				})
				.catch((error) => {
					if (!active) return;
					console.error(`[svelte-include] failed to load ${include.url}`, error);
					markError(element);
				});
		}

		for (const pre of root.querySelectorAll<HTMLElement>('pre')) {
			const language = [...(pre.querySelector('code')?.classList ?? [])]
				.find((name) => name.startsWith('language-'))
				?.slice('language-'.length);

			if (language && language !== 'text') {
				pre.dataset.language = language;
			}

			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'code-copy';
			button.textContent = 'Copy';
			button.setAttribute('aria-label', 'Copy code');

			let resetTimer: ReturnType<typeof setTimeout> | undefined;

			const onClick = async () => {
				const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';

				try {
					await copyText(code);
					button.textContent = 'Copied';
					button.classList.add('is-copied');
				} catch {
					button.textContent = 'Press ⌘C';
				}

				clearTimeout(resetTimer);
				resetTimer = setTimeout(() => {
					button.textContent = 'Copy';
					button.classList.remove('is-copied');
				}, 1600);
			};

			button.addEventListener('click', onClick);
			pre.append(button);

			cleanups.push(() => {
				clearTimeout(resetTimer);
				button.removeEventListener('click', onClick);
				button.remove();
			});
		}

		return () => {
			active = false;
			for (const cleanup of cleanups.reverse()) cleanup();
		};
	});
</script>

<div class="prose" bind:this={root}>
	{@html html}
</div>
