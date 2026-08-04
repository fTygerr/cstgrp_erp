<script lang="ts">
	import {
		Dialog,
		DialogBody,
		DialogContent,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import api from '$lib/utils/server';
	import Label from '$lib/components/basic/Label.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import { Button } from '$lib/components/ui/button';
	import { showError, showSuccess } from '$lib/utils/showToast';
	import { refetch } from '$lib/utils/query';
	import { untrack } from 'svelte';

	interface Props {
		show: boolean;
		pl: any;
	}

	let { show = $bindable(), pl }: Props = $props();

	let data: any = $state({});
	let orders: any[] = $state([]);
	let saving = $state(false);

	function lineBoxes(order: any) {
		return order.boxes ?? (order.perBox ? Math.ceil(order.amount / order.perBox) : 0);
	}

	async function fetchData() {
		try {
			const { data: result } = await api.get('/ie/packing-list/data', {
				params: { id: pl.id }
			});
			const d = result.data;
			orders = (d.orders || []).map((o: any) => ({ ...o, boxes: lineBoxes(o) }));
			data = {
				shipDate: d.shipDate?.slice(0, 10) || '',
				shipVia: d.shipVia || '',
				consignee: d.consignee || '',
				blNo: d.blNo || '',
				trk: d.trk || '',
				po: d.po || '',
				invoice: d.invoice || '',
				weight: d.weight || '',
				carrierExp: d.carrierExp || '',
				exported: { name: '', direction: '', rfc: '', ...(d.exported || {}) },
				soldTo: { name: '', direction: '', rfc: '', ...(d.soldTo || {}) },
				destination: { name: '', direction: '', ...(d.destination || {}) },
				totalBoxes:
					d.totalBoxes ?? orders.reduce((acc: number, o: any) => acc + lineBoxes(o), 0),
				totalPallets:
					d.totalPallets != null
						? Number(d.totalPallets)
						: Math.ceil(orders.reduce((acc: number, o: any) => acc + Number(o.pallets || 0), 0))
			};
		} catch (e) {
			showError(e as any);
		}
	}

	async function save() {
		saving = true;
		try {
			await api.put('/ie/packing-list/data', {
				id: pl.id,
				...data,
				totalBoxes: Number(data.totalBoxes) || 0,
				totalPallets: Number(data.totalPallets) || 0,
				orders: orders.map((o) => ({ boxes: Number(o.boxes) || 0 }))
			});
			showSuccess(`Packing list ${pl.packSlip} actualizado`);
			show = false;
			refetch(['packing-lists']);
		} catch (e) {
			showError(e as any);
		} finally {
			saving = false;
		}
	}

	$effect(() => {
		if (show) untrack(() => fetchData());
	});
</script>

<Dialog bind:open={show}>
	<DialogContent class="sm:max-w-4xl">
		<DialogHeader>
			<DialogTitle>Modificar Packing List — {pl?.packSlip}</DialogTitle>
		</DialogHeader>
		<DialogBody class="flex max-h-[80dvh] flex-col gap-4 overflow-auto">
			<div class="grid gap-2 sm:grid-cols-3">
				<Label name="Ship Date">
					<Input type="date" bind:value={data.shipDate} />
				</Label>
				<Label name="Ship Via">
					<Input bind:value={data.shipVia} />
				</Label>
				<Label name="Carrier Exp">
					<Input bind:value={data.carrierExp} />
				</Label>
				<Label name="Consignee">
					<Input bind:value={data.consignee} />
				</Label>
				<Label name="B/L No.">
					<Input bind:value={data.blNo} />
				</Label>
				<Label name="Tracking #">
					<Input bind:value={data.trk} />
				</Label>
				<Label name="PO">
					<Input bind:value={data.po} />
				</Label>
				<Label name="Invoice">
					<Input bind:value={data.invoice} />
				</Label>
				<Label name="Total Weight">
					<Input bind:value={data.weight} />
				</Label>
			</div>

			<div class="grid gap-2 sm:grid-cols-2">
				{#if data.exported}
					<div class="flex flex-col gap-1 rounded-md border p-2">
						<span class="text-sm font-semibold">Exported</span>
						<Label name="Nombre"><Input bind:value={data.exported.name} /></Label>
						<Label name="Dirección"><Input bind:value={data.exported.direction} /></Label>
						<Label name="RFC"><Input bind:value={data.exported.rfc} /></Label>
					</div>
				{/if}
				{#if data.soldTo}
					<div class="flex flex-col gap-1 rounded-md border p-2">
						<span class="text-sm font-semibold">Sold to</span>
						<Label name="Nombre"><Input bind:value={data.soldTo.name} /></Label>
						<Label name="Dirección"><Input bind:value={data.soldTo.direction} /></Label>
						<Label name="TAX ID"><Input bind:value={data.soldTo.rfc} /></Label>
					</div>
				{/if}
				{#if data.destination}
					<div class="flex flex-col gap-1 rounded-md border p-2 sm:col-span-2">
						<span class="text-sm font-semibold">Destination</span>
						<div class="grid gap-2 sm:grid-cols-2">
							<Label name="Nombre"><Input bind:value={data.destination.name} /></Label>
							<Label name="Dirección"><Input bind:value={data.destination.direction} /></Label>
						</div>
					</div>
				{/if}
			</div>

			{#if orders.length}
				<div class="flex flex-col gap-1">
					<span class="text-sm font-semibold">Cajas por job</span>
					<Table divClass="h-auto overflow-visible">
						<TableHeader>
							<TableHead>Job</TableHead>
							<TableHead>Parte</TableHead>
							<TableHead>Cantidad</TableHead>
							<TableHead class="w-28">Cajas</TableHead>
						</TableHeader>
						<TableBody>
							{#each orders as order}
								<TableRow>
									<TableCell>{order.ref}</TableCell>
									<TableCell>{order.part}</TableCell>
									<TableCell>{order.amount}</TableCell>
									<TableCell class="p-1">
										<Input type="number" bind:value={order.boxes} />
									</TableCell>
								</TableRow>
							{/each}
						</TableBody>
					</Table>
				</div>
			{/if}

			<div class="grid gap-2 sm:grid-cols-2">
				<Label name="Total Box">
					<Input type="number" bind:value={data.totalBoxes} />
				</Label>
				<Label name="Total Pallet">
					<Input type="number" bind:value={data.totalPallets} />
				</Label>
			</div>

			<div class="mt-auto flex justify-end gap-2">
				<Button variant="outline" onclick={() => (show = false)}>Cancelar</Button>
				<Button onclick={save} disabled={saving}>Guardar</Button>
			</div>
		</DialogBody>
	</DialogContent>
</Dialog>
