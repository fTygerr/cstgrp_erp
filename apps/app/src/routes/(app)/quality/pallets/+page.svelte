<script lang="ts">
	import CusTable from '$lib/components/basic/CusTable.svelte';
	import { TableBody, TableCell, TableHeader, TableRow } from '$lib/components/ui/table';
	import TableHead from '$lib/components/ui/table/table-head.svelte';
	import api from '$lib/utils/server';
	import { formatDate } from '$lib/utils/functions';
	import MenuBar from '$lib/components/basic/MenuBar.svelte';
	import OptionsCell from '$lib/components/basic/OptionsCell.svelte';
	import OptionsHead from '$lib/components/basic/OptionsHead.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { refetch } from '$lib/utils/query';
	import Select from '$lib/components/basic/Select.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import PalletsForm from './PalletsForm.svelte';
	import { getClients, getOptions } from '$lib/utils/queries';

	const pendingOptions = [
		{ name: 'Pendientes', value: 'true', color: 'yellow' },
		{ name: 'Todos', value: '', color: 'blue' }
	];

	const clientsQuery = createQuery({ queryKey: ['inventory-clients'], queryFn: getClients });
	const clients = $derived(getOptions($clientsQuery?.data));

	let filters = $state({ job: '', programation: '', pending: 'true', clientId: '' });
	let show = $state(false);
	let selectedJob: any = $state(null);

	const jobs = createQuery({
		queryKey: ['pallet-jobs', { ...filters }],
		queryFn: async () => (await api.get('/quality/pallets/jobs', { params: filters })).data
	});

	$effect(() => {
		({ ...filters });
		refetch(['pallet-jobs']);
	});
</script>

<MenuBar>
	<div class="flex flex-col gap-1.5 lg:flex-row">
		<Input menu bind:value={filters.job} placeholder="Job" class="max-w-32" />
		<Input menu bind:value={filters.programation} placeholder="Programación" class="max-w-32" />
		<Select
			menu
			items={clients}
			bind:value={filters.clientId}
			allowDeselect
			placeholder="Cliente"
			class="min-w-36 max-w-44"
		/>
		<Select menu items={pendingOptions} bind:value={filters.pending} class="min-w-36 max-w-36" />
	</div>
</MenuBar>

<CusTable>
	<TableHeader>
		<OptionsHead />
		<TableHead>Job/PO</TableHead>
		<TableHead>Programación</TableHead>
		<TableHead>Parte</TableHead>
		<TableHead>Cliente</TableHead>
		<TableHead>Cantidad</TableHead>
		<TableHead>Paletizado</TableHead>
		<TableHead>Pendiente</TableHead>
		<TableHead>Due date</TableHead>
	</TableHeader>
	<TableBody>
		{#each $jobs?.data || [] as job}
			<TableRow>
				<OptionsCell
					editFunc={() => {
						selectedJob = job;
						show = true;
					}}
				/>
				<TableCell>{job.ref}</TableCell>
				<TableCell>{job.programation}</TableCell>
				<TableCell>{job.part}</TableCell>
				<TableCell>{job.client}</TableCell>
				<TableCell>{job.amount}</TableCell>
				<TableCell>{job.palletized}</TableCell>
				<TableCell>{job.amount - job.palletized}</TableCell>
				<TableCell>{formatDate(job.due)}</TableCell>
			</TableRow>
		{/each}
	</TableBody>
</CusTable>

<PalletsForm bind:show {selectedJob} />
