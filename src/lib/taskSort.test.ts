import { describe, it, expect } from 'vitest';
import { partitionTasks, selectOverdueTasks } from './taskSort';
import type { Task } from '@/types';

const NOW = new Date('2026-07-23T12:00:00');

function makeTask(over: Partial<Task> & Pick<Task, 'id'>): Task {
	return {
		title: over.id,
		description: null,
		due_date: null,
		repo_full_name: null,
		issue_owner: null,
		issue_repo: null,
		issue_number: null,
		issue_title: null,
		done: false,
		completed_at: null,
		pinned: false,
		created_at: '2026-07-01T00:00:00',
		updated_at: '2026-07-01T00:00:00',
		...over,
	};
}

describe('partitionTasks', () => {
	it('sépare épinglées / actives / terminées', () => {
		const tasks = [
			makeTask({ id: 'a' }),
			makeTask({ id: 'b', pinned: true }),
			makeTask({ id: 'c', done: true }),
		];
		const { pinned, active, done } = partitionTasks(tasks, NOW);
		expect(pinned.map((t) => t.id)).toEqual(['b']);
		expect(active.map((t) => t.id)).toEqual(['a']);
		expect(done.map((t) => t.id)).toEqual(['c']);
	});

	it('trie les actives par urgence croissante (en retard en tête, sans date en fin)', () => {
		const tasks = [
			makeTask({ id: 'green', due_date: '2026-08-10' }),
			makeTask({ id: 'background' }),
			makeTask({ id: 'overdue', due_date: '2026-07-20' }),
			makeTask({ id: 'red', due_date: '2026-07-24' }),
		];
		const { active } = partitionTasks(tasks, NOW);
		expect(active.map((t) => t.id)).toEqual(['overdue', 'red', 'green', 'background']);
	});

	it('une task terminée reste dans done même si épinglée', () => {
		const tasks = [makeTask({ id: 'x', pinned: true, done: true })];
		const { pinned, done } = partitionTasks(tasks, NOW);
		expect(pinned).toHaveLength(0);
		expect(done.map((t) => t.id)).toEqual(['x']);
	});

	it('trie les terminées par date de complétion décroissante', () => {
		const tasks = [
			makeTask({ id: 'old', done: true, completed_at: '2026-07-10T00:00:00' }),
			makeTask({ id: 'recent', done: true, completed_at: '2026-07-22T00:00:00' }),
		];
		const { done } = partitionTasks(tasks, NOW);
		expect(done.map((t) => t.id)).toEqual(['recent', 'old']);
	});
});

describe('selectOverdueTasks', () => {
	it('ne garde que les échéances dépassées', () => {
		const tasks = [
			makeTask({ id: 'overdue', due_date: '2026-07-20' }),
			makeTask({ id: 'today', due_date: '2026-07-23' }),
			makeTask({ id: 'future', due_date: '2026-08-10' }),
			makeTask({ id: 'background' }),
		];
		expect(selectOverdueTasks(tasks, NOW).map((t) => t.id)).toEqual(['overdue']);
	});

	it('exclut les tasks terminées, même en retard', () => {
		const tasks = [
			makeTask({ id: 'done', due_date: '2026-07-01', done: true }),
			makeTask({ id: 'late', due_date: '2026-07-01' }),
		];
		expect(selectOverdueTasks(tasks, NOW).map((t) => t.id)).toEqual(['late']);
	});

	it('inclut les épinglées et trie la plus en retard en tête', () => {
		const tasks = [
			makeTask({ id: 'late2d', due_date: '2026-07-21' }),
			makeTask({ id: 'late22d', due_date: '2026-07-01', pinned: true }),
			makeTask({ id: 'late9d', due_date: '2026-07-14' }),
		];
		expect(selectOverdueTasks(tasks, NOW).map((t) => t.id)).toEqual([
			'late22d',
			'late9d',
			'late2d',
		]);
	});

	it('départage deux mêmes échéances par récence de création', () => {
		const tasks = [
			makeTask({ id: 'older', due_date: '2026-07-20', created_at: '2026-06-01T00:00:00' }),
			makeTask({ id: 'newer', due_date: '2026-07-20', created_at: '2026-06-15T00:00:00' }),
		];
		expect(selectOverdueTasks(tasks, NOW).map((t) => t.id)).toEqual(['newer', 'older']);
	});

	it('renvoie un tableau vide quand rien n’est en retard', () => {
		expect(selectOverdueTasks([makeTask({ id: 'a' })], NOW)).toEqual([]);
	});
});
