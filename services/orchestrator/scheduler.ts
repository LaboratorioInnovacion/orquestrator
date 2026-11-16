import type { Plan } from '../../packages/contracts/plan.ts';
import { validatePlan } from '../../packages/contracts/plan.ts';

export type TaskStatus = 'pending' | 'ready' | 'dispatching' | 'running' | 'waiting_approval' |
  'reviewing' | 'completed' | 'failed' | 'cancelled' | 'blocked' | 'needs_reconciliation' |
  'waiting_input' | 'paused' | 'cancelling';
export type TaskSnapshot = { status: TaskStatus; workspace: string };
export type AdmissionPolicy = { total: number; specialists: number };
export type SchedulingDecision = {
  dispatch: string[];
  blocked: { key: string; reason: string }[];
  waiting: { key: string; reason: string }[];
};
const active = new Set<TaskStatus>([
  'dispatching', 'running', 'waiting_approval', 'reviewing', 'needs_reconciliation', 'cancelling'
]);
const terminalFailure = new Set<TaskStatus>(['failed', 'cancelled', 'blocked']);

/** Pure admission decision. A durable worker must lock, reserve and persist before dispatch. */
export function schedule(
  plan: Plan,
  snapshots: Record<string, TaskSnapshot>,
  policy: AdmissionPolicy = { total: 3, specialists: 2 },
  paused = false
): SchedulingDecision {
  const validated = validatePlan(plan);
  if (!validated.valid) throw new Error('No se puede programar un plan inválido.');
  if (![policy.total, policy.specialists].every(n => Number.isInteger(n) && n >= 0)) {
    throw new Error('Los límites deben ser enteros no negativos.');
  }
  const known = new Set(plan.tasks.map(t => t.key));
  if (Object.keys(snapshots).some(key => !known.has(key))) throw new Error('Snapshot contiene tareas ajenas al plan.');
  for (const task of plan.tasks) {
    const snapshot = snapshots[task.key];
    if (!snapshot || !snapshot.workspace.trim()) throw new Error('Falta estado o workspace de una tarea.');
  }
  const decisions: SchedulingDecision = { dispatch: [], blocked: [], waiting: [] };
  let total = 0;
  let specialists = 0;
  const workspaces = new Set<string>();
  for (const task of plan.tasks) {
    if (active.has(snapshots[task.key].status)) {
      total++;
      if (task.role !== 'coordinator') specialists++;
      workspaces.add(snapshots[task.key].workspace);
    }
  }
  const blocked = new Set<string>();
  const byKey = new Map(plan.tasks.map(task => [task.key, task]));
  for (const key of validated.order) {
    const task = byKey.get(key)!;
    const snapshot = snapshots[key];
    // Running or accepted work is never silently overwritten by planning.
    if (!['pending', 'ready'].includes(snapshot.status)) continue;
    const failed = task.dependsOn.find(dep => terminalFailure.has(snapshots[dep].status) || blocked.has(dep));
    if (failed) {
      blocked.add(key);
      decisions.blocked.push({ key, reason: `dependency_failed:${failed}` });
      continue;
    }
    const unmet = task.dependsOn.find(dep => snapshots[dep].status !== 'completed');
    let reason: string | undefined;
    if (unmet) reason = `dependency_not_accepted:${unmet}`;
    else if (paused) reason = 'project_paused';
    else if (total >= policy.total) reason = 'total_capacity';
    else if (task.role !== 'coordinator' && specialists >= policy.specialists) reason = 'specialist_capacity';
    else if (workspaces.has(snapshot.workspace)) reason = 'workspace_busy';
    if (reason) decisions.waiting.push({ key, reason });
    else {
      decisions.dispatch.push(key);
      total++;
      if (task.role !== 'coordinator') specialists++;
      workspaces.add(snapshot.workspace);
    }
  }
  return decisions;
}
