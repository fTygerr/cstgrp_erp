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
	import { Badge } from '$lib/components/ui/badge';
	import DeletePopUp from '$lib/components/complex/DeletePopUp.svelte';
	import { downloadFile } from '$lib/utils/files';
	import { showSuccess } from '$lib/utils/showToast';
	import { formatDate } from '$lib/utils/functions';
	import { getClients, getOptions } from '$lib/utils/queries';
	import { userData } from '$lib/utils/store';
	import { FileDown, Package, Pencil } from 'lucide-svelte';
	import EditPLDialog from './EditPLDialog.svelte';

	const clientsQuery = createQuery({ queryKey: ['inventory-clients'], queryFn: getClients });
	const clients = $derived(getOptions($clientsQuery?.data));

	let filters = $state({ packSlip: '', clientId: '' });
	let showDelete = $state(false);
	let toDelete: any = $state(null);
	let showEdit = $state(false);
	let toEdit: any = $state(null);
	const canDelete = $derived(($userData?.permissions?.['ie_packing_list'] || 0) >= 3);
	const canEdit = $derived(($userData?.permissions?.['ie_packing_list'] || 0) >= 2);

	const lists = createQuery({
		queryKey: ['packing-lists', { ...filters }],
		queryFn: async () => (await api.get('/ie/packing-list', { params: filters })).data
	});

	async function deletePl() {
		await api.delete('/ie/packing-list/' + toDelete.id);
		showDelete = false;
		refetch(['packing-lists']);
		refetch(['ie-export-jobs']);
		showSuccess('Packing list eliminado');
	}

	$effect(() => {
		({ ...filters });
		refetch(['packing-lists']);
	});
</script>

<MenuBar>
	<div class="flex w-full flex-col gap-1.5 lg:flex-row">
		<Input menu bind:value={filters.packSlip} placeholder="Pack Slip #" class="max-w-36" />
		<Select
			menu
			items={clients}
			bind:value={filters.clientId}
			allowDeselect
			placeholder="Cliente"
			class="min-w-36 max-w-44"
		/>
	</div>
</MenuBar>

<CusTable>
	<TableHeader>
		<OptionsHead />
		<TableHead>Pack Slip #</TableHead>
		<TableHead>Cliente</TableHead>
		<TableHead>Job(s)</TableHead>
		<TableHead>No. Parte</TableHead>
		<TableHead class="min-w-52">Descripción</TableHead>
		<TableHead>PO</TableHead>
		<TableHead>Cantidad</TableHead>
		<TableHead>Pallets</TableHead>
		<TableHead>Fecha</TableHead>
	</TableHeader>
	<TableBody>
		{#each $lists?.data || [] as pl}
			<TableRow>
				<OptionsCell
					extraButtons={[
						...(canEdit
							? [
									{
										name: 'Modificar',
										icon: Pencil,
										fn: () => {
											toEdit = pl;
											showEdit = true;
										}
									}
								]
							: []),
						{
							name: 'Descargar PDF',
							icon: FileDown,
							fn: () =>
								downloadFile({
									url: '/ie/packing-list/download',
									name: `packing-list-${pl.packSlip}.pdf`,
									params: { id: pl.id }
								})
						},
						{
							name: 'Desglose de Pallets',
							icon: Package,
							fn: () =>
								downloadFile({
									url: '/ie/packing-list/desglose',
									name: `desglose-pallets-${pl.packSlip}.pdf`,
									params: { id: pl.id }
								})
						}
					]}
					deleteFunc={canDelete
						? () => {
								toDelete = pl;
								showDelete = true;
							}
						: undefined}
				/>
				<TableCell class="font-semibold">{pl.packSlip}</TableCell>
				<TableCell>{pl.client || ''}</TableCell>
				<TableCell class="max-w-44 truncate" title={pl.jobs}>{pl.jobs || ''}</TableCell>
				<TableCell class="max-w-44 truncate" title={pl.parts}>{pl.parts || ''}</TableCell>
				<TableCell class="max-w-56 truncate" title={pl.description}>{pl.description || ''}</TableCell>
				<TableCell class="max-w-36 truncate" title={pl.po}>{pl.po || ''}</TableCell>
				<TableCell>{pl.amount}</TableCell>
				<TableCell>{pl.pallets}</TableCell>
				<TableCell>
					{#if pl.shipDate}
						<Badge color="gray">{formatDate(pl.shipDate)}</Badge>
					{/if}
				</TableCell>
			</TableRow>
		{/each}
	</TableBody>
</CusTable>

<EditPLDialog bind:show={showEdit} pl={toEdit} />

<DeletePopUp
	bind:show={showDelete}
	deleteFunc={deletePl}
	text={`el packing list ${toDelete?.packSlip}`}
/>
