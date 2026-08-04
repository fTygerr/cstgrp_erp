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
	import { showError, showSuccess } from '$lib/utils/showToast';
	import { downloadFile } from '$lib/utils/files';
	import { format } from 'date-fns';
	import { untrack } from 'svelte';

	interface Props {
		show: boolean;
		plType: string;
		materials: any[];
		onGenerated?: () => void;
	}

	let { show = $bindable(), plType, materials, onGenerated = () => {} }: Props = $props();

	let options: any = $state(null);
	let folio: number | null = $state(null);
	let lines: any[] = $state([]);
	let saving = $state(false);
	let missingFields: string[] = $state([]);
	let confirmStep = $state(false);
	let data: any = $state({});

	const typeName = $derived(plType === 'materiaPrima' ? 'Materia Prima' : 'Subproductos');

	async function init() {
		lines = materials.map((m) => ({ ...m, amount: m.available, boxes: '' }));
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
		confirmStep = false;
		missingFields = [];
		try {
			if (!options) options = (await api.get('/ie/packing-list-generate/options')).data;
			folio = (await api.get('/ie/packing-list-generate/next-folio')).data.folio;
		} catch (e) {
			showError(e as any);
		}
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
		for (const line of lines) {
			const amount = Number(line.amount);
			if (!amount || amount <= 0)
				return showError(null, `${line.code}: captura una cantidad válida`);
			if (amount > line.available)
				return showError(
					null,
					`${line.code}: la cantidad (${amount}) excede la existencia (${line.available})`
				);
		}
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
				plType,
				lines: lines.map((l) => ({
					materialId: l.id,
					amount: Number(l.amount),
					boxes: Number(l.boxes) || null
				})),
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
			const { data: result } = await api.post('/ie/packing-list-generate/inventory', body);
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
		if (show) untrack(() => init());
	});
</script>

<Dialog bind:open={show}>
	<DialogContent class="min-h-[90dvh] sm:max-w-5xl">
		<DialogHeader>
			<DialogTitle>
				Generar Packing List de {typeName} {folio ? `— Pack Slip #${folio}` : ''}
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
						<Input value={folio ?? ''} disabled />
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
					<span class="text-sm font-semibold">
						Materiales a exportar (jobs, SO y PO van vacíos — sin PO del cliente)
					</span>
					<Table divClass="h-auto overflow-visible">
						<TableHeader>
							<TableHead>Codigo</TableHead>
							<TableHead class="w-full">Descripción</TableHead>
							<TableHead>Existencia</TableHead>
							<TableHead class="w-32">Cantidad</TableHead>
							<TableHead class="w-28">Cajas</TableHead>
						</TableHeader>
						<TableBody>
							{#each lines as line}
								<TableRow>
									<TableCell class="font-semibold">{line.code}</TableCell>
									<TableCell class="max-w-64 truncate" title={line.description}>
										{line.description}
									</TableCell>
									<TableCell>{line.available} {line.measurement}</TableCell>
									<TableCell class="p-1">
										<Input type="number" bind:value={line.amount} />
									</TableCell>
									<TableCell class="p-1">
										<Input type="number" bind:value={line.boxes} placeholder="—" />
									</TableCell>
								</TableRow>
							{/each}
						</TableBody>
					</Table>
				</div>

				<div class="mt-auto flex justify-end gap-2">
					<Button variant="outline" onclick={() => (show = false)}>Cancelar</Button>
					<Button onclick={tryToSave} disabled={saving || !lines.length}>Guardar</Button>
				</div>
			{/if}
		</DialogBody>
	</DialogContent>
</Dialog>
