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
	import Select from '$lib/components/basic/Select.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { showError, showSuccess } from '$lib/utils/showToast';
	import { downloadFile } from '$lib/utils/files';
	import { format } from 'date-fns';
	import { untrack } from 'svelte';

	interface Props {
		show: boolean;
		jobs: any[];
		onGenerated?: () => void;
	}

	let { show = $bindable(), jobs, onGenerated = () => {} }: Props = $props();

	let options: any = $state(null);
	let preview: any = $state(null);
	let jobIds: number[] = $state([]);
	let saving = $state(false);
	let showDesglose = $state(false);
	let missingFields: string[] = $state([]);
	let confirmStep = $state(false);

	let data: any = $state({});

	function resetForm() {
		data = {
			shipDate: format(new Date(), 'yyyy-MM-dd'),
			shipVia: '',
			consignee: '',
			blNo: '',
			trk: '',
			invoice: '',
			weight: '',
			destination: '',
			carrierExp: '',
			shipTo: ''
		};
		preview = null;
		showDesglose = false;
		confirmStep = false;
		missingFields = [];
	}

	async function fetchAll() {
		try {
			if (!options) options = (await api.get('/ie/packing-list-generate/options')).data;
			preview = (await api.post('/ie/packing-list-generate/preview', { jobIds })).data;
		} catch (e) {
			showError(e as any);
		}
	}

	function quitJob(jobId: number) {
		jobIds = jobIds.filter((id) => id !== jobId);
		if (!jobIds.length) {
			show = false;
			return;
		}
		fetchAll();
	}

	const fieldNames: Record<string, string> = {
		shipVia: 'Ship Via',
		consignee: 'Consignee',
		blNo: 'B/L No.',
		trk: 'Tracking number',
		invoice: 'Invoice',
		weight: 'Weight',
		destination: 'Destination',
		carrierExp: 'Carrier Exp',
		shipTo: 'Ship To'
	};

	function tryToSave() {
		missingFields = Object.keys(fieldNames).filter((k) => !data[k]);
		if (missingFields.length) {
			confirmStep = true;
			return;
		}
		save();
	}

	async function save() {
		saving = true;
		try {
			const body = {
				jobIds,
				shipDate: data.shipDate,
				shipVia: data.shipVia || null,
				consignee: data.consignee || null,
				blNo: data.blNo,
				trk: data.trk,
				invoice: data.invoice,
				weight: data.weight,
				destination: data.destination || null,
				carrierExp: data.carrierExp || null,
				shipTo: data.shipTo || null
			};
			const { data: result } = await api.post('/ie/packing-list-generate', body);
			showSuccess(`Packing list ${result.folio} generado`);
			show = false;
			onGenerated();
			downloadFile({
				url: '/ie/packing-list/download',
				name: `packing-list-${result.folio}.pdf`,
				params: { id: result.id }
			});
		} catch (e) {
			showError(e as any);
		} finally {
			saving = false;
			confirmStep = false;
		}
	}

	$effect(() => {
		if (show) {
			untrack(() => {
				jobIds = jobs.map((j) => j.id);
				resetForm();
				fetchAll();
			});
		}
	});
</script>

