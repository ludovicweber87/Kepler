import { describe, it, expect } from 'vitest';
import {
	validateAttachment,
	stripDataUrlPrefix,
	mediaTypeForFile,
	fileExtension,
	isImageMediaType,
	MAX_IMAGE_BYTES,
	MAX_FILE_BYTES,
} from './fileAttach';

describe('validateAttachment', () => {
	it('accepts a small png', () => {
		expect(validateAttachment({ name: 'a.png', type: 'image/png', size: 1000 })).toBeNull();
	});
	it('rejects an image format the model cannot see', () => {
		expect(validateAttachment({ name: 'a.bmp', type: 'image/bmp', size: 1000 })).toBe('type');
	});
	it('accepts non-image files', () => {
		expect(validateAttachment({ name: 'r.pdf', type: 'application/pdf', size: 10 })).toBeNull();
		expect(validateAttachment({ name: 'notes.md', type: '', size: 10 })).toBeNull();
	});
	it('rejects an oversized image', () => {
		expect(
			validateAttachment({ name: 'a.png', type: 'image/png', size: MAX_IMAGE_BYTES + 1 }),
		).toBe('size');
	});
	it('lets a file go past the image ceiling, up to the file ceiling', () => {
		expect(
			validateAttachment({
				name: 'a.zip',
				type: 'application/zip',
				size: MAX_IMAGE_BYTES + 1,
			}),
		).toBeNull();
		expect(
			validateAttachment({
				name: 'a.zip',
				type: 'application/zip',
				size: MAX_FILE_BYTES + 1,
			}),
		).toBe('size');
	});
});

describe('mediaTypeForFile', () => {
	it('trusts the browser when it typed the file', () => {
		expect(mediaTypeForFile({ name: 'a.md', type: 'application/pdf' })).toBe('application/pdf');
	});
	it('falls back to the extension', () => {
		expect(mediaTypeForFile({ name: 'notes.MD', type: '' })).toBe('text/markdown');
		expect(mediaTypeForFile({ name: 'hook.ts', type: '' })).toBe('text/x-typescript');
	});
	it('falls back to an opaque binary for unknown extensions', () => {
		expect(mediaTypeForFile({ name: 'blob.qqq', type: '' })).toBe('application/octet-stream');
		expect(mediaTypeForFile({ name: 'Makefile', type: '' })).toBe('application/octet-stream');
	});
});

describe('fileExtension', () => {
	it('ignores dotfiles and extensionless names', () => {
		expect(fileExtension('.gitignore')).toBe('');
		expect(fileExtension('Makefile')).toBe('');
		expect(fileExtension('a.tar.gz')).toBe('gz');
	});
});

describe('isImageMediaType', () => {
	it('only accepts what the API renders', () => {
		expect(isImageMediaType('image/webp')).toBe(true);
		expect(isImageMediaType('image/bmp')).toBe(false);
		expect(isImageMediaType('application/pdf')).toBe(false);
	});
});

describe('stripDataUrlPrefix', () => {
	it('splits media type and base64 payload', () => {
		expect(stripDataUrlPrefix('data:image/png;base64,AAAB')).toEqual({
			mediaType: 'image/png',
			data: 'AAAB',
		});
	});
	it('falls back when the browser left the type empty', () => {
		expect(stripDataUrlPrefix('data:;base64,AAAB')).toEqual({
			mediaType: 'application/octet-stream',
			data: 'AAAB',
		});
	});
});
