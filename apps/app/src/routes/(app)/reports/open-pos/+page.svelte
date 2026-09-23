<script lang="ts">
	import CusTable from '$lib/components/basic/CusTable.svelte';
	import { TableBody, TableCell, TableHeader, TableRow } from '$lib/components/ui/table';
	import TableHead from '$lib/components/ui/table/table-head.svelte';
	import api from '$lib/utils/server';
	import MenuBar from '$lib/components/basic/MenuBar.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { refetch } from '$lib/utils/query';
	import Select from '$lib/components/basic/Select.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { formatDate } from '$lib/utils/functions';
	import { getClients, getOptions } from '$lib/utils/queries';
	import { downloadFile } from '$lib/utils/files';
	import { FileDown } from 'lucide-svelte';

	// PO Abiertos (Hector/Juan 11-Sep-2026)
	// Pedido = Σ jobs con esa programación (PO) · Embarcado = piezas en packing
	// lists ya marcados como embarcados/cruzados/recibidos · Abierto = Pedido − Embarcado
	// · Liberado = calidad + contratista. Misma consulta que el feed de ZenPet.
	const clientsQuery = createQuery({ queryKey: ['inventory-clients'], queryFn: getClients });
	const clients = $derived(getOptions($clientsQuery?.data));

	let filters = $state({ clientId: '', onlyOpen: true });
	let open: Record<string, boolean> = $state({});

	const report = createQuery({
		queryKey: ['reports-open-pos'],
		queryFn: async () =>
			(
				await api.get('/reports/open-pos', {
					params: { clientId: filters.clientId, onlyOpen: String(filters.onlyOpen) }
				})
			).data
	});

	$effect(() => {
		({ ...filters });
		refetch(['reports-open-pos']);
	});

	const statusInfo: Record<string, { text: string; color: any }> = {
		completo: { text: 'Embarcado completo', color: 'green' },
		liberado: { text: 'Liberado, por embarcar', color: 'blue' },
		parcial: { text: 'En producción (parcial liberado)', color: 'yellow' },
		produccion: { text: 'En producción', color: 'gray' }
	};
	const n = (v: any) => new Intl.NumberFormat('en-US').format(Number(v || 0));
	const key = (r: any) => r.clientId + '|' + r.po;
	const totals = $derived.by(() => {
		const s = $report?.data?.summary || [];
		const sum = (k: string) => s.reduce((a: number, r: any) => a + Number(r[k] || 0), 0);
		return { ordered: sum('ordered'), shipped: sum('shipped'), inPl: sum('inPl'), open: sum('open'), released: sum('released') };
	});
</script>

