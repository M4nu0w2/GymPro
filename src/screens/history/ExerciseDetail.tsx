import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { IconTrophy } from '../../components/Icons';
import { Segmented, Sheet } from '../../components/ui';
import { db } from '../../db';
import { computeRecord, estimate1RM, exerciseSeries } from '../../lib/stats';
import { fmtDate, fmtKg, fmtVolume } from '../../lib/utils';

type Metric = 'maxWeight' | 'best1RM' | 'volume';

const METRIC_LABEL: Record<Metric, string> = {
  maxWeight: 'Peso max',
  best1RM: '1RM stimato',
  volume: 'Volume',
};

export function ExerciseDetail({
  exerciseKey,
  onClose,
  onOpenSession,
}: {
  exerciseKey: string | null;
  onClose: () => void;
  onOpenSession: (id: string) => void;
}) {
  const [metric, setMetric] = useState<Metric>('maxWeight');
  const data = useLiveQuery(async () => {
    if (!exerciseKey) return null;
    const sessions = (await db.sessions.where('exerciseKeys').equals(exerciseKey).toArray()).filter((s) => s.status === 'done');
    const points = exerciseSeries(sessions, exerciseKey);
    const all = points.flatMap((p) => p.sets);
    return { points, record: computeRecord(all), name: all.at(-1)?.exerciseName ?? exerciseKey };
  }, [exerciseKey]);

  const chartData = data?.points.map((p) => ({
    date: fmtDate(p.date, { day: 'numeric', month: 'short' }),
    value: Math.round(p[metric] * 10) / 10,
  }));

  const recordWeightSet = data?.points.flatMap((p) => p.sets).find((s) => s.weight === data.record.maxWeight && s.reps === data.record.maxWeightReps);
  const best1RMValue = data ? Math.round(data.record.best1RM * 10) / 10 : 0;

  return (
    <Sheet open={!!exerciseKey} onClose={onClose} full title={data?.name ?? ''}>
      {data && (
        <div className="space-y-4 py-2 pb-10">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl border border-gold/30 bg-gold/10 p-4">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gold">
                <IconTrophy size={14} /> Record peso
              </p>
              <p className="num mt-1 text-[28px] leading-none font-black">
                {fmtKg(data.record.maxWeight)}
                <span className="text-base font-bold text-muted"> kg</span>
              </p>
              <p className="num mt-1 text-xs text-muted">
                × {data.record.maxWeightReps} rep{recordWeightSet ? ` · ${fmtDate(recordWeightSet.timestamp, { day: 'numeric', month: 'short' })}` : ''}
              </p>
            </div>
            <div className="rounded-3xl bg-surface p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">1RM stimato</p>
              <p className="num mt-1 text-[28px] leading-none font-black">
                {fmtKg(best1RMValue)}
                <span className="text-base font-bold text-muted"> kg</span>
              </p>
              <p className="mt-1 text-xs text-muted">formula di Epley</p>
            </div>
          </div>

          <Segmented
            value={metric}
            onChange={setMetric}
            options={(Object.keys(METRIC_LABEL) as Metric[]).map((m) => ({ value: m, label: METRIC_LABEL[m] }))}
          />

          <div className="rounded-3xl bg-surface p-3 pt-4">
            {chartData && chartData.length >= 2 ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                    <defs>
                      <linearGradient id="fillAccent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3' }}
                      contentStyle={{
                        background: 'var(--surface-2)',
                        border: 'none',
                        borderRadius: 14,
                        color: 'var(--text)',
                        fontWeight: 700,
                      }}
                      labelStyle={{ color: 'var(--muted)', fontWeight: 600 }}
                      formatter={(v) => [metric === 'volume' ? fmtVolume(Number(v)) : `${fmtKg(Number(v))} kg`, METRIC_LABEL[metric]]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="var(--accent)"
                      strokeWidth={3}
                      fill="url(#fillAccent)"
                      dot={{ r: 3, fill: 'var(--accent)', strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: 'var(--accent)', stroke: 'var(--bg)', strokeWidth: 2 }}
                      isAnimationActive
                      animationDuration={500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted">Il grafico apparirà dopo almeno 2 sessioni.</p>
            )}
          </div>

          <h3 className="px-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted">Sessioni · {data.points.length}</h3>
          <div className="space-y-2.5">
            {data.points
              .slice()
              .reverse()
              .map((p) => (
                <button
                  key={p.sessionId}
                  type="button"
                  onClick={() => onOpenSession(p.sessionId)}
                  className="tap block w-full rounded-3xl border border-line bg-surface p-4 text-left active:bg-surface-2"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-bold capitalize">{fmtDate(p.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span className="num text-xs text-muted">{fmtVolume(p.volume)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.sets.map((s) => {
                      const isPR = s.weight === data.record.maxWeight && s.reps === data.record.maxWeightReps;
                      const is1RM = Math.abs(estimate1RM(s.weight, s.reps) - data.record.best1RM) < 0.01;
                      return (
                        <span
                          key={s.id}
                          className={`num rounded-xl px-2.5 py-1 text-sm font-bold ${isPR || is1RM ? 'bg-gold/15 text-gold' : 'bg-surface-2'}`}
                        >
                          {fmtKg(s.weight)}×{s.reps}
                        </span>
                      );
                    })}
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
