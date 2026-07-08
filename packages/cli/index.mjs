import { Command } from 'commander';
import { runStart } from './commands/start.mjs';
import { runStop } from './commands/stop.mjs';
import { runStatus } from './commands/status.mjs';
import { runLogs } from './commands/logs.mjs';
import { runUpdate } from './commands/update.mjs';

const program = new Command();

program.name('devora').description('Run Devora locally').version('0.1.0');

program
	.command('start')
	.description('Build (if needed) and start Devora, then open it')
	.option('--no-window', 'do not open a browser/app window')
	.action((opts) => runStart({ window: opts.window }));

program
	.command('stop')
	.description('Stop all Devora services')
	.action(() => runStop());

program
	.command('restart')
	.description('Restart Devora')
	.option('--no-window', 'do not open a browser/app window')
	.action(async (opts) => {
		await runStop();
		await new Promise((r) => setTimeout(r, 1000));
		await runStart({ window: opts.window });
	});

program
	.command('status')
	.description('Show which Devora services are running')
	.action(() => runStatus());

program
	.command('logs')
	.description('Tail service logs')
	.argument('[service]', 'agent | web')
	.action((service) => runLogs(service));

program
	.command('update')
	.description('Rebase on origin/main, reinstall, rebuild, refresh the CLI symlink')
	.action(() => runUpdate());

program.parseAsync(process.argv).catch((err) => {
	console.error(`\nError: ${err?.message ?? err}`);
	process.exit(1);
});
