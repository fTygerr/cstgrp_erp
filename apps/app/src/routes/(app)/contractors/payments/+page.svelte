<script lang="ts">
	import CusTable from '$lib/components/basic/CusTable.svelte';
	import { TableBody, TableCell, TableHeader, TableRow } from '$lib/components/ui/table';
	import TableHead from '$lib/components/ui/table/table-head.svelte';
	import api from '$lib/utils/server';
	import MenuBar from '$lib/components/basic/MenuBar.svelte';
	import OptionsCell from '$lib/components/basic/OptionsCell.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { refetch } from '$lib/utils/query';
	import OptionsHead from '$lib/components/basic/OptionsHead.svelte';
	import { formatDate } from '$lib/utils/functions';
	import Input from '$lib/components/ui/input/input.svelte';
	import DeletePopUp from '$lib/components/complex/DeletePopUp.svelte';
	import { showSuccess } from '$lib/utils/showToast';
	import PaymentsForm from './PaymentsForm.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Eye, FileDown } from 'lucide-svelte';
	import { Dialog, DialogBody, DialogContent } from '$lib/components/ui/dialog';

	let showForm: boolean = $state(false);
	let showVer = $state(false);
	let verPago: any = $state(null);
	let verRows: any[] = $state([]);
	let selectedMovement: any = $state({});
	let showDelete: boolean = $state(false);

	let filters = $state({
		folio: '',
		date: ''
	});

	const payments = createQuery({
		queryKey: ['contractors-payments'],
		queryFn: async () =>
			(
				await api.get('/contractors/payments', {
					params: filters
				})
			).data
	});

	$effect(() => {
		({ ...filters });
		refetch(['contractors-payments']);
	});
</script>

<MenuBar>
	<div class="flex flex-col gap-1.5 lg:flex-row">
		<Input
			menu
			bind:value={filters.folio}
			placeholder="Folio"
			class="max-w-32"
			oninput={() => refetch(['contractors-payments'])}
		/>
		<Input
			menu
			bind:value={filters.date}
			placeholder="Fecha"
			class="max-w-40"
			type="date"
			oninput={() => refetch(['contractors-payments'])}
		/>
	</div>

	{#snippet right()}
		<Button size="action" onclick={() => (showForm = true)}>Generar pagos</Button>
	{/snippet}
</MenuBar>
<CusTable>
	<TableHeader>
		<OptionsHead />
		<TableHead class="">Folio</TableHead>
		<TableHead class="">Inicio del periodo</TableHead>
		<TableHead class="">Fin del periodo</TableHead>
		<TableHead class="">Contratista</TableHead>
		<TableHead class="min-w-52">Órdenes</TableHead>
		<TableHead class="">Aceptados</TableHead>
		<TableHead class="">Rechazados</TableHead>
		<TableHead class="w-full">Total a pagar</TableHead>
	</TableHeader>
	<TableBody>
		{#each $payments?.data as payment}
			<TableRow>
				<OptionsCell
					extraButtons={[
						{
							fn: async () => {
								verPago = payment;
								verRows = (
									await api.get('/contractors/payments/deliveries', { params: { id: payment.id } })
								).data;
								showVer = true;
							},
							name: 'Ver',
							icon: Eye
						},
						{
							fn: () => {
								window.open(
									import.meta.env.VITE_BASEURL + '/contractors/payments/download?id=' + payment.id,
									'_blank'
								);
							},
							name: 'Descargar',
							icon: FileDown
						}
					]}
					deleteFunc={() => {
						selectedMovement = payment;
						showDelete = true;
					}}
				/>

				<TableCell>{payment.folio}</TableCell>
				<TableCell>{formatDate(payment.startDate)}</TableCell>
				<TableCell>{formatDate(payment.endDate)}</TableCell>
				<TableCell>{payment.contractors ?? ''}</TableCell>
				<TableCell class="max-w-64 truncate" title={payment.orders ?? ''}
					>{payment.orders ?? ''}</TableCell
				>
				<TableCell>{payment.accepted}</TableCell>
				<TableCell>{payment.rejected}</TableCell>
				<TableCell>${Number(payment.total ?? 0).toFixed(2)}</TableCell>
			</TableRow>
		{/each}
	</TableBody>
</CusTable>

<PaymentsForm bind:show={showForm} />

<Dialog bind:open={showVer}>
	<DialogContent class="h-auto sm:max-w-3xl">
		<DialogBody class="border-none">
			<h2 class="text-lg font-semibold">Pago #{verPago?.folio} — entregas incluidas</h2>
			<div class="mt-2 max-h-96 overflow-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b text-left">
							<th class="py-1 pr-2">Fecha</th>
							<th class="pr-2">Orden</th>
							<th class="pr-2">Parte</th>
							<th class="pr-2">Contratista</th>
							<th class="pr-2">Aceptadas</th>
							<th class="pr-2">Rechazadas</th>
							<th class="pr-2">Precio</th>
							<th>Total</th>
						</tr>
					</thead>
					<tbody>
						{#each verRows as r}
							<tr class="border-b border-dotted">
								<td class="py-1 pr-2">{formatDate(r.date)}</td>
								<td class="pr-2 font-semibold">{r.ref}</td>
								<td class="pr-2">{r.part}</td>
								<td class="pr-2">{r.contractor || ''}</td>
								<td class="pr-2">{r.accepted}</td>
								<td class="pr-2">{r.rejected}</td>
								<td class="pr-2">{r.price}</td>
								<td>{r.total}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="mt-4 flex justify-end">
				<Button variant="outline" onclick={() => (showVer = false)}>Cerrar</Button>
			</div>
		</DialogBody>
	</DialogContent>
</Dialog>

<DeletePopUp
	bind:show={showDelete}
	text="Eliminar pago"
	deleteFunc={async () => {
		await api.delete('/contractors/payments', { data: { id: selectedMovement.id } });
		showSuccess('Pago eliminado');
		refetch(['contractors-payments']);
		showDelete = false;
	}}
/>