<MenuBar>
	<div class="flex w-full flex-col gap-1.5 lg:flex-row lg:items-center">
		<Select
			menu
			items={clients}
			bind:value={filters.clientId}
			allowDeselect
			placeholder="Cliente"
			class="min-w-36 max-w-44"
		/>
		<label class="flex items-center gap-2 text-sm">
			<Checkbox bind:checked={filters.onlyOpen} /> Solo PO con saldo abierto
		</label>
	</div>
	{#snippet right()}
		<Button
			size="action"
			onclick={() =>
				downloadFile({
					url: '/reports/open-pos/excel',
					name: 'PO-abiertos.xlsx',
					params: { clientId: filters.clientId, onlyOpen: String(filters.onlyOpen) }
				})}><FileDown class="size-3.5" />Excel</Button
		>
	{/snippet}
</MenuBar>

<CusTable>
	<TableHeader>
		<TableHead></TableHead>
		<TableHead>Cliente</TableHead>
		<TableHead>PO</TableHead>
		<TableHead>Líneas</TableHead>
		<TableHead>Capturado</TableHead>
		<TableHead>Entrega</TableHead>
		<TableHead class="text-right">Pedido</TableHead>
		<TableHead class="text-right">Embarcado</TableHead>
		<TableHead class="text-right">En PL sin salir</TableHead>
		<TableHead class="text-right">Abierto</TableHead>
		<TableHead class="text-right">Liberado</TableHead>
		<TableHead>Último embarque</TableHead>
		<TableHead>Estatus</TableHead>
	</TableHeader>
	<TableBody>
		{#each $report?.data?.summary || [] as r}
			<TableRow class="cursor-pointer" onclick={() => (open[key(r)] = !open[key(r)])}>
				<TableCell class="w-6">{open[key(r)] ? '▾' : '▸'}</TableCell>
				<TableCell>{r.client}</TableCell>
				<TableCell class="font-semibold">{r.po}</TableCell>
				<TableCell>{r.lines}</TableCell>
				<TableCell>{formatDate(r.entered)}</TableCell>
				<TableCell>{formatDate(r.due)}{r.dueMax && r.dueMax !== r.due ? ' – ' + formatDate(r.dueMax) : ''}</TableCell>
				<TableCell class="text-right">{n(r.ordered)}</TableCell>
				<TableCell class="text-right">{n(r.shipped)}</TableCell>
				<TableCell class="text-right {Number(r.inPl) > 0 ? 'text-yellow-700' : 'text-muted-foreground'}">{n(r.inPl)}</TableCell>
				<TableCell class="text-right font-semibold">{n(r.open)}</TableCell>
				<TableCell class="text-right">{n(r.released)}</TableCell>
				<TableCell>{r.lastShip ? formatDate(r.lastShip) : ''}</TableCell>
				<TableCell><Badge color={statusInfo[r.status]?.color || 'gray'}>{statusInfo[r.status]?.text || r.status}</Badge></TableCell>
			</TableRow>
			{#if open[key(r)]}
				<TableRow class="bg-muted/40 hover:bg-muted/40">
					<TableCell colspan={13} class="p-0">
						<table class="w-full text-xs">
							<thead>
								<tr class="border-b text-left text-muted-foreground">
									<th class="py-1 pl-10">Job / línea</th>
									<th>No. parte</th>
									<th>Descripción</th>
									<th>Capturado</th>
									<th>Entrega</th>
									<th class="text-right">Pedido</th>
									<th class="text-right">Embarcado</th>
									<th class="text-right">En PL</th>
									<th class="text-right">Abierto</th>
									<th class="text-right pr-3">Liberado</th>
									<th>Embarques (pack slip: pz (fecha))</th>
								</tr>
							</thead>
							<tbody>
								{#each ($report?.data?.lines || []).filter((l: any) => key(l) === key(r)) as l}
									<tr class="border-b border-dashed {Number(l.open) === 0 ? 'text-muted-foreground' : ''}">
										<td class="py-1 pl-10">{l.job}</td>
										<td class="font-mono">{l.part}</td>
										<td class="max-w-72 truncate" title={l.description}>{l.description}</td>
										<td>{formatDate(l.entered)}</td>
										<td>{formatDate(l.due)}</td>
										<td class="text-right">{n(l.ordered)}</td>
										<td class="text-right">{n(l.shipped)}</td>
										<td class="text-right">{n(l.inPl)}</td>
										<td class="text-right font-semibold">{n(l.open)}</td>
										<td class="text-right pr-3">{n(l.released)}</td>
										<td class="max-w-96 truncate" title={l.shipments || ''}>{l.shipments || ''}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</TableCell>
				</TableRow>
			{/if}
		{/each}
		{#if ($report?.data?.summary || []).length}
			<TableRow class="font-semibold">
				<TableCell></TableCell>
				<TableCell colspan={5}>TOTAL ({($report?.data?.summary || []).length} PO)</TableCell>
				<TableCell class="text-right">{n(totals.ordered)}</TableCell>
				<TableCell class="text-right">{n(totals.shipped)}</TableCell>
				<TableCell class="text-right">{n(totals.inPl)}</TableCell>
				<TableCell class="text-right">{n(totals.open)}</TableCell>
				<TableCell class="text-right">{n(totals.released)}</TableCell>
				<TableCell colspan={2}></TableCell>
			</TableRow>
		{/if}
	</TableBody>
</CusTable>

<p class="mt-2 px-1 text-xs text-muted-foreground">
	Pedido = Σ jobs con esa programación (PO del cliente; cada línea del PO es un job) ·
	Embarcado = piezas en packing lists marcados como embarcados, cruzados o recibidos ·
	En PL sin salir = piezas en un packing list generado que aún no se marca "Salió" ·
	Abierto = Pedido − Embarcado · Liberado = calidad + contratista. Solo programaciones numéricas (el PO real).
</p>
