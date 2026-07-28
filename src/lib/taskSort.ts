import type { Task } from '@/types';
import { computeUrgency } from './taskUrgency';

export interface PartitionedTasks {
	pinned: Task[];
	active: Task[];
	done: Task[];
}

/** Tri décroissant par date de création (plus récent d'abord). */
function byCreatedDesc(a: Task, b: Task): number {
	return (b.created_at ?? '').localeCompare(a.created_at ?? '');
}

/**
 * Ordonne par urgence : les tasks datées d'abord (échéance la plus proche —
 * voire dépassée — en tête), puis les tasks de fond (sans date) par récence.
 */
function byUrgency(now: Date) {
	return (a: Task, b: Task): number => {
		const da = computeUrgency(a.due_date, now).daysRemaining;
		const db = computeUrgency(b.due_date, now).daysRemaining;
		if (da !== null && db !== null) {
			return da !== db ? da - db : byCreatedDesc(a, b);
		}
		if (da !== null) return -1; // datée avant non-datée
		if (db !== null) return 1;
		return byCreatedDesc(a, b);
	};
}

/** Tri des terminées : complétées le plus récemment d'abord. */
function byCompletedDesc(a: Task, b: Task): number {
	return (b.completed_at ?? b.created_at ?? '').localeCompare(
		a.completed_at ?? a.created_at ?? '',
	);
}

/**
 * Répartit et trie les tasks pour l'affichage :
 *   pinned  → épinglées non terminées (par urgence)
 *   active  → non épinglées non terminées (par urgence)
 *   done    → terminées (par date de complétion desc)
 */
export function partitionTasks(tasks: Task[], now: Date): PartitionedTasks {
	const urgencyCmp = byUrgency(now);
	const pinned: Task[] = [];
	const active: Task[] = [];
	const done: Task[] = [];

	for (const task of tasks) {
		if (task.done) done.push(task);
		else if (task.pinned) pinned.push(task);
		else active.push(task);
	}

	pinned.sort(urgencyCmp);
	active.sort(urgencyCmp);
	done.sort(byCompletedDesc);

	return { pinned, active, done };
}

/**
 * Tasks non terminées dont l'échéance est dépassée, la plus en retard en tête.
 * Épinglées comprises : le retard prime sur la mise en avant.
 */
export function selectOverdueTasks(tasks: Task[], now: Date): Task[] {
	return tasks
		.filter((task) => !task.done && computeUrgency(task.due_date, now).level === 'overdue')
		.sort(byUrgency(now));
}
