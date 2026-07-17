export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateImageFile(file: { type: string; size: number }): 'type' | 'size' | null {
	if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return 'type';
	if (file.size > MAX_IMAGE_BYTES) return 'size';
	return null;
}

export function stripDataUrlPrefix(dataUrl: string): { mediaType: string; data: string } {
	const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
	if (!m) return { mediaType: 'application/octet-stream', data: '' };
	return { mediaType: m[1], data: m[2] };
}

export function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}
