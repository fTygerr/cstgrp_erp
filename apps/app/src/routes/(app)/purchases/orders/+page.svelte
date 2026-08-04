<script lang="ts">
	import CusTable from '$lib/components/basic/CusTable.svelte';
	import { Button } from '$lib/components/ui/button';
	import { TableBody, TableCell, TableHeader, TableRow } from '$lib/components/ui/table';
	import TableHead from '$lib/components/ui/table/table-head.svelte';
	import api from '$lib/utils/server';
	import { CheckCircle, Copy, FileDown, PlusCircle } from 'lucide-svelte';
	import DeletePopUp from '$lib/components/complex/DeletePopUp.svelte';
	import { showSuccess } from '$lib/utils/showToast';
	import ComputersForm from './OrdersForm.svelte';
	import MenuBar from '$lib/components/basic/MenuBar.svelte';
	import OptionsCell from '$lib/components/basic/OptionsCell.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { refetch } from '$lib/utils/query';
	import { formatDate } from '$lib/utils/functions';
	import { downloadFile } from '$lib/utils/files';
	import { Badge } from '$lib/components/ui/badge';
	import { Dialog, DialogBody, DialogContent } from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import OptionsHead from '$lib/components/basic/OptionsHead.svelte';

	let searchParams: any = $state({
		name: ''
	});

	let show: boolean = $state(false);
	let show1: boolean = $state(false);
	let selectedDevice: any = $state({});
	let showClose = $state(false);
	let toClose: any = $state(null);
	let closeDate = $state('');

	const computers = createQuery({
		queryKey: ['purchases-orders'],
		queryFn: async () => (await api.get('/purchases/orders', { params: searchParams })).data
	});

	function editDevice(i: number) {
		selectedDevice = $computers?.data?.[i];
		show = true;
	}

	function duplicateDevice(i: number) {
		selectedDevice = { ...$computers?.data?.[i], ref: '', id: null };
		show = true;
	}

	function createDevice() {
		selectedDevice = {};
		show = true;
	}
	function deleteDevice(i: number) {
		selectedDevice = $computers?.data?.[i];
		show1 = true;
	}
</script>

<MenuBar>
	{#snippet left()}
		<Input
			menu
			bind:value={searchParams.name}
			placeholder="Buscar"
			oninput={() => refetch(['purchases-orders'])}
		/>
	{/snippet}
	{#snippet right()}
		<Button
			variant="outline"
			size="action"
			onclick={() => downloadFile({ url: '/purchases/orders/export', name: 'ordenes-compra.xlsx' })}
			><FileDown class=" size-3.5" />Excel</Button
		>
		<Button onclick={createDevice} size="action"><PlusCircle class=" size-3.5" />Crear orden</Button
		>
	{/snippet}
</MenuBar>

<CusTable>
	<TableHeader>
		<OptionsHead />
		<TableHead class="">Folio</TableHead>
		<TableHead class="w-full">Proveedor</TableHead>
		<TableHead class="">Neto</TableHead>
		<TableHead class="">Impuesto</TableHead>
		<TableHead class="">Total</TableHead>
		<TableHead class="">Fecha</TableHead>
		<TableHead class="">Status</TableHead>
	</TableHeader>
	<TableBody>
		{#each $computers?.data as device, i}
			<TableRow>
				<OptionsCell
					editFunc={() => editDevice(i)}
					deleteFunc={() => deleteDevice(i)}
					extraButtons={[
						{
							fn: () => {
								downloadFile({
									url: '/purchases/orders/download/' + device.id,
									name: 'oc-' + device.ref + '.pdf'
								});
							},
							name: 'Descargar',
							icon: FileDown
						},
						{
							fn: () => {
								duplicateDevice(i);
							},
							name: 'Duplicar',
							icon: Copy
						},
						...(device.status !== 'cerrada'
							? [
									{
										fn: () => {
											toClose = device;
											closeDate = new Date().toISOString().slice(0, 10);
											showClose = true;
										},
										name: 'Status (cerrar)',
										icon: CheckCircle
									}
								]
							: [])
					]}
				/>
				<TableCell>{device.ref || ''}</TableCell>
				<TableCell>{device.supplier || ''}</TableCell>
				<TableCell>{device.net || ''}</TableCell>
				<TableCell>{device.tax || ''}</TableCell>
				<TableCell>{device.total || ''}</TableCell>
				<TableCell>{formatDate(device.created_at) || ''}</TableCell>
				<TableCell>
					<Badge
						color={device.status === 'cerrada'
							? 'green'
							: device.status === 'parcial'
								? 'yellow'
								: 'blue'}
					>
						{device.status === 'cerrada'
							? 'Cerrada'
							: device.status === 'parcial'
								? 'Parcial'
								: 'Abierta'}
					</Badge>
				</TableCell>
			</TableRow>
		{/each}
	</TableBody>
</CusTable>

<ComputersForm bind:show bind:selectedDevice />

<Dialog bind:open={showClose}>
	<DialogContent class="h-auto sm:max-w-md">
		<DialogBody class="border-none">
			<h2 class="text-lg font-semibold">Cerrar OC {toClose?.ref}</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Confirma la fecha de recepción: se marcarán como recibidos los movimientos pendientes de
				esta orden en almacén (afecta inventario).
			</p>
			<Input class="mt-2" type="date" bind:value={closeDate} />
			<div class="mt-4 flex justify-end gap-2">
				<Button onclick={() => (showClose = false)} variant="outline">Cancelar</Button>
				<Button
					onclick={async () => {
						await api.put('/purchases/orders/close', { id: toClose.id, date: closeDate });
						showClose = false;
						refetch(['purchases-orders']);
						showSuccess(`OC ${toClose.ref} cerrada`);
					}}>Cerrar orden</Button
				>
			</div>
		</DialogBody>
	</DialogContent>
</Dialog>
<DeletePopUp
	bind:show={show1}
	text="Eliminar orden"
	deleteFunc={async () => {
		await api.delete('/purchases/orders', { data: { id: parseInt(selectedDevice.id || '') } });
		showSuccess('Orden eliminada');
		refetch(['purchases-orders']);
		show1 = false;
	}}
/>
