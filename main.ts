import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, MarkdownView, Editor, debounce } from 'obsidian';

interface EMatrixSettings {
	mySetting: string;
	placeholderText: string;
	enableLogging: boolean;
	showEisenhowerMatrix: boolean;
	debounceInterval: number;
}

const DEFAULT_SETTINGS: EMatrixSettings = {
	mySetting: 'default',
	placeholderText: 'This note has been processed by EMatrix.',
	enableLogging: true,
	showEisenhowerMatrix: true,
	debounceInterval: 5000 // 5 seconds - much longer to prevent interrupting editing
}

export default class EMatrixPlugin extends Plugin {
	settings: EMatrixSettings;
	debouncedProcessFile: (file: TFile) => void;

	async onload() {
		console.log('Initializing EMatrix plugin');
		
		try {
			await this.loadSettings();
			
			console.log('EMatrix plugin loaded successfully');
			new Notice('EMatrix plugin loaded successfully - DEBUG MODE');
			
			// Force logging on for debugging
			this.settings.enableLogging = true;
			await this.saveSettings();
			
			// Create a debounced version of processFile that's more responsive for testing
			this.debouncedProcessFile = debounce(
				(file: TFile) => {
					console.log("EMatrix DEBUG: Debounced process triggering for file:", file.path);
					this.processFile(file);
				},
				3000, // Use 3 seconds for testing
				true
			);

			// Register event to detect file open 
			this.registerEvent(
				this.app.workspace.on('file-open', (file) => {
					if (file instanceof TFile && file.extension === 'md') {
						console.log("EMatrix DEBUG: File opened:", file.path);
						// Check if the file has #ematrix tag first
						this.app.vault.read(file).then(content => {
							if (content.includes('#ematrix') && 
							   !content.includes('```eisenhower-matrix')) {
								// Only process on open if it hasn't been processed yet
								this.processFile(file);
							}
						});
					}
				})
			);

			// Register special handler for when user clicks outside of editor
			this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
				// Check if we have an active markdown view
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView) {
					// Process after user clicks somewhere else
					console.log("EMatrix DEBUG: Document click detected, processing after delay");
					setTimeout(() => {
						const activeFile = this.app.workspace.getActiveFile();
						if (activeFile && activeFile.extension === 'md') {
							this.processFile(activeFile);
						}
					}, 500); // Short delay to let any other changes settle
				}
			});

			// Register event to detect content change
			this.registerEvent(
				this.app.vault.on('modify', (file) => {
					if (file instanceof TFile && file.extension === 'md') {
						console.log("EMatrix DEBUG: File modified:", file.path);
						// Use heavily debounced processing
						this.debouncedProcessFile(file);
					}
				})
			);

			// Add a command to process the current file - no debounce needed for manual trigger
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
			
			// Add a debug command to force process the current file
			this.addCommand({
				id: 'force-process-ematrix',
				name: 'DEBUG: Force Process with EMatrix',
				callback: () => {
					const activeFile = this.app.workspace.getActiveFile();
					if (activeFile && activeFile.extension === 'md') {
						console.log(`EMatrix DEBUG: Forcing processing on file ${activeFile.path}`);
						new Notice(`Forcing EMatrix processing on: ${activeFile.name}`);
						this.processFile(activeFile);
					} else {
						new Notice('No markdown file is currently open');
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
			console.log(`EMatrix DEBUG: Starting processing for file: ${file.path}`);
			
			// Read the file content
			const content = await this.app.vault.read(file);
			
			// Check if the content contains #ematrix
			if (content.includes('#ematrix')) {
				console.log(`EMatrix DEBUG: Detected #ematrix tag in file: ${file.path}`);
				
				// Check if already processed to avoid redundant processing
				const isAlreadyProcessed = content.includes('```eisenhower-matrix') && 
										  content.includes('<div class="ematrix-container">');
				
				// Skip if the file is too small - likely still being created
				const isTooSmall = content.length < 50;
				
				if (isAlreadyProcessed && !content.includes('- [ ]') && !content.includes('- [x]')) {
					console.log(`EMatrix DEBUG: File appears to be already processed without new tasks. Skipping.`);
					return;
				}
				
				if (isTooSmall) {
					console.log(`EMatrix DEBUG: File is too small, might be in creation. Skipping.`);
					return;
				}
				
				// Extract tasks from the content
				const tasks = this.extractTasksFromContent(content);
				
				console.log(`EMatrix DEBUG: Extracted ${tasks.length} tasks from file: ${file.path}`);
				
				// Skip if no tasks found
				if (tasks.length === 0) {
					console.log(`EMatrix DEBUG: No tasks found in file. Skipping.`);
					return;
				}
				
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
					console.log(`EMatrix DEBUG: File is open in editor. Will update it.`);
					
					// Check if we should skip processing by seeing if any editor is focused
					const allEditors = document.querySelectorAll('.cm-editor');
					let hasFocusedEditor = false;
					allEditors.forEach(editorEl => {
						if (editorEl.contains(document.activeElement)) {
							hasFocusedEditor = true;
						}
					});
					
					if (hasFocusedEditor) {
						console.log(`EMatrix DEBUG: Editor has focus, skipping to avoid disrupting user.`);
						return;
					}
					
					new Notice(`EMatrix processing: ${file.name}`);
					editor.setValue(replacementContent);
					
					// Try to restore cursor position to a reasonable place
					try {
						// Set cursor to a reasonable position - near a task if possible
						editor.setCursor({ line: 20, ch: 0 });
					} catch (err) {
						console.log(`EMatrix DEBUG: Error setting cursor:`, err);
					}
					
					console.log(`EMatrix DEBUG: Replaced content in open file: ${file.path}`);
				} else {
					// If the file is not being edited, we can directly modify it
					console.log(`EMatrix DEBUG: File is not open. Will modify directly.`);
					
					new Notice(`EMatrix processing: ${file.name}`);
					await this.app.vault.modify(file, replacementContent);
					console.log(`EMatrix DEBUG: Replaced content in file: ${file.path}`);
				}
			} else {
				console.log(`EMatrix DEBUG: File does not contain #ematrix tag: ${file.path}`);
			}
		} catch (error) {
			console.error(`EMatrix DEBUG: Error processing file ${file.path}:`, error);
		}
	}
	
	/**
	 * Checks if the user is in the process of adding tasks
	 * by comparing the number of tasks in current and replacement content
	 */
	isAddingTasks(currentContent: string, replacementContent: string): boolean {
		// Count number of tasks in both contents
		const countTasks = (content: string) => {
			return (content.match(/- \[[ x]\]/g) || []).length;
		};
		
		const currentTasks = countTasks(currentContent);
		const replacementTasks = countTasks(replacementContent);
		
		// If the current content has more tasks than would be in the replacement,
		// the user might be in the process of adding tasks
		return currentTasks > replacementTasks;
	}
	
	/**
	 * Checks if the user is currently typing a tag
	 * This includes any tag, not just #ematrix
	 */
	isTypingTag(lineText: string, cursorPosition: number): boolean {
		// Get the text up to the cursor
		const textBeforeCursor = lineText.substring(0, cursorPosition);
		
		// Find the last # character before the cursor
		const lastHashIndex = textBeforeCursor.lastIndexOf('#');
		
		// If there's no # or it's at the cursor position, not typing a tag
		if (lastHashIndex === -1 || lastHashIndex === cursorPosition - 1) {
			return false;
		}
		
		// Extract the potential tag
		const potentialTag = textBeforeCursor.substring(lastHashIndex);
		
		// Check if it looks like a tag (# followed by letters)
		// and doesn't contain a space (which would indicate the tag is complete)
		return /^#[a-zA-Z]*$/.test(potentialTag);
	}
	
	/**
	 * Checks if the user is editing tags in nearby lines
	 * Looks at a few lines before and after the cursor
	 */
	isEditingTagsNearby(editor: Editor, cursorPos: {line: number, ch: number}): boolean {
		const lineCount = editor.lineCount();
		const startLine = Math.max(0, cursorPos.line - 2);
		const endLine = Math.min(lineCount - 1, cursorPos.line + 2);
		
		// Check for task items with tags being edited
		for (let i = startLine; i <= endLine; i++) {
			const lineText = editor.getLine(i);
			
			// If this is a task item line
			if (lineText.trim().startsWith('- [')) {
				// Check for partially typed tags like #ur, #imp, etc.
				// We're looking for something that looks like a tag in progress
				const matches = lineText.match(/#[a-zA-Z]{1,6}(?!\w)/g);
				
				if (matches && matches.length > 0) {
					// If we find short tags that might be incomplete, assume user is still typing
					for (const match of matches) {
						// Check for common tag prefixes
						if (match.startsWith('#ur') || 
							match.startsWith('#im') || 
							match.startsWith('#la') || 
							match.startsWith('#em')) {
							return true;
						}
					}
				}
			}
		}
		
		return false;
	}
	
	extractTasksFromContent(content: string): string[] {
		const lines = content.split('\n');
		const tasks: string[] = [];
		
		// Track indentation level to identify top-level tasks
		let inList = false;
		let previousIndent = 0;
		
		if (this.settings.enableLogging) {
			console.log("EMatrix: Starting task extraction");
		}
		
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
						if (this.settings.enableLogging) {
							console.log(`EMatrix: Extracted task: "${taskContent}"`);
						}
					} 
					// Only consider this a top-level task if the indentation is 0
					// or if this is not within a list
					else if (!inList) {
						tasks.push(taskContent);
						inList = true;
						previousIndent = indentation;
						if (this.settings.enableLogging) {
							console.log(`EMatrix: Extracted task: "${taskContent}"`);
						}
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
		
		if (this.settings.enableLogging) {
			console.log(`EMatrix: Extracted ${tasks.length} tasks total`);
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
		
		if (this.settings.enableLogging) {
			console.log("EMatrix: Categorizing tasks into matrix quadrants");
		}
		
		// More robust categorization based on keywords
		tasks.forEach(task => {
			const taskLower = task.toLowerCase();
			
			// Use more robust tag detection
			const hasUrgentTag = /#urgent\b/i.test(task);
			const hasImportantTag = /#important\b/i.test(task);
			const hasLaterTag = /#later\b/i.test(task);
			
			// Clean the task text by removing all tags
			let cleanTask = task.replace(/#[a-zA-Z0-9_-]+\b/g, '').trim();
			
			if (this.settings.enableLogging) {
				console.log(`EMatrix: Processing task "${task}"`);
				console.log(`  - Urgent: ${hasUrgentTag}, Important: ${hasImportantTag}, Later: ${hasLaterTag}`);
				console.log(`  - Clean task: "${cleanTask}"`);
			}
			
			if (hasUrgentTag && hasImportantTag) {
				urgentImportant.push(cleanTask);
				if (this.settings.enableLogging) {
					console.log(`  - Categorized as: Urgent & Important`);
				}
			} else if (hasImportantTag) {
				notUrgentImportant.push(cleanTask);
				if (this.settings.enableLogging) {
					console.log(`  - Categorized as: Important (not urgent)`);
				}
			} else if (hasUrgentTag) {
				urgentNotImportant.push(cleanTask);
				if (this.settings.enableLogging) {
					console.log(`  - Categorized as: Urgent (not important)`);
				}
			} else if (hasLaterTag) {
				notUrgentNotImportant.push(cleanTask);
				if (this.settings.enableLogging) {
					console.log(`  - Categorized as: Later (not urgent, not important)`);
				}
			} else {
				backlog.push(cleanTask);
				if (this.settings.enableLogging) {
					console.log(`  - Categorized as: Backlog (no tags)`);
				}
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
				
		new Setting(containerEl)
			.setName('Debounce Interval')
			.setDesc('The time (in milliseconds) to wait after typing before processing the note. Higher values reduce processing during typing but increase delay.')
			.addSlider(slider => slider
				.setLimits(3000, 10000, 1000)
				.setValue(this.plugin.settings.debounceInterval)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.debounceInterval = value;
					
					// Update the debounced function with the new interval
					this.plugin.debouncedProcessFile = debounce(
						(file: TFile) => {
							this.plugin.processFile(file);
						},
						this.plugin.settings.debounceInterval,
						true
					);
					
					await this.plugin.saveSettings();
				}))
			.addExtraButton(button => {
				button
					.setIcon('reset')
					.setTooltip('Reset to default (2000ms)')
					.onClick(async () => {
						this.plugin.settings.debounceInterval = DEFAULT_SETTINGS.debounceInterval;
						
						// Update the debounced function with the default interval
						this.plugin.debouncedProcessFile = debounce(
							(file: TFile) => {
								this.plugin.processFile(file);
							},
							this.plugin.settings.debounceInterval,
							true
						);
						
						await this.plugin.saveSettings();
						this.display();
					});
			});
				
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