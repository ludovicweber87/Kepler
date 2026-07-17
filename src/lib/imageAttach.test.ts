import { describe, it, expect } from 'vitest';
import { validateImageFile, stripDataUrlPrefix, MAX_IMAGE_BYTES } from './imageAttach';

describe('validateImageFile', () => {
	it('accepts a small png', () => {
		expect(validateImageFile({ type: 'image/png', size: 1000 })).toBeNull();
	});
	it('rejects an unsupported type', () => {
		expect(validateImageFile({ type: 'image/bmp', size: 1000 })).toBe('type');
		expect(validateImageFile({ type: 'application/pdf', size: 10 })).toBe('type');
	});
	it('rejects an oversized image', () => {
		expect(validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toBe('size');
	});
});

describe('stripDataUrlPrefix', () => {
	it('splits media type and base64 payload', () => {
		expect(stripDataUrlPrefix('data:image/png;base64,AAAB')).toEqual({
			mediaType: 'image/png',
			data: 'AAAB',
		});
	});
});
