import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { createDb } from '../../db';
import type { Plan } from '../../types';
import { type Remote, type RemoteRecord, type SyncState, syncOnce } from '../sync/engine';
import { getOutbox } from '../sync/tracker';

const plan = (id: string, name: string): Plan => ({
  id,
  name,
  createdAt: 1,
  updatedAt: 1,
  exercises: [{ id: 'e', name: 'Squat', sets: 3, reps: '5', restSec: 120 }],
});

/** Server finto con la stessa semantica di push_records + RLS (un solo utente) */
function fakeServer() {
  const rows = new Map<string, RemoteRecord>();
  let clock = Date.parse('2026-01-01T00:00:00Z');
  const remote: Remote = {
    async push(records) {
      for (const r of records) {
        const k = `${r.table_name}:${r.id}`;
        const cur = rows.get(k);
        if (cur && cur.updated_at >= r.updated_at) continue;
        rows.set(k, { ...JSON.parse(JSON.stringify(r)), server_updated_at: new Date(++clock).toISOString() });
      }
    },
    async pull(since) {
      return [...rows.values()]
        .filter((r) => !since || r.server_updated_at! > since)
        .sort((a, b) => a.server_updated_at!.localeCompare(b.server_updated_at!));
    },
  };
  return { rows, remote };
}

const fresh = (): SyncState => ({ cursor: null, initialPushDone: false });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('migrazione Dexie v1 -> v2', () => {
  it('conserva schede e storico', async () => {
    const name = 'migr-' + Math.random();
    const v1 = new Dexie(name);
    v1.version(1).stores({ plans: 'id, name, createdAt', sessions: 'id, planId, startedAt, status, *exerciseKeys' });
    await v1.table('plans').add({ id: 'p1', name: 'Push', exercises: [], createdAt: 5 });
    await v1.table('sessions').add({
      id: 's1', planId: 'p1', planName: 'Push', startedAt: 10, endedAt: 20, status: 'done', exercises: [],
      sets: [{ id: 'x', exerciseName: 'Panca', exerciseKey: 'panca', setNumber: 1, weight: 60, reps: 8, timestamp: 11 }],
      exerciseKeys: ['panca'],
    });
    v1.close();

    const v2 = createDb(name);
    await v2.open();
    expect(v2.verno).toBe(2);
    const p = await v2.plans.get('p1');
    const s = await v2.sessions.get('s1');
    expect(p?.name).toBe('Push');
    expect(p?.updatedAt).toBe(5);
    expect(s?.sets[0].weight).toBe(60);
    expect(s?.updatedAt).toBe(20);
    expect(await v2.sessions.where('exerciseKeys').equals('panca').count()).toBe(1);
    expect(await v2.exercises.count()).toBe(0);
    v2.close();
  });
});

describe('tracker', () => {
  it('registra creazioni, modifiche e cancellazioni', async () => {
    const d = createDb('trk-' + Math.random());
    await d.plans.add(plan('a', 'A'));
    await d.plans.update('a', { name: 'A2' });
    expect((await d.plans.get('a'))!.updatedAt).toBeGreaterThan(1);
    await d.body.add({ id: 'b', date: 1, weight: 80 });
    await d.body.delete('b');
    expect(Object.keys(getOutbox(d)).sort()).toEqual(['body:b', 'plans:a']);
  });
});

describe('sync', () => {
  it('primo login: carica i dati locali senza duplicarli e li porta su un altro dispositivo', async () => {
    const { rows, remote } = fakeServer();
    const phone = createDb('phone-' + Math.random());
    const ipad = createDb('ipad-' + Math.random());
    await phone.plans.add(plan('p1', 'Push'));
    await phone.exercises.put({ key: 'squat', name: 'Squat', muscle: 'gambe' });

    let sp = (await syncOnce(phone, remote, fresh())).state;
    // un secondo primo-upload (es. reinstallazione) non duplica: ID stabili
    await syncOnce(phone, remote, fresh());
    expect(rows.size).toBe(2);

    let si = (await syncOnce(ipad, remote, fresh())).state;
    expect((await ipad.plans.get('p1'))?.name).toBe('Push');
    expect((await ipad.exercises.get('squat'))?.muscle).toBe('gambe');
    // i record arrivati dal cloud non tornano nell'outbox
    expect(getOutbox(ipad)).toEqual({});

    // modifica su iPad, cancellazione propagata al telefono
    await wait(5);
    await ipad.plans.update('p1', { name: 'Push v2' });
    si = (await syncOnce(ipad, remote, si)).state;
    sp = (await syncOnce(phone, remote, sp)).state;
    expect((await phone.plans.get('p1'))?.name).toBe('Push v2');

    await wait(5);
    await phone.plans.delete('p1');
    sp = (await syncOnce(phone, remote, sp)).state;
    si = (await syncOnce(ipad, remote, si)).state;
    expect(await ipad.plans.get('p1')).toBeUndefined();
  });

  it('conflitto: vince l’ultima modifica', async () => {
    const { remote } = fakeServer();
    const a = createDb('a-' + Math.random());
    const b = createDb('b-' + Math.random());
    await a.plans.add(plan('p', 'Base'));
    let sa = (await syncOnce(a, remote, fresh())).state;
    let sb = (await syncOnce(b, remote, fresh())).state;

    // entrambi modificano offline; B dopo A
    await wait(5);
    await a.plans.update('p', { name: 'Da A' });
    await wait(5);
    await b.plans.update('p', { name: 'Da B' });

    sa = (await syncOnce(a, remote, sa)).state;
    sb = (await syncOnce(b, remote, sb)).state;
    sa = (await syncOnce(a, remote, sa)).state;
    expect((await a.plans.get('p'))?.name).toBe('Da B');
    expect((await b.plans.get('p'))?.name).toBe('Da B');
    void sb;
  });
});
