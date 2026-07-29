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
	import { formatDate } from '$lib/utils/functions';
	import Label from '$lib/components/basic/Label.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	interface Props {
		show: boolean;
		selectedRow: any;
	}

	let { show = $bindable(), selectedRow = $bindable() }: Props = $props();

	let data: Record<string, any> | null = $state(null);

	async function fetchData() {
		data = (await api.get('/quality/orders/destinations', { params: { id: selectedRow.id } })).data;
	}

	$effect(() => {
		if (selectedRow.id) fetchData();
	});
</script>

<Dialog bind:open={show}>
	<DialogContent class="min-h-[50%] sm:max-w-2xl">
		<DialogHeader>
			<DialogTitle>
				{data?.ref}
			</DialogTitle>
		</DialogHeader>
		<DialogBody class="h-full max-w-full">
			<div class="mb-4 grid grid-cols-3 gap-2">
				<Label name="Programación">
					<Input readonly value={data?.programation ?? ''} />
				</Label>
				<Label name="Job PO">
					<Input readonly value={data?.ref ?? ''} />
				</Label>
				<Label name="Parte">
					<Input readonly value={data?.part ?? ''} />
				</Label>
				<Label name="Cantidad">
					<Input readonly value={data?.amount ?? ''} />
				</Label>
				<Label name="Pz/Caja">
					<Input readonly value={data?.perBox ?? ''} />
				</Label>
				<Label name="Due Date">
					<Input readonly value={formatDate(data?.due) ?? ''} />
				</Label>
			</div>
			<Table>
				<TableHeader class="sticky top-0 border-t">
					<TableHead class="border-l">SO</TableHead>
					<TableHead class="border-l">Cantidad</TableHead>
					<TableHead class="border-l">Fecha</TableHead>
					<TableHead class="border-l">Pallets</TableHead>
				</TableHeader>
				<TableBody>
					{#each data?.destinations as row}
						<TableRow>
							<TableCell class="border-l">{row.so}</TableCell>
							<TableCell>{row.amount}</TableCell>
							<TableCell>{formatDate(row.date)}</TableCell>
							<!-- pallets now come from the Pallets module (Calidad → Pallets) -->
							<TableCell class="w-24 text-center">{row.pallets ?? '—'}</TableCell>
						</TableRow>
					{/each}
					<TableRow>
						<TableCell class="" colspan={3}></TableCell>
						<TableCell class="" colspan={3}
							>Total: {data?.destinations.reduce(
								(acc: number, row: any) => acc + row.pallets,
								0
							)}</TableCell
						>
					</TableRow>
					{#if data?.destinations.length === 0}
						<TableRow>
							<TableCell class="border-l text-center text-muted-foreground" colspan={100}
								>No hay destinos</TableCell
							>
						</TableRow>
					{/if}
				</TableBody>
			</Table>
		</DialogBody>
	</DialogContent>
</Dialog>
