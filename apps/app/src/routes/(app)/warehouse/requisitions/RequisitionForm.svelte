<script lang="ts">
	import Label from '$lib/components/basic/Label.svelte';
	import Select from '$lib/components/basic/Select.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import {
		Dialog,
		DialogBody,
		DialogContent,
		DialogFooter,
		DialogHeader
	} from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { formatDate } from '$lib/utils/functions';
	import api from '$lib/utils/server';
	import { showSuccess } from '$lib/utils/showToast';
	import { refetch } from '$lib/utils/query';
	import { getOptions, getProdAreas } from '$lib/utils/queries';
	import { createQuery } from '@tanstack/svelte-query';
	import { untrack } from 'svelte';
	import { userData } from '$lib/utils/store';

	interface Props {
		show?: boolean;
		selectedMovement: any;
	}

	let { show = $bindable(false), selectedMovement = $bindable() }: Props = $props();
	let formData: any = $state({});
	let jobs: any[] = $state([]);

	async function setFormData() {
		formData = { ...selectedMovement };
		formData.petitioner = $userData?.username;
		await getJobs();
	}

	async function getJobs() {
		jobs = [];
		jobs = (
			await api.get('requisitions/jobs', {
				params: {
					code: selectedMovement.code
				}
			})
		).data;
	}

	const areasQuery = createQuery({
		queryKey: ['requisitions-areas'],
		queryFn: getProdAreas
	});

	// Obs 20-Nov (Juan): la cantidad requerida se escribe por orden (igual o
	// menor a lo que necesita) y "Material requerido" es la suma automática.
	const toNum = (v: any) => (v === '' || v == null ? 0 : Number(v));
	const overLimit = (row: any) => toNum(row.requested) > Number(row.amount);

	function toggleRow(i: number, checked: boolean) {
		jobs[i].selected = checked;
		jobs[i].requested = checked ? Number(jobs[i].amount) : '';
	}

	function typeRow(i: number, value: string) {
		jobs[i].requested = value;
		jobs[i].selected = toNum(value) > 0;
	}

	async function handleSubmit() {
		const items = jobs
			.filter((v) => v.selected && toNum(v.requested) > 0)
			.map((v) => ({ id: v.id, amount: toNum(v.requested) }));
		await api.post('requisitions', {
			petitioner: formData.petitioner,
			motive: formData.motive,
			areaId: formData.areaId,
			code: formData.code,
			items
		});

		refetch(['requisitions']);
		showSuccess('Requisicion registrada');
		show = false;
	}

	const motives = [
		{ name: 'Producción', value: 'Producción' },
		{ name: 'Empaque', value: 'Empaque' },
		{ name: 'Corte de tela', value: 'Corte de tela' },
		{ name: 'Cortes varios', value: 'Cortes varios' }
	];

	$effect(() => {
		if (show) untrack(() => setFormData());
	});

	$effect(() => {
		formData.necessary = jobs.reduce((prev, v) => (v.selected ? prev + Number(v.amount) : prev), 0);
		formData.requested =
			Math.round(
				jobs.reduce((prev, v) => (v.selected ? prev + toNum(v.requested) : prev), 0) * 100
			) / 100;
	});
</script>

<Dialog bind:open={show}>
	<DialogContent class="grid min-h-[90%] grid-rows-[auto_1fr] gap-4 sm:max-w-4xl">
		<DialogHeader title={`Requerir ${selectedMovement?.code}`} />
		<DialogBody>
			<div class="mb-4 grid w-full gap-4 sm:grid-cols-3">
				<Label name="Solicitante:">
					<Input bind:value={formData.petitioner} />
				</Label>
				<Label name="Motivo:">
					<Select items={motives} bind:value={formData.motive} />
				</Label>
				<Label name="Area:">
					<Select items={getOptions($areasQuery.data)} bind:value={formData.areaId} />
				</Label>
				<Label name="Material necesario total:">
					<Input
						disabled
						value={formData.necessary + ' ' + formData.measurement}
						class="disabled:opacity-100"
					/>
				</Label>
				<Label name="Material requerido (suma de lo requerido por orden):" class="sm:col-span-2">
					<Input
						disabled
						value={formData.requested + ' ' + formData.measurement}
						class="font-semibold disabled:opacity-100"
					/>
				</Label>
			</div>

			<Table>
				<TableHeader class="sticky top-0 border-t">
					<TableHead class="border-l">Programacion</TableHead>
					<TableHead>Job</TableHead>
					<TableHead>Due</TableHead>
					<TableHead>Cantidad</TableHead>
					<TableHead>Requerido</TableHead>
					<TableHead class="w-min max-w-2"></TableHead>
				</TableHeader>
				<TableBody>
					{#each jobs as row, i}
						<TableRow>
							<TableCell class="border-l">{row.programation}</TableCell>
							<TableCell>{row.ref}</TableCell>
							<TableCell>{formatDate(row.due)}</TableCell>
							<TableCell>{row.amount}</TableCell>
							<TableCell class="w-40">
								<Input
									type="number"
									min="0"
									max={row.amount}
									step="any"
									value={row.requested ?? ''}
									oninput={(e) => typeRow(i, e.currentTarget.value)}
									class={'h-8 ' + (overLimit(row) ? 'border-red-500 text-red-600' : '')}
								/>
								{#if overLimit(row)}
									<p class="mt-0.5 text-xs text-red-600">Máximo {row.amount}</p>
								{/if}
							</TableCell>
							<TableCell class="w-min max-w-2">
								<Checkbox checked={jobs[i].selected} onCheckedChange={(v) => toggleRow(i, !!v)} />
							</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</DialogBody>
		<DialogFooter
			submitFunc={handleSubmit}
			hideFunc={() => (show = false)}
			disabled={!formData.requested || jobs.some(overLimit)}
		/>
	</DialogContent>
</Dialog>
