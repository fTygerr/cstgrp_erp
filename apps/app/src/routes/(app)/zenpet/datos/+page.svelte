<script lang="ts">
	import api from '$lib/utils/server';
	import { createQuery } from '@tanstack/svelte-query';
	import { Badge } from '$lib/components/ui/badge';
	import Select from '$lib/components/basic/Select.svelte';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';

	const etapasQuery = createQuery({
		queryKey: ['zenpet-etapas'],
		queryFn: async () => (await api.get('/zenpet/etapas')).data
	});
	const e = $derived($etapasQuery?.data);
	const rawMatsQuery = createQuery({
		queryKey: ['zenpet-materials'],
		queryFn: async () => (await api.get('/zenpet/materials')).data
	});
	const rawMats = $derived($rawMatsQuery?.data || []);
	const fgQuery = createQuery({
		queryKey: ['zenpet-finished-goods'],
		queryFn: async () => (await api.get('/zenpet/finished-goods')).data
	});
	const fg = $derived($fgQuery?.data);

	// ======= Vista ZenPet: las 12 etapas EXACTAMENTE como las arma su sistema =======
	// (fórmulas de como-agrupamos-los-datos.md, 08/09/2026 — misma fuente: estos 2 endpoints)
	const sum = (rows: any[], f: (r: any) => number) =>
		(rows || []).reduce((a, r) => a + (Number(f(r)) || 0), 0);
	// detalle por etapa (sección 8 del md): SKU = sufijo numérico del código de parte
	const skuOf = (part: string) => (part || '').match(/(\d{4})$/)?.[1] || part || '?';
	const CHECK_SKUS = ['5940', '5951'];
	let zpOpen: Record<string, boolean> = $state({});
	let zpFams: Record<string, boolean> = $state({});
	let zpMode: Record<string, string> = $state({});
	function zpByProduct(rows: any[], cols: any) {
		const map = new Map<string, any>();
		for (const r of rows) {
			const sku = skuOf(r.part);
			const g = map.get(sku) ?? { sku, description: r.description, c1: 0, c2: 0, c3: 0, ordenes: 0 };
			g.c1 += Number(cols.c1(r)) || 0;
			g.c2 += cols.c2 ? Number(cols.c2(r)) || 0 : 0;
			g.c3 += Number(cols.c3(r)) || 0;
			g.ordenes += 1;
			map.set(sku, g);
		}
		return [...map.values()].sort((a, b) => a.sku.localeCompare(b.sku));
	}
	const zpView = $derived.by(() => {
		if (!e) return [];
		const prod = e.produccion || [];
		const enPoder = prod.filter((r: any) => (r.enPoder || 0) > 0);
		const faltCols = (done: (r: any) => number) => ({
			l1: 'ORDERED', l2: 'DONE', l3: 'REMAINING',
			c1: (r: any) => r.amount, c2: done, c3: (r: any) => Math.max((r.amount || 0) - (done(r) || 0), 0)
		});
		return [
			{ key: 'corteTela', rows: e.corteTela || [], cols: faltCols((r: any) => r.capturado), en: 'Fabric cutting', es: 'Corte de tela', o: (e.corteTela || []).length, u: sum(e.corteTela, (r) => r.faltante), f: 'órdenes del bloque corteTela · Σ faltante' },
			{ key: 'serigrafia', rows: e.serigrafia || [], cols: faltCols((r: any) => r.capturado), en: 'Screen printing', es: 'Serigrafía', o: (e.serigrafia || []).length, u: sum(e.serigrafia, (r) => r.faltante), f: 'bloque serigrafia · Σ faltante' },
			{ key: 'cortePvc', rows: e.cortePvc || [], cols: faltCols((r: any) => r.producido), en: 'PVC film cutting', es: 'Corte de PVC', o: (e.cortePvc || []).length, u: sum(e.cortePvc, (r) => r.faltante), f: 'bloque cortePvc · Σ faltante' },
			{ key: 'corteComponentes', rows: e.corteComponentes || [], cols: faltCols((r: any) => r.capturado), en: 'Component cutting', es: 'Corte de componentes', o: (e.corteComponentes || []).length, u: sum(e.corteComponentes, (r) => r.faltante), f: 'bloque corteComponentes · Σ faltante' },
			{ key: 'cortePet', rows: e.cortePet || [], cols: faltCols((r: any) => r.liberado), en: 'PET cutting', es: 'Corte de PET', o: (e.cortePet || []).length, u: sum(e.cortePet, (r) => Math.max((r.amount || 0) - (r.liberado || 0), 0)), f: 'bloque cortePet · Σ max(cantidad − liberado, 0) — UNIDAD: CORTES, no conos (falta la regla cortes-por-cono de Juan). Cortes en existencia (petInventario): ' + (e.petInventario || []).map((p: any) => p.code.slice(-4) + '=' + p.units).join(' · ') },
			{ key: 'kits', rows: e.kits || [], cols: { l1: 'ORDERED', l2: '', l3: 'STAGED', c1: (r: any) => r.amount, c2: null, c3: (r: any) => r.amount }, en: 'Staged, not started', es: 'Kits surtidos sin arrancar', o: (e.kits || []).length, u: sum(e.kits, (r) => r.amount), f: 'bloque kits · Σ cantidad' },
			{ key: 'produccion', rows: prod, withCol: true, cols: faltCols((r: any) => (r.producido || 0) + (r.aceptado || 0)), en: 'Assembly', es: 'Ensamble', o: prod.length, u: sum(prod, (r) => Math.max((r.amount || 0) - (r.producido || 0) - (r.aceptado || 0), 0)), f: 'bloque produccion · Σ max(cantidad − producido − aceptado, 0) — SÍ resta lo que el contratista ya regresó. Regla Juan 11/09: solo jobs Z9 + Z0 sin Z9 (E-Collar, ZenDog); los Z4 (corte PET) y los Z0 con Z9 (empaque) ya NO entran aquí' },
			{ key: 'enPoder', rows: enPoder, cols: { l1: 'SURTIDO', l2: 'ACEPTADO', l3: 'EN PODER', c1: (r: any) => r.surtido, c2: (r: any) => r.aceptado, c3: (r: any) => r.enPoder }, en: 'With outside contractors', es: 'En poder de contratistas', o: enPoder.length, u: sum(enPoder, (r) => r.enPoder), f: 'mismo bloque produccion, filas con enPoder > 0 · Σ enPoder — NO es etapa aparte: se traslapa con Ensamble' },
			{ key: 'empaqueZ0', rows: e.empaqueZ0 || [], cols: faltCols((r: any) => r.empacado), en: 'Packing (Z0 jobs)', es: 'Empaque por job (Z0 con Z9)', o: (e.empaqueZ0 || []).length, u: sum(e.empaqueZ0, (r) => r.faltante), f: 'NUEVO 11/09 (Juan: "Z0 lo compone su empaque y su Z9") · jobs Z0 cuyo producto tiene Z9 · Σ (cantidad − liberado). Antes estos jobs se sumaban en Ensamble junto con su job Z9 → el mismo collar contaba dos veces' },
			{ key: 'calidadLib', rows: e.calidadLib || [], cols: { l1: 'ON HAND', l2: 'PENDING Z0', l3: 'NOT PACKED', c1: (r: any) => r.existencia ?? r.liberado, c2: (r: any) => r.pendienteZ0 ?? 0, c3: (r: any) => r.sinPallet }, en: 'Quality-approved, not packed', es: 'Subensambles liberados sin empacar', o: (e.calidadLib || []).length, u: sum(e.calidadLib, (r) => r.sinPallet), f: 'regla Juan 11/09 v3: SOLO códigos Z9 (los cortes de PET Z4-352x salen: son componente, bloque petInventario) · sinPallet = existencia − Z9 pendiente de jobs Z0 ya liberados (Juan hoy lo descuenta a mano; si el código da 0 es que su ajuste manual ya lo cubrió)' },
			{ key: 'fg', en: 'Finished goods at factory', es: 'Producto terminado en fábrica', o: fg?.skus ?? '…', u: fg?.units ?? '…', f: '/zenpet/finished-goods · inventario Z0 (31 SKUs, ceros incluidos — un cero dice \"se acabó\")' },
			{ key: 'empaque', en: 'Palletized, ready to ship', es: 'En pallet, listo', o: (e.empaque || []).length, u: sum(e.empaque, (r) => r.units), f: 'bloque empaque (pallets sin embarque) · Σ piezas' },
			{ key: 'shipped', en: 'Shipped (last 60 days)', es: 'Embarcado (últimos 60 días)', o: e.enRoute?.pls ?? 0, u: e.enRoute?.units ?? 0, f: 'enRoute · packing lists exportadas — VENTANA MÓVIL: al cumplir 60 días un embarque se sale solo del número. Su pantalla NO tiene desglose de esta etapa' }
		];
	});
	const zpCards = $derived.by(() => {
		if (!e) return null;
		const v = Object.fromEntries(zpView.map((r) => [r.en, r]));
		return {
			finished: { n: fg?.units ?? '…', sub: `${(fg?.items || []).filter((m: any) => Number(m.units) > 0).length} SKUs con existencia` },
			pallets: { n: v['Palletized, ready to ship']?.u ?? 0, sub: `${v['Palletized, ready to ship']?.o ?? 0} pallets` },
			inprod: { n: (Number(v['Assembly']?.u) || 0) + (Number(v['Staged, not started']?.u) || 0), sub: `${v['Assembly']?.o ?? 0} órdenes abiertas (ensamble + kits)` },
			contractors: { n: v['With outside contractors']?.u ?? 0, sub: `${v['With outside contractors']?.o ?? 0} órdenes` }
		};
	});

	// Reglas de Juan (Observaciones 18-Ago): columnas por etapa
	const etapaCols: Record<string, { k: string; label: string }[]> = {
		corteTela: [
			{ k: 'capturado', label: 'Cortado' },
			{ k: 'faltante', label: 'Faltante' }
		],
		serigrafia: [
			{ k: 'capturado', label: 'Impreso' },
			{ k: 'faltante', label: 'Faltante' }
		],
		cortePvc: [
			{ k: 'producido', label: 'Producido' },
			{ k: 'faltante', label: 'Faltante' }
		],
		corteComponentes: [
			{ k: 'capturado', label: 'Cortado' },
			{ k: 'faltante', label: 'Faltante' }
		],
		cortePet: [
			{ k: 'surtido', label: 'Surtido (pase)' },
			{ k: 'liberado', label: 'Liberado' }
		],
		kits: [],
		produccion: [
			{ k: 'producido', label: 'Producido planta' },
			{ k: 'surtido', label: 'Surtido contratista' },
			{ k: 'aceptado', label: 'Entregado aceptado' },
			{ k: 'enPoder', label: 'En poder' },
			{ k: 'contratistas', label: 'Contratista(s)' }
		],
		calidadLib: [
			{ k: 'liberado', label: 'Liberado' },
			{ k: 'enPallet', label: 'En pallet' },
			{ k: 'sinPallet', label: 'Sin pallet' }
		]
	};
	const etapasDef = [
		{ key: 'corteTela', num: '2', title: 'Corte de tela', rule: 'Órdenes con requisición de telas (ZEN-Z1) que aún no capturan el total del corte.' },
		{ key: 'serigrafia', num: '3', title: 'Serigrafía', rule: 'Órdenes activadas en corte que traen operación de serigrafía y no han capturado su total.' },
		{ key: 'cortePvc', num: '4/8', title: 'Corte de PVC / Bladder producción', rule: 'Órdenes con requisición de film PVC (ZEN-Z4-2115/2116); cierran al producirse el bladder. Control por inventario de bladders.' },
		{ key: 'corteComponentes', num: '5', title: 'Corte de componentes', rule: 'Órdenes con requisición de componentes (ZEN-Z3 / ZEN-Z5) que no han capturado cortes varios completos.' },
		{ key: 'cortePet', num: '6', title: 'Corte de PET (externo)', rule: 'Órdenes con pase de salida generado; cierran cuando calidad libera el producto.' },
		{ key: 'kits', num: '7', title: 'Kits listos para producir', rule: 'Fases de corte, serigrafía y cortes varios completas (las que apliquen), sin pase de salida y sin producción iniciada.' },
		{ key: 'produccion', num: '9/10', title: 'Producción (interna y contratistas)', rule: 'Toda la producción en un solo apartado: lo capturado en planta y lo surtido a contratistas (en poder = surtido − entregado aceptado).' },
		{ key: 'calidadLib', num: '11', title: 'Acabado y calidad', rule: 'Inventario de subproductos Z9 en existencia esperando empaque (al empacarse se convierten en Z0; los bladders tienen su bloque). Fuente: inventario, no órdenes — regla Juan 08/09 v2.' }
	];
	// Punto 6 (obs 26-Ago): sintetizar por número de parte — totales para el cliente
	let showDetalle: Record<string, boolean> = $state({});
	let openFams: Record<string, boolean> = $state({});
	function groupByPart(key: string) {
		const rows = (e?.[key] as any[]) || [];
		const numCols = (etapaCols[key] || []).filter((c) => c.k !== 'contratistas');
		const map = new Map<string, any>();
		for (const r of rows) {
			const g = map.get(r.part) ?? {
				part: r.part,
				description: r.description,
				ordenes: 0,
				amount: 0,
				...Object.fromEntries(numCols.map((c) => [c.k, 0]))
			};
			g.ordenes += 1;
			g.amount += Number(r.amount || 0);
			for (const c of numCols) g[c.k] += Number(r[c.k] || 0);
			map.set(r.part, g);
		}
		return [...map.values()];
	}

	function etapaUnits(key: string): number {
		const rows = (e?.[key] as any[]) || [];
		const sumKey =
			key === 'produccion' ? 'enPoder'
			: key === 'calidadLib' ? 'sinPallet'
			: key === 'cortePet' ? 'surtido'
			: etapaCols[key]?.some((c) => c.k === 'faltante') ? 'faltante'
			: 'amount';
		return rows.reduce((a, r) => a + Number(r[sumKey] ?? r.amount ?? 0), 0);
	}

	// pestaña "Resumen 13 etapas" oculta desde 25/08; llamada apagada para no
	// pegarle a /zenpet/stages en cada carga (el endpoint sigue vivo hasta que
	// el sistema de ZenPet confirme su migración a /finished-goods)
	const stagesQuery = createQuery({
		queryKey: ['zenpet-stages'],
		queryFn: async () => (await api.get('/zenpet/stages')).data,
		enabled: false
	});
	const formulasQuery = createQuery({
		queryKey: ['zenpet-formulas'],
		queryFn: async () => (await api.get('/zenpet/formulas')).data
	});

	const s = $derived($stagesQuery?.data);
	const f = $derived($formulasQuery?.data);

	// ---- BOM viewer ----
	let selectedProduct = $state('');
	const productOptions = $derived(
		(f?.products || []).map((p: any, i: number) => ({
			name: `${p.line} — ${p.size}`,
			value: String(i)
		}))
	);
	const bomProduct = $derived(selectedProduct !== '' ? f?.products?.[Number(selectedProduct)] : null);

	// ---- stage model, grouped by floor zone ----
	interface StageRow {
		n: string;
		name: string;
		en: string;
		units: number | null;
		unitsNote: string;
		formula: string;
		status: 'ok' | 'validar' | 'proxy' | 'falta';
	}
	interface Zone {
		zone: string;
		desc: string;
		rows: StageRow[];
	}

	const rawTotalMaterials = $derived(
		(s?.rawByFamily || []).reduce((a: number, r: any) => a + r.materials, 0)
	);
	const cortePool = $derived((s?.pipeline?.at_corte || 0) + (s?.pipeline?.at_cortes_varios || 0));

	const zones: Zone[] = $derived([
		{
			zone: 'ALMACÉN',
			desc: 'Material comprado, todavía sin cortar',
			rows: [
				{
					n: '1',
					name: 'Materia prima recibida',
					en: 'Raw material received',
					units: rawTotalMaterials,
					unitsNote: 'materiales distintos con existencia',
					formula: 'Inventario ZENPET del ERP, familias Z1–Z8. Desglose por familia en la tabla de abajo.',
					status: 'ok'
				}
			]
		},
		{
			zone: 'CORTE',
			desc: 'Piezas cortadas que aún no avanzan al siguiente proceso',
			rows: [
				{
					n: '2–6',
					name: 'Cortes y serigrafía',
					en: 'Fabric / screen print / PVC / components / PET',
					units: cortePool + (s?.pipeline?.at_serigrafia || 0),
					unitsNote: 'piezas en el pool de corte + serigrafía',
					formula:
						'ERP: corte + cortes varios + serigrafía capturados − lo que ya avanzó a producción. ZenPet los quiere separados en 5 etapas: la separación se hace por la familia del material que consume cada job según su BOM (Z1 = tela, Z4 = películas, Z2/Z3 = componentes). Serigrafía sí es proceso propio del ERP: ' +
						(s?.pipeline?.at_serigrafia ?? '…') +
						' pzs. Regla de atribución pendiente de validar con Juan.',
					status: 'validar'
				}
			]
		},
		{
			zone: 'PRODUCCIÓN',
			desc: 'Del kit armado a la pieza producida',
			rows: [
				{
					n: '7',
					name: 'Kits de costura',
					en: 'Full sewing kits',
					units: s?.kits?.units ?? null,
					unitsNote: `piezas en ${s?.kits?.jobs ?? '…'} jobs con material surtido, producción sin iniciar`,
					formula:
						'APROXIMACIÓN: jobs cuyo material ya fue surtido del almacén pero que no reportan producción. La receta de cada kit está en la pestaña Fórmulas. Validar con Juan si esto refleja los kits reales en piso.',
					status: 'proxy'
				},
				{
					n: '8',
					name: 'Bladder de producción',
					en: 'Production bladder',
					units: null,
					unitsNote: 'nadie captura este conteo hoy',
					formula:
						'Único dato que no existe en ningún sistema. Composición conocida (CST-Tracker): 1 bladder = película PVC (kg) + 1 válvula ZEN-Z5-2102. Juan decide: ¿se cuenta en piso, se estima por consumo de válvulas, o se agrupa en producción?',
					status: 'falta'
				},
				{
					n: '9',
					name: 'Línea de producción — interna',
					en: 'Production line — in-house',
					units: s?.pipeline?.at_produccion ?? null,
					unitsNote: 'piezas producidas que Calidad aún no libera',
					formula: 'ERP: producción capturada − calidad liberada, por job (lado interno).',
					status: 'ok'
				},
				{
					n: '10',
					name: 'Línea de producción — contratistas',
					en: 'Production line — contractors',
					units: s?.pipeline?.at_contractors ?? null,
					unitsNote: 'piezas asignadas a contratistas, sin entregar',
					formula: 'ERP: cantidad asignada a contratistas − entregada por contratistas, por job.',
					status: 'ok'
				}
			]
		},
		{
			zone: 'CALIDAD Y EMPAQUE',
			desc: 'De la liberación al pallet',
			rows: [
				{
					n: '11',
					name: 'Acabado y Calidad',
					en: 'Finishing & QC',
					units: s?.pipeline?.liberado_sin_pallet ?? null,
					unitsNote: 'piezas liberadas por Calidad, sin paletizar',
					formula:
						'ERP: liberado por Calidad − paletizado, por job. Ojo: hoy incluye liberaciones históricas de antes del módulo de pallets; se normaliza cuando el piso paletice todo.',
					status: 'ok'
				},
				{
					n: '12',
					name: 'Empaque',
					en: 'Packaging',
					units: s?.packaging?.units ?? null,
					unitsNote: `piezas en ${s?.packaging?.pallets ?? '…'} pallets sin exportación`,
					formula: 'ERP: pallets registrados (Calidad → Pallets) que aún no entran a una orden de exportación.',
					status: 'ok'
				},
				{
					n: '13',
					name: 'Producto terminado listo',
					en: 'Finished goods ready to ship',
					units: s ? Number(s.finished?.units || 0) + Number(s.inExport?.units || 0) : null,
					unitsNote: `${s?.finished?.units ?? '…'} pzs en stock Z0 + ${s?.inExport?.units ?? '…'} pzs en órdenes de exportación`,
					formula: 'ERP: existencia de producto terminado (códigos ZEN-Z0) + piezas de pallets ya asignados a una orden de exportación.',
					status: 'ok'
				}
			]
		},
		{
			zone: 'EMBARQUE',
			desc: 'Lo que ya salió de CST',
			rows: [
				{
					n: '→',
					name: 'En ruta a Carlsbad',
					en: 'En route',
					units: s?.enRoute?.units ?? null,
					unitsNote: `piezas en ${s?.enRoute?.pls ?? '…'} packing lists de los últimos 60 días`,
					formula: 'ERP: Packing Lists guardados (exportados). La llegada a Carlsbad la confirma ZenPet de su lado.',
					status: 'ok'
				}
			]
		}
	]);

	const statusInfo: Record<string, { text: string; color: any; means: string }> = {
		ok: { text: 'EN VIVO', color: 'green', means: 'el número sale del ERP ahora mismo' },
		validar: { text: 'VALIDAR REGLA', color: 'yellow', means: 'el dato existe; falta que Juan confirme cómo se clasifica' },
		proxy: { text: 'APROXIMACIÓN', color: 'orange', means: 'calculado indirectamente; validar contra el piso' },
		falta: { text: 'SIN DATO', color: 'red', means: 'nadie captura esto hoy — requiere decisión' }
	};

	const familyColor: Record<string, string> = {
		Z0: 'bg-emerald-100 text-emerald-800',
		Z1: 'bg-amber-100 text-amber-800',
		Z2: 'bg-orange-100 text-orange-800',
		Z3: 'bg-sky-100 text-sky-800',
		Z4: 'bg-violet-100 text-violet-800',
		Z5: 'bg-slate-200 text-slate-800',
		Z6: 'bg-yellow-100 text-yellow-800',
		Z7: 'bg-lime-100 text-lime-800',
		Z8: 'bg-pink-100 text-pink-800'
	};
