/**
 * Kepler site — no framework, no build. Three behaviours only:
 * scroll reveal, a shadow on the nav once it detaches, and copy-to-clipboard
 * on the install commands.
 */

(() => {
	'use strict';

	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	// ── reveal on scroll ───────────────────────────────────
	// Without IntersectionObserver (or with reduced motion), everything is shown
	// at once: the class is what makes content visible, so it must never be left off.
	const revealables = document.querySelectorAll('.reveal');

	if (reduceMotion || !('IntersectionObserver' in window)) {
		revealables.forEach((el) => el.classList.add('is-in'));
	} else {
		const io = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (!entry.isIntersecting) return;
					entry.target.classList.add('is-in');
					io.unobserve(entry.target);
				});
			},
			{ rootMargin: '0px 0px -12% 0px', threshold: 0.06 },
		);

		revealables.forEach((el, i) => {
			// Siblings in the same grid stagger slightly; capped so a long list
			// never leaves the last card waiting.
			el.style.transitionDelay = `${Math.min(i % 4, 3) * 70}ms`;
			io.observe(el);
		});
	}

	// ── nav shadow ─────────────────────────────────────────
	const nav = document.getElementById('nav');
	const sentinel = document.getElementById('top');

	if (nav && sentinel && 'IntersectionObserver' in window) {
		new IntersectionObserver(
			([entry]) => nav.classList.toggle('is-stuck', !entry.isIntersecting),
			{
				rootMargin: '-8px 0px 0px 0px',
			},
		).observe(sentinel);
	}

	// ── copy to clipboard ──────────────────────────────────
	// `data-copy=":id"` points at the element holding the text, so the markup
	// stays the single source of truth for the command itself.
	document.querySelectorAll('[data-copy]').forEach((wrap) => {
		const btn = wrap.querySelector('.cmd__btn');
		const label = wrap.querySelector('.cmd__label');
		const target = document.querySelector(wrap.getAttribute('data-copy').replace(/^:/, '#'));
		if (!btn || !label || !target) return;

		let timer;

		btn.addEventListener('click', async () => {
			const text = target.textContent.replace(/\s+/g, ' ').trim();

			try {
				await navigator.clipboard.writeText(text);
			} catch {
				// Clipboard API needs a secure context; selecting the command is the
				// next best thing — the user finishes with ⌘C.
				const range = document.createRange();
				range.selectNodeContents(target);
				const sel = window.getSelection();
				sel.removeAllRanges();
				sel.addRange(range);
				label.textContent = 'Press ⌘C';
				return;
			}

			label.textContent = 'Copied';
			btn.classList.add('is-done');
			clearTimeout(timer);
			timer = setTimeout(() => {
				label.textContent = 'Copy';
				btn.classList.remove('is-done');
			}, 1800);
		});
	});
})();
