<script lang="ts">
	import CusTable from '$lib/components/basic/CusTable.svelte';
	import { TableBody, TableCell, TableHeader, TableRow } from '$lib/components/ui/table';
	import TableHead from '$lib/components/ui/table/table-head.svelte';
	import api from '$lib/utils/server';
	import MenuBar from '$lib/components/basic/MenuBar.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { refetch } from '$lib/utils/query';
	import Select from '$lib/components/basic/Select.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { showError } from '$lib/utils/showToast';
	import { getClients, getOptions } from '$lib/utils/queries';
	import GeneratePLDialog from './GeneratePLDialog.svelte';

	const clientsQuery = createQuery({ queryKey: ['inventory-clients'], queryFn: getClients });
	const clients = $derived(getOptions($clientsQuery?.data));

	let filters = $state({ job: '', part: '', clientId: '' });
	let selected: Record<number, any> = $state({});
	let showGenerate = $state(false);

	const jobs = createQuery({
		queryKey: ['ie-export-jobs', { ...filters }],
		queryFn: async () => (await api.get('/ie/exports', { params: filters })).data
	});

	const selectedList = $derived(Object.values(selected).filter(Boolean));

	function toggle(job: any) {
		if (selected[job.id]) {
			delete selected[job.id];
			selected = { ...selected };
			return;
		}
		const current: any[] = Object.values(selected).filter(Boolean);
		if (current.length && current[0].clientId !== job.clientId)
			return showError(null, 'Todos los jobs deben ser del mismo cliente');
		selected = { ...selected, [job.id]: job };
	}

	$effect(() => {
		({ ...filters });
		refetch(['ie-export-jobs']);
	});
</script>

<MenuBar>
	<div class="flex w-full flex-col gap-1.5 lg:flex-row">
		<Input menu bind:value={filters.job} placeholder="Job" class="max-w-32" />
		<Input menu bind:value={filters.part} placeholder="Parte" class="max-w-36" />
		<Select
			menu
			items={clients}
			bind:value={filters.clientId}
			allowDeselect
			placeholder="Cliente"
			class="min-w-36 max-w-44"
		/>
		<Button
			class="ml-auto h-8"
			onclick={() => (showGenerate = true)}
			disabled={!selectedList.length}
		>
			Generar Packing List {selectedList.length ? `(${selectedList.length})` : ''}
		</Button>
	</div>
</MenuBar>

<CusTable>
	<TableHeader>
		<TableHead class="w-8"></TableHead>
		<TableHead>Job/Orden</TableHead>
		<TableHead>No. Parte</TableHead>
		<TableHead class="min-w-52">Descripción</TableHead>
		<TableHead>Cliente</TableHead>
		<TableHead>SO</TableHead>
		<TableHead>Cantidad</TableHead>
		<TableHead>Liberado</TableHead>
		<TableHead>Pallet(s)</TableHead>
		<TableHead>No. Pallets</TableHead>
	</TableHeader>
	<TableBody>
		{#each $jobs?.data || [] as job}
			<TableRow>
				<TableCell>
					<Checkbox checked={!!selected[job.id]} onCheckedChange={() => toggle(job)} />
				</TableCell>
				<TableCell class="font-semibold">{job.ref}</TableCell>
				<TableCell>{job.part}</TableCell>
				<TableCell class="max-w-64 truncate" title={job.description}>{job.description}</TableCell>
				<TableCell><Badge color="gray">{job.client}</Badge></TableCell>
				<TableCell>{job.client === 'CSI' ? job.so || '' : ''}</TableCell>
				<TableCell>{job.amount}</TableCell>
				<TableCell>{job.liberated}</TableCell>
				<TableCell class="max-w-52 truncate" title={job.palletFolios}>
					{job.palletFolios || ''}
				</TableCell>
				<TableCell>{job.palletCount}</TableCell>
			</TableRow>
		{/each}
	</TableBody>
</CusTable>

<GeneratePLDialog
	bind:show={showGenerate}
	jobs={selectedList}
	onGenerated={() => {
		selected = {};
		refetch(['ie-export-jobs']);
		refetch(['packing-lists']);
	}}
/>