<Dialog bind:open={show}>
	<DialogContent class="min-h-[90dvh] sm:max-w-5xl">
		<DialogHeader>
			<DialogTitle>
				Generar Packing List {preview ? `— Pack Slip #${preview.folio}` : ''}
			</DialogTitle>
		</DialogHeader>
		<DialogBody class="flex max-h-[80dvh] flex-col gap-4 overflow-auto">
			{#if confirmStep}
				<div class="flex flex-col gap-3 rounded-md border border-yellow-400 bg-yellow-50 p-4">
					<p class="font-semibold">Campos sin llenar (solo aviso):</p>
					<ul class="list-inside list-disc text-sm">
						{#each missingFields as f}
							<li>{fieldNames[f]}</li>
						{/each}
					</ul>
					<div class="flex gap-2">
						<Button onclick={save} disabled={saving}>Continuar y guardar</Button>
						<Button variant="outline" onclick={() => (confirmStep = false)}>Regresar</Button>
					</div>
				</div>
			{:else}
				<div class="grid gap-2 sm:grid-cols-3">
					<Label name="Pack Slip #">
						<Input value={preview?.folio ?? ''} disabled />
					</Label>
					<Label name="Ship Date">
						<Input type="date" bind:value={data.shipDate} />
					</Label>
					<Label name="Ship Via">
						<Select items={options?.shippers || []} bind:value={data.shipVia} allowDeselect />
					</Label>
					<Label name="Consignee">
						<Select items={options?.clients || []} bind:value={data.consignee} allowDeselect />
					</Label>
					<Label name="B/L No.">
						<Input bind:value={data.blNo} />
					</Label>
					<Label name="Tracking number">
						<Input bind:value={data.trk} />
					</Label>
					<Label name="Invoice">
						<Input bind:value={data.invoice} />
					</Label>
					<Label name="Weight">
						<Input bind:value={data.weight} />
					</Label>
					<Label name="Destination">
						<Select items={options?.destinations || []} bind:value={data.destination} allowDeselect />
					</Label>
					<Label name="Carrier Exp">
						<Select items={options?.carriers || []} bind:value={data.carrierExp} allowDeselect />
					</Label>
					<Label name="Ship To">
						<Select items={options?.shipTo || []} bind:value={data.shipTo} allowDeselect />
					</Label>
				</div>

				<div class="flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<span class="text-sm font-semibold">Vista previa</span>
						<Button variant="outline" class="h-7" onclick={() => (showDesglose = !showDesglose)}>
							{showDesglose ? 'Ocultar desglose' : 'Modificar'}
						</Button>
					</div>

					{#if preview?.missing?.length}
						<div class="rounded-md border border-yellow-400 bg-yellow-50 p-2 text-sm">
							Sin pallets disponibles (no se incluirán):
							{preview.missing.map((j: any) => j.ref).join(', ')}
						</div>
					{/if}

					<Table divClass="h-auto overflow-visible">
						<TableHeader>
							<TableHead>Job</TableHead>
							<TableHead>Parte</TableHead>
							<TableHead class="w-full">Descripción</TableHead>
							<TableHead>Cliente</TableHead>
							<TableHead>Cantidad</TableHead>
							<TableHead>Pallets</TableHead>
							{#if showDesglose}
								<TableHead></TableHead>
							{/if}
						</TableHeader>
						<TableBody>
							{#each preview?.lines || [] as line}
								<TableRow>
									<TableCell class="font-semibold">
										{line.ref}
										{#if line.implicit}
											<Badge color="blue" class="ml-1">pallet compartido</Badge>
										{/if}
									</TableCell>
									<TableCell>{line.part}</TableCell>
									<TableCell class="max-w-56 truncate" title={line.description}
										>{line.description}</TableCell
									>
									<TableCell>{line.client}</TableCell>
									<TableCell>{line.amount}</TableCell>
									<TableCell>{Number(line.pallets).toFixed(2)}</TableCell>
									{#if showDesglose}
										<TableCell class="p-1">
											{#if !line.implicit}
												<Button
													variant="outline"
													class="h-7 text-destructive-foreground"
													onclick={() => quitJob(line.jobId)}
												>
													Quitar
												</Button>
											{/if}
										</TableCell>
									{/if}
								</TableRow>
							{/each}
						</TableBody>
					</Table>

					{#if showDesglose}
						<span class="mt-2 text-sm font-semibold">Desglose de pallets</span>
						<div class="grid gap-2 sm:grid-cols-2">
							{#each preview?.pallets || [] as pallet}
								<div class="rounded-md border p-2 text-sm">
									<p class="font-semibold">Pallet {pallet.folio}</p>
									{#each pallet.contents || [] as c}
										<p class="flex justify-between">
											<span>{c.ref} — {c.part}</span>
											<span>{c.amount} pzs / {c.boxes} cajas</span>
										</p>
									{/each}
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<div class="mt-auto flex justify-end gap-2">
					<Button variant="outline" onclick={() => (show = false)}>Cancelar</Button>
					<Button onclick={tryToSave} disabled={saving || !preview?.lines?.length}>
						Guardar
					</Button>
				</div>
			{/if}
		</DialogBody>
	</DialogContent>
</Dialog>
