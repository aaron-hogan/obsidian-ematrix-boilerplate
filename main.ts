import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, MarkdownView, Editor } from 'obsidian';

interface EMatrixSettings {
	mySetting: string;
	placeholderText: string;
	enableLogging: boolean;
	showEisenhowerMatrix: boolean;
}

const DEFAULT_SETTINGS: EMatrixSettings = {
	mySetting: 'default',
	placeholderText: 'This note has been processed by EMatrix.',
	enableLogging: true,
	showEisenhowerMatrix: true
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
				
				// Extract tasks from the content
				const tasks = this.extractTasksFromContent(content);
				
				// Create the Eisenhower Matrix content
				let replacementContent;
				if (this.settings.showEisenhowerMatrix) {
					replacementContent = this.createEisenhowerMatrixContent(tasks, file.basename);
				} else {
					replacementContent = this.settings.placeholderText;
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
						editor.setValue(replacementContent);
					}
				} else {
					// If the file is not being edited, we can directly modify it
					new Notice(`EMatrix processing: ${file.name}`);
					await this.app.vault.modify(file, replacementContent);
				}
				
				if (this.settings.enableLogging) {
					console.log(`EMatrix: Replaced content in file: ${file.path}`);
				}
			}
		} catch (error) {
			console.error(`EMatrix: Error processing file ${file.path}:`, error);
		}
	}
	
	/**
	 * Extracts tasks from content string
	 */
	extractTasksFromContent(content: string): string[] {
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
				const isCompleted = taskMatch[2] === 'x';
				const taskContent = taskMatch[3].trim();
				
				// Only include incomplete tasks
				if (!isCompleted) {
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
		
		return tasks;
	}
	
	/**
	 * Creates Eisenhower Matrix content with tasks
	 */
	createEisenhowerMatrixContent(tasks: string[], title: string): string {
		// Categorize tasks
		const urgentImportant: string[] = [];
		const notUrgentImportant: string[] = [];
		const urgentNotImportant: string[] = [];
		const notUrgentNotImportant: string[] = [];
		const backlog: string[] = [];
		
		// Simple categorization based on keywords
		tasks.forEach(task => {
			const taskLower = task.toLowerCase();
			
			if (taskLower.includes('#urgent') && taskLower.includes('#important')) {
				urgentImportant.push(task.replace(/#urgent|#important/gi, '').trim());
			} else if (taskLower.includes('#important')) {
				notUrgentImportant.push(task.replace(/#important/gi, '').trim());
			} else if (taskLower.includes('#urgent')) {
				urgentNotImportant.push(task.replace(/#urgent/gi, '').trim());
			} else if (taskLower.includes('#later')) {
				notUrgentNotImportant.push(task.replace(/#later/gi, '').trim());
			} else {
				backlog.push(task);
			}
		});
		
		// Create task list HTML for a quadrant
		const createTaskList = (tasks: string[], emptyMessage: string) => {
			if (tasks.length === 0) {
				return `<p class="empty-message">${emptyMessage}</p>`;
			}
			
			return `<ul>${tasks.map(task => `<li>- [ ] ${task}</li>`).join('')}</ul>`;
		};
		
		// Return the Markdown content with HTML for the Eisenhower Matrix
		return `# ${title} - Eisenhower Matrix

\`\`\`eisenhower-matrix
## Eisenhower Matrix
\`\`\`

<div class="ematrix-container">
  <div class="ematrix-header">
    <div class="ematrix-header-empty"></div>
    <div class="ematrix-header-urgent">Urgent</div>
    <div class="ematrix-header-not-urgent">Not Urgent</div>
  </div>
  
  <div class="ematrix-row">
    <div class="ematrix-row-header">Important</div>
    <div class="ematrix-quadrant urgent-important">
      <h3>Do First</h3>
      ${createTaskList(urgentImportant, 'No urgent and important tasks')}
    </div>
    <div class="ematrix-quadrant not-urgent-important">
      <h3>Schedule</h3>
      ${createTaskList(notUrgentImportant, 'No important tasks to schedule')}
    </div>
  </div>
  
  <div class="ematrix-row">
    <div class="ematrix-row-header">Not Important</div>
    <div class="ematrix-quadrant urgent-not-important">
      <h3>Delegate</h3>
      ${createTaskList(urgentNotImportant, 'No tasks to delegate')}
    </div>
    <div class="ematrix-quadrant not-urgent-not-important">
      <h3>Eliminate</h3>
      ${createTaskList(notUrgentNotImportant, 'No tasks to eliminate')}
    </div>
  </div>
</div>

## Backlog

${backlog.map(task => `- [ ] ${task}`).join('\n')}

<div class="ematrix-instructions">
  <h3>Task Organization</h3>
  <p>Use the following tags to organize tasks in the matrix:</p>
  <ul>
    <li><strong>#urgent #important</strong> - Do First quadrant</li>
    <li><strong>#important</strong> - Schedule quadrant</li>
    <li><strong>#urgent</strong> - Delegate quadrant</li>
    <li><strong>#later</strong> - Eliminate quadrant</li>
    <li>No tags - Tasks appear in Backlog</li>
  </ul>
</div>

<!-- #ematrix -->`;
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
			.setName('Show Eisenhower Matrix')
			.setDesc('Display tasks in an Eisenhower Matrix when #ematrix tag is present')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showEisenhowerMatrix)
				.onChange(async (value) => {
					this.plugin.settings.showEisenhowerMatrix = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Placeholder Text')
			.setDesc('Text to replace note content when #ematrix is detected and Eisenhower Matrix is disabled')
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
		usageEl.createEl('p', {text: 'Add the tag #ematrix to any note to have its content replaced with an Eisenhower Matrix of your tasks.'});
		usageEl.createEl('p', {text: 'The plugin processes notes when:'});
		
		const usageList = usageEl.createEl('ul');
		usageList.createEl('li', {text: 'A note is opened'});
		usageList.createEl('li', {text: 'A note is modified'});
		usageList.createEl('li', {text: 'The "Process Current File with EMatrix" command is run'});
		
		containerEl.createEl('h3', {text: 'Eisenhower Matrix Task Organization'});
		const matrixUsageEl = containerEl.createEl('div', {cls: 'ematrix-usage'});
		matrixUsageEl.createEl('p', {text: 'Use the following tags to organize tasks in the matrix:'});
		
		const matrixUsageList = matrixUsageEl.createEl('ul');
		matrixUsageList.createEl('li', {text: '#urgent #important - "Do First" quadrant (urgent and important)'});
		matrixUsageList.createEl('li', {text: '#important - "Schedule" quadrant (not urgent but important)'});
		matrixUsageList.createEl('li', {text: '#urgent - "Delegate" quadrant (urgent but not important)'});
		matrixUsageList.createEl('li', {text: '#later - "Eliminate" quadrant (not urgent, not important)'});
		matrixUsageList.createEl('li', {text: 'No tags - Tasks appear in the Backlog section'});
	}
}