/**
 * Liste figée des éditeurs proposés pour ouvrir un worktree.
 * `appName` = cible passée à `open -a` côté serveur agent (macOS).
 * `id` sert de clé persistée (`preferred_editor`) et de clé du mapping d'icônes.
 */
export interface EditorEntry {
	id: string;
	appName: string;
	label: string;
}

export const EDITORS: EditorEntry[] = [
	{ id: 'vscode', appName: 'Visual Studio Code', label: 'VS Code' },
	{ id: 'cursor', appName: 'Cursor', label: 'Cursor' },
	{ id: 'windsurf', appName: 'Windsurf', label: 'Windsurf' },
	{ id: 'zed', appName: 'Zed', label: 'Zed' },
	{ id: 'intellij', appName: 'IntelliJ IDEA', label: 'IntelliJ IDEA' },
	{ id: 'webstorm', appName: 'WebStorm', label: 'WebStorm' },
	{ id: 'phpstorm', appName: 'PhpStorm', label: 'PhpStorm' },
	{ id: 'pycharm', appName: 'PyCharm', label: 'PyCharm' },
	{ id: 'sublime', appName: 'Sublime Text', label: 'Sublime Text' },
];

export const getEditorById = (id: string | null | undefined): EditorEntry | undefined =>
	EDITORS.find((e) => e.id === id);
