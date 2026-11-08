<script>
	import { onMount } from 'svelte';

	const KEY = 'default';
	const TTL_MS = 2800;
	const FOLLOW_MS = 800;
	const HOLD_MS = 400;
	const MAX_NODES = 5;
	const ERRS_TO_FALLBACK = 3;

	let now = $state(0);
	let running = $state(true);
	let speed = $state(1);
	let nodes = $state(makeRoster());
	let storage = $state(emptyStorage());
	let status = $state('cut a link to test the lease');
	let statusTone = $state('muted');
	let pulseSeq = 0;
	let nextNodeNumber = 4;

	let remaining = $derived(Math.max(0, storage.deadline - now));
	let leasePercent = $derived(
		storage.exists && storage.deadline > now
			? Math.max(0, Math.min(100, (remaining / TTL_MS) * 100))
			: 0
	);
	let holder = $derived(
		storage.exists && storage.value && storage.deadline > now ? storage.value : ''
	);
	let leaseState = $derived(
		!storage.exists || !storage.value
			? 'free'
			: storage.deadline > now
				? 'held'
				: 'expired'
	);

	function emptyStorage() {
		return { exists: false, value: '', deadline: 0, expiredLogged: false };
	}

	function makeNode(number, offset) {
		return {
			id: `node-${number}`,
			alive: true,
			leader: false,
			phase: 'following',
			nextAt: offset,
			connected: true,
			errors: 0,
			outPulse: 0
		};
	}

	function makeRoster() {
		return [makeNode(1, 0), makeNode(2, 180), makeNode(3, 360)];
	}

	function fmt(ms) {
		return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
	}

	function setStatus(text, tone = 'muted') {
		status = text;
		statusTone = tone;
	}

	function pulse(node) {
		node.outPulse = ++pulseSeq;
	}

	/**
	 * SetNX only writes when the record is missing or its lease has expired.
	 * A disconnected node still follows; its storage calls simply fail.
	 */
	function trySetNx(node) {
		if (!node.connected) {
			node.nextAt = now + FOLLOW_MS;
			return;
		}

		pulse(node);

		if (storage.exists && storage.deadline > now) {
			node.nextAt = now + FOLLOW_MS;
			return;
		}

		storage.exists = true;
		storage.value = node.id;
		storage.deadline = now + TTL_MS;
		storage.expiredLogged = false;

		node.leader = true;
		node.phase = 'holding';
		node.errors = 0;
		node.nextAt = now + HOLD_MS;

		setStatus(`${node.id} holds the lease`, 'ok');
	}

	/**
	 * Renew extends the deadline, Get verifies ownership. A disconnected
	 * leader keeps its title for ERRS_TO_FALLBACK failed renewals.
	 */
	function hold(node) {
		if (!node.connected) {
			node.errors += 1;
			node.nextAt = now + HOLD_MS;

			if (node.errors >= ERRS_TO_FALLBACK) {
				node.errors = 0;
				node.leader = false;
				node.phase = 'following';
				node.nextAt = now + FOLLOW_MS;
				setStatus(`${node.id} lost leadership`, 'bad');
			}
			return;
		}

		if (storage.exists) {
			storage.deadline = now + TTL_MS;
			storage.expiredLogged = false;
		}

		pulse(node);

		const current = storage.exists && storage.deadline > now ? storage.value : '';

		if (current !== node.id) {
			node.leader = false;
			node.phase = 'following';
			node.errors = 0;
			node.nextAt = now + FOLLOW_MS;

			if (storage.exists && storage.value === node.id) {
				storage.deadline = now;
				storage.expiredLogged = true;
			}

			setStatus(`${node.id} lost leadership`, 'bad');
			return;
		}

		node.errors = 0;
		node.nextAt = now + HOLD_MS;
	}

	function tick() {
		if (storage.exists && storage.value && storage.deadline <= now && !storage.expiredLogged) {
			storage.expiredLogged = true;
			setStatus('lease expired', 'warn');
		}

		for (const node of nodes) {
			if (!node.alive) continue;

			let guard = 0;
			while (now >= node.nextAt && guard++ < 4) {
				if (node.phase === 'holding') hold(node);
				else trySetNx(node);
			}
		}
	}

	function toggleLink(node) {
		if (!node.alive) return;

		node.connected = !node.connected;
		node.errors = 0;

		if (node.connected) {
			// If the node stepped down after exhausting retries but its own
			// lease never expired, it is still the unique owner. Resume it
			// instead of leaving the key stale until the deadline.
			if (storage.exists && storage.value === node.id && storage.deadline > now) {
				node.leader = true;
				node.phase = 'holding';
				node.errors = 0;
				node.nextAt = now + HOLD_MS;
				setStatus(`${node.id} resumed the lease`, 'ok');
				return;
			}

			node.nextAt = now + 180 + Math.random() * 260;
			setStatus(`${node.id} reconnected`, 'ok');
		} else {
			node.nextAt = now + (node.phase === 'holding' ? HOLD_MS : FOLLOW_MS);
			setStatus(`${node.id} lost storage access`, 'warn');
		}
	}

	function toggleAlive(node) {
		if (node.alive) {
			node.alive = false;
			node.leader = false;
			node.phase = 'offline';
			node.errors = 0;
			setStatus(`${node.id} stopped`, 'warn');
			return;
		}

		node.alive = true;
		node.leader = false;
		node.phase = 'following';
		node.errors = 0;
		node.nextAt = now + 220 + Math.random() * 280;
		setStatus(`${node.id} started`, 'ok');
	}

	function addNode() {
		if (nodes.length >= MAX_NODES) return;

		const node = makeNode(nextNodeNumber++, now + 180 + Math.random() * 260);
		nodes.push(node);
		setStatus(`${node.id} joined`, 'muted');
	}

	function toggleRunning() {
		running = !running;
	}

	function reset() {
		now = 0;
		nodes = makeRoster();
		storage = emptyStorage();
		nextNodeNumber = 4;
		running = true;
		setStatus('cut a link to test the lease', 'muted');
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

<section class="demo" aria-label="Interactive leader election simulation">
	<header class="topbar">
		<div class="brand">
			<span class="live-dot" class:paused={!running} aria-hidden="true"></span>
			<span class="brand-title">leader election</span>
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

			<button
				class="icon-btn"
				type="button"
				onclick={addNode}
				disabled={nodes.length >= MAX_NODES}
				title={nodes.length >= MAX_NODES ? 'Five nodes is the limit' : 'Add a node'}
				aria-label="Add a node"
			>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M12 5v14M5 12h14"></path>
				</svg>
			</button>
		</div>
	</header>

	<div class="stage">
		{#each nodes as node, index (node.id)}
			<div class="node-cell" style={`grid-row: ${index + 1}`}>
				<div class="node" class:leader={node.leader} class:dead={!node.alive}>
					<div class="node-top">
						<span class="role-dot" class:on={node.leader} aria-hidden="true"></span>
						<span class="node-id">{node.id}</span>

						<button
							class="power-btn"
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

					<div class="node-bottom">
						{#if node.leader}
							<span class="leader-tag">leader</span>
						{/if}

						{#if node.errors > 0}
							<span class="pips" aria-hidden="true">
								{#each [0, 1, 2] as level}
									<span class="pip" class:on={node.errors > level}></span>
								{/each}
							</span>
						{/if}
					</div>
				</div>
			</div>

			<div
				class="link-cell"
				class:leader={node.leader}
				class:cut={!node.connected}
				class:dead={!node.alive}
				style={`grid-row: ${index + 1}`}
			>
				<span class="wire" aria-hidden="true"></span>
				<span class="arrowhead" aria-hidden="true"></span>

				{#if node.alive && node.connected && node.outPulse > 0}
					{#key node.outPulse}
						<span class="packet" aria-hidden="true"></span>
					{/key}
				{/if}

				<button
					class="link-btn"
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
			</div>
		{/each}

		<section
			class="storage"
			class:held={leaseState === 'held'}
			class:expired={leaseState === 'expired'}
			style={`grid-row: 1 / span ${nodes.length}`}
			aria-label="Shared storage"
		>
			<div class="storage-top">
				<span class="storage-title">storage</span>
				<span class="state-pill" class:held={leaseState === 'held'} class:expired={leaseState === 'expired'}>
					{leaseState}
				</span>
			</div>

			<span class="key-chip">{KEY}</span>

			<div
				class="storage-value"
				class:empty={leaseState === 'free'}
				class:stale={leaseState === 'expired'}
			>
				{leaseState === 'free' ? '—' : storage.value}
			</div>

			<div class="lease-track">
				<span
					class="lease-fill"
					class:low={leasePercent < 28}
					style={`width: ${leasePercent}%`}
				></span>
			</div>

			<div class="lease-time">
				{leaseState === 'held' ? fmt(remaining) : ''}
			</div>
		</section>
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
	.node-top,
	.node-bottom,
	.storage-top,
	.status-line {
		display: flex;
		align-items: center;
	}

	.topbar {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
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

	.icon-btn:hover:not(:disabled) {
		border-color: var(--line, #252525);
		background: var(--bg-soft, #101010);
		color: var(--accent, #c8f56c);
	}

	.icon-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
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

	.stage {
		display: grid;
		grid-template-columns: minmax(150px, 210px) minmax(64px, 1fr) minmax(170px, 230px);
		grid-auto-rows: minmax(78px, auto);
		row-gap: 11px;
		padding: 0.9rem 0.85rem;
		align-items: stretch;
	}

	.node-cell {
		grid-column: 1;
		display: flex;
		min-width: 0;
	}

	.node {
		position: relative;
		display: flex;
		flex: 1;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.55rem;
		min-width: 0;
		min-height: 78px;
		padding: 0.55rem 0.6rem 0.5rem;
		border: 1px solid var(--line, #252525);
		border-radius: 2px;
		background: color-mix(in srgb, var(--bg-elevated, #151515) 46%, transparent);
		transition:
			border-color 180ms ease,
			background 180ms ease;
	}

	.node.leader {
		border-color: color-mix(in srgb, var(--accent, #c8f56c) 45%, var(--line, #252525));
		background:
			linear-gradient(
				90deg,
				color-mix(in srgb, var(--accent, #c8f56c) 10%, transparent),
				transparent 65%
			),
			color-mix(in srgb, var(--bg-elevated, #151515) 60%, transparent);
	}

	.node.leader::before {
		content: '';
		position: absolute;
		left: -1px;
		top: 8px;
		bottom: 8px;
		width: 2px;
		background: var(--accent, #c8f56c);
	}

	.node.dead {
		border-style: dashed;
		background: color-mix(in srgb, var(--bg-soft, #101010) 42%, transparent);
	}

	.node.dead .node-id {
		color: var(--muted, #817d75);
	}

	.node.dead .role-dot {
		opacity: 0.4;
	}

	.node-top {
		gap: 0.42rem;
		min-width: 0;
	}

	.role-dot {
		width: 5px;
		height: 5px;
		flex: none;
		border: 1px solid var(--line-strong, #3b3b3b);
		border-radius: 50%;
		background: transparent;
		transition:
			background 180ms ease,
			border-color 180ms ease,
			box-shadow 180ms ease;
	}

	.role-dot.on {
		border-color: var(--accent, #c8f56c);
		background: var(--accent, #c8f56c);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #c8f56c) 14%, transparent);
	}

	.node-id {
		flex: 1 1 auto;
		overflow: hidden;
		color: var(--text, #e8e6e0);
		font-size: 0.72rem;
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.power-btn {
		display: grid;
		flex: none;
		place-items: center;
		width: 18px;
		height: 18px;
		padding: 0;
		margin: 0 -0.15rem 0 0;
		border: 1px solid transparent;
		border-radius: 2px;
		background: transparent;
		color: color-mix(in srgb, var(--muted, #817d75) 55%, transparent);
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease,
			background 140ms ease;
	}

	.power-btn:hover {
		border-color: var(--line, #252525);
		background: var(--bg-soft, #101010);
		color: var(--danger);
	}

	.power-btn svg {
		width: 11px;
		height: 11px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
	}

	.node.dead .power-btn {
		color: var(--danger);
	}

	.node-bottom {
		justify-content: space-between;
		gap: 0.4rem;
		min-height: 0.8rem;
	}

	.leader-tag {
		color: var(--accent, #c8f56c);
		font-size: 0.51rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.pips {
		display: flex;
		gap: 2px;
		margin-left: auto;
	}

	.pip {
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: var(--line-strong, #3b3b3b);
	}

	.pip.on {
		background: var(--danger);
	}

	.link-cell {
		position: relative;
		grid-column: 2;
		min-height: 78px;
	}

	.wire {
		position: absolute;
		top: 50%;
		right: 0;
		left: 0;
		height: 1px;
		background: var(--line-strong, #3b3b3b);
		transition:
			background 180ms ease,
			border-color 180ms ease;
	}

	.arrowhead {
		position: absolute;
		top: 50%;
		right: -1px;
		transform: translateY(-50%);
		border-top: 4px solid transparent;
		border-bottom: 4px solid transparent;
		border-left: 5px solid var(--line-strong, #3b3b3b);
		transition: border-color 180ms ease;
	}

	.link-cell.leader .wire {
		background: color-mix(in srgb, var(--accent, #c8f56c) 60%, var(--line, #252525));
	}

	.link-cell.leader .arrowhead {
		border-left-color: var(--accent, #c8f56c);
	}

	.link-cell.cut .wire {
		top: 50%;
		height: 0;
		border-top: 1px dashed var(--danger);
		background: transparent;
	}

	.link-cell.cut .arrowhead {
		border-left-color: color-mix(in srgb, var(--danger) 60%, var(--line, #252525));
	}

	.link-cell.dead {
		opacity: 0.45;
	}

	.link-cell.dead .wire {
		background: var(--line, #252525);
	}

	.link-cell.dead .arrowhead {
		border-left-color: var(--line, #252525);
	}

	.link-btn {
		position: absolute;
		top: 50%;
		left: 50%;
		z-index: 2;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 1px solid var(--line-strong, #3b3b3b);
		border-radius: 2px;
		background: var(--bg-soft, #101010);
		color: var(--muted, #817d75);
		cursor: pointer;
		transform: translate(-50%, -50%);
		transition:
			color 140ms ease,
			border-color 140ms ease,
			background 140ms ease;
	}

	.link-btn:hover:not(:disabled) {
		border-color: var(--accent, #c8f56c);
		color: var(--accent, #c8f56c);
	}

	.link-btn:disabled {
		cursor: not-allowed;
	}

	.link-btn svg {
		width: 12px;
		height: 12px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.link-cell.cut .link-btn {
		border-color: color-mix(in srgb, var(--danger) 55%, var(--line, #252525));
		background: color-mix(in srgb, var(--danger) 9%, var(--bg-soft, #101010));
		color: var(--danger);
	}

	.slash {
		position: absolute;
		width: 15px;
		height: 1.5px;
		border-radius: 1px;
		background: var(--danger);
		transform: rotate(-45deg);
	}

	.packet {
		position: absolute;
		top: 50%;
		left: 0;
		z-index: 1;
		width: 5px;
		height: 5px;
		margin-top: -2.5px;
		border-radius: 50%;
		background: var(--accent, #c8f56c);
		box-shadow: 0 0 6px color-mix(in srgb, var(--accent, #c8f56c) 45%, transparent);
		pointer-events: none;
		animation: flow-out 520ms ease-out forwards;
	}

	@keyframes flow-out {
		0% {
			left: 0;
			opacity: 0;
		}
		20% {
			opacity: 1;
		}
		100% {
			left: calc(100% - 6px);
			opacity: 0;
		}
	}

	.storage {
		grid-column: 3;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.42rem;
		min-width: 0;
		padding: 0.75rem;
		border: 1px solid var(--line, #252525);
		border-radius: 2px;
		background: color-mix(in srgb, var(--bg-soft, #101010) 62%, transparent);
		transition:
			border-color 180ms ease,
			background 180ms ease;
	}

	.storage.held {
		border-color: color-mix(in srgb, var(--accent, #c8f56c) 35%, var(--line, #252525));
	}

	.storage.expired {
		border-color: color-mix(in srgb, var(--warn) 30%, var(--line, #252525));
	}

	.storage-top {
		justify-content: space-between;
		gap: 0.5rem;
	}

	.storage-title {
		color: var(--muted, #817d75);
		font-size: 0.57rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.state-pill {
		padding: 0.02rem 0.28rem;
		border: 1px solid var(--line-strong, #3b3b3b);
		border-radius: 2px;
		color: var(--muted, #817d75);
		font-size: 0.5rem;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.state-pill.held {
		border-color: color-mix(in srgb, var(--accent, #c8f56c) 45%, var(--line, #252525));
		color: var(--accent, #c8f56c);
	}

	.state-pill.expired {
		border-color: color-mix(in srgb, var(--warn) 45%, var(--line, #252525));
		color: var(--warn);
	}

	.key-chip {
		align-self: flex-start;
		max-width: 100%;
		overflow: hidden;
		padding: 0.02rem 0.28rem;
		border: 1px solid var(--line, #252525);
		border-radius: 2px;
		background: color-mix(in srgb, var(--bg, #0b0b0b) 35%, transparent);
		color: var(--muted, #817d75);
		font-size: 0.57rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.storage-value {
		min-height: 1.55em;
		overflow: hidden;
		color: var(--accent, #c8f56c);
		font-size: 1.02rem;
		font-weight: 500;
		line-height: 1.35;
		text-align: center;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.storage-value.empty {
		color: var(--muted, #817d75);
		font-weight: 400;
	}

	.storage-value.stale {
		color: var(--warn);
		font-weight: 400;
		text-decoration: line-through;
		text-decoration-thickness: 1px;
	}

	.lease-track {
		height: 4px;
		overflow: hidden;
		border-radius: 1px;
		background: color-mix(in srgb, var(--line, #252525) 80%, transparent);
	}

	.lease-fill {
		display: block;
		height: 100%;
		background: var(--accent, #c8f56c);
		transition: width 80ms linear;
	}

	.lease-fill.low {
		background: var(--warn);
	}

	.lease-time {
		min-height: 0.8em;
		color: var(--muted, #817d75);
		font-size: 0.54rem;
		font-variant-numeric: tabular-nums;
		text-align: right;
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

		.stage {
			grid-template-columns: minmax(112px, 1fr) 42px minmax(118px, 0.9fr);
			grid-auto-rows: minmax(64px, auto);
			row-gap: 8px;
			padding: 0.65rem 0.6rem;
		}

		.node {
			min-height: 64px;
			padding: 0.45rem 0.5rem 0.4rem;
		}

		.node-id {
			font-size: 0.64rem;
		}

		.leader-tag {
			font-size: 0.46rem;
		}

		.link-cell {
			min-height: 64px;
		}

		.link-btn {
			width: 22px;
			height: 22px;
		}

		.power-btn {
			width: 16px;
			height: 16px;
		}

		.link-btn svg {
			width: 10px;
			height: 10px;
		}

		.storage {
			gap: 0.32rem;
			padding: 0.5rem 0.45rem;
		}

		.storage-title {
			font-size: 0.5rem;
		}

		.storage-value {
			font-size: 0.82rem;
		}

		.state-pill,
		.key-chip {
			font-size: 0.46rem;
		}

		.status-line {
			font-size: 0.55rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.live-dot {
			animation: none;
		}

		.packet {
			display: none;
		}
	}
</style>
