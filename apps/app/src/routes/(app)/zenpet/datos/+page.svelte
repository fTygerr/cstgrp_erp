<script lang="ts">
	import api from '$lib/utils/server';
	import { createQuery } from '@tanstack/svelte-query';
	import { Badge } from '$lib/components/ui/badge';
	import Select from '$lib/components/basic/Select.svelte';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';

	const stagesQuery = createQuery({
		queryKey: ['zenpet-stages'],
		queryFn: async () => (await api.get('/zenpet/stages')).data
	});
	const formulasQuery = createQuery({
		queryKey: ['zenpet-formulas'],
		queryFn: async () => (await api.get('/zenpet/formulas')).data
	});

	const s = $derived($stagesQuery?.data);
	const f = $derived($formulasQuery?.data);

	// ---- BOM viewer state ----
	let selectedProduct = $state('');
	const productOptions = $derived(
		(f?.products || []).map((p: any, i: number) => ({
			name: `${p.line} — ${p.size}`,
			value: String(i)
		}))
	);
	const bomProduct = $derived(selectedProduct !== '' ? f?.products?.[Number(selectedProduct)] : null);

	// ---- Stage rows (units + formula + status), built from live data ----
	interface StageRow {
		n: string;
		name: string;
		en: string;
		units: number | string | null;
		formula: string;
		status: 'ok' | 'validar' | 'proxy' | 'falta';
	}
	const rawTotalMaterials = $derived(
		(s?.rawByFamily || []).reduce((a: number, r: any) => a + r.materials, 0)
	);
	const cortePool = $derived((s?.pipeline?.at_corte || 0) + (s?.pipeline?.at_cortes_varios || 0));

	const stageRows: StageRow[] = $derived([
		{
			n: '1',
			name: 'Materia prima recibida',
			en: 'Raw material received',
			units: rawTotalMaterials ? `${rawTotalMaterials} materiales` : 0,
			formula: 'Inventario ZENPET (familias Z1–Z8) con existencia al día — ver desglose por familia abajo.',
			status: 'ok'
		},
		{
			n: '2',
			name: 'Corte de tela',
			en: 'Fabric cutting',
			units: `pool: ${cortePool}`,
			formula:
				'Piezas cortadas sin avanzar al siguiente proceso (corte + cortes varios − serigrafía/producción). La separación tela vs PVC vs componentes se atribuye por familia del material del BOM (Z1 = tela) — regla por validar con Juan (P2).',
			status: 'validar'
		},
		{
			n: '3',
			name: 'Serigrafía',
			en: 'Screen print',
			units: s?.pipeline?.at_serigrafia ?? null,
			formula: 'Σ por job: serigrafía capturada − producción capturada (solo jobs con proceso de serigrafía).',
			status: 'ok'
		},
		{
			n: '4',
			name: 'Corte de película PVC',
			en: 'PVC film cutting',
			units: '(en pool de corte)',
			formula: 'Mismo pool de corte, atribuido a jobs que consumen Z4-PVC según su BOM — regla por validar (P2).',
			status: 'validar'
		},
		{
			n: '5',
			name: 'Corte de componentes',
			en: 'Component cutting',
			units: '(en pool de corte)',
			formula: 'Mismo pool, materiales Z2/Z3 — regla por validar (P2).',
			status: 'validar'
		},
		{
			n: '6',
			name: 'Corte de película PET',
			en: 'PET film cutting',
			units: '(en pool de corte)',
			formula:
				'Cortes PET = ZEN-Z4-352x, hojas = Z4-31xx. Factores corte→hoja ya definidos en CST-Tracker (ver Reglas abajo).',
			status: 'validar'
		},
		{
			n: '7',
			name: 'Kits de costura',
			en: 'Full sewing kits',
			units: s?.kits?.units ?? null,
			formula: `PROXY: piezas de jobs con material ya surtido pero producción sin iniciar (${s?.kits?.jobs ?? '…'} jobs). La composición del kit viene del BOM (ver abajo). Validar con Juan si refleja el piso (P3).`,
			status: 'proxy'
		},
		{
			n: '8',
			name: 'Bladder de producción',
			en: 'Production bladder',
			units: null,
			formula:
				'SIN DATO en piso. Composición conocida (CST-Tracker): 1 bladder = PVC film (KG) + 1 válvula ZEN-Z5-2102. Definir con Juan cómo contarlos (P3).',
			status: 'falta'
		},
		{
			n: '9',
			name: 'Línea de producción — interna',
			en: 'Production line — in-house',
			units: s?.pipeline?.at_produccion ?? null,
			formula: 'Σ por job: producción capturada − calidad liberada (lado interno del job).',
			status: 'ok'
		},
		{
			n: '10',
			name: 'Línea de producción — contratistas',
			en: 'Production line — contractors',
			units: s?.pipeline?.at_contractors ?? null,
			formula: 'Σ por job: cantidad asignada a contratistas − entregada por contratistas.',
			status: 'ok'
		},
		{
			n: '11',
			name: 'Acabado y Calidad',
			en: 'Finishing & QC',
			units: s?.pipeline?.liberado_sin_pallet ?? null,
			formula:
				'Σ por job: liberado por Calidad − paletizado. Nota: incluye liberaciones históricas previas al módulo de pallets — el número se normaliza cuando el piso use pallets.',
			status: 'ok'
		},
		{
			n: '12',
			name: 'Empaque',
			en: 'Packaging',
			units: s?.packaging?.units ?? null,
			formula: `Piezas en pallets registrados sin exportación asignada (${s?.packaging?.pallets ?? '…'} pallets). Fuente: módulo Calidad → Pallets.`,
			status: 'ok'
		},
		{
			n: '13',
			name: 'Producto terminado listo',
			en: 'Finished goods ready to ship',
			units: s ? Number(s.finished?.units || 0) + Number(s.inExport?.units || 0) : null,
			formula: `Stock de producto terminado Z0 (${s?.finished?.units ?? '…'} pzs en ${s?.finished?.skus ?? '…'} SKUs) + piezas en órdenes de exportación (${s?.inExport?.units ?? '…'} pzs).`,
			status: 'ok'
		},
		{
			n: '→',
			name: 'En ruta',
			en: 'En route',
			units: s?.enRoute?.units ?? null,
			formula: `Piezas en Packing Lists guardados en los últimos 60 días (${s?.enRoute?.pls ?? '…'} PLs). La llegada a Carlsbad la confirma ZenPet de su lado.`,
			status: 'ok'
		}
	]);

	const maxUnits = $derived(
		Math.max(1, ...stageRows.map((r) => (typeof r.units === 'number' ? r.units : 0)))
	);

	const statusBadge: Record<string, { text: string; color: any }> = {
		ok: { text: 'EN VIVO', color: 'green' },
		validar: { text: 'VALIDAR REGLA', color: 'yellow' },
		proxy: { text: 'PROXY', color: 'orange' },
		falta: { text: 'SIN DATO', color: 'red' }
	};
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-4 p-4">
	<div class="flex items-end justify-between">
		<div>
			<h1 class="text-xl font-bold">ZenPet Datos — las 13 etapas</h1>
			<p class="text-sm text-muted-foreground">
				Datos en vivo del ERP ({s?.environment || '…'}) · fórmulas de kits de CST-Tracker (extracto {f?.extracted_at ||
					'…'}) · página de verificación para conectar con el sistema de ZenPet
			</p>
		</div>
	</div>

	<!-- resumen -->
	<div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
		<div class="rounded-md border p-3">
			<p class="text-xs text-muted-foreground">MATERIA PRIMA</p>
			<p class="text-2xl font-bold">{rawTotalMaterials}</p>
			<p class="text-xs text-muted-foreground">materiales con existencia</p>
		</div>
		<div class="rounded-md border p-3">
			<p class="text-xs text-muted-foreground">EN PRODUCCIÓN</p>
			<p class="text-2xl font-bold">
				{(s?.pipeline?.at_produccion || 0) + (s?.pipeline?.at_contractors || 0)}
			</p>
			<p class="text-xs text-muted-foreground">pzs (interna + contratistas)</p>
		</div>
		<div class="rounded-md border p-3">
			<p class="text-xs text-muted-foreground">LIBERADO + EMPAQUE</p>
			<p class="text-2xl font-bold">
				{(s?.pipeline?.liberado_sin_pallet || 0) + (s?.packaging?.units || 0)}
			</p>
			<p class="text-xs text-muted-foreground">pzs post-calidad</p>
		</div>
		<div class="rounded-md border p-3">
			<p class="text-xs text-muted-foreground">PRODUCTO TERMINADO</p>
			<p class="text-2xl font-bold">
				{Number(s?.finished?.units || 0) + Number(s?.inExport?.units || 0)}
			</p>
			<p class="text-xs text-muted-foreground">pzs listas / en exportación</p>
		</div>
	</div>

	<!-- tabla de etapas -->
	<div class="rounded-md border">
		<div class="border-b bg-muted/50 px-3 py-2">
			<p class="text-sm font-semibold">Capital por etapa de producción — {s?.pipeline?.jobs_activos ?? '…'} jobs activos de ZENPET</p>
			<p class="text-xs text-muted-foreground">Cada renglón muestra su fórmula exacta — para que Juan verifique la fuente antes de conectar con ZenPet.</p>
		</div>
		<Table divClass="h-auto overflow-visible">
			<TableHeader>
				<TableHead class="w-8">#</TableHead>
				<TableHead class="min-w-44">Etapa</TableHead>
				<TableHead class="w-28 text-right">Unidades hoy</TableHead>
				<TableHead class="w-40"></TableHead>
				<TableHead>De dónde sale (fórmula)</TableHead>
				<TableHead class="w-28">Estado</TableHead>
			</TableHeader>
			<TableBody>
				{#each stageRows as row}
					<TableRow>
						<TableCell class="font-mono text-muted-foreground">{row.n}</TableCell>
						<TableCell>
							<p class="font-semibold">{row.name}</p>
							<p class="text-xs italic text-muted-foreground">{row.en}</p>
						</TableCell>
						<TableCell class="text-right font-semibold">
							{row.units === null ? '—' : row.units}
						</TableCell>
						<TableCell>
							{#if typeof row.units === 'number' && row.units > 0}
								<div class="h-2.5 rounded-sm bg-blue-500/80" style="width: {Math.max(4, (row.units / maxUnits) * 100)}%"></div>
							{/if}
						</TableCell>
						<TableCell class="text-xs text-muted-foreground">{row.formula}</TableCell>
						<TableCell>
							<Badge color={statusBadge[row.status].color}>{statusBadge[row.status].text}</Badge>
						</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
	</div>

	<!-- materia prima por familia -->
	<div class="rounded-md border">
		<div class="border-b bg-muted/50 px-3 py-2">
			<p class="text-sm font-semibold">Etapa 1 en detalle — materia prima por familia de código</p>
		</div>
		<Table divClass="h-auto overflow-visible">
			<TableHeader>
				<TableHead>Familia</TableHead>
				<TableHead>Qué es</TableHead>
				<TableHead class="text-right">Materiales</TableHead>
				<TableHead class="text-right">Existencia (unidades mixtas)</TableHead>
			</TableHeader>
			<TableBody>
				{#each s?.rawByFamily || [] as fam}
					<TableRow>
						<TableCell class="font-mono font-semibold">ZEN-{fam.family}</TableCell>
						<TableCell>{f?.rules?.families?.[fam.family] || ''}</TableCell>
						<TableCell class="text-right">{fam.materials}</TableCell>
						<TableCell class="text-right">{fam.units}</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
	</div>

	<!-- BOM / formulas de kits -->
	<div class="rounded-md border">
		<div class="flex items-end justify-between border-b bg-muted/50 px-3 py-2">
			<div>
				<p class="text-sm font-semibold">Fórmulas de kits (BOM) — {f?.products?.length ?? '…'} productos, fuente CST-Tracker</p>
				<p class="text-xs text-muted-foreground">La receta exacta de materiales por unidad de producto — la definición de la etapa 7 y la base del costeo.</p>
			</div>
			<Select items={productOptions} bind:value={selectedProduct} placeholder="Selecciona un producto" class="w-64" />
		</div>
		{#if bomProduct}
			<div class="flex gap-6 border-b px-3 py-2 text-sm">
				<span><b>{bomProduct.line} — {bomProduct.size}</b></span>
				<span>Costo material: <b>${bomProduct.material_cost.toFixed(4)}</b>/pz</span>
				<span>Labor (venta a ZenPet): <b>${bomProduct.labor_usd.toFixed(2)}</b></span>
				<span>Subcontrato: <b>${bomProduct.subcon_mxn.toFixed(2)} MXN</b></span>
				<span>Tiempo: <b>{bomProduct.minutes} min</b></span>
			</div>
			<Table divClass="h-auto overflow-visible">
				<TableHeader>
					<TableHead>Material</TableHead>
					<TableHead>Descripción</TableHead>
					<TableHead class="text-right">Cant./unidad</TableHead>
					<TableHead>Medida</TableHead>
					<TableHead class="text-right">Costo unit.</TableHead>
					<TableHead class="text-right">Costo/pz</TableHead>
				</TableHeader>
				<TableBody>
					{#each bomProduct.bom as line}
						<TableRow>
							<TableCell class="font-mono">{line.pn}</TableCell>
							<TableCell class="max-w-64 truncate text-xs">{line.desc}</TableCell>
							<TableCell class="text-right">{line.qty}</TableCell>
							<TableCell>{line.unit}</TableCell>
							<TableCell class="text-right">${line.cost.toFixed(4)}</TableCell>
							<TableCell class="text-right">${(line.qty * line.cost).toFixed(4)}</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		{:else}
			<p class="px-3 py-4 text-sm text-muted-foreground">Selecciona un producto para ver su fórmula completa de materiales.</p>
		{/if}
	</div>

	<!-- reglas -->
	<div class="grid gap-2 lg:grid-cols-2">
		<div class="rounded-md border p-3">
			<p class="mb-1 text-sm font-semibold">Reglas y factores (CST-Tracker)</p>
			<ul class="list-disc pl-5 text-xs text-muted-foreground">
				<li><b>Bladder:</b> {f?.rules?.bladder || '…'}</li>
				<li><b>PET corte→hoja:</b>
					{#each Object.entries(f?.rules?.pet_cut_to_sheet || {}) as [pn, factor]}
						<span class="mr-2 font-mono">{pn}: {factor}</span>
					{/each}
				</li>
				<li><b>Empaque:</b> {(f?.rules?.packaging_families || []).join(', ')}</li>
			</ul>
		</div>
		<div class="rounded-md border border-yellow-300 bg-yellow-50 p-3">
			<p class="mb-1 text-sm font-semibold">Pendientes para cerrar el mapeo</p>
			<ul class="list-disc pl-5 text-xs">
				<li><b>P2:</b> validar la atribución de cortes por familia (Z1 tela / Z4 películas / Z2-Z3 componentes).</li>
				<li><b>P3:</b> confirmar el proxy de kits y cómo contar bladders en piso.</li>
				<li><b>Costos:</b> validar que los costos de CST-Tracker siguen vigentes (o ZenPet pone los suyos).</li>
				<li><b>P4:</b> cadencia del envío de datos (propuesta: lunes y miércoles).</li>
			</ul>
		</div>
	</div>
</div>
