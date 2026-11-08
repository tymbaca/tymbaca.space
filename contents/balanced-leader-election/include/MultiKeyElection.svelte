<script>
	import { onMount } from 'svelte';

	const KEY_POOL = Array.from({ length: 12 }, (_, index) => `job${index + 1}`);
	const NODE_IDS = ['node-1', 'node-2', 'node-3'];

	const MIN_JOBS = 6;
	const MAX_JOBS = 12;
	const MIN_NODES = 2;
	const MAX_NODES = 6;

	const TTL_MS = 2800;
	const FOLLOW_MS = 800;
	const HOLD_MS = 400;
	const ERRS_TO_FALLBACK = 3;

	let now = $state(0);
	let running = $state(true);
	let speed = $state(1);
	let jobs = $state(9);
	let nodes = $state(makeNodes());
	let candidates = $state(makeCandidates(nodes));
	let records = $state(makeRecords());
	let status = $state('waiting for claims');
	let statusTone = $state('muted');
	let nextNodeNumber = 4;

	let activeKeys = $derived(KEY_POOL.slice(0, jobs));

	function makeNodes() {
		return NODE_IDS.map((id) => ({ id, alive: true, connected: true }));
	}

	function makeRecords() {
		return Object.fromEntries(
			KEY_POOL.map((key) => [key, { value: '', deadline: 0, expiredLogged: false }])
		);
	}

	// Deliberately uneven start: most keys prefer the first node, some the
	// second and the rest the third. With no balancer the distribution sticks.
	function preferredOwner(keyIndex, roster) {
		const slot = keyIndex < 5 ? 0 : keyIndex < 8 ? 1 : 2;
		return roster[Math.min(slot, roster.length - 1)].id;
	}

	function makeCandidates(roster) {
		const list = [];

		KEY_POOL.forEach((key, index) => {
			const preferred = preferredOwner(index, roster);
			const order = [preferred, ...roster.map((node) => node.id).filter((id) => id !== preferred)];

			order.forEach((node, rank) => {
				list.push({
					node,
					key,
					phase: 'following',
					nextAt: rank === 0 ? index * 10 : 220 + index * 6 + rank * 140,
					errors: 0
				});
			});
		});

		return list;
	}

	function setStatus(text, tone = 'muted') {
		status = text;
		statusTone = tone;
	}

	function nodeById(id) {
		return nodes.find((node) => node.id === id);
	}

	function isHeldBy(key, nodeId) {
		const record = records[key];
		return record.value === nodeId && record.deadline > now;
	}

	function heldCount(nodeId) {
		let count = 0;
		for (const key of activeKeys) {
			if (isHeldBy(key, nodeId)) count += 1;
		}
		return count;
	}

	function leasePercent(key) {
		const record = records[key];
		if (!record.value || record.deadline <= now) return 0;
		return Math.max(0, Math.min(100, ((record.deadline - now) / TTL_MS) * 100));
	}

	function trySetNx(candidate) {
		const node = nodeById(candidate.node);

		if (!node || !node.alive || !node.connected) {
			candidate.nextAt = now + FOLLOW_MS;
			return;
		}

		const record = records[candidate.key];

		if (record.value && record.deadline > now) {
			candidate.nextAt = now + FOLLOW_MS;
			return;
		}

		record.value = candidate.node;
		record.deadline = now + TTL_MS;
		record.expiredLogged = false;

		candidate.phase = 'holding';
		candidate.errors = 0;
		candidate.nextAt = now + HOLD_MS;

		setStatus(`${candidate.key} → ${candidate.node}`, 'ok');
	}

	function hold(candidate) {
		const node = nodeById(candidate.node);

		if (!node || !node.alive || !node.connected) {
			candidate.errors += 1;
			candidate.nextAt = now + HOLD_MS;

			if (candidate.errors >= ERRS_TO_FALLBACK) {
				candidate.errors = 0;
				candidate.phase = 'following';
				candidate.nextAt = now + FOLLOW_MS;
				setStatus(`${candidate.node} lost ${candidate.key}`, 'bad');
			}
			return;
		}

		const record = records[candidate.key];

		if (record.value && record.deadline > now) {
			record.deadline = now + TTL_MS;
			record.expiredLogged = false;
		}

		const current = record.value && record.deadline > now ? record.value : '';

		if (current !== candidate.node) {
			candidate.phase = 'following';
			candidate.errors = 0;
			candidate.nextAt = now + FOLLOW_MS;

			if (record.value === candidate.node) {
				record.deadline = now;
				record.expiredLogged = true;
			}

			setStatus(`${candidate.node} lost ${candidate.key}`, 'bad');
			return;
		}

		candidate.errors = 0;
		candidate.nextAt = now + HOLD_MS;
	}

	function tick() {
		for (const key of activeKeys) {
			const record = records[key];

			if (record.value && record.deadline <= now && !record.expiredLogged) {
				record.expiredLogged = true;
				setStatus(`${key} expired`, 'warn');
			}
		}

		for (const candidate of candidates) {
			if (KEY_POOL.indexOf(candidate.key) >= jobs) continue;

			const node = nodeById(candidate.node);
			if (!node || !node.alive) continue;

			let guard = 0;
			while (now >= candidate.nextAt && guard++ < 4) {
				if (candidate.phase === 'holding') hold(candidate);
				else trySetNx(candidate);
			}
		}
	}

	function toggleLink(node) {
		node.connected = !node.connected;

		if (node.connected) {
			let resumed = 0;

			for (const candidate of candidates) {
				if (candidate.node !== node.id) continue;
				if (KEY_POOL.indexOf(candidate.key) >= jobs) continue;

				candidate.errors = 0;
				const record = records[candidate.key];

				if (candidate.phase === 'holding') {
					candidate.nextAt = now + HOLD_MS;
					continue;
				}

				if (record.value === node.id && record.deadline > now) {
					candidate.phase = 'holding';
					candidate.nextAt = now + HOLD_MS;
					resumed += 1;
					continue;
				}

				candidate.nextAt = now + 140 + Math.random() * 260;
			}

			if (resumed > 0) {
				setStatus(`${node.id} resumed ${resumed} ${resumed === 1 ? 'key' : 'keys'}`, 'ok');
			} else {
				setStatus(`${node.id} reconnected`, 'ok');
			}
		} else {
			for (const candidate of candidates) {
				if (candidate.node === node.id) {
					candidate.nextAt = now + (candidate.phase === 'holding' ? HOLD_MS : FOLLOW_MS);
				}
			}

			setStatus(`${node.id} lost storage access`, 'warn');
		}
	}

	function toggleAlive(node) {
		if (node.alive) {
			node.alive = false;

			for (const candidate of candidates) {
				if (candidate.node !== node.id) continue;
				candidate.phase = 'following';
				candidate.errors = 0;
			}

			setStatus(`${node.id} stopped`, 'warn');
			return;
		}

		node.alive = true;

		for (const candidate of candidates) {
			if (candidate.node !== node.id) continue;
			candidate.phase = 'following';
			candidate.errors = 0;
			candidate.nextAt = now + 180 + Math.random() * 280;
		}

		setStatus(`${node.id} started`, 'ok');
	}

	function addNode() {
		if (nodes.length >= MAX_NODES) return;

		const node = { id: `node-${nextNodeNumber}`, alive: true, connected: true };
		nextNodeNumber += 1;
		nodes.push(node);

		for (const key of KEY_POOL) {
			candidates.push({
				key,
				node: node.id,
				phase: 'following',
				nextAt: now + 140 + Math.random() * 300,
				errors: 0
			});
		}

		setStatus(`${node.id} joined — ${nodes.length} nodes`, 'muted');
	}

	function removeNode() {
		if (nodes.length <= MIN_NODES) return;

		const node = nodes[nodes.length - 1];
		const freedKeys = [];

		for (const key of activeKeys) {
			const record = records[key];
			if (record.value !== node.id || record.deadline <= now) continue;
			record.deadline = now;
			record.expiredLogged = true;
			freedKeys.push(key);
		}

		candidates = candidates.filter((candidate) => candidate.node !== node.id);
		nodes.pop();
		nextNodeNumber = nodes.length + 1;

		for (const candidate of candidates) {
			if (!freedKeys.includes(candidate.key) || candidate.phase !== 'following') continue;
			candidate.nextAt = Math.min(candidate.nextAt, now + 140 + Math.random() * 260);
		}

		setStatus(
			freedKeys.length > 0
				? `${node.id} removed — released ${freedKeys.length} ${freedKeys.length === 1 ? 'key' : 'keys'}`
				: `${node.id} removed — ${nodes.length} nodes`,
			'warn'
		);
	}

	function setJobs(next) {
		const target = Math.max(MIN_JOBS, Math.min(MAX_JOBS, next));
		if (target === jobs) return;

		const previous = jobs;
		const added = target > previous;
		jobs = target;

		if (added) {
			for (const key of KEY_POOL.slice(previous, target)) {
				records[key] = { value: '', deadline: 0, expiredLogged: false };

				const keyIndex = KEY_POOL.indexOf(key);
				const preferred = preferredOwner(keyIndex, nodes);
				const order = [
					preferred,
					...nodes.map((node) => node.id).filter((id) => id !== preferred)
				];

				for (const candidate of candidates) {
					if (candidate.key !== key) continue;
					const rank = order.indexOf(candidate.node);
					candidate.phase = 'following';
					candidate.errors = 0;
					candidate.nextAt = now + (rank >= 0 ? rank * 45 : 260) + Math.random() * 40;
				}
			}
		} else {
			for (const key of KEY_POOL.slice(target, previous)) {
				records[key] = { value: '', deadline: 0, expiredLogged: false };

				for (const candidate of candidates) {
					if (candidate.key !== key) continue;
					candidate.phase = 'following';
					candidate.errors = 0;
					candidate.nextAt = now + 500 + Math.random() * 400;
				}
			}
		}

		setStatus(
			added
				? `${KEY_POOL[target - 1]} added — L=${target}`
				: `${KEY_POOL[previous - 1]} removed — L=${target}`,
			'muted'
		);
	}

	function toggleRunning() {
		running = !running;
	}

	function reset() {
		now = 0;
		jobs = 9;
		nextNodeNumber = 4;
		nodes = makeNodes();
		candidates = makeCandidates(nodes);
		records = makeRecords();
		running = true;
		setStatus('waiting for claims', 'muted');
	}

	onMount(() => {
		let previous = performance.now();

		const timer = window.setInterval(() => {
			const stamp = performance.now();
			const delta = Math.min(stamp - previous, 200);
			previous = stamp;

			if (!running) return;

			now += delta * speed;
			tick();
		}, 50);

		return () => window.clearInterval(timer);
	});
