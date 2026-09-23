<script lang="ts">
	import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '$lib/components/ui/dialog';
	import Label from '$lib/components/basic/Label.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Textarea } from '$lib/components/ui/textarea';
	import api from '$lib/utils/server';
	import { showSuccess } from '$lib/utils/showToast';
	import { refetch } from '$lib/utils/query';

	interface Props {
		show: boolean;
		pl: any;
	}
	let { show = $bindable(), pl }: Props = $props();

	// Recibo del cliente (11-Sep): lo que Iván confirma por correo, ahora guardado
	let data = $state({ receivedAt: '', receivedPallets: '', receivedComplete: true, receivedNotes: '' });

	$effect(() => {
		if (show && pl) {
			data = {
				receivedAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Tijuana' }),
				receivedPallets: pl.pallets ? String(pl.pallets) : '',
				receivedComplete: true,
				receivedNotes: ''
			};
		}
	});

	async function submit() {
		try {
			await api.put('/ie/packing-list/receive', {
				id: pl.id,
				receivedAt: data.receivedAt,
				receivedPallets: data.receivedPallets === '' ? null : Number(data.receivedPallets),
				receivedComplete: data.receivedComplete,
				receivedNotes: data.receivedNotes || null
			});
			showSuccess(`Recibo del packing list ${pl.packSlip} registrado`);
			show = false;
			refetch(['packing-lists']);
		} catch (err: any) {
			if (err.response?.status !== 400) throw err;
		}
	}
</script>

<Dialog bind:open={show}>
	<DialogContent class="sm:max-w-md">
		<DialogHeader title={`Recibo del packing list ${pl?.packSlip || ''}`} />
		<DialogBody>
			<div class="grid gap-3">
				<Label name="Fecha de recibo">
					<Input type="date" bind:value={data.receivedAt} />
				</Label>
				<Label name="Pallets recibidos">
					<Input type="number" min="0" step="1" bind:value={data.receivedPallets} />
				</Label>
				<div class="flex items-center gap-2">
					<Checkbox bind:checked={data.receivedComplete} id="receivedComplete" />
					<label for="receivedComplete" class="text-sm">Orden recibida completa</label>
				</div>
				<Label name="Notas">
					<Textarea bind:value={data.receivedNotes} placeholder="Ej. 2 pallets sin tratar, 1 caja dañada" />
				</Label>
			</div>
		</DialogBody>
		<DialogFooter submitFunc={submit} hideFunc={() => (show = false)} />
	</DialogContent>
</Dialog>
