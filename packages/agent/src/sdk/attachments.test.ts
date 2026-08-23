import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	extForMediaType,
	isImageMediaType,
	sanitizeSegment,
	sanitizeFileName,
	truncateFileName,
	isSafeAttachmentFile,
	diskFileName,
	attachmentRelUrl,
	buildAttachmentsNote,
} from './attachments.js';

test('extForMediaType maps supported types', () => {
	assert.equal(extForMediaType('image/png'), 'png');
	assert.equal(extForMediaType('image/jpeg'), 'jpg');
	assert.equal(extForMediaType('image/gif'), 'gif');
	assert.equal(extForMediaType('image/webp'), 'webp');
	assert.equal(extForMediaType('image/bmp'), null);
	assert.equal(extForMediaType('text/plain'), null);
});

test('isImageMediaType separates inline images from disk-only files', () => {
	assert.equal(isImageMediaType('image/png'), true);
	assert.equal(isImageMediaType('application/pdf'), false);
	assert.equal(isImageMediaType('text/markdown'), false);
});

test('sanitizeSegment strips path traversal and unsafe chars', () => {
	assert.equal(sanitizeSegment('../../etc'), '______etc');
	assert.equal(sanitizeSegment('ok_name-1'), 'ok_name-1');
});

test('attachmentRelUrl composes a safe relative url', () => {
	assert.equal(attachmentRelUrl('sess/1', 'abc.png'), '/attachments/sess_1/abc.png');
});

test('sanitizeFileName keeps the extension and is idempotent', () => {
	assert.equal(sanitizeFileName('rapport Q3.pdf'), 'rapport_Q3.pdf');
	assert.equal(sanitizeFileName(sanitizeFileName('rapport Q3.pdf')), 'rapport_Q3.pdf');
	assert.equal(sanitizeFileName('notes.tar.gz'), 'notes.tar.gz');
	assert.equal(sanitizeFileName('../../etc/passwd'), '_._etc_passwd');
	assert.equal(sanitizeFileName('...'), 'fichier');
	assert.equal(sanitizeFileName('trailing.'), 'trailing');
});

test('truncateFileName shortens the stem, never the extension', () => {
	assert.equal(truncateFileName('short.pdf', 20), 'short.pdf');
	assert.equal(truncateFileName('a'.repeat(30) + '.pdf', 12), 'a'.repeat(8) + '.pdf');
});

test('isSafeAttachmentFile accepts the names saveAttachment writes', () => {
	assert.equal(isSafeAttachmentFile('b2110c2e-9efd-40de-9720-63d2dfe0bac4.png'), true);
	assert.equal(isSafeAttachmentFile('abc.jpg'), true);
	assert.equal(isSafeAttachmentFile('abc.gif'), true);
	assert.equal(isSafeAttachmentFile('abc.webp'), true);
	// Le composer accepte tout type de fichier : plus de liste blanche d'extensions,
	// et un nom d'origine à plusieurs points reste servable.
	assert.equal(isSafeAttachmentFile('uuid-rapport_Q3.pdf'), true);
	assert.equal(isSafeAttachmentFile('uuid-archive.tar.gz'), true);
	assert.equal(isSafeAttachmentFile('uuid-Makefile'), true);
});

test('isSafeAttachmentFile rejects traversal', () => {
	assert.equal(isSafeAttachmentFile('../../etc/passwd'), false);
	assert.equal(isSafeAttachmentFile('a/b.png'), false);
	assert.equal(isSafeAttachmentFile('..png'), false);
	assert.equal(isSafeAttachmentFile('..'), false);
	assert.equal(isSafeAttachmentFile('abc.'), false);
	assert.equal(isSafeAttachmentFile('.hidden'), false);
	assert.equal(isSafeAttachmentFile(''), false);
});

test('diskFileName always produces a servable name', () => {
	const nasty = [
		['application/pdf', '../../etc/passwd'],
		['application/pdf', 'rapport Q3 (final).pdf'],
		['application/pdf', `a.${'b'.repeat(80)}.pdf`],
		['application/pdf', '...'],
		['application/pdf', 'trailing.'],
		['image/png', 'collé'],
		['text/markdown', 'notes.tar.gz'],
	] as const;
	for (const [mediaType, name] of nasty) {
		const file = diskFileName(mediaType, name);
		assert.equal(isSafeAttachmentFile(file), true, `${name} → ${file}`);
	}
	// L'extension d'une image collée sans nom de fichier est rétablie.
	assert.match(diskFileName('image/png', 'collé'), /-coll_\.png$/);
});

test('buildAttachmentsNote lists name, media type and path', () => {
	assert.equal(buildAttachmentsNote([]), undefined);
	const note = buildAttachmentsNote([
		{
			name: 'r.pdf',
			url: '/attachments/s/uuid-r.pdf',
			mediaType: 'application/pdf',
			path: '/tmp/uuid-r.pdf',
		},
	]);
	assert.match(note ?? '', /1 fichier/);
	assert.match(note ?? '', /- r\.pdf \(application\/pdf\) : \/tmp\/uuid-r\.pdf/);
});