</script>

<section class="demo" aria-label="Leader election with independent keys">
	<header class="topbar">
		<div class="brand">
			<span class="live-dot" class:paused={!running} aria-hidden="true"></span>
			<span class="brand-title">multiple keys</span>
		</div>

		<label class="speed" title="Simulation speed">
			<input
				type="range"
				min="0.1"
				max="2"
				step="0.1"
				bind:value={speed}
				aria-label="Simulation speed"
			/>
			<span class="speed-value">{Number(speed).toFixed(1)}×</span>
		</label>

		<div class="actions">
			<button
				class="icon-btn"
				type="button"
				onclick={toggleRunning}
				title={running ? 'Pause' : 'Resume'}
				aria-label={running ? 'Pause simulation' : 'Resume simulation'}
			>
				{#if running}
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M9 5v14M15 5v14"></path>
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M8 5l11 7-11 7z"></path>
					</svg>
				{/if}
			</button>

			<button
				class="icon-btn"
				type="button"
				onclick={reset}
				title="Reset"
				aria-label="Reset simulation"
			>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M20 12a8 8 0 1 1-2.34-5.66"></path>
					<path d="M20 4v5h-5"></path>
				</svg>
			</button>
		</div>
	</header>

	<div class="metrics">
		<div class="metric jobs-metric">
			<span class="metric-key">L</span>
			<div class="stepper">
				<button
					type="button"
					onclick={() => setJobs(jobs - 1)}
					disabled={jobs <= MIN_JOBS}
					title="Remove a job"
					aria-label="Remove a job"
				>
					−
				</button>
				<b>{jobs}</b>
				<button
					type="button"
					onclick={() => setJobs(jobs + 1)}
					disabled={jobs >= MAX_JOBS}
					title="Add a job"
					aria-label="Add a job"
				>
					+
				</button>
			</div>
			<span class="metric-note">jobs</span>
		</div>

		<div class="metric">
			<span class="metric-key">N</span>
			<div class="stepper">
				<button
					type="button"
					onclick={removeNode}
					disabled={nodes.length <= MIN_NODES}
					title="Remove a node"
					aria-label="Remove a node"
				>
					−
				</button>
				<b>{nodes.length}</b>
				<button
					type="button"
					onclick={addNode}
					disabled={nodes.length >= MAX_NODES}
					title="Add a node"
					aria-label="Add a node"
				>
					+
				</button>
			</div>
			<span class="metric-note">nodes</span>
		</div>

		<span class="state-pill" title="There is no balancer: keys stay wherever they were claimed">
			no balancer
		</span>
	</div>

	<div
		class="board"
		style={`grid-template-columns: 3.2rem repeat(${nodes.length}, minmax(4rem, 1fr))`}
	>
		<span class="corner">storage</span>

		{#each nodes as node, column (node.id)}
			<div
				class="node-head"
				class:active={heldCount(node.id) > 0}
				class:cut={!node.connected}
				class:dead={!node.alive}
				style={`grid-column: ${column + 2}`}
			>
				<div class="node-line">
					<span class="node-id">{node.id}</span>

					<div class="node-tools">
						<button
							class="tool"
							class:cut={!node.connected}
							type="button"
							onclick={() => toggleLink(node)}
							disabled={!node.alive}
							title={!node.alive
								? 'Node is stopped'
								: node.connected
									? `Cut ${node.id} from storage`
									: `Reconnect ${node.id}`}
							aria-label={node.connected
								? `Cut ${node.id} storage access`
								: `Restore ${node.id} storage access`}
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
								<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
							</svg>
							{#if !node.connected}
								<span class="slash" aria-hidden="true"></span>
							{/if}
						</button>

						<button
							class="tool power"
							type="button"
							onclick={() => toggleAlive(node)}
							title={node.alive ? `Stop ${node.id}` : `Start ${node.id}`}
							aria-label={node.alive ? `Stop ${node.id}` : `Start ${node.id}`}
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<path d="M12 3v8"></path>
								<path d="M6.3 6.3a8 8 0 1 0 11.4 0"></path>
							</svg>
						</button>
					</div>
				</div>

				<div class="count" aria-label={`${heldCount(node.id)} of ${jobs} keys`}>
					<b>{heldCount(node.id)}</b><span>/{jobs}</span>
				</div>
			</div>
		{/each}

		{#each activeKeys as key, row (key)}
			<div class="key-name" style={`grid-row: ${row + 2}`}>{key}</div>

			{#each nodes as node, column (node.id)}
				{@const held = isHeldBy(key, node.id)}
				{@const stale = held && (!node.connected || !node.alive)}

				<div
					class="cell"
					class:held
					class:stale
					class:col-cut={!node.connected}
					class:col-dead={!node.alive}
					style={`grid-row: ${row + 2}; grid-column: ${column + 2}`}
					aria-label={held ? `${key} held by ${node.id}` : `${key} not held by ${node.id}`}
				>
					{#if held}
						<span class="cell-dot" aria-hidden="true"></span>
						<span class="cell-bar" style={`width: ${leasePercent(key)}%`}></span>
					{/if}
				</div>
			{/each}
		{/each}
	</div>

	<footer class="status-line" class:ok={statusTone === 'ok'} class:warn={statusTone === 'warn'} class:bad={statusTone === 'bad'} aria-live="polite">
		<span class="status-pip" aria-hidden="true"></span>
		<span class="status-text">{status}</span>
	</footer>
</section>

<style>
	.demo {
		--warn: #d9a441;
		--danger: #e06c5f;

		margin: 0;
		border: 1px solid var(--line, #252525);
		border-radius: var(--radius, 3px);
		background:
			linear-gradient(
				180deg,
				color-mix(in srgb, var(--bg-elevated, #151515) 72%, transparent),
				var(--bg-soft, #101010)
			);
		color: var(--text, #e8e6e0);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.78rem;
		line-height: 1.5;
		overflow: hidden;
	}

	.topbar,
	.brand,
	.actions,
	.metrics,
	.metric,
	.stepper,
	.node-line,
	.node-tools,
	.count,
	.status-line {
		display: flex;
		align-items: center;
	}

	.topbar {
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.45rem 1rem;
		padding: 0.55rem 0.75rem 0.55rem 0.85rem;
		border-bottom: 1px solid var(--line, #252525);
		background: color-mix(in srgb, var(--bg-elevated, #151515) 55%, transparent);
	}

	.brand {
		gap: 0.45rem;
		min-width: 0;
	}

	.brand-title {
		font-size: 0.66rem;
		font-weight: 500;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text, #e8e6e0);
	}

	.live-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent, #c8f56c);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #c8f56c) 14%, transparent);
		animation: pulse 1.8s ease-in-out infinite;
	}

	.live-dot.paused {
		background: var(--muted, #817d75);
		box-shadow: none;
		animation: none;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.45;
			transform: scale(0.85);
		}
		50% {
			opacity: 1;
			transform: scale(1);
		}
	}

	.speed {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin-left: auto;
		flex: none;
	}

	.speed input {
		width: 64px;
		height: 14px;
		margin: 0;
		accent-color: var(--accent, #c8f56c);
		cursor: pointer;
	}

	.speed-value {
		width: 2.05rem;
		color: var(--muted, #817d75);
		font-size: 0.56rem;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.actions {
		gap: 0.15rem;
		flex: none;
	}

	.icon-btn {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 2px;
		background: transparent;
		color: var(--muted, #817d75);
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease,
			background 140ms ease;
	}

	.icon-btn:hover {
		border-color: var(--line, #252525);
		background: var(--bg-soft, #101010);
		color: var(--accent, #c8f56c);
	}

	.icon-btn svg {
		width: 13px;
		height: 13px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.metrics {
		flex-wrap: wrap;
		gap: 0.4rem 1.1rem;
		padding: 0.5rem 0.85rem;
		border-bottom: 1px solid var(--line, #252525);
		background: color-mix(in srgb, var(--bg-soft, #101010) 45%, transparent);
		font-size: 0.57rem;
		color: var(--muted, #817d75);
	}

	.metric {
		gap: 0.32rem;
		min-width: 0;
	}

	.metric b {
		color: var(--text, #e8e6e0);
		font-size: 0.72rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	.metric-key {
		display: inline-grid;
		place-items: center;
		width: 1.05rem;
		height: 1.05rem;
		border: 1px solid var(--line-strong, #3b3b3b);
		border-radius: 2px;
		color: var(--muted, #817d75);
		font-size: 0.52rem;
		line-height: 1;
	}

	.metric-note {
		color: var(--muted, #817d75);
		font-size: 0.53rem;
		letter-spacing: 0.02em;
	}

	.jobs-metric {
		gap: 0.35rem;
	}

	.stepper {
		gap: 0.1rem;
	}

	.stepper button {
		display: grid;
		place-items: center;
		width: 16px;
		height: 16px;
		padding: 0;
		border: 1px solid var(--line, #252525);
		border-radius: 2px;
		background: transparent;
		color: var(--muted, #817d75);
		font-family: inherit;
		font-size: 0.7rem;
		line-height: 1;
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease;
	}

	.stepper button:hover:not(:disabled) {
		border-color: var(--accent, #c8f56c);
		color: var(--accent, #c8f56c);
	}

	.stepper button:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.state-pill {
		margin-left: auto;
		padding: 0.05rem 0.34rem;
		border: 1px solid var(--line-strong, #3b3b3b);
		border-radius: 2px;
		color: var(--muted, #817d75);
		font-size: 0.49rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.board {
		display: grid;
		gap: 6px 8px;
		padding: 0.8rem 0.85rem 0.9rem;
		align-items: stretch;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: thin;
		scrollbar-color: var(--line-strong, #3b3b3b) transparent;
	}

	.corner {
		grid-row: 1;
		grid-column: 1;
		align-self: end;
		padding-bottom: 0.3rem;
		color: var(--muted, #817d75);
		font-size: 0.51rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.node-head {
		grid-row: 1;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.35rem;
		min-width: 0;
		min-height: 54px;
		padding: 0.42rem 0.45rem 0.38rem;
		border: 1px solid var(--line, #252525);
		border-radius: 2px;
		background: color-mix(in srgb, var(--bg-elevated, #151515) 46%, transparent);
		transition:
			border-color 180ms ease,
			background 180ms ease;
	}

	.node-head.active {
		border-color: color-mix(in srgb, var(--accent, #c8f56c) 40%, var(--line, #252525));
		background:
			linear-gradient(
				180deg,
				color-mix(in srgb, var(--accent, #c8f56c) 8%, transparent),
				transparent
			),
			color-mix(in srgb, var(--bg-elevated, #151515) 58%, transparent);
	}

	.node-head.dead {
		border-style: dashed;
		background: color-mix(in srgb, var(--bg-soft, #101010) 42%, transparent);
	}

	.node-head.dead .node-id {
		color: var(--muted, #817d75);
	}

	.node-line {
		gap: 0.25rem;
		min-width: 0;
	}

	.node-id {
		flex: 1 1 auto;
		overflow: hidden;
		color: var(--text, #e8e6e0);
		font-size: 0.66rem;
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.node-tools {
		gap: 1px;
		flex: none;
	}

	.tool {
		position: relative;
		display: grid;
		place-items: center;
		width: 17px;
		height: 17px;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 2px;
		background: transparent;
		color: color-mix(in srgb, var(--muted, #817d75) 65%, transparent);
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease,
			background 140ms ease;
	}

	.tool:hover:not(:disabled) {
		border-color: var(--line, #252525);
		background: var(--bg-soft, #101010);
		color: var(--accent, #c8f56c);
	}

	.tool:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.tool svg {
		width: 10px;
		height: 10px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.tool.cut {
		color: var(--danger);
	}

	.node-head.dead .power {
		color: var(--danger);
		opacity: 1;
	}

	.slash {
		position: absolute;
		width: 12px;
		height: 1.5px;
		border-radius: 1px;
		background: var(--danger);
		transform: rotate(-45deg);
	}

	.count {
		gap: 0;
		color: var(--muted, #817d75);
		font-size: 0.55rem;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	.count b {
		color: var(--accent, #c8f56c);
		font-weight: 500;
		font-size: 0.7rem;
	}

	.node-head.cut .count b {
		color: var(--warn);
	}

	.node-head.dead .count b {
		color: var(--danger);
	}

	.key-name {
		grid-column: 1;
		display: flex;
		align-items: center;
		padding-right: 0.2rem;
		color: var(--text-soft, #b4b1a9);
		font-size: 0.64rem;
		font-variant-numeric: tabular-nums;
	}

	.cell {
		position: relative;
		min-width: 0;
		min-height: 30px;
		border: 1px solid color-mix(in srgb, var(--line, #252525) 72%, transparent);
		border-radius: 2px;
		background: color-mix(in srgb, var(--bg-elevated, #151515) 26%, transparent);
		overflow: hidden;
		transition:
			border-color 180ms ease,
			background 180ms ease,
			opacity 180ms ease;
	}

	.cell.held {
		border-color: color-mix(in srgb, var(--accent, #c8f56c) 40%, var(--line, #252525));
		background: color-mix(in srgb, var(--accent, #c8f56c) 7%, transparent);
	}

	.cell.stale {
		border-color: color-mix(in srgb, var(--warn) 50%, var(--line, #252525));
		background: color-mix(in srgb, var(--warn) 7%, transparent);
	}

	.cell.col-cut:not(.held) {
		opacity: 0.4;
	}

	.cell.col-dead:not(.held) {
		opacity: 0.3;
	}

	.cell-dot {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent, #c8f56c);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #c8f56c) 12%, transparent);
		transform: translate(-50%, -50%);
	}

	.cell.stale .cell-dot {
		background: var(--warn);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--warn) 12%, transparent);
	}

	.cell-bar {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 2px;
		background: var(--accent, #c8f56c);
		transition: width 80ms linear;
	}

	.cell.stale .cell-bar {
		background: var(--warn);
	}

	.status-line {
		gap: 0.42rem;
		min-height: 2rem;
		padding: 0.42rem 0.85rem 0.5rem;
		border-top: 1px solid var(--line, #252525);
		color: var(--muted, #817d75);
		font-size: 0.59rem;
	}

	.status-pip {
		width: 4px;
		height: 4px;
		flex: none;
		border-radius: 50%;
		background: var(--line-strong, #3b3b3b);
	}

	.status-line.ok .status-pip {
		background: var(--accent, #c8f56c);
	}

	.status-line.warn .status-pip {
		background: var(--warn);
	}

	.status-line.bad .status-pip {
		background: var(--danger);
	}

	.status-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (max-width: 640px) {
		.topbar {
			gap: 0.35rem 0.65rem;
			padding-inline: 0.6rem;
		}

		.brand-title {
			font-size: 0.6rem;
			letter-spacing: 0.1em;
		}

		.speed {
			gap: 0.25rem;
		}

		.speed input {
			width: 48px;
		}

		.speed-value {
			width: 1.8rem;
			font-size: 0.5rem;
		}

		.icon-btn {
			width: 24px;
			height: 24px;
		}

		.metrics {
			gap: 0.35rem 0.7rem;
			padding: 0.45rem 0.6rem;
		}

		.metric b {
			font-size: 0.66rem;
		}

		.board {
			gap: 4px 5px;
			padding: 0.65rem 0.6rem 0.75rem;
		}

		.node-head {
			min-height: 48px;
			padding: 0.35rem 0.28rem 0.32rem;
		}

		.node-id {
			font-size: 0.5rem;
		}

		.tool {
			width: 12px;
			height: 12px;
		}

		.tool svg {
			width: 7px;
			height: 7px;
		}

		.cell {
			min-height: 27px;
		}

		.key-name {
			font-size: 0.56rem;
		}

		.status-line {
			font-size: 0.55rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.live-dot {
			animation: none;
		}
	}
</style>
