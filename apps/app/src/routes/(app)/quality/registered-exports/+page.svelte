<script lang="ts">
	import CusTable from '$lib/components/basic/CusTable.svelte';
	import { TableBody, TableCell, TableHeader, TableRow } from '$lib/components/ui/table';
	import TableHead from '$lib/components/ui/table/table-head.svelte';
	import api from '$lib/utils/server';
	import { formatDate } from '$lib/utils/functions';
	import MenuBar from '$lib/components/basic/MenuBar.svelte';
	import OptionsCell from '$lib/components/basic/OptionsCell.svelte';
	import OptionsHead from '$lib/components/basic/OptionsHead.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { refetch } from '$lib/utils/query';
	import Input from '$lib/components/ui/input/input.svelte';
	import DeletePopUp from '$lib/components/complex/DeletePopUp.svelte';
	import { downloadFile } from '$lib/utils/files';
	import { showSuccess } from '$lib/utils/showToast';
	import { FileDown } from 'lucide-svelte';
	import { userData } from '$lib/utils/store';
	import Select from '$lib/components/basic/Select.svelte';
	import Badge from '$lib/components/ui/badge/badge.svelte';

	// Estado del PL (Juan 09-Oct): se deriva de si los pallets de la orden ya
	// se fueron en un packing list.
	const statusOptions = [
		{ value: 'sin PL', name: 'Sin PL', color: 'red' },
		{ value: 'con PL', name: 'Con PL', color: 'green' },
		{ value: 'parcial', name: 'Parcial', color: 'yellow' },
		{ value: 'sin pallets', name: 'Sin pallets', color: 'gray' }
	];
	const statusColor = (s: string) =>
		s === 'con PL' ? 'green' : s === 'parcial' ? 'yellow' : s === 'sin PL' ? 'red' : 'gray';

	let filters = $state({ id: '', status: '' });
	let showDelete = $state(false);
	const canDelete = $derived(($userData?.permissions?.['quality_registered_exports'] || 0) >= 3);
	let toDelete: any = $state(null);

	const orders = createQuery({
		queryKey: ['registered-exports', { ...filters }],
		queryFn: async () => (await api.get('/quality/exportorders', { params: filters })).data
	});

	async function deleteOrder() {
		await api.delete('/quality/exportorders/' + toDelete.id);
		showDelete = false;
		refetch(['registered-exports']);
		refetch(['registered-pallets']);
		showSuccess('Orden eliminada (pallets liberados)');
	}

	$effect(() => {
		({ ...filters });
		refetch(['registered-exports']);
	});
</script>

<MenuBar>
	<div class="flex flex-col gap-1.5 lg:flex-row">
		<Input menu bind:value={filters.id} placeholder="No. de exportación" class="max-w-40" />
		<Select
			menu
			items={statusOptions}
			bind:value={filters.status}
			placeholder="Estatus del PL"
			class="max-w-44"
		/>
	</div>
</MenuBar>

<CusTable>
	<TableHeader>
		<OptionsHead />
		<TableHead>No.</TableHead>
		<TableHead>Fecha</TableHead>
		<TableHead>Cliente</TableHead>
		<TableHead>Estatus</TableHead>
		<TableHead>Job(s)</TableHead>
		<TableHead>No. Parte</TableHead>
		<TableHead>Descripción</TableHead>
		<TableHead>Pallets</TableHead>
		<TableHead>Cajas</TableHead>
		<TableHead>Piezas</TableHead>
	</TableHeader>
	<TableBody>
		{#each $orders?.data || [] as order}
			<TableRow>
				<OptionsCell
					extraButtons={[
						{
							name: 'Descargar orden',
							icon: FileDown,
							fn: () =>
								downloadFile({
									url: '/quality/exportorders/download',
									name: `orden-exportacion-${order.id}.pdf`,
									params: { id: order.id }
								})
						}
					]}
					deleteFunc={canDelete
						? () => {
								toDelete = order;
								showDelete = true;
							}
						: undefined}
				/>
				<TableCell class="font-semibold">{order.id}</TableCell>
				<TableCell>{formatDate(order.date)}</TableCell>
				<TableCell>{order.client}</TableCell>
				<TableCell>
					<Badge color={statusColor(order.plStatus)}>
						{order.plStatus === 'con PL'
							? `PL ${order.packSlips ?? ''}`.trim()
							: order.plStatus === 'parcial'
								? `Parcial ${order.packSlips ?? ''}`.trim()
								: order.plStatus === 'sin PL'
									? 'Sin PL'
									: 'Sin pallets'}
					</Badge>
				</TableCell>
				<TableCell class="max-w-48 truncate">{order.jobs || ''}</TableCell>
				<TableCell class="max-w-48 truncate">{order.parts || ''}</TableCell>
				<TableCell class="max-w-56 truncate">{order.descriptions || ''}</TableCell>
				<TableCell>{order.pallets}</TableCell>
				<TableCell>{order.boxes}</TableCell>
				<TableCell>{order.pieces}</TableCell>
			</TableRow>
		{/each}
	</TableBody>
</CusTable>

<DeletePopUp
	bind:show={showDelete}
	deleteFunc={deleteOrder}
	text={`la orden de exportación ${toDelete?.id}`}
/>
