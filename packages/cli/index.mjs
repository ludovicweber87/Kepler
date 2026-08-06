import { Command } from 'commander';
import { runStart } from './commands/start.mjs';
import { runStop } from './commands/stop.mjs';
import { runStatus } from './commands/status.mjs';
import { runLogs } from './commands/logs.mjs';
import { runUpdate } from './commands/update.mjs';
import { runSeed } from './commands/seed.mjs';

const program = new Command();

program
	.name('kepler')
	.description(
		[
			'Kepler — run your personal dev dashboard locally.',
			'',
			'Manages a dedicated copy in ~/.kepler/repo: builds it, runs the web app',
			'and the agent server as background services, and opens a desktop window.',
			'GitHub access uses your local `gh` CLI session — no tokens to configure.',
		].join('\n'),
	)
	.version('0.1.0', '-v, --version', 'output the Kepler CLI version');

program
	.command('start')
	.summary('build (if needed) and launch Kepler, then open the window')
	.description(
		[
			'Build Kepler if not built yet, then start the agent (:4001) and the web',
			'app (first free port from 4000) as detached background services, and open',
			'the desktop window. Safe to run twice — reopens the window if it was closed.',
		].join('\n'),
	)
	.option('--no-window', 'start the services without opening the desktop window')
	.addHelpText('after', '\nExample:\n  $ kepler start\n  $ kepler start --no-window')
	.action((opts) => runStart({ window: opts.window }));

program
	.command('stop')
	.summary('stop all Kepler services')
	.description('Stop the agent, web app and desktop window (kills by pid + frees the ports).')
	.action(() => runStop());

program
	.command('restart')
	.summary('stop then start Kepler')
	.description('Convenience for `kepler stop` followed by `kepler start`.')
	.option('--no-window', 'restart the services without opening the desktop window')
	.action(async (opts) => {
		await runStop();
		await new Promise((r) => setTimeout(r, 1000));
		await runStart({ window: opts.window });
	});

program
	.command('status')
	.summary('show which services are running')
	.description('Print each service (agent / web / desktop) with its status, pid and URL.')
	.action(() => runStatus());

program
	.command('logs')
	.summary('tail service logs')
	.description('Follow the logs (`tail -f`) of all services, or a single one.')
	.argument('[service]', 'limit to one service: agent | web | desktop')
	.addHelpText('after', '\nExample:\n  $ kepler logs\n  $ kepler logs agent')
	.action((service) => runLogs(service));

program
	.command('update')
	.summary('update Kepler to the latest main')
	.description(
		[
			'Rebase ~/.kepler/repo on origin/main (fallback to merge on conflict),',
			'reinstall dependencies, rebuild the app and agent, and refresh the CLI',
			'symlink. The running instance is left untouched — run `kepler restart` to',
			'apply the update.',
		].join('\n'),
	)
	.action(() => runUpdate());

program
	.command('seed')
	.summary('add the reference persona library to the database')
	.description(
		[
			'Insert the reference personas into the local database. Personas that already',
			'exist are left untouched, so the command is safe to run twice and never',
			'silently discards edits made from the UI — pass --overwrite to reset them.',
		].join('\n'),
	)
	.option('--overwrite', 'reset personas that already exist to the seeded version')
	.addHelpText('after', '\nExample:\n  $ kepler seed\n  $ kepler seed --overwrite')
	.action((opts) => runSeed({ overwrite: Boolean(opts.overwrite) }));

program.addHelpText(
	'after',
	[
		'',
		'Common flow:',
		'  $ kepler start            # launch the app',
		'  $ kepler status           # see what is running',
		'  $ kepler update           # pull latest main + rebuild',
		'  $ kepler restart          # apply an update',
		'  $ kepler stop             # shut everything down',
		'',
		'Notes:',
		'  • GitHub auth comes from `gh` — run `gh auth login` once if needed.',
		'  • Runtime state (db, pids, logs) lives in ~/.kepler/.',
		'  • The agent uses port 4001; don’t run `npm run dev` at the same time.',
	].join('\n'),
);

program.parseAsync(process.argv).catch((err) => {
	console.error(`\nError: ${err?.message ?? err}`);
	process.exit(1);
});
