<script lang="ts">
	import CusTable from '$lib/components/basic/CusTable.svelte';
	import { TableBody, TableCell, TableHeader, TableRow } from '$lib/components/ui/table';
	import TableHead from '$lib/components/ui/table/table-head.svelte';
	import api from '$lib/utils/server';
	import MenuBar from '$lib/components/basic/MenuBar.svelte';
	import OptionsCell from '$lib/components/basic/OptionsCell.svelte';
	import OptionsHead from '$lib/components/basic/OptionsHead.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { refetch } from '$lib/utils/query';
	import Select from '$lib/components/basic/Select.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import DeletePopUp from '$lib/components/complex/DeletePopUp.svelte';
	import { downloadFile } from '$lib/utils/files';
	import { showSuccess, showError } from '$lib/utils/showToast';
	import { getClients, getOptions } from '$lib/utils/queries';
	import { userData } from '$lib/utils/store';
	import { FileDown } from 'lucide-svelte';

	const pendingOptions = [
		{ name: 'Sin exportar', value: 'true', color: 'yellow' },
		{ name: 'Exportados', value: 'false', color: 'green' },
		{ name: 'Todos', value: '', color: 'blue' }
	];

	const clientsQuery = createQuery({ queryKey: ['inventory-clients'], queryFn: getClients });
	const clients = $derived(getOptions($clientsQuery?.data));

	let filters = $state({ folio: '', clientId: '', pending: 'true', job: '', programation: '' });
	let selected: Record<number, any> = $state({});
	let showDelete = $state(false);
	const canDelete = $derived(($userData?.permissions?.['quality'] || 0) >= 3);
	let toDelete: any = $state(null);

	const pallets = createQuery({
		queryKey: ['registered-pallets', { ...filters }],
		queryFn: async () => (await api.get('/quality/pallets', { params: filters })).data
	});

	const selectedList = $derived(Object.values(selected).filter(Boolean));

	function toggle(pallet: any) {
		if (selected[pallet.id]) {
			delete selected[pallet.id];
			selected = { ...selected };
			return;
		}
		const current: any[] = Object.values(selected).filter(Boolean);
		if (current.length && current[0].clientId !== pallet.clientId)
			return showError(null, 'Todos los pallets deben ser del mismo cliente');
		selected = { ...selected, [pallet.id]: pallet };
	}

	async function createExport() {
		const ids = selectedList.map((p: any) => p.id);
		if (!ids.length) return showError(null, 'Selecciona al menos un pallet');
		const { data } = await api.post('/quality/exportorders', { palletIds: ids });
		selected = {};
		refetch(['registered-pallets']);
		refetch(['registered-exports']);
		showSuccess(`Orden de exportación ${data.id} creada`);
	}

	async function deletePallet() {
		await api.delete('/quality/pallets/' + toDelete.id);
		showDelete = false;
		refetch(['registered-pallets']);
		refetch(['pallet-jobs']);
		showSuccess('Pallet eliminado');
	}

	$effect(() => {
		({ ...filters });
		refetch(['registered-pallets']);
	});
</script>

<MenuBar>
	<div class="flex w-full flex-col gap-1.5 lg:flex-row">
		<Input menu bind:value={filters.folio} placeholder="No. Pallet" class="max-w-32" />
		<Input menu bind:value={filters.job} placeholder="Job / Orden" class="max-w-32" />
		<Input menu bind:value={filters.programation} placeholder="Programación" class="max-w-32" />
		<Select
			menu
			items={clients}
			bind:value={filters.clientId}
			allowDeselect
			placeholder="Cliente"
			class="min-w-36 max-w-44"
		/>
		<Select menu items={pendingOptions} bind:value={filters.pending} class="min-w-36 max-w-36" />
		<Button class="ml-auto h-8" onclick={createExport} disabled={!selectedList.length}>
			Orden de Exportación {selectedList.length ? `(${selectedList.length})` : ''}
		</Button>
	</div>
</MenuBar>

<CusTable>
	<TableHeader>
		<OptionsHead />
		<TableHead class="w-8"></TableHead>
		<TableHead>No. Pallet</TableHead>
		<TableHead>Job(s)</TableHead>
		<TableHead>Programación</TableHead>
		<TableHead>Parte</TableHead>
		<TableHead>Descripción</TableHead>
		<TableHead>Cliente</TableHead>
		<TableHead>Piezas</TableHead>
		<TableHead>Cajas</TableHead>
		<TableHead>Estado</TableHead>
	</TableHeader>
	<TableBody>
		{#each $pallets?.data || [] as pallet}
			<TableRow>
				<OptionsCell
					extraButtons={[
						{
							name: 'Descargar plantilla',
							icon: FileDown,
							fn: () =>
								downloadFile({
									url: '/quality/pallets/label',
									name: `pallet-${pallet.client}-${pallet.folio}.pdf`,
									params: { id: pallet.id }
								})
						}
					]}
					deleteFunc={pallet.exportOrderId || !canDelete
						? undefined
						: () => {
								toDelete = pallet;
								showDelete = true;
							}}
				/>
				<TableCell>
					{#if !pallet.exportOrderId}
						<Checkbox checked={!!selected[pallet.id]} onCheckedChange={() => toggle(pallet)} />
					{/if}
				</TableCell>
				<TableCell class="font-semibold">{pallet.client}-{pallet.folio}</TableCell>
				<TableCell>{(pallet.contents || []).map((c: any) => c.ref).join(', ')}</TableCell>
				<TableCell>{(pallet.contents || [])[0]?.programation || ''}</TableCell>
				<TableCell>{(pallet.contents || []).map((c: any) => c.part).join(', ')}</TableCell>
				<TableCell class="max-w-56 truncate">{(pallet.contents || [])[0]?.description || ''}</TableCell>
				<TableCell>{pallet.client}</TableCell>
				<TableCell>{(pallet.contents || []).reduce((a: number, c: any) => a + c.amount, 0)}</TableCell>
				<TableCell>{(pallet.contents || []).reduce((a: number, c: any) => a + c.boxes, 0)}</TableCell>
				<TableCell>
					{#if pallet.exportOrderId}
						<Badge color="green">Exportación {pallet.exportOrderId}</Badge>
					{:else}
						<Badge color="yellow">Pendiente</Badge>
					{/if}
				</TableCell>
			</TableRow>
		{/each}
	</TableBody>
</CusTable>

<DeletePopUp
	bind:show={showDelete}
	deleteFunc={deletePallet}
	text={`el pallet ${toDelete?.client}-${toDelete?.folio}`}
/>