</script>

<div class="mx-auto flex max-w-7xl flex-col gap-4 p-4">
	<div>
		<h1 class="text-xl font-bold">ZenPet Datos</h1>
		<p class="text-sm text-muted-foreground">
			Página de verificación: qué necesita ver ZenPet, qué tenemos hoy en el ERP, y de dónde sale cada
			número — para que Juan confirme las fuentes antes de conectar los sistemas.
		</p>
	</div>

	<Tabs value="ordenes">
		<TabsList class="grid w-full grid-cols-3">
			<TabsTrigger value="ordenes">Órdenes por etapa</TabsTrigger>
			<TabsTrigger value="vistazenpet">Vista ZenPet</TabsTrigger>
			<!-- oculto por ahora (Hector 25/08): <TabsTrigger value="etapas">Resumen 13 etapas</TabsTrigger> -->
			<TabsTrigger value="formulas">Fórmulas de kits</TabsTrigger>
		</TabsList>

		<!-- ============ TAB 0: ÓRDENES POR ETAPA (reglas de Juan 18-Ago) ============ -->
		<TabsContent value="ordenes" class="mt-4">
			<div class="flex flex-col gap-5">
				<div class="rounded-md border p-3">
					<div class="mb-1 flex items-center justify-between">
						<h3 class="font-semibold">1. Materia prima recibida (existencia ZENPET por familia)</h3>
						{#if e?.enRoute}
							<Badge color="blue">En ruta (60 días): {e.enRoute.units} pzs en {e.enRoute.pls} PL</Badge>
						{/if}
					</div>
					<Table divClass="h-auto overflow-visible">
						<TableHeader>
							<TableHead>Familia</TableHead>
							<TableHead>Materiales</TableHead>
							<TableHead>Existencia</TableHead>
							<TableHead>Medida</TableHead>
						</TableHeader>
						<TableBody>
							{#each e?.rawByFamily || [] as r}
								<TableRow
									class="cursor-pointer"
									onclick={() => (openFams[r.family] = !openFams[r.family])}
								>
									<TableCell class="font-semibold"
										>{openFams[r.family] ? '▾' : '▸'} {r.family}</TableCell
									>
									<TableCell>{r.materials}</TableCell>
									<TableCell>{r.units}</TableCell>
									<TableCell>{r.unit}</TableCell>
								</TableRow>
								{#if openFams[r.family]}
									{#each rawMats.filter((m: any) => m.family === r.family) as m}
										<TableRow class="bg-muted/40">
											<TableCell class="pl-8 text-xs">{m.code}</TableCell>
											<TableCell class="max-w-72 truncate text-xs" title={m.description}
												>{m.description}</TableCell
											>
											<TableCell class="text-xs">{m.units}</TableCell>
											<TableCell class="text-xs">{m.measurement}</TableCell>
										</TableRow>
									{/each}
								{/if}
							{/each}
						</TableBody>
					</Table>
				</div>

				{#each etapasDef as et}
					<div class="rounded-md border p-3">
						<div class="mb-1 flex flex-wrap items-center justify-between gap-2">
							<h3 class="font-semibold">{et.num}. {et.title}</h3>
							<div class="flex gap-2">
								<Badge color="gray">{(e?.[et.key] || []).length} órdenes</Badge>
								<Badge color="green">{etapaUnits(et.key)} pzs</Badge>
							</div>
						</div>
						<p class="mb-2 text-xs text-muted-foreground">{et.rule}</p>
						{#if (e?.[et.key] || []).length}
							<Table divClass="h-auto max-h-72 overflow-auto">
								<TableHeader>
									<TableHead>Parte</TableHead>
									<TableHead class="min-w-44">Descripción</TableHead>
									<TableHead>Órdenes</TableHead>
									<TableHead>Cantidad total</TableHead>
									{#each (etapaCols[et.key] || []).filter((c) => c.k !== 'contratistas') as c}
										<TableHead>{c.label}</TableHead>
									{/each}
								</TableHeader>
								<TableBody>
									{#each groupByPart(et.key) as g}
										<TableRow>
											<TableCell class="font-semibold">{g.part}</TableCell>
											<TableCell class="max-w-56 truncate" title={g.description}>{g.description}</TableCell>
											<TableCell>{g.ordenes}</TableCell>
											<TableCell>{g.amount}</TableCell>
											{#each (etapaCols[et.key] || []).filter((c) => c.k !== 'contratistas') as c}
												<TableCell>{g[c.k]}</TableCell>
											{/each}
										</TableRow>
									{/each}
								</TableBody>
							</Table>
							<button
								class="mt-1 text-xs text-muted-foreground underline"
								onclick={() => (showDetalle[et.key] = !showDetalle[et.key])}
							>
								{showDetalle[et.key] ? 'Ocultar detalle por orden' : 'Ver detalle por orden'}
							</button>
							{#if showDetalle[et.key]}
								<Table divClass="mt-1 h-auto max-h-72 overflow-auto">
									<TableHeader>
										<TableHead>Job</TableHead>
										<TableHead>Programación</TableHead>
										<TableHead>Parte</TableHead>
										<TableHead class="min-w-44">Descripción</TableHead>
										<TableHead>Cantidad</TableHead>
										{#each etapaCols[et.key] || [] as c}
											<TableHead>{c.label}</TableHead>
										{/each}
									</TableHeader>
									<TableBody>
										{#each e?.[et.key] || [] as row}
											<TableRow>
												<TableCell class="font-semibold">{row.ref}</TableCell>
												<TableCell>{row.programation || ''}</TableCell>
												<TableCell>{row.part}</TableCell>
												<TableCell class="max-w-56 truncate" title={row.description}>{row.description}</TableCell>
												<TableCell>{row.amount}</TableCell>
												{#each etapaCols[et.key] || [] as c}
													<TableCell>{row[c.k] ?? ''}</TableCell>
												{/each}
											</TableRow>
										{/each}
									</TableBody>
								</Table>
							{/if}
						{:else}
							<p class="text-sm text-muted-foreground">Sin órdenes activas en esta etapa.</p>
						{/if}
						{#if et.key === 'cortePvc' && e?.bladderInventory?.length}
							<p class="mb-1 mt-3 text-xs font-semibold">Inventario de bladders (control de la etapa):</p>
							<div class="flex flex-wrap gap-2">
								{#each e.bladderInventory as b}
									<Badge color="blue">{b.code} · {b.description}: {b.units} {b.measurement}</Badge>
								{/each}
							</div>
						{/if}
					</div>
				{/each}

				<div class="rounded-md border p-3">
					<div class="mb-1 flex items-center justify-between">
						<h3 class="font-semibold">12/13. Empaque · Producto terminado listo</h3>
						<div class="flex gap-2">
							<Badge color="gray">{(e?.empaque || []).length} pallets</Badge>
							<Badge color="green">
								{(e?.empaque || []).reduce((a: number, r: any) => a + Number(r.units || 0), 0)} pzs
							</Badge>
						</div>
					</div>
					<p class="mb-2 text-xs text-muted-foreground">
						Producto liberado y asignado a pallet, listo para exportar (sale al generar su packing list).
					</p>
					{#if (e?.empaque || []).length}
						<Table divClass="h-auto max-h-72 overflow-auto">
							<TableHeader>
								<TableHead>Pallet</TableHead>
								<TableHead>Job(s)</TableHead>
								<TableHead>Piezas</TableHead>
								<TableHead>Cajas</TableHead>
								<TableHead>Estado</TableHead>
							</TableHeader>
							<TableBody>
								{#each e?.empaque || [] as pl}
									<TableRow>
										<TableCell class="font-semibold">{pl.folio}</TableCell>
										<TableCell class="max-w-56 truncate" title={pl.jobs}>{pl.jobs}</TableCell>
										<TableCell>{pl.units}</TableCell>
										<TableCell>{pl.boxes}</TableCell>
										<TableCell>
											<Badge color={pl.enOrden ? 'green' : 'yellow'}>
												{pl.enOrden ? 'En orden de exportación' : 'Pendiente'}
											</Badge>
										</TableCell>
									</TableRow>
								{/each}
							</TableBody>
						</Table>
					{:else}
						<p class="text-sm text-muted-foreground">Sin pallets pendientes de exportar.</p>
					{/if}
				</div>
			</div>
		</TabsContent>

		<!-- ============ TAB 1: ETAPAS ============ -->
		<TabsContent value="etapas" class="mt-4"><div class="flex flex-col gap-4">
			<div class="rounded-md border bg-muted/30 p-3">
				<p class="text-xs text-muted-foreground">
					<b class="text-foreground">Cómo leer esta pestaña:</b> ZenPet quiere ver su material en 13 etapas.
					Aquí están agrupadas por zona del piso, con las piezas de hoy ({s?.pipeline?.jobs_activos ?? '…'}
					jobs activos de ZENPET, datos en vivo del ERP) y la fórmula de cada número.
				</p>
				<div class="mt-2 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
					{#each Object.values(statusInfo) as st}
						<div class="flex items-center gap-1.5">
							<Badge color={st.color}>{st.text}</Badge>
							<span class="leading-tight">{st.means}</span>
						</div>
					{/each}
				</div>
			</div>

			<div class="overflow-hidden rounded-md border">
				<table class="w-full border-collapse text-sm">
					<thead>
						<tr class="border-b bg-muted/50 text-left text-xs text-muted-foreground">
							<th class="w-12 px-3 py-2 font-medium">#</th>
							<th class="w-60 px-2 py-2 font-medium">Etapa</th>
							<th class="w-40 px-2 py-2 text-right font-medium">Piezas hoy</th>
							<th class="w-32 px-2 py-2 text-center font-medium">Estado</th>
							<th class="px-3 py-2 font-medium">De dónde sale el número</th>
						</tr>
					</thead>
					<tbody>
						{#each zones as zone}
							<tr class="border-b bg-muted/40">
								<td colspan="5" class="px-3 py-1.5">
									<span class="text-xs font-bold tracking-widest">{zone.zone}</span>
									<span class="ml-3 text-xs text-muted-foreground">{zone.desc}</span>
								</td>
							</tr>
							{#each zone.rows as row}
								<tr class="border-b last:border-b-0">
									<td class="px-3 py-2.5 align-top font-mono text-xs text-muted-foreground">{row.n}</td>
									<td class="px-2 py-2.5 align-top">
										<p class="font-semibold leading-snug">{row.name}</p>
										<p class="text-xs italic leading-snug text-muted-foreground">{row.en}</p>
									</td>
									<td class="px-2 py-2.5 text-right align-top">
										<p class="text-lg font-bold leading-tight">
											{row.units === null ? '—' : row.units.toLocaleString()}
										</p>
										<p class="text-[11px] leading-snug text-muted-foreground">{row.unitsNote}</p>
									</td>
									<td class="whitespace-nowrap px-2 py-2.5 text-center align-top">
										<Badge color={statusInfo[row.status].color}>{statusInfo[row.status].text}</Badge>
									</td>
									<td class="px-3 py-2.5 align-top text-xs leading-relaxed text-muted-foreground">{row.formula}</td>
								</tr>
							{/each}
						{/each}
					</tbody>
				</table>
			</div>

			<!-- etapa 1 detalle -->
			<div class="rounded-md border">
				<div class="border-b bg-muted/50 px-3 py-1.5">
					<p class="text-sm font-bold">Materia prima por familia de código</p>
					<p class="text-xs text-muted-foreground">
						Los códigos ZEN-Z# ya dicen qué tipo de material es — esta clasificación es la base para separar
						las etapas de corte.
					</p>
				</div>
				<Table divClass="h-auto overflow-visible">
					<TableHeader>
						<TableHead>Familia</TableHead>
						<TableHead>Tipo de material</TableHead>
						<TableHead class="text-right">Materiales distintos</TableHead>
						<TableHead class="text-right">Existencia total</TableHead>
					</TableHeader>
					<TableBody>
						{#each s?.rawByFamily || [] as fam}
							<TableRow>
								<TableCell>
									<span class="rounded px-1.5 py-0.5 font-mono text-xs font-semibold {familyColor[fam.family] || ''}">ZEN-{fam.family}</span>
								</TableCell>
								<TableCell>{f?.rules?.families?.[fam.family] || ''}</TableCell>
								<TableCell class="text-right">{fam.materials}</TableCell>
								<TableCell class="text-right">{Number(fam.units).toLocaleString()} {fam.unit || ''}</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			</div>
		</div></TabsContent>

		<!-- ============ TAB 2: FORMULAS ============ -->
		<!-- ============ TAB: VISTA ZENPET (espejo exacto de su dashboard) ============ -->
		<TabsContent value="vistazenpet" class="mt-4">
			<div class="flex flex-col gap-4">
				<div class="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm">
					<b>Esta pestaña muestra los números EXACTAMENTE como los ve ZenPet en su sistema</b>, con la
					fórmula de cada renglón. Su dashboard se alimenta de los mismos 2 endpoints que esta página
					(<code>/zenpet/etapas</code> y <code>/zenpet/finished-goods</code>) — si un número de aquí no
					cuadra con su pantalla, casi siempre es la <b>hora</b>: ellos ven una foto congelada que se
					toma <b>miércoles 12:00 y viernes 17:00</b> (hora Tijuana); esta pestaña es en vivo.
				</div>

				{#if zpCards}
					<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
						<div class="rounded-md border p-3">
							<p class="text-xs text-muted-foreground">Finished at factory</p>
							<p class="text-2xl font-bold">{zpCards.finished.n}</p>
							<p class="text-xs text-muted-foreground">{zpCards.finished.sub}</p>
						</div>
						<div class="rounded-md border p-3">
							<p class="text-xs text-muted-foreground">On pallets</p>
							<p class="text-2xl font-bold">{zpCards.pallets.n}</p>
							<p class="text-xs text-muted-foreground">{zpCards.pallets.sub}</p>
						</div>
						<div class="rounded-md border p-3">
							<p class="text-xs text-muted-foreground">In production</p>
							<p class="text-2xl font-bold">{zpCards.inprod.n}</p>
							<p class="text-xs text-muted-foreground">{zpCards.inprod.sub}</p>
						</div>
						<div class="rounded-md border p-3">
							<p class="text-xs text-muted-foreground">With contractors</p>
							<p class="text-2xl font-bold">{zpCards.contractors.n}</p>
							<p class="text-xs text-muted-foreground">{zpCards.contractors.sub}</p>
						</div>
					</div>
				{/if}

				<div class="rounded-md border p-3">
					<h3 class="mb-1 font-semibold">Materia prima (arriba del flujo — próximamente en su pantalla)</h3>
					<p class="mb-1 text-xs text-muted-foreground">
						bloque rawByFamily · igual que la pestaña "Órdenes por etapa": familias con su unidad —
						<b>nunca se suman entre sí</b> (Z1/Z3 son yardas, el resto piezas). Pícale a una familia
						para ver sus materiales.
					</p>
					<Table divClass="h-auto overflow-visible">
						<TableHeader>
							<TableHead>Familia</TableHead>
							<TableHead class="text-right">Materiales</TableHead>
							<TableHead class="text-right">Existencia</TableHead>
							<TableHead>Medida</TableHead>
						</TableHeader>
						<TableBody>
							{#each e?.rawByFamily || [] as r}
								<TableRow class="cursor-pointer" onclick={() => (zpFams[r.family] = !zpFams[r.family])}>
									<TableCell class="font-semibold">{zpFams[r.family] ? '▾' : '▸'} {r.family}</TableCell>
									<TableCell class="text-right">{r.materials}</TableCell>
									<TableCell class="text-right font-semibold">{r.units}</TableCell>
									<TableCell>{r.unit}</TableCell>
								</TableRow>
								{#if zpFams[r.family]}
									{#each rawMats.filter((m: any) => m.family === r.family) as m}
										<TableRow class="bg-muted/40">
											<TableCell class="pl-8 text-xs">{m.code}</TableCell>
											<TableCell class="max-w-72 truncate text-xs" title={m.description} colspan={1}
												>{m.description}</TableCell
											>
											<TableCell class="text-right text-xs">{m.units}</TableCell>
											<TableCell class="text-xs">{m.measurement}</TableCell>
										</TableRow>
									{/each}
								{/if}
							{/each}
						</TableBody>
					</Table>
				</div>

				<div class="rounded-md border p-3">
					<h3 class="mb-1 font-semibold">Las 12 etapas de su pantalla — con su fórmula</h3>
					<Table divClass="h-auto overflow-visible">
						<TableHeader>
							<TableHead>Etiqueta en ZenPet</TableHead>
							<TableHead>Equivalente</TableHead>
							<TableHead class="text-right">Órdenes</TableHead>
							<TableHead class="text-right">Unidades</TableHead>
							<TableHead>Fórmula (del feed del ERP)</TableHead>
						</TableHeader>
						<TableBody>
							{#each zpView as r}
								<TableRow
									class="cursor-pointer"
									onclick={() => (zpOpen[r.key] = !zpOpen[r.key])}
								>
									<TableCell class="font-medium">{zpOpen[r.key] ? '▾' : '▸'} {r.en}</TableCell>
									<TableCell>{r.es}</TableCell>
									<TableCell class="text-right">{r.o}</TableCell>
									<TableCell class="text-right font-semibold">{r.u}</TableCell>
									<TableCell class="max-w-md text-xs text-muted-foreground">{r.f}</TableCell>
								</TableRow>
								{#if zpOpen[r.key]}
									<TableRow>
										<TableCell colspan={5} class="bg-muted/30 p-3">
											{#if r.rows}
												<!-- etapas de trabajo pendiente: By product / By work order -->
												<div class="mb-2 flex gap-2 text-xs">
													<button
														class="rounded border px-2 py-0.5 {(zpMode[r.key] ?? 'product') === 'product' ? 'bg-foreground text-background' : ''}"
														onclick={() => (zpMode[r.key] = 'product')}>By product</button
													>
													<button
														class="rounded border px-2 py-0.5 {zpMode[r.key] === 'order' ? 'bg-foreground text-background' : ''}"
														onclick={() => (zpMode[r.key] = 'order')}>By work order</button
													>
													<span class="self-center text-muted-foreground">
														la última columna siempre suma el total del renglón — es la primera comprobación
													</span>
												</div>
												{#if (zpMode[r.key] ?? 'product') === 'product'}
													<table class="w-full text-xs">
														<thead><tr class="border-b text-left">
															<th class="py-1">SKU</th><th>Producto (descripción ERP — ZenPet muestra su catálogo)</th>
															<th class="text-right">{r.cols.l1}</th>
															{#if r.cols.c2}<th class="text-right">{r.cols.l2}</th>{/if}
															<th class="text-right">{r.cols.l3}</th><th class="text-right">Órdenes</th>
														</tr></thead>
														<tbody>
															{#each zpByProduct(r.rows, r.cols) as g}
																<tr class="border-b border-dashed">
																	<td class="py-1 font-mono">{g.sku}
																		{#if CHECK_SKUS.includes(g.sku)}<span class="ml-1 rounded bg-amber-200 px-1 text-[10px] font-bold">CHECK</span>{/if}
																	</td>
																	<td>{g.description}</td>
																	<td class="text-right">{g.c1}</td>
																	{#if r.cols.c2}<td class="text-right">{g.c2}</td>{/if}
																	<td class="text-right font-semibold">{g.c3}</td>
																	<td class="text-right">{g.ordenes}</td>
																</tr>
															{/each}
														</tbody>
													</table>
													{#if zpByProduct(r.rows, r.cols).some((g) => CHECK_SKUS.includes(g.sku))}
														<p class="mt-1 rounded bg-amber-100 p-1.5 text-[11px]">
															<b>CHECK:</b> los SKUs 5940 y 5951 tienen descripción "E-COLLAR" en el job, pero el
															catálogo y el maestro de materiales dicen Tick Tornado / Hock Wrap — ZenPet los muestra
															con el nombre del catálogo hasta que se corrija aquí.
														</p>
													{/if}
												{:else}
													<table class="w-full text-xs">
														<thead><tr class="border-b text-left">
															<th class="py-1">ORDER</th><th>Producto</th><th>PROGRAM</th>
															{#if r.withCol}<th>WITH</th>{/if}
															<th class="text-right">QTY ({r.cols.l3})</th>
														</tr></thead>
														<tbody>
															{#each r.rows as row}
																<tr class="border-b border-dashed">
																	<td class="py-1">{row.ref}</td>
																	<td>{row.description}</td>
																	<td>{row.programation}</td>
																	{#if r.withCol}<td>{(row.surtido || 0) > 0 ? 'Contractors' : 'In-house'}</td>{/if}
																	<td class="text-right font-semibold">{r.cols.c3(row)}</td>
																</tr>
															{/each}
														</tbody>
													</table>
												{/if}
											{:else if r.key === 'fg'}
												<table class="w-full text-xs">
													<thead><tr class="border-b text-left"><th class="py-1">SKU</th><th>Producto</th><th class="text-right">Unidades</th></tr></thead>
													<tbody>
														{#each fg?.items || [] as m}
															<tr class="border-b border-dashed {Number(m.units) === 0 ? 'text-muted-foreground' : ''}">
																<td class="py-1 font-mono">{skuOf(m.code)}</td>
																<td>{m.description}</td>
																<td class="text-right {Number(m.units) === 0 ? '' : 'font-semibold'}">{m.units}</td>
															</tr>
														{/each}
													</tbody>
												</table>
												<p class="mt-1 text-[11px] text-muted-foreground">Los ceros salen en gris pero SALEN — un cero dice "se acabó"; esconderlo hace parecer que el producto no existe.</p>
											{:else if r.key === 'empaque'}
												<table class="w-full text-xs">
													<thead><tr class="border-b text-left"><th class="py-1">Pallet</th><th>Órdenes que contiene</th><th class="text-right">Cajas</th><th class="text-right">Unidades</th></tr></thead>
													<tbody>
														{#each e?.empaque || [] as pal}
															<tr class="border-b border-dashed">
																<td class="py-1">{pal.folio}</td><td>{pal.jobs}</td>
																<td class="text-right">{pal.boxes}</td><td class="text-right font-semibold">{pal.units}</td>
															</tr>
														{/each}
													</tbody>
												</table>
											{:else}
												<p class="text-xs text-muted-foreground">
													Esta etapa <b>no tiene desglose en la pantalla de ZenPet</b>: muestra el total
													({e?.enRoute?.units ?? 0} pzs en {e?.enRoute?.pls ?? 0} packing lists) y avisa que la
													fábrica reporta el total pero todavía no los embarques detrás de él.
												</p>
											{/if}
										</TableCell>
									</TableRow>
								{/if}
							{/each}
						</TableBody>
					</Table>
				</div>

				<div class="rounded-md border p-3">
					<h3 class="mb-1 font-semibold">Bladder stock (siempre visible abajo en su pantalla)</h3>
					<p class="mb-1 text-xs text-muted-foreground">Sub-ensamble, no producto vendible — pero condiciona todos los collares inflables.</p>
					<table class="w-full text-xs">
						<thead><tr class="border-b text-left"><th class="py-1">Código</th><th>Talla</th><th class="text-right">Existencia</th></tr></thead>
						<tbody>
							{#each e?.bladderInventory || [] as b}
								<tr class="border-b border-dashed">
									<td class="py-1 font-mono">{b.code}</td><td>{b.description}</td>
									<td class="text-right font-semibold">{b.units}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<div class="rounded-md border p-3 text-sm">
					<h3 class="mb-1 font-semibold">Reglas para leerla (y para contestarle a ZenPet)</h3>
					<ul class="list-disc space-y-1 pl-5">
						<li><b>Las etapas NO se suman.</b> Cada una es una posición en el flujo, no una rebanada
						de un total. Desde el 08/09: "Quality-approved" rastrea SUBPRODUCTOS (ya no se duplica
						con Finished goods, que es el Z0); "En pallet" sí sigue dentro del paraguas de Finished
						goods hasta que el packing list descuenta el inventario.</li>
						<li><b>"En poder de contratistas" se traslapa con "Ensamble"</b>: es la columna enPoder
						del mismo bloque, mostrada como renglón propio.</li>
						<li><b>La materia prima nunca se suma entre familias</b> (Z1/Z3 son yardas, el resto piezas).</li>
						<li><b>Las columnas del detalle cambian por etapa</b>: en cortes la base es lo ordenado;
						en calidad la base es lo LIBERADO (liberado = en pallet + sin pallet) — usar lo ordenado
						ahí "inventa" piezas perdidas.</li>
						<li><b>Su pantalla agrupa por SKU</b> = el sufijo del código de parte (ZEN-Z0-5919 y
						ZEN-Z9-5919 son el MISMO producto 5919). Los nombres son de su catálogo, no la
						descripción del ERP.</li>
						<li><b>"Shipped" es ventana móvil de 60 días</b>: los embarques se salen solos del número
						al cumplir 60 días (el 22-sep se salen las 40,618 de PS-2858 — no es que se pierdan).</li>
						<li>Al comparar contra su pantalla, usar la <b>hora del snapshot</b> que dice "as of ..."
						arriba en su dashboard — no la hora actual.</li>
					</ul>
				</div>
			</div>
		</TabsContent>

		<TabsContent value="formulas" class="mt-4"><div class="flex flex-col gap-4">
			<div class="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
				<b class="text-foreground">Qué es esto:</b> la receta exacta de materiales de cada producto (el
				"kit"), con su costo — tomada del sistema CST-Tracker (extracto del {f?.extracted_at ?? '…'},
				solo lectura). Es la definición de la etapa 7 y la base del costeo. <b class="text-foreground">Para verificar:</b>
				elige un producto y confirma que las cantidades y costos siguen siendo los reales.
			</div>

			<div class="flex items-center gap-3">
				<Select items={productOptions} bind:value={selectedProduct} placeholder="Selecciona un producto ({f?.products?.length ?? '…'} disponibles)" class="w-80" />
			</div>

			{#if bomProduct}
				<div class="rounded-md border">
					<div class="grid grid-cols-2 gap-2 border-b bg-muted/50 px-3 py-2 text-sm sm:grid-cols-5">
						<div><p class="text-xs text-muted-foreground">Producto</p><p class="font-bold">{bomProduct.line} — {bomProduct.size}</p></div>
						<div><p class="text-xs text-muted-foreground">Costo de material</p><p class="font-bold">${bomProduct.material_cost.toFixed(4)} /pz</p></div>
						<div><p class="text-xs text-muted-foreground">Labor (venta a ZenPet)</p><p class="font-bold">${bomProduct.labor_usd.toFixed(2)}</p></div>
						<div><p class="text-xs text-muted-foreground">Subcontrato</p><p class="font-bold">${bomProduct.subcon_mxn.toFixed(2)} MXN</p></div>
						<div><p class="text-xs text-muted-foreground">Tiempo de producción</p><p class="font-bold">{bomProduct.minutes} min/pz</p></div>
					</div>
					<Table divClass="h-auto overflow-visible">
						<TableHeader>
							<TableHead>Material</TableHead>
							<TableHead>Tipo</TableHead>
							<TableHead>Descripción</TableHead>
							<TableHead class="text-right">Cantidad por pieza</TableHead>
							<TableHead class="text-right">Costo unitario</TableHead>
							<TableHead class="text-right">Costo por pieza</TableHead>
						</TableHeader>
						<TableBody>
							{#each bomProduct.bom as line}
								<TableRow>
									<TableCell class="font-mono text-xs">{line.pn}</TableCell>
									<TableCell>
										<span class="rounded px-1.5 py-0.5 text-[10px] font-semibold {familyColor[line.family] || ''}">{f?.rules?.families?.[line.family] || line.family}</span>
									</TableCell>
									<TableCell class="max-w-56 truncate text-xs">{line.desc}</TableCell>
									<TableCell class="text-right">{line.qty} <span class="text-xs text-muted-foreground">{line.unit}</span></TableCell>
									<TableCell class="text-right">${line.cost.toFixed(4)}</TableCell>
									<TableCell class="text-right font-semibold">${(line.qty * line.cost).toFixed(4)}</TableCell>
								</TableRow>
							{/each}
						</TableBody>
					</Table>
				</div>
			{:else}
				<div class="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
					Selecciona un producto arriba para ver su fórmula completa — por ejemplo <b>ZEN COLLAR — M</b>.
				</div>
			{/if}

			<div class="rounded-md border p-3">
				<p class="mb-1 text-sm font-bold">Reglas especiales (también de CST-Tracker)</p>
				<ul class="list-disc pl-5 text-xs text-muted-foreground">
					<li class="mb-1"><b class="text-foreground">Bladder:</b> {f?.rules?.bladder || '…'}</li>
					<li class="mb-1"><b class="text-foreground">PET, conversión corte → hoja:</b>
						{#each Object.entries(f?.rules?.pet_cut_to_sheet || {}) as [pn, factor]}
							<span class="mr-3 font-mono">{pn} = {factor}</span>
						{/each}
					</li>
					<li><b class="text-foreground">Qué cuenta como empaque:</b> {(f?.rules?.packaging_families || []).join(' · ')}</li>
				</ul>
			</div>
		</div></TabsContent>
	</Tabs>
</div>
