import { z } from 'zod';

const text = z.string().trim().min(1).max(4000);
const key = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
export const planSchema = z.object({
  objective: text,
  revision: z.number().int().positive(),
  tasks: z.array(z.object({
    key,
    role: z.enum(['coordinator', 'researcher', 'executor', 'reviewer']),
    dependsOn: z.array(key).max(20),
    deliverable: text,
    criteria: z.array(text).min(1).max(20)
  }).strict()).min(1).max(20)
}).strict();
export type Plan = z.infer<typeof planSchema>;
export type PlanIssue = { code: string; path: string; message: string };
export type PlanValidation =
  | { valid: false; issues: PlanIssue[] }
  | { valid: true; plan: Plan; order: string[]; ready: string[] };

// Pure validation: never writes data or dispatches work.
export function validatePlan(input: unknown): PlanValidation {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return {
    valid: false,
    issues: parsed.error.issues.map(i => ({ code: 'schema', path: i.path.join('.'), message: i.message }))
  };
  const plan = parsed.data;
  const issues: PlanIssue[] = [];
  const tasks = new Map(plan.tasks.map(t => [t.key, t]));
  const seen = new Set<string>();
  for (const [index, task] of plan.tasks.entries()) {
    const path = `tasks.${index}`;
    if (seen.has(task.key)) issues.push({ code: 'duplicate_key', path, message: `Clave duplicada: ${task.key}` });
    seen.add(task.key);
    const deps = new Set<string>();
    for (const dep of task.dependsOn) {
      if (!tasks.has(dep)) issues.push({ code: 'missing_dependency', path, message: `Dependencia inexistente: ${dep}` });
      if (deps.has(dep)) issues.push({ code: 'duplicate_dependency', path, message: `Dependencia repetida: ${dep}` });
      deps.add(dep);
    }
  }
  if (issues.length) return { valid: false, issues };
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const order: string[] = [];
  function visit(id: string): boolean {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const dep of tasks.get(id)!.dependsOn) if (!visit(dep)) return false;
    visiting.delete(id);
    visited.add(id);
    order.push(id);
    return true;
  }
  for (const task of plan.tasks) {
    if (!visit(task.key)) return {
      valid: false, issues: [{ code: 'cycle', path: 'tasks', message: 'El plan contiene dependencias cíclicas.' }]
    };
  }
  return { valid: true, plan, order, ready: plan.tasks.filter(t => !t.dependsOn.length).map(t => t.key) };
}
