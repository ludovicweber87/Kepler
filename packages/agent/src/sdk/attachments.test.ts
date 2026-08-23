import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	extForMediaType,
	sanitizeSegment,
	attachmentRelUrl,
	isSafeAttachmentFile,
} from './attachments.js';

test('extForMediaType maps supported types', () => {
	assert.equal(extForMediaType('image/png'), 'png');
	assert.equal(extForMediaType('image/jpeg'), 'jpg');
	assert.equal(extForMediaType('image/gif'), 'gif');
	assert.equal(extForMediaType('image/webp'), 'webp');
	assert.equal(extForMediaType('image/bmp'), null);
	assert.equal(extForMediaType('text/plain'), null);
});

test('sanitizeSegment strips path traversal and unsafe chars', () => {
	assert.equal(sanitizeSegment('../../etc'), '______etc');
	assert.equal(sanitizeSegment('ok_name-1'), 'ok_name-1');
});

test('attachmentRelUrl composes a safe relative url', () => {
	assert.equal(attachmentRelUrl('sess/1', 'abc.png'), '/attachments/sess_1/abc.png');
});

test('isSafeAttachmentFile accepts the names saveAttachment writes', () => {
	assert.equal(isSafeAttachmentFile('b2110c2e-9efd-40de-9720-63d2dfe0bac4.png'), true);
	assert.equal(isSafeAttachmentFile('abc.jpg'), true);
	assert.equal(isSafeAttachmentFile('abc.gif'), true);
	assert.equal(isSafeAttachmentFile('abc.webp'), true);
});

test('isSafeAttachmentFile rejects traversal and unknown extensions', () => {
	assert.equal(isSafeAttachmentFile('../../etc/passwd'), false);
	assert.equal(isSafeAttachmentFile('a/b.png'), false);
	assert.equal(isSafeAttachmentFile('..png'), false);
	assert.equal(isSafeAttachmentFile('abc.png.sh'), false);
	assert.equal(isSafeAttachmentFile('abc'), false);
	assert.equal(isSafeAttachmentFile('abc.svg'), false);
});
