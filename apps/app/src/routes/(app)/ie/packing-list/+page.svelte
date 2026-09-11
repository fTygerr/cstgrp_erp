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
	import { Eye, FileDown, Package, Pencil, Truck, Undo2, PackageCheck } from 'lucide-svelte';
	import EditPLDialog from './EditPLDialog.svelte';
	import ReceivePLDialog from './ReceivePLDialog.svelte';
	import { showError } from '$lib/utils/showToast';

	// Ciclo del PL (11-Sep): generado → embarcado → cruzado → recibido
	const statusInfo: Record<string, { text: string; color: any }> = {
		generado: { text: 'Generado', color: 'yellow' },
		embarcado: { text: 'Embarcado', color: 'blue' },
		cruzado: { text: 'Cruzado', color: 'purple' },
		recibido: { text: 'Recibido', color: 'green' }
	};
	const statusItems = Object.entries(statusInfo).map(([value, v]) => ({ value, name: v.text }));
	let showReceive = $state(false);
	let toReceive: any = $state(null);
	let confirmShip: any = $state(null);
	let showShip = $state(false);

	async function shipPl() {
		try {
			await api.put('/ie/packing-list/ship', { id: confirmShip.id });
			showSuccess(`Packing list ${confirmShip.packSlip} marcado como embarcado`);
			showShip = false;
			refetch(['packing-lists']);
		} catch (err: any) {
			if (err.response?.status !== 400) throw err;
		}
	}
	async function unshipPl(pl: any) {
		try {
			await api.put('/ie/packing-list/unship', { id: pl.id });
			showSuccess(`Embarque del packing list ${pl.packSlip} revertido`);
			refetch(['packing-lists']);
		} catch (err: any) {
			if (err.response?.status !== 400) throw err;
		}
	}
	function fmtDateTime(v?: string) {
		if (!v) return '';
		const d = new Date(v);
		return d.toLocaleString('es-MX', { timeZone: 'America/Tijuana', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	const clientsQuery = createQuery({ queryKey: ['inventory-clients'], queryFn: getClients });
	const clients = $derived(getOptions($clientsQuery?.data));

	let filters = $state({ packSlip: '', clientId: '', status: '' });
	let showDelete = $state(false);
	let toDelete: any = $state(null);
	let showEdit = $state(false);
	let toEdit: any = $state(null);
	let plViewOnly = $state(false);
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
		<Select
			menu
			items={statusItems}
			bind:value={filters.status}
			allowDeselect
			placeholder="Estatus"
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
		<TableHead>Fecha embarque</TableHead>
		<TableHead>Estatus</TableHead>
		<TableHead>Pedimento</TableHead>
	</TableHeader>
	<TableBody>
		{#each $lists?.data || [] as pl}
			<TableRow>
				<OptionsCell
					extraButtons={[
						{
							name: 'Ver',
							icon: Eye,
							fn: () => {
								toEdit = pl;
								plViewOnly = true;
								showEdit = true;
							}
						},
						...(canEdit && pl.status !== 'cruzado' && pl.status !== 'recibido'
							? [
									{
										name: 'Modificar',
										icon: Pencil,
										fn: () => {
											toEdit = pl;
											plViewOnly = false;
											showEdit = true;
										}
									}
								]
							: []),
						...(canEdit && pl.status === 'generado'
							? [
									{
										name: 'Salió (marcar embarcado)',
										icon: Truck,
										fn: () => {
											confirmShip = pl;
											showShip = true;
										}
									}
								]
							: []),
						...(canEdit && pl.status === 'embarcado'
							? [{ name: 'Revertir salida', icon: Undo2, fn: () => unshipPl(pl) }]
							: []),
						...(canEdit && (pl.status === 'embarcado' || pl.status === 'cruzado')
							? [
									{
										name: 'Recibido por el cliente',
										icon: PackageCheck,
										fn: () => {
											toReceive = pl;
											showReceive = true;
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
					deleteFunc={canDelete && pl.status !== 'cruzado' && pl.status !== 'recibido'
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
						<Badge color="gray" title={pl.shippedAt ? 'Salió: ' + fmtDateTime(pl.shippedAt) : 'Fecha capturada al generar el PL'}
							>{formatDate(pl.shipDate)}</Badge
						>
					{/if}
				</TableCell>
				<TableCell>
					<div class="flex flex-col gap-0.5">
						<Badge color={statusInfo[pl.status]?.color || 'gray'}>{statusInfo[pl.status]?.text || pl.status}</Badge>
						{#if pl.crossedAt}
							<span class="text-[11px] text-muted-foreground">Cruzó {formatDate(pl.crossedAt)}</span>
						{/if}
						{#if pl.receivedAt}
							<span class="text-[11px] text-muted-foreground"
								>Recibido {formatDate(pl.receivedAt)}{pl.receivedComplete === false ? ' (parcial)' : ''}</span
							>
						{/if}
					</div>
				</TableCell>
				<TableCell class="max-w-36 truncate text-xs" title={pl.pedimento || ''}>{pl.pedimento || ''}</TableCell>
			</TableRow>
		{/each}
	</TableBody>
</CusTable>

<EditPLDialog bind:show={showEdit} pl={toEdit} viewOnly={plViewOnly} />
<ReceivePLDialog bind:show={showReceive} pl={toReceive} />

<DeletePopUp
	bind:show={showShip}
	deleteFunc={shipPl}
	warning={true}
	text={`Marcar el packing list ${confirmShip?.packSlip} como EMBARCADO (salió hoy)? La fecha y hora se registran automáticamente.`}
/>

<DeletePopUp
	bind:show={showDelete}
	deleteFunc={deletePl}
	text={`el packing list ${toDelete?.packSlip}`}
/>
