import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtKg } from '../../lib/utils';

export default function BodyChart({ data, unit, label }: { data: { date: string; value: number }[]; unit: string; label: string }) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="fillBody" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={44} domain={['dataMin - 1', 'dataMax + 1']} />
          <Tooltip
            cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3' }}
            contentStyle={{ background: 'var(--elevated)', border: 'none', borderRadius: 14, color: 'var(--text)', fontWeight: 600 }}
            labelStyle={{ color: 'var(--muted)', fontWeight: 500 }}
            formatter={(v) => [`${fmtKg(Number(v))} ${unit}`, label]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--accent)"
            strokeWidth={3}
            fill="url(#fillBody)"
            dot={{ r: 3, fill: 'var(--accent)', strokeWidth: 0 }}
            activeDot={{ r: 6, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
            animationDuration={500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
