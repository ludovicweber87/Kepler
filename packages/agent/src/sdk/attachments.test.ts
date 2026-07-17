import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extForMediaType, sanitizeSegment, attachmentRelUrl } from './attachments.js';

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
