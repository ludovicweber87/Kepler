import type { ServerResponse } from 'node:http';

export interface EmittedNotification {
	id: string; source: string; type: string; priority: string;
	title: string; body: string; url: string;
	entity_ref: unknown; payload: unknown; read_at: string | null; created_at: string;
}

const clients = new Set<ServerResponse>();

export const notificationStore = {
	emit(row: EmittedNotification): void {
		const data = `data: ${JSON.stringify(row)}\n\n`;
		for (const res of clients) {
			try { res.write(data); } catch { clients.delete(res); }
		}
	},
	subscribe(res: ServerResponse): () => void {
		clients.add(res);
		return () => clients.delete(res);
	},
	count(): number { return clients.size; },
};
