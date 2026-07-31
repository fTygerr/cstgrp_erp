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

	let filters = $state({ id: '' });
	let showDelete = $state(false);
	const canDelete = $derived(($userData?.permissions?.['quality'] || 0) >= 3);
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
	</div>
</MenuBar>

<CusTable>
	<TableHeader>
		<OptionsHead />
		<TableHead>No.</TableHead>
		<TableHead>Fecha</TableHead>
		<TableHead>Cliente</TableHead>
		<TableHead>Pallets</TableHead>
		<TableHead>Piezas</TableHead>
		<TableHead>Cajas</TableHead>
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
				<TableCell>{order.pallets}</TableCell>
				<TableCell>{order.pieces}</TableCell>
				<TableCell>{order.boxes}</TableCell>
			</TableRow>
		{/each}
	</TableBody>
</CusTable>

<DeletePopUp
	bind:show={showDelete}
	deleteFunc={deleteOrder}
	text={`la orden de exportación ${toDelete?.id}`}
/>
