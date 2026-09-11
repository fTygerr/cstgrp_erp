<script lang="ts">
	import Label from '$lib/components/basic/Label.svelte';
	import {
		Dialog,
		DialogBody,
		DialogContent,
		DialogFooter,
		DialogHeader
	} from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import api from '$lib/utils/server';
	import { showSuccess } from '$lib/utils/showToast';
	import { refetch } from '$lib/utils/query';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import Select from '$lib/components/basic/Select.svelte';

	interface Props {
		show?: boolean;
		selectedPosition: any;
	}

	let { show = $bindable(false), selectedPosition = $bindable({}) }: Props = $props();
	let formData: any = $state({
		name: '',
		active: true,
		ivaRate: '0'
	});
	// IVA por tasa (Juan 11/09): sin IVA, 8% o 16%
	const ivaOptions = [
		{ value: '0', name: 'Sin IVA' },
		{ value: '8', name: 'IVA 8%' },
		{ value: '16', name: 'IVA 16%' }
	];

	function setFormData() {
		formData = { ...selectedPosition, ivaRate: String(selectedPosition.ivaRate ?? (selectedPosition.iva ? 16 : 0)) };
	}

	async function handleSubmit() {
		if (selectedPosition.id) {
			await api.put('/contractors-list', formData);
			showSuccess('contratista editado');
		} else {
			await api.post('/contractors-list', formData);
			showSuccess('contratista registrado');
		}
		refetch(['structure-contractors']);
		show = false;
	}

	$effect(() => {
		if (show) setFormData();
	});
</script>

<Dialog bind:open={show}>
	<DialogContent>
		<DialogHeader
			title={selectedPosition.id ? `Editar ${selectedPosition.name}` : 'Registrar contratista'}
		/>
		<DialogBody grid="2">
			<Label name="Nombre">
				<Input name="text" bind:value={formData.name} />
			</Label>
			<Label name="Activo">
				<Checkbox name="text" bind:checked={formData.active} />
			</Label>
			<Label name="IVA en el pago">
				<Select items={ivaOptions} bind:value={formData.ivaRate} />
			</Label>
		</DialogBody>
		<DialogFooter submitFunc={handleSubmit} hideFunc={() => (show = false)} />
	</DialogContent>
</Dialog>
