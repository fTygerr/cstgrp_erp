<script lang="ts">
	import CusTable from '$lib/components/basic/CusTable.svelte';
	import { TableBody, TableCell, TableHeader, TableRow } from '$lib/components/ui/table';
	import TableHead from '$lib/components/ui/table/table-head.svelte';
	import api from '$lib/utils/server';
	import MenuBar from '$lib/components/basic/MenuBar.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { refetch } from '$lib/utils/query';
	import Select from '$lib/components/basic/Select.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { showError } from '$lib/utils/showToast';
	import { getClients, getOptions } from '$lib/utils/queries';
	import GeneratePLDialog from './GeneratePLDialog.svelte';
	import InventoryPLDialog from './InventoryPLDialog.svelte';

	const clientsQuery = createQuery({ queryKey: ['inventory-clients'], queryFn: getClients });
	const clients = $derived(getOptions($clientsQuery?.data));

	const exportTypes = [
		{ name: 'Producto terminado', value: 'producto', color: 'green' },
		{ name: 'Materia Prima', value: 'materiaPrima', color: 'blue' },
		{ name: 'Subproductos', value: 'subproducto', color: 'orange' }
	];

	let filters = $state({ job: '', part: '', clientId: '', type: 'producto', exportOrder: '' });
	let selected: Record<number, any> = $state({});
	let showGenerate = $state(false);
	let showInventoryGenerate = $state(false);

	const isInventory = $derived(filters.type !== 'producto');

	// un solo query: el queryFn decide el endpoint según el tipo seleccionado
	const rows = createQuery({
		queryKey: ['ie-export-jobs'],
		queryFn: async () => {
			if (filters.type === 'producto')
				return (
					await api.get('/ie/exports', {
						params: {
							job: filters.job,
							part: filters.part,
							clientId: filters.clientId,
							exportOrder: filters.exportOrder
						}
					})
				).data;
			return (
				await api.get('/ie/exports/inventory', {
					params: { type: filters.type, code: filters.part, clientId: filters.clientId }
				})
			).data;
		}
	});

	const selectedList = $derived(Object.values(selected).filter(Boolean));

	function toggle(item: any) {
		if (selected[item.id]) {
			delete selected[item.id];
			selected = { ...selected };
			return;
		}
		const current: any[] = Object.values(selected).filter(Boolean);
		if (current.length && current[0].clientId !== item.clientId)
			return showError(
				null,
				isInventory
					? 'Todos los materiales deben ser del mismo cliente'
					: 'Todos los jobs deben ser del mismo cliente'
			);
		selected = { ...selected, [item.id]: item };
	}

	$effect(() => {
		({ ...filters });
		refetch(['ie-export-jobs']);
	});

	// al cambiar de tipo se limpia la selección (no se mezclan tipos en un PL)
	$effect(() => {
		filters.type;
		selected = {};
	});
</script>

<MenuBar>
	<div class="flex w-full flex-col gap-1.5 lg:flex-row">
		{#if !isInventory}
			<Input menu bind:value={filters.job} placeholder="Job" class="max-w-32" />
			<Input menu bind:value={filters.exportOrder} placeholder="Orden Exp. #" class="max-w-32" />
		{/if}
		<Input menu bind:value={filters.part} placeholder="Parte" class="max-w-36" />
		<Select
			menu
			items={clients}
			bind:value={filters.clientId}
			allowDeselect
			placeholder="Cliente"
			class="min-w-36 max-w-44"
		/>
		<Select menu items={exportTypes} bind:value={filters.type} class="min-w-44 max-w-48" />
		<Button
			class="ml-auto h-8"
			onclick={() => (isInventory ? (showInventoryGenerate = true) : (showGenerate = true))}
			disabled={!selectedList.length}
		>
			Generar Packing List {selectedList.length ? `(${selectedList.length})` : ''}
		</Button>
	</div>
</MenuBar>

{#if !isInventory}
	<CusTable>
		<TableHeader>
			<TableHead class="w-8"></TableHead>
			<TableHead>Job/Orden</TableHead>
			<TableHead>No. Parte</TableHead>
			<TableHead class="min-w-52">Descripción</TableHead>
			<TableHead>Cliente</TableHead>
			<TableHead>SO</TableHead>
			<TableHead>Cantidad</TableHead>
			<TableHead>Liberado</TableHead>
			<TableHead>Pallet(s)</TableHead>
			<TableHead>No. Pallets</TableHead>
		</TableHeader>
		<TableBody>
			{#each $rows?.data || [] as job}
				<TableRow>
					<TableCell>
						<Checkbox checked={!!selected[job.id]} onCheckedChange={() => toggle(job)} />
					</TableCell>
					<TableCell class="font-semibold">{job.ref}</TableCell>
					<TableCell>{job.part}</TableCell>
					<TableCell class="max-w-64 truncate" title={job.description}>{job.description}</TableCell>
					<TableCell><Badge color="gray">{job.client}</Badge></TableCell>
					<TableCell>{job.client === 'CSI' ? job.so || '' : ''}</TableCell>
					<TableCell>{job.amount}</TableCell>
					<TableCell>{job.liberated}</TableCell>
					<TableCell class="max-w-52 truncate" title={job.palletFolios}>
						{job.palletFolios || ''}
					</TableCell>
					<TableCell>{job.palletCount}</TableCell>
				</TableRow>
			{/each}
		</TableBody>
	</CusTable>
{:else}
	<CusTable>
		<TableHeader>
			<TableHead class="w-8"></TableHead>
			<TableHead>Codigo</TableHead>
			<TableHead class="min-w-52">Descripción</TableHead>
			<TableHead>Cliente</TableHead>
			<TableHead>Existencia</TableHead>
			<TableHead>Medida</TableHead>
		</TableHeader>
		<TableBody>
			{#each $rows?.data || [] as material}
				<TableRow>
					<TableCell>
						<Checkbox checked={!!selected[material.id]} onCheckedChange={() => toggle(material)} />
					</TableCell>
					<TableCell class="font-semibold">{material.code}</TableCell>
					<TableCell class="max-w-64 truncate" title={material.description}>
						{material.description}
					</TableCell>
					<TableCell>
						{#if material.client}
							<Badge color="gray">{material.client}</Badge>
						{/if}
					</TableCell>
					<TableCell>{material.available}</TableCell>
					<TableCell>{material.measurement}</TableCell>
				</TableRow>
			{/each}
		</TableBody>
	</CusTable>
{/if}

<GeneratePLDialog
	bind:show={showGenerate}
	jobs={selectedList}
	exportOrderId={filters.exportOrder ? Number(filters.exportOrder) : null}
	onGenerated={() => {
		selected = {};
		refetch(['ie-export-jobs']);
		refetch(['packing-lists']);
	}}
/>

<InventoryPLDialog
	bind:show={showInventoryGenerate}
	plType={filters.type}
	materials={selectedList}
	onGenerated={() => {
		selected = {};
		refetch(['ie-export-jobs']);
		refetch(['packing-lists']);
	}}
/>
