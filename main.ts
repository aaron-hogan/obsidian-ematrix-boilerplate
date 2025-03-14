import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, MarkdownView, Editor } from 'obsidian';

interface EMatrixSettings {
	mySetting: string;
	placeholderText: string;
	enableLogging: boolean;
}

const DEFAULT_SETTINGS: EMatrixSettings = {
	mySetting: 'default',
	placeholderText: 'This note has been processed by EMatrix.',
	enableLogging: true
}

export default class EMatrixPlugin extends Plugin {
	settings: EMatrixSettings;

	async onload() {
		console.log('Initializing EMatrix plugin');
		
		try {
			await this.loadSettings();
			
			console.log('EMatrix plugin loaded successfully');
			new Notice('EMatrix plugin loaded successfully');

			// Register event to detect file open
			this.registerEvent(
				this.app.workspace.on('file-open', (file) => {
					if (file instanceof TFile && file.extension === 'md') {
						this.processFile(file);
					}
				})
			);

			// Register event to detect content change
			this.registerEvent(
				this.app.vault.on('modify', (file) => {
					if (file instanceof TFile && file.extension === 'md') {
						this.processFile(file);
					}
				})
			);

			// Add a command to process the current file
			this.addCommand({
				id: 'process-current-file',
				name: 'Process Current File with EMatrix',
				callback: () => {
					const activeFile = this.app.workspace.getActiveFile();
					if (activeFile && activeFile.extension === 'md') {
						this.processFile(activeFile);
					} else {
						new Notice('No markdown file is currently open');
					}
				}
			});

			// Add a command to extract top-level tasks
			this.addCommand({
				id: 'extract-top-level-tasks',
				name: 'Extract Top-Level Tasks',
				callback: () => {
					const tasks = this.extractTopLevelTasks();
					if (tasks.length > 0) {
						new Notice(`Extracted ${tasks.length} top-level tasks`);
						console.log('Extracted top-level tasks:', tasks);
					} else {
						new Notice('No top-level tasks found in the current note');
					}
				}
			});

			// Add a command to confirm plugin is working
			this.addCommand({
				id: 'show-ematrix-notice',
				name: 'Show EMatrix Notice',
				callback: () => {
					new Notice('EMatrix plugin is working!');
				}
			});

			// Add settings tab
			this.addSettingTab(new EMatrixSettingTab(this.app, this));
		} catch (error) {
			console.error('Error loading EMatrix plugin:', error);
			new Notice('Error loading EMatrix plugin: ' + error.message);
		}
	}
	
	/**
	 * Extracts top-level tasks from the active note
	 * Only captures tasks at the root level, ignoring nested subtasks
	 * @returns An array of task strings without the checkbox markdown
	 */
	extractTopLevelTasks(): string[] {
		try {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView) {
				console.log('No active markdown view found');
				return [];
			}
			
			const editor = activeView.editor;
			const content = editor.getValue();
			
			// Split content into lines
			const lines = content.split('\n');
			const tasks: string[] = [];
			
			// Track indentation level to identify top-level tasks
			let inList = false;
			let previousIndent = 0;
			
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				
				// Check if line contains a task
				const taskMatch = line.match(/^(\s*)- \[([ x])\] (.+)$/);
				
				if (taskMatch) {
					const indentation = taskMatch[1].length;
					const taskContent = taskMatch[3].trim();
					
					// Reset tracking if we found a task with no indentation
					if (indentation === 0) {
						inList = true;
						previousIndent = 0;
						tasks.push(taskContent);
					} 
					// Only consider this a top-level task if the indentation is 0
					// or if this is not within a list
					else if (!inList) {
						tasks.push(taskContent);
						inList = true;
						previousIndent = indentation;
					}
				} 
				// If line starts with list marker but isn't a task
				else if (line.match(/^\s*- /)) {
					// Keep track of being in a list
					inList = true;
				}
				// If line is empty or doesn't start with a list marker
				else if (line.trim() === '' || !line.match(/^\s*- /)) {
					// Reset list tracking when we're no longer in a list context
					inList = false;
					previousIndent = 0;
				}
			}
			
			if (this.settings.enableLogging) {
				console.log(`EMatrix: Extracted ${tasks.length} top-level tasks`);
			}
			
			return tasks;
		} catch (error) {
			console.error('Error extracting tasks:', error);
			new Notice('Error extracting tasks: ' + error.message);
			return [];
		}
	}

	async processFile(file: TFile) {
		try {
			// Read the file content
			const content = await this.app.vault.read(file);
			
			// Check if the content contains #ematrix
			if (content.includes('#ematrix')) {
				if (this.settings.enableLogging) {
					console.log(`EMatrix: Detected #ematrix tag in file: ${file.path}`);
				}
				
				// Get the active view to check if this file is currently open
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				
				if (activeView && activeView.file === file) {
					// If the file is currently being edited, we need to update the editor
					const editor = activeView.editor;
					const currentContent = editor.getValue();
					
					// Only replace if the content still contains #ematrix
					if (currentContent.includes('#ematrix')) {
						new Notice(`EMatrix processing: ${file.name}`);
						editor.setValue(this.settings.placeholderText);
					}
				} else {
					// If the file is not being edited, we can directly modify it
					new Notice(`EMatrix processing: ${file.name}`);
					await this.app.vault.modify(file, this.settings.placeholderText);
				}
				
				if (this.settings.enableLogging) {
					console.log(`EMatrix: Replaced content in file: ${file.path}`);
				}
			}
		} catch (error) {
			console.error(`EMatrix: Error processing file ${file.path}:`, error);
		}
	}

	onunload() {
		console.log('EMatrix plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class EMatrixSettingTab extends PluginSettingTab {
	plugin: EMatrixPlugin;

	constructor(app: App, plugin: EMatrixPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'EMatrix Settings'});

		new Setting(containerEl)
			.setName('Basic Setting')
			.setDesc('A basic setting (not used for functionality)')
			.addText(text => text
				.setPlaceholder('Enter your setting')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Placeholder Text')
			.setDesc('Text to replace note content when #ematrix is detected')
			.addTextArea(text => text
				.setPlaceholder('Replacement text')
				.setValue(this.plugin.settings.placeholderText)
				.onChange(async (value) => {
					this.plugin.settings.placeholderText = value;
					await this.plugin.saveSettings();
				}))
			.addExtraButton(button => {
				button
					.setIcon('reset')
					.setTooltip('Reset to default')
					.onClick(async () => {
						this.plugin.settings.placeholderText = DEFAULT_SETTINGS.placeholderText;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		new Setting(containerEl)
			.setName('Enable Logging')
			.setDesc('Log detection and processing events to console')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableLogging)
				.onChange(async (value) => {
					this.plugin.settings.enableLogging = value;
					await this.plugin.saveSettings();
				}));
				
		containerEl.createEl('h3', {text: 'How to Use'});
		const usageEl = containerEl.createEl('div', {cls: 'ematrix-usage'});
		usageEl.createEl('p', {text: 'Add the tag #ematrix to any note to have its content replaced with the placeholder text above.'});
		usageEl.createEl('p', {text: 'The plugin processes notes when:'});
		
		const usageList = usageEl.createEl('ul');
		usageList.createEl('li', {text: 'A note is opened'});
		usageList.createEl('li', {text: 'A note is modified'});
		usageList.createEl('li', {text: 'The "Process Current File with EMatrix" command is run'});
	}
}