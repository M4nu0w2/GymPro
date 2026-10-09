import { useState } from 'react';
import { useSettings } from '../lib/settings';
import type { SetLog } from '../types';
import { IconTrash } from './Icons';
import { Stepper } from './Stepper';
import { Button, Sheet } from './ui';

/** Modifica / eliminazione di una serie già salvata */
export function SetEditSheet({
  set,
  onClose,
  onSave,
  onDelete,
}: {
  set: SetLog | null;
  onClose: () => void;
  onSave: (patch: { weight: number; reps: number }) => void;
  onDelete: () => void;
}) {
  return (
    <Sheet open={!!set} onClose={onClose} title={set ? `${set.exerciseName} · serie ${set.setNumber}` : ''}>
      {set && <Body key={set.id} set={set} onSave={onSave} onDelete={onDelete} />}
    </Sheet>
  );
}

function Body({ set, onSave, onDelete }: { set: SetLog; onSave: (p: { weight: number; reps: number }) => void; onDelete: () => void }) {
  const { weightStep } = useSettings();
  const [weight, setWeight] = useState<number | null>(set.weight);
  const [reps, setReps] = useState<number | null>(set.reps);
  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-1 gap-3">
        <Stepper label="Peso" unit="kg" decimals value={weight} step={weightStep} max={1000} onChange={setWeight} />
        <Stepper label="Rep" value={reps} step={1} max={200} onChange={setReps} />
      </div>
      <Button variant="primary" size="lg" className="w-full" onClick={() => onSave({ weight: weight ?? 0, reps: reps ?? 0 })}>
        Salva modifiche
      </Button>
      <Button variant="danger" className="w-full" onClick={onDelete}>
        <IconTrash size={18} /> Elimina serie
      </Button>
    </div>
  );
}
