<script lang="ts">
	import {
		Dialog,
		DialogBody,
		DialogContent,
		DialogFooter,
		DialogHeader
	} from '$lib/components/ui/dialog';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import Label from '$lib/components/basic/Label.svelte';
	import api from '$lib/utils/server';
	import { showSuccess, showError } from '$lib/utils/showToast';
	import { refetch } from '$lib/utils/query';

	interface Props {
		show: boolean;
		selectedJob?: any;
	}

	let { show = $bindable(), selectedJob = null }: Props = $props();

	interface palletRow {
		amount: string;
		boxes: string;
		combine: boolean;
		combineFolio: string;
	}

	let palletCount = $state('');
	let rows: palletRow[] = $state([]);

	const remaining = $derived(
		selectedJob ? Number(selectedJob.amount) - Number(selectedJob.palletized) : 0
	);
	const totalCaptured = $derived(rows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0));

	function boxesFor(amount: number) {
		const perBox = Number(selectedJob?.perBox) || 0;
		if (!perBox) return '0';
		return String(Math.ceil(amount / perBox));
	}

	function generateRows() {
		const count = Number(palletCount);
		if (!count || count <= 0) return showError(null, 'Cantidad de pallets invalida');

		const fullRows = Math.floor(count);
		const hasPartial = count % 1 > 0;
		const n = fullRows + (hasPartial ? 1 : 0);

		const perFull = n > 0 ? Math.floor(remaining / count) : 0;
		rows = [];
		let assigned = 0;
		for (let i = 0; i < n; i++) {
			const isLast = i === n - 1;
			const amount = isLast ? remaining - assigned : perFull;
			assigned += amount;
			rows.push({
				amount: String(Math.max(amount, 0)),
				boxes: boxesFor(Math.max(amount, 0)),
				combine: false,
				combineFolio: ''
			});
		}
	}

	async function handleSubmit() {
		if (!rows.length) return showError(null, 'Genera los renglones primero');
		for (const row of rows)
			if (row.combine && !row.combineFolio)
				return showError(null, 'Pon el número del pallet a combinar');

		const { data } = await api.post('/quality/pallets', {
			jobId: selectedJob.id,
			rows: rows.map((r) => ({
				amount: r.amount,
				boxes: r.boxes,
				combineFolio: r.combine ? r.combineFolio : null
			}))
		});

		refetch(['pallet-jobs']);
		refetch(['registered-pallets']);
		show = false;
		showSuccess(`Pallets creados: ${data.folios.join(', ')}`);
	}

	$effect(() => {
		if (show) {
			palletCount = '';
			rows = [];
		}
	});
</script>

<Dialog bind:open={show}>
	<DialogContent class="sm:max-w-2xl">
		<DialogHeader>Capturar pallets — {selectedJob?.ref}</DialogHeader>
		<DialogBody grid="1">
			<div class="grid grid-cols-3 gap-2">
				<Label name="Parte">
					<Input value={selectedJob?.part} disabled />
				</Label>
				<Label name="Pz/Caja">
					<Input value={selectedJob?.perBox} disabled />
				</Label>
				<Label name="Pendiente por paletizar">
					<Input value={remaining} disabled />
				</Label>
			</div>

			<div class="flex items-end gap-2">
				<Label name="Cantidad de pallets" class="w-40">
					<Input bind:value={palletCount} placeholder="Ej. 2.5" />
				</Label>
				<button
					class="h-8 rounded-md border border-input px-3 text-sm hover:bg-muted"
					onclick={generateRows}>Generar</button
				>
			</div>

			{#if rows.length}
				<Table divClass="h-auto overflow-visible">
					<TableHeader>
						<TableHead>Pallet</TableHead>
						<TableHead>Piezas</TableHead>
						<TableHead>Cajas</TableHead>
						<TableHead>Combinar</TableHead>
						<TableHead>No. pallet existente</TableHead>
					</TableHeader>
					<TableBody>
						{#each rows as row, i}
							<TableRow>
								<TableCell>{row.combine ? 'Combinado' : `Nuevo #${i + 1}`}</TableCell>
								<TableCell>
									<Input
										bind:value={row.amount}
										oninput={() => (row.boxes = boxesFor(Number(row.amount) || 0))}
									/>
								</TableCell>
								<TableCell><Input bind:value={row.boxes} /></TableCell>
								<TableCell><Checkbox bind:checked={row.combine} /></TableCell>
								<TableCell>
									<Input bind:value={row.combineFolio} disabled={!row.combine} placeholder="Folio" />
								</TableCell>
							</TableRow>
						{/each}
						<TableRow>
							<TableCell class="font-semibold">Total</TableCell>
							<TableCell class="font-semibold">{totalCaptured} / {remaining}</TableCell>
							<TableCell colspan={3}></TableCell>
						</TableRow>
					</TableBody>
				</Table>
			{/if}
		</DialogBody>
		<DialogFooter submitFunc={handleSubmit} hideFunc={() => (show = false)} />
	</DialogContent>
</Dialog>
