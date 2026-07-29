<script lang="ts">
	import {
		Dialog,
		DialogBody,
		DialogContent,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import api from '$lib/utils/server';
	import Label from '$lib/components/basic/Label.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import DialogFooter from '$lib/components/ui/dialog/dialog-footer.svelte';
	import { showSuccess } from '$lib/utils/showToast';
	import Select from '$lib/components/basic/Select.svelte';
	import { format } from 'date-fns';
	import { refetch } from '$lib/utils/query';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { X } from 'lucide-svelte';

	interface Props {
		show: boolean;
		selectedRow: any;
	}

	let { show = $bindable(), selectedRow = $bindable() }: Props = $props();

	let data: Record<string, any> = $state({});
	let orders: Record<string, any> = $state([]);
	let options: any = $state(null);
	let exportOrders: any = $state({ applied: [], available: [] });
	let selectedOrder: any = $state('');

	async function fetchExportOrders() {
		exportOrders = (await api.get('/ie/packing-list/exportorders?id=' + selectedRow.id)).data;
	}

	async function fetchData() {
		const result2 = await api.get('/ie/packing-list/options');
		options = result2.data;

		await fetchExportOrders();

		const result = (await api.get('/ie/packing-list/data?id=' + selectedRow.id)).data;
		orders = result.orders;
		data = {
			...result.data,
			shipDate: format(result.data.shipDate, 'yyyy-MM-dd'),
			shipVia: options.shippers.find((item: any) => item.name === result.data.shipVia)?.value,
			consignee: options.clients.find((item: any) => item.name === result.data.consignee)?.value,
			destination: options.destinations.find(
				(item: any) => item.name === result.data.destination?.name
			)?.value,
			shipTo: !data.exported
				? 1
				: options.shipTo.find((item: any) => item.name === result.data.destination?.name)?.value,
			carrierExp: options.carriers.find((item: any) => item.name === result.data.carrierExp)?.value
		};
	}

	const availableOptions = $derived(
		(exportOrders.available || []).map((o: any) => ({
			name: `Exportación ${o.id} — ${o.client} (${o.pallets} pallets, ${o.pieces} pzs)`,
			value: String(o.id)
		}))
	);

	async function applyOrder() {
		if (!selectedOrder) return;
		await api.post('/ie/packing-list/apply-exportorder', {
			id: selectedRow.id,
			exportOrderId: selectedOrder
		});
		selectedOrder = '';
		showSuccess('Orden aplicada al packing list');
		await fetchExportOrders();
		refetch(['exports']);
	}

	async function removeOrder(exportOrderId: number) {
		await api.post('/ie/packing-list/remove-exportorder', {
			id: selectedRow.id,
			exportOrderId
		});
		showSuccess('Orden quitada del packing list');
		await fetchExportOrders();
		refetch(['exports']);
	}

	$effect(() => {
		if (selectedRow.id) fetchData();
	});

	async function handleSubmit() {
		await api.put('/ie/packing-list', {
			...data
		});
		showSuccess('Packing list actualizado');
		show = false;
		refetch(['exports']);
	}
</script>

<Dialog bind:open={show}>
	<DialogContent class="min-h-[90dvh] ">
		<DialogHeader>
			<DialogTitle>
				{selectedRow?.so}
			</DialogTitle>
		</DialogHeader>
		<DialogBody grid="2">
			<div class="col-span-2 rounded-md border border-input p-2">
				<p class="mb-1.5 text-sm font-semibold">Órdenes de exportación (Calidad)</p>
				<div class="flex items-end gap-2">
					<Select
						items={availableOptions}
						bind:value={selectedOrder}
						allowDeselect
						placeholder="Selecciona una orden"
						class="w-full"
					/>
					<Button class="h-8" onclick={applyOrder} disabled={!selectedOrder}>Aplicar</Button>
				</div>
				{#if exportOrders.applied?.length}
					<div class="mt-2 flex flex-wrap gap-1.5">
						{#each exportOrders.applied as order}
							<Badge color="green" class="gap-1">
								Exportación {order.id} ({order.pallets} pallets, {order.pieces} pzs)
								<button onclick={() => removeOrder(order.id)} title="Quitar del PL">
									<X class="size-3" />
								</button>
							</Badge>
						{/each}
					</div>
				{/if}
			</div>

			<Label name="Pack Slip">
				<Input bind:value={data.packSlip} />
			</Label>
			<Label name="Ship Via">
				<Select items={options.shippers} bind:value={data.shipVia} />
			</Label>
			<Label name="Consignee">
				<Select items={options.clients} bind:value={data.consignee} />
			</Label>
			<Label name="Ship Date">
				<Input type="date" bind:value={data.shipDate} />
			</Label>
			<Label name="B/L No">
				<Input bind:value={data.blNo} />
			</Label>
			<Label name="TRK#">
				<Input bind:value={data.trk} />
			</Label>
			<Label name="PO">
				<Input bind:value={data.po} />
			</Label>
			<Label name="Invoice">
				<Input bind:value={data.invoice} />
			</Label>
			<Label name="Weight">
				<Input bind:value={data.weight} />
			</Label>
			<Label name="Destination">
				<Select items={options.destinations} bind:value={data.destination} />
			</Label>
			<Label name="Carrier Exp">
				<Select items={options.carriers} bind:value={data.carrierExp} />
			</Label>
			<Label name="Ship To">
				<Select items={options.shipTo} bind:value={data.shipTo} />
			</Label>
		</DialogBody>
		<DialogFooter submitFunc={handleSubmit} hideFunc={() => (show = false)} />
	</DialogContent>
</Dialog>
