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
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { formatDate } from '$lib/utils/functions';
	import api from '$lib/utils/server';
	import { refetch } from '$lib/utils/query';
	import { showError, showSuccess } from '$lib/utils/showToast';
	import DeletePopUp from '$lib/components/complex/DeletePopUp.svelte';
	import { format } from 'date-fns';
	import { es } from 'date-fns/locale';
	import { CheckIcon, Pen, Trash, X } from 'lucide-svelte';
	import { XIcon } from 'lucide-svelte';

	interface Props {
		show: boolean;
		selectedOrder: any;
		manage?: boolean;
	}

	let { show = $bindable(), selectedOrder = $bindable(), manage = false }: Props = $props();

	let movements: any[] = $state([]);
	let editingId: number | null = $state(null);
	let editAmount: string = $state('');
	let editDate: string = $state('');
	let showDelete: boolean = $state(false);
	let deleteId: number | null = $state(null);

	async function fetchData() {
		movements = (
			await api.get('/contractors/progress/records', {
				params: { id: selectedOrder.id, all: String(manage) }
			})
		).data;
	}

	function startEdit(row: any) {
		editingId = row.id;
		editAmount = String(row.amount);
		editDate = row.date?.split('T')[0] ?? '';
	}

	async function saveEdit() {
		try {
			await api.put('/contractors/progress/movement', {
				id: editingId,
				amount: Number(editAmount),
				date: editDate
			});
			showSuccess('Captura editada');
			editingId = null;
			await fetchData();
			refetch(['contractors-orders']);
			refetch(['contractors-deliveries']);
		} catch (e) {
			showError(e as any);
		}
	}

	$effect(() => {
		if (selectedOrder?.id) fetchData();
	});
	$effect(() => {
		if (!show) {
			selectedOrder = null;
			editingId = null;
		}
	});
</script>

<Dialog bind:open={show}>
	<DialogContent class="min-h-[90%]">
		<DialogHeader>
			<DialogTitle>
				{selectedOrder?.ref}
			</DialogTitle>
		</DialogHeader>
		<DialogBody class="h-full max-w-full">
			<Table>
				<TableHeader class="sticky top-0 border-t">
					<TableHead class="border-l"><CheckIcon class="size-4" /></TableHead>
					<TableHead class="border-l"><XIcon class="size-4" /></TableHead>
					<TableHead>Fecha</TableHead>
					<TableHead>Capturado</TableHead>
					{#if manage}
						<TableHead></TableHead>
					{/if}
				</TableHeader>
				<TableBody>
					{#each movements as row (row.id)}
						<TableRow class="border-l">
							{#if editingId === row.id}
								<TableCell class="p-1">
									<Input class="h-8 w-24" type="text" inputmode="numeric" bind:value={editAmount} />
								</TableCell>
								<TableCell>{row.rejected}</TableCell>
								<TableCell class="p-1">
									<Input class="h-8 w-36" type="date" bind:value={editDate} />
								</TableCell>
								<TableCell
									>{format(new Date(row.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}</TableCell
								>
								<TableCell class="p-1">
									<div class="flex gap-1">
										<Button onclick={saveEdit} variant="ghost" class="aspect-square p-1" type="button">
											<CheckIcon class="size-4" />
										</Button>
										<Button
											onclick={() => (editingId = null)}
											variant="ghost"
											class="aspect-square p-1"
											type="button"
										>
											<X class="size-4" />
										</Button>
									</div>
								</TableCell>
							{:else}
								<TableCell>{row.accepted}</TableCell>
								<TableCell>{row.rejected}</TableCell>
								<TableCell>{formatDate(row.date)}</TableCell>
								<TableCell
									>{format(new Date(row.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}</TableCell
								>
								{#if manage}
									<TableCell class="p-1">
										<div class="flex gap-1">
											<Button
												onclick={() => startEdit(row)}
												variant="ghost"
												class="aspect-square p-1"
												type="button"
												disabled={!!row.paymentId}
												title={row.paymentId ? 'Ya incluida en un pago' : 'Editar'}
											>
												<Pen class="size-4" />
											</Button>
											<Button
												onclick={() => {
													deleteId = row.id;
													showDelete = true;
												}}
												variant="ghost"
												class="aspect-square p-1 text-destructive-foreground"
												type="button"
												disabled={!!row.paymentId}
												title={row.paymentId ? 'Ya incluida en un pago' : 'Eliminar'}
											>
												<Trash class="size-4" />
											</Button>
										</div>
									</TableCell>
								{/if}
							{/if}
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</DialogBody>
	</DialogContent>
</Dialog>

<DeletePopUp
	bind:show={showDelete}
	text="Eliminar captura"
	deleteFunc={async () => {
		try {
			await api.delete('/contractors/progress/movement', { data: { id: deleteId } });
			showSuccess('Captura eliminada');
			showDelete = false;
			await fetchData();
			refetch(['contractors-orders']);
			refetch(['contractors-deliveries']);
		} catch (e) {
			showError(e as any);
		}
	}}
/>
