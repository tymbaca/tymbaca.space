<script>
	import { onMount } from 'svelte';

	const KEY_POOL = Array.from({ length: 12 }, (_, index) => `job${index + 1}`);

	const MIN_JOBS = 6;
	const MAX_JOBS = 12;
	const MIN_NODES = 2;
	const MAX_NODES = 6;

	const TTL_MS = 3000;
	const HOLD_MS = 450;
	const FOLLOW_MS = 850;
	const ERRS_TO_FALLBACK = 3;

	/** The balancer's own check loop: ~1s with jitter, like WithCheckRate. */
	const CHECK_MS = 1300;
	const CHECK_JITTER_MS = 600;

	/** Liveness records: nodes counted in C are the ones that renewed recently. */
	const LIVENESS_RATE_MS = 700;
	const LIVENESS_TIMEOUT_MS = 2200;

	/** After shedding, the node gives the free leases a head start. */
	const SHED_COOLDOWN_MS = 1200;
	const SHED_BLOCK_MS = 2600;
	const SHED_FLASH_MS = 1100;
	const CLAIM_FLASH_MS = 700;

	let now = $state(0);
	let running = $state(true);
	let speed = $state(1);

	let jobs = $state(9);
	let nodes = $state(makeRoster());
	let records = $state(makeRecords());
	let candidates = $state(makeCandidates(nodes));
	let shedMarks = $state({});
	let shedBlock = $state({});

	let status = $state('slow start: node-1 holds 7 of 9 leases');
	let statusTone = $state('muted');
	let nextNodeNumber = 4;
	let wasBalanced = false;

	let activeKeys = $derived(KEY_POOL.slice(0, jobs));
	let activeCount = $derived(nodes.filter((node) => node.livenessDeadline > now).length);
	let limit = $derived(activeCount > 0 ? Math.ceil(jobs / activeCount) : 0);
	let heldTotal = $derived(nodes.reduce((sum, node) => sum + heldCount(node.id), 0));
	let unownedCount = $derived(jobs - heldTotal);
	let staleCount = $derived(activeKeys.filter((key) => isStale(key)).length);
	let overCount = $derived(
		nodes.filter((node) => node.alive && node.connected && heldCount(node.id) > limit).length
	);
	let settled = $derived(
		activeCount > 0 && overCount === 0 && unownedCount === 0 && staleCount === 0
	);
	let phaseLabel = $derived(
		activeCount === 0
			? 'idle'
			: overCount > 0
				? 'shedding'
				: unownedCount > 0
					? 'claiming'
					: staleCount > 0
						? 'recovering'
						: 'balanced'
	);

	function blankRecord() {
		return { value: '', deadline: 0, expiredLogged: false, claimedAt: -9000 };
	}

	/**
	 * Skewed cold start: a node that was slow to start left seven leases on
	 * node-1, two on node-2 and none on node-3. The balancer will fix it.
	 */
	function seedOwner(index) {
		if (index < 7) return 'node-1';
		if (index < 9) return 'node-2';
		return '';
	}

	function makeSeedNode(index) {
		const number = index + 1;

		return {
			id: `node-${number}`,
			alive: true,
			connected: true,
			livenessDeadline: LIVENESS_TIMEOUT_MS,
			nextLivenessAt: 180 + index * 120,
			nextCheckAt: 950 + index * 210,
			wasLive: true,
			claimCooldownUntil: 0,
			shedUntil: 0,
			lastShed: 0
		};
	}

	function makeRoster() {
		return [0, 1, 2].map((index) => makeSeedNode(index));
	}

	function makeLiveNode(number) {
		return {
			id: `node-${number}`,
			alive: true,
			connected: true,
			livenessDeadline: now + LIVENESS_TIMEOUT_MS,
			nextLivenessAt: now + LIVENESS_RATE_MS,
			nextCheckAt: now + CHECK_MS + Math.random() * CHECK_JITTER_MS,
			wasLive: true,
			claimCooldownUntil: 0,
			shedUntil: 0,
			lastShed: 0
		};
	}

	function makeRecords() {
		const next = {};

		KEY_POOL.forEach((key, index) => {
			const owner = seedOwner(index);
			next[key] = owner
				? {
						value: owner,
						deadline: TTL_MS - index * 55,
						expiredLogged: false,
						claimedAt: -9000
					}
				: blankRecord();
		});

		return next;
	}

	function makeCandidates(roster) {
		const list = [];

		KEY_POOL.forEach((key, keyIndex) => {
			roster.forEach((node, nodeIndex) => {
				const holding = seedOwner(keyIndex) === node.id;

				list.push({
					key,
					node: node.id,
					phase: holding ? 'holding' : 'following',
					nextAt: holding
						? 260 + keyIndex * 45
						: 620 + keyIndex * 55 + nodeIndex * 140 + Math.random() * 280,
					errors: 0
				});
			});
		});

		return list;
	}

	function nodeById(id) {
		return nodes.find((node) => node.id === id);
	}

	function ownerOf(key) {
		const record = records[key];
		if (!record || !record.value || record.deadline <= now) return '';
		return record.value;
	}

	function isHeldBy(key, nodeId) {
		return ownerOf(key) === nodeId;
	}

	function isStale(key) {
		const owner = ownerOf(key);
		if (!owner) return false;
		const node = nodeById(owner);
		return !node || !node.alive || !node.connected;
	}

	function heldKeysOf(nodeId) {
		return activeKeys.filter((key) => isHeldBy(key, nodeId));
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

	function followGap() {
		return FOLLOW_MS * (0.8 + Math.random() * 0.5);
	}

	function setStatus(text, tone = 'muted') {
		status = text;
		statusTone = tone;
	}

	function nudgeChecks() {
		for (const node of nodes) {
			node.nextCheckAt = Math.min(node.nextCheckAt, now + 400 + Math.random() * 400);
		}
	}

	function shed(node, key) {
		const record = records[key];
		if (!record || record.value !== node.id || record.deadline <= now) return;

		// Lease shedding: drop the deadline to now, exactly like the library's
		// Renew(key, now). The next SetNX wins, not necessarily this node.
		record.deadline = now;
		record.expiredLogged = true;
		shedMarks[key] = { from: node.id, at: now };
		shedBlock[key] = { node: node.id, until: now + SHED_BLOCK_MS };

		const candidate = candidates.find((item) => item.key === key && item.node === node.id);
		if (candidate) {
			candidate.phase = 'following';
			candidate.errors = 0;
			candidate.nextAt = now + SHED_COOLDOWN_MS + Math.random() * 250;
		}
	}

	/**
	 * Mirrors needDrop in the balancer: M = ceil(L / C), and a node holding
	 * more than M leases receives drop signals for the excess.
	 */
	function checkBalance(node) {
		if (activeCount <= 0) return;

		const currentLimit = Math.ceil(jobs / activeCount);
		const held = heldKeysOf(node.id);
		const excess = held.length - currentLimit;
		if (excess <= 0) return;

		const pool = [...held];
		const shedKeys = [];

		for (let i = 0; i < excess && pool.length > 0; i += 1) {
			const index = Math.floor(Math.random() * pool.length);
			shedKeys.push(pool.splice(index, 1)[0]);
		}

		for (const key of shedKeys) shed(node, key);

		node.claimCooldownUntil = now + SHED_COOLDOWN_MS;
		node.lastShed = shedKeys.length;
		node.shedUntil = now + SHED_FLASH_MS;

		const label = shedKeys.length === 1 ? shedKeys[0] : `${shedKeys.length} leases`;
		setStatus(`${node.id}: ${held.length} > M=${currentLimit} → shed ${label}`, 'warn');
	}

	function trySetNx(candidate) {
		const node = nodeById(candidate.node);

		if (!node || !node.alive || !node.connected) {
			candidate.nextAt = now + FOLLOW_MS;
			return;
		}

		const record = records[candidate.key];

		if (record.value && record.deadline > now) {
			candidate.nextAt = now + followGap();
			return;
		}

		if (node.claimCooldownUntil > now) {
			candidate.nextAt = now + 260;
			return;
		}

		const block = shedBlock[candidate.key];
		if (block && block.node === node.id && block.until > now) {
			candidate.nextAt = now + 300;
			return;
		}

		record.value = node.id;
		record.deadline = now + TTL_MS;
		record.expiredLogged = false;
		record.claimedAt = now;

		candidate.phase = 'holding';
		candidate.errors = 0;
		candidate.nextAt = now + HOLD_MS;

		setStatus(`${candidate.key} → ${node.id}`, 'ok');
	}

	function hold(candidate) {
		const node = nodeById(candidate.node);

		if (!node || !node.alive || !node.connected) {
			candidate.errors += 1;
			candidate.nextAt = now + HOLD_MS;

			if (candidate.errors >= ERRS_TO_FALLBACK) {
				candidate.errors = 0;
				candidate.phase = 'following';
				candidate.nextAt = now + followGap();
				setStatus(`${candidate.node} lost ${candidate.key}`, 'bad');
			}
			return;
		}

		const record = records[candidate.key];
		const current = record.value && record.deadline > now ? record.value : '';

		if (current !== candidate.node) {
			candidate.phase = 'following';
			candidate.errors = 0;
			candidate.nextAt = now + followGap();

			if (record.value === candidate.node && record.deadline > now) {
				record.deadline = now;
				record.expiredLogged = true;
			}

			setStatus(`${candidate.node} lost ${candidate.key}`, 'bad');
			return;
		}

		record.deadline = now + TTL_MS;
		record.expiredLogged = false;
		candidate.errors = 0;
		candidate.nextAt = now + HOLD_MS;
	}

	function expireNotices() {
		for (const key of activeKeys) {
			const record = records[key];

			if (!record.value || record.deadline > now || record.expiredLogged) continue;

			record.expiredLogged = true;

			const owner = nodeById(record.value);
			if (!owner || !owner.alive || !owner.connected) {
				setStatus(`${key} lease expired`, 'warn');
			}
		}
	}

	function tick() {
		expireNotices();

		for (const candidate of candidates) {
			if (KEY_POOL.indexOf(candidate.key) >= jobs) continue;

			const node = nodeById(candidate.node);
			if (!node || !node.alive) continue;

			let guard = 0;
			while (now >= candidate.nextAt && guard < 4) {
				guard += 1;
				if (candidate.phase === 'holding') hold(candidate);
				else trySetNx(candidate);
			}
		}

		for (const node of nodes) {
			if (node.alive && node.connected && now >= node.nextLivenessAt) {
				node.livenessDeadline = now + LIVENESS_TIMEOUT_MS;
				node.nextLivenessAt = now + LIVENESS_RATE_MS * (0.85 + Math.random() * 0.3);
			}

			const live = node.livenessDeadline > now;

			if (node.wasLive && !live) {
				const c = activeCount;
				setStatus(
					`${node.id} liveness expired → C=${c}, M=${c > 0 ? Math.ceil(jobs / c) : '—'}`,
					'warn'
				);
			}

			node.wasLive = live;
		}

		for (const node of nodes) {
			if (!node.alive || !node.connected || now < node.nextCheckAt) continue;

			node.nextCheckAt = now + CHECK_MS + Math.random() * CHECK_JITTER_MS;
			checkBalance(node);
		}

		if (settled && !wasBalanced) {
			setStatus('balanced — no node holds more than M leases', 'ok');
			wasBalanced = true;
		} else if (!settled) {
			wasBalanced = false;
		}
	}

	function resumeNode(node) {
		if (!node.alive || !node.connected) return 0;

		node.livenessDeadline = now + LIVENESS_TIMEOUT_MS;
		node.nextLivenessAt = now + LIVENESS_RATE_MS;
		node.wasLive = true;

		let resumed = 0;

		for (const candidate of candidates) {
			if (candidate.node !== node.id) continue;
			if (KEY_POOL.indexOf(candidate.key) >= jobs) continue;

			candidate.errors = 0;

			if (isHeldBy(candidate.key, node.id)) {
				candidate.phase = 'holding';
				candidate.nextAt = now + HOLD_MS;
				resumed += 1;
			} else {
				candidate.phase = 'following';
				candidate.nextAt = now + 180 + Math.random() * 420;
			}
		}

		return resumed;
	}

	function toggleLink(node) {
		if (!node.alive) return;

		node.connected = !node.connected;

		if (node.connected) {
			const resumed = resumeNode(node);
			nudgeChecks();

			setStatus(
				resumed > 0
					? `${node.id} reconnected — resumed ${resumed} ${resumed === 1 ? 'lease' : 'leases'}`
					: `${node.id} reconnected`,
				'ok'
			);
			return;
		}

		for (const candidate of candidates) {
			if (candidate.node !== node.id) continue;
			candidate.nextAt = now + (candidate.phase === 'holding' ? HOLD_MS : FOLLOW_MS);
		}

		setStatus(`${node.id} lost storage access`, 'warn');
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
		const resumed = resumeNode(node);
		nudgeChecks();

		setStatus(
			resumed > 0
				? `${node.id} started — resumed ${resumed} ${resumed === 1 ? 'lease' : 'leases'}`
				: `${node.id} started`,
			'ok'
		);
	}

	function addNode() {
		if (nodes.length >= MAX_NODES) return;

		const node = makeLiveNode(nextNodeNumber);
		nextNodeNumber += 1;
		nodes.push(node);

		for (const key of KEY_POOL) {
			candidates.push({
				key,
				node: node.id,
				phase: 'following',
				nextAt: now + 240 + Math.random() * 420,
				errors: 0
			});
		}

		nudgeChecks();

		const c = nodes.filter((item) => item.livenessDeadline > now).length;
		setStatus(`${node.id} joined — C=${c}, M=${Math.ceil(jobs / c)}`, 'muted');
	}

	function removeNode() {
		if (nodes.length <= MIN_NODES) return;

		const node = nodes[nodes.length - 1];

		for (const key of activeKeys) {
			const record = records[key];
			if (record.value !== node.id || record.deadline <= now) continue;
			record.deadline = now;
			record.expiredLogged = true;
		}

		for (const key of Object.keys(shedBlock)) {
			if (shedBlock[key].node === node.id) delete shedBlock[key];
		}

		candidates = candidates.filter((candidate) => candidate.node !== node.id);
		nodes.pop();
		nextNodeNumber = nodes.length + 1;
		nudgeChecks();

		setStatus(
			`${node.id} removed — C=${activeCount}, M=${activeCount > 0 ? Math.ceil(jobs / activeCount) : '—'}`,
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
				records[key] = blankRecord();

				for (const candidate of candidates) {
					if (candidate.key !== key) continue;
					candidate.phase = 'following';
					candidate.errors = 0;
					candidate.nextAt = now + 140 + Math.random() * 380;
				}
			}
		} else {
			for (const key of KEY_POOL.slice(target, previous)) {
				records[key] = blankRecord();
				delete shedMarks[key];
				delete shedBlock[key];

				for (const candidate of candidates) {
					if (candidate.key !== key) continue;
					candidate.phase = 'following';
					candidate.errors = 0;
					candidate.nextAt = now + 400 + Math.random() * 300;
				}
			}
		}

		nudgeChecks();

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
		running = true;
		jobs = 9;
		nextNodeNumber = 4;
		shedMarks = {};
		shedBlock = {};
		nodes = makeRoster();
		records = makeRecords();
		candidates = makeCandidates(nodes);
		wasBalanced = false;
		setStatus('slow start: node-1 holds 7 of 9 leases', 'muted');
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

<section class="demo" aria-label="Balanced leader election simulation">
	<header class="topbar">
		<div class="brand">
			<span class="live-dot" class:paused={!running} aria-hidden="true"></span>
			<span class="brand-title">lease shedding</span>
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

		<div class="metric" title="Configured nodes; C counts the ones with fresh liveness">
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

		<div class="metric" title="Nodes with fresh liveness records">
			<span class="metric-key">C</span>
			<b>{activeCount}</b>
			<span class="metric-note">active</span>
		</div>

		<div class="metric formula">
			<span class="metric-key">M</span>
			{#if activeCount > 0}
				<span class="formula-calc">ceil({jobs} / {activeCount}) =</span>
				<b>{limit}</b>
			{:else}
				<span class="formula-calc">no active nodes</span>
				<b>—</b>
			{/if}
		</div>

		<span
			class="state-pill"
			class:over={phaseLabel === 'shedding'}
			class:work={phaseLabel === 'claiming' || phaseLabel === 'recovering'}
			class:ok={phaseLabel === 'balanced'}
			title="Each node may hold at most M leases"
		>
			{phaseLabel}
		</span>
	</div>

	<div
		class="board"
		style={`grid-template-columns: 3.2rem repeat(${nodes.length}, minmax(4rem, 1fr))`}
	>
		<span class="corner">job</span>

		{#each nodes as node, column (node.id)}
			{@const held = heldCount(node.id)}
			{@const over = held - limit}
			{@const live = node.livenessDeadline > now}
			{@const shedding = node.shedUntil > now}

			<div
				class="node-head"
				class:active={held > 0}
				class:over={node.alive && node.connected && over > 0}
				class:cut={!node.connected}
				class:dead={!node.alive}
				style={`grid-column: ${column + 2}`}
			>
				<div class="node-line">
					<span
						class="live-pip"
						class:fresh={live && node.alive && node.connected}
						title={live ? 'liveness record is fresh' : 'liveness record expired'}
						aria-hidden="true"
					></span>
					<span class="node-id" title={node.id}>{node.id}</span>

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

				<div class="count-row">
					<span
						class="count"
						class:over={node.alive && node.connected && over > 0}
						title={`${held} held, limit M=${limit}`}
					>
						<b>{held}</b><span> / {limit}</span>
					</span>

					{#if shedding}
						<span class="shed-badge" aria-hidden="true">−{node.lastShed}</span>
					{/if}
				</div>

				<div class="cap-track" aria-hidden="true">
					<span
						class="cap-fill"
						class:over={over > 0}
						class:stale={!node.alive || !node.connected}
						style={`width: ${limit > 0 ? Math.min(100, (held / limit) * 100) : 0}%`}
					></span>
				</div>
			</div>
		{/each}

		{#each activeKeys as key, row (key)}
			{@const owner = ownerOf(key)}
			{@const mark = shedMarks[key]}

			<div
				class="key-name"
				class:free={!owner}
				style={`grid-row: ${row + 2}`}
				title={owner ? `${key} is held by ${owner}` : `${key} is free`}
			>
				{key}
			</div>

			{#each nodes as node, column (node.id)}
				{@const held = isHeldBy(key, node.id)}
				{@const stale = held && (!node.connected || !node.alive)}
				{@const shedding = !held && mark && mark.from === node.id && now - mark.at < SHED_FLASH_MS}
				{@const claimed = held && records[key].claimedAt > now - CLAIM_FLASH_MS}

				<div
					class="cell"
					class:held
					class:stale
					class:shed={shedding}
					class:claimed
					class:col-cut={!node.connected}
					class:col-dead={!node.alive}
					style={`grid-row: ${row + 2}; grid-column: ${column + 2}`}
					aria-label={held
						? `${key} held by ${node.id}`
						: shedding
							? `${key} shed by ${node.id}`
							: `${key} not held by ${node.id}`}
				>
					{#if held}
						<span class="cell-dot" aria-hidden="true"></span>
						<span class="cell-bar" style={`width: ${leasePercent(key)}%`}></span>
					{:else if shedding}
						<span class="shed-dot" aria-hidden="true"></span>
					{/if}
				</div>
			{/each}
		{/each}
	</div>

	<footer
		class="status-line"
		class:ok={statusTone === 'ok'}
		class:warn={statusTone === 'warn'}
		class:bad={statusTone === 'bad'}
		aria-live="polite"
	>
		<span class="status-pip" aria-hidden="true"></span>
		<span class="status-text" title={status}>{status}</span>
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
	.count-row,
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

	.formula {
		gap: 0.35rem;
		font-variant-numeric: tabular-nums;
	}

	.formula-calc {
		color: var(--muted, #817d75);
		font-size: 0.55rem;
		letter-spacing: 0.01em;
	}

	.formula b {
		color: var(--accent, #c8f56c);
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

	.state-pill.over {
		border-color: color-mix(in srgb, var(--danger) 55%, var(--line, #252525));
		color: var(--danger);
	}

	.state-pill.work {
		border-color: color-mix(in srgb, var(--warn) 55%, var(--line, #252525));
		color: var(--warn);
	}

	.state-pill.ok {
		border-color: color-mix(in srgb, var(--accent, #c8f56c) 45%, var(--line, #252525));
		color: var(--accent, #c8f56c);
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
		padding-bottom: 0.32rem;
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
		gap: 0.3rem;
		min-width: 0;
		min-height: 58px;
		padding: 0.4rem 0.45rem 0.38rem;
		border: 1px solid var(--line, #252525);
		border-radius: 2px;
		background: color-mix(in srgb, var(--bg-elevated, #151515) 46%, transparent);
		transition:
			border-color 180ms ease,
			background 180ms ease;
	}

	.node-head.active {
		border-color: color-mix(in srgb, var(--accent, #c8f56c) 38%, var(--line, #252525));
		background:
			linear-gradient(
				180deg,
				color-mix(in srgb, var(--accent, #c8f56c) 7%, transparent),
				transparent
			),
			color-mix(in srgb, var(--bg-elevated, #151515) 58%, transparent);
	}

	.node-head.over {
		border-color: color-mix(in srgb, var(--danger) 58%, var(--line, #252525));
		background:
			linear-gradient(
				180deg,
				color-mix(in srgb, var(--danger) 10%, transparent),
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
		gap: 0.28rem;
		min-width: 0;
	}

	.live-pip {
		width: 5px;
		height: 5px;
		flex: none;
		border-radius: 50%;
		background: var(--line-strong, #3b3b3b);
		transition:
			background 200ms ease,
			box-shadow 200ms ease;
	}

	.live-pip.fresh {
		background: var(--accent, #c8f56c);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent, #c8f56c) 12%, transparent);
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

	.count-row {
		justify-content: space-between;
		gap: 0.35rem;
		min-height: 0.85rem;
	}

	.count {
		color: var(--muted, #817d75);
		font-size: 0.55rem;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	.count b {
		color: var(--accent, #c8f56c);
		font-size: 0.73rem;
		font-weight: 500;
	}

	.count.over b {
		color: var(--danger);
	}

	.count.over {
		color: color-mix(in srgb, var(--danger) 70%, var(--muted, #817d75));
	}

	.node-head.dead .count b {
		color: var(--muted, #817d75);
	}

	.shed-badge {
		padding: 0 0.2rem;
		border: 1px solid color-mix(in srgb, var(--danger) 55%, var(--line, #252525));
		border-radius: 2px;
		background: color-mix(in srgb, var(--danger) 9%, transparent);
		color: var(--danger);
		font-size: 0.5rem;
		line-height: 1.35;
		font-variant-numeric: tabular-nums;
		animation: shed-badge 1100ms ease-out;
	}

	@keyframes shed-badge {
		0% {
			opacity: 0;
			transform: translateY(-3px);
		}
		20% {
			opacity: 1;
			transform: translateY(0);
		}
		100% {
			opacity: 1;
		}
	}

	.cap-track {
		height: 3px;
		overflow: hidden;
		border-radius: 1px;
		background: color-mix(in srgb, var(--line, #252525) 85%, transparent);
	}

	.cap-fill {
		display: block;
		height: 100%;
		background: var(--accent, #c8f56c);
		transition: width 180ms ease;
	}

	.cap-fill.over {
		background: var(--danger);
	}

	.cap-fill.stale {
		background: var(--warn);
	}

	.key-name {
		grid-column: 1;
		display: flex;
		align-items: center;
		padding-right: 0.2rem;
		color: var(--text-soft, #b4b1a9);
		font-size: 0.62rem;
		font-variant-numeric: tabular-nums;
		transition: color 180ms ease;
	}

	.key-name.free {
		color: var(--warn);
	}

	.cell {
		position: relative;
		min-width: 0;
		min-height: 29px;
		overflow: hidden;
		border: 1px solid color-mix(in srgb, var(--line, #252525) 72%, transparent);
		border-radius: 2px;
		background: color-mix(in srgb, var(--bg-elevated, #151515) 26%, transparent);
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
		border-color: color-mix(in srgb, var(--warn) 52%, var(--line, #252525));
		background: color-mix(in srgb, var(--warn) 7%, transparent);
	}

	.cell.shed {
		border-color: color-mix(in srgb, var(--danger) 58%, var(--line, #252525));
		background: color-mix(in srgb, var(--danger) 9%, transparent);
	}

	.cell.claimed {
		animation: claim-flash 700ms ease-out;
	}

	@keyframes claim-flash {
		0% {
			background: color-mix(in srgb, var(--accent, #c8f56c) 24%, transparent);
			border-color: var(--accent, #c8f56c);
		}
		100% {
			background: color-mix(in srgb, var(--accent, #c8f56c) 7%, transparent);
		}
	}

	.cell.col-cut:not(.held):not(.shed) {
		opacity: 0.4;
	}

	.cell.col-dead:not(.held):not(.shed) {
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

	.shed-dot {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--danger);
		transform: translate(-50%, -50%);
		animation: shed-fade 900ms ease-out forwards;
	}

	@keyframes shed-fade {
		0% {
			opacity: 1;
			box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 18%, transparent);
		}
		100% {
			opacity: 0;
			box-shadow: 0 0 0 0 transparent;
		}
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

		.formula-calc {
			display: none;
		}

		.state-pill {
			font-size: 0.45rem;
		}

		.board {
			gap: 4px 4px;
			padding: 0.6rem 0.55rem 0.7rem;
		}

		.node-head {
			gap: 0.24rem;
			min-height: 52px;
			padding: 0.32rem 0.24rem 0.3rem;
		}

		.node-line {
			gap: 0.16rem;
		}

		.node-id {
			font-size: 0.48rem;
		}

		.live-pip {
			display: none;
		}

		.tool {
			width: 12px;
			height: 12px;
		}

		.tool svg {
			width: 7px;
			height: 7px;
		}

		.count {
			font-size: 0.49rem;
		}

		.count b {
			font-size: 0.64rem;
		}

		.shed-badge {
			font-size: 0.44rem;
		}

		.cell {
			min-height: 26px;
		}

		.key-name {
			font-size: 0.55rem;
		}

		.status-line {
			font-size: 0.55rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.live-dot {
			animation: none;
		}

		.shed-badge,
		.cell.claimed,
		.shed-dot {
			animation: none;
		}

		.shed-dot {
			display: none;
		}
	}
</style>
