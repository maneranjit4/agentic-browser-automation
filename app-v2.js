// ===================================
// Configuration & State Management
// ===================================
const CONFIG = {
    apiEndpoint: 'http://localhost:8001',
    autoApprove: false,
    showTimestamps: true,
    theme: 'light'
};

const STATE = {
    messages: [],
    currentPlan: null,
    currentStepIndex: 0,
    toolExecutions: [],
    isProcessing: false,
    sessionId: null,
    latestScreenshot: null
};

// ===================================
// DOM Elements
// ===================================
const elements = {
    // Chat
    chatMessages: document.getElementById('chatMessages'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    clearChat: document.getElementById('clearChat'),
    themeToggle: document.getElementById('themeToggle'),
    statusIndicator: document.getElementById('statusIndicator'),

    // Browser
    browserContent: document.getElementById('browserContent'),
    refreshBrowser: document.getElementById('refreshBrowser'),
    fitToScreen: document.getElementById('fitToScreen'),

    // Settings
    settingsBtn: document.getElementById('settingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    closeSettings: document.getElementById('closeSettings'),
    cancelSettings: document.getElementById('cancelSettings'),
    saveSettings: document.getElementById('saveSettings'),
    apiEndpoint: document.getElementById('apiEndpoint'),
    autoApprove: document.getElementById('autoApprove'),
    showTimestamps: document.getElementById('showTimestamps'),

    // Pinned Plan
    pinnedPlanContainer: document.getElementById('pinnedPlanContainer'),
    pinnedPlanHeader: document.getElementById('pinnedPlanHeader'),
    pinnedPlanBody: document.getElementById('pinnedPlanBody'),
    togglePinnedPlan: document.getElementById('togglePinnedPlan'),
    planBadge: document.getElementById('planBadge'),

    // Other
    attachBtn: document.getElementById('attachBtn')
};

// ===================================
// Initialization
// ===================================
function init() {
    loadSettings();
    setupEventListeners();
    initializeSession();

    // Auto-resize textarea
    elements.messageInput.addEventListener('input', autoResizeTextarea);
}

function loadSettings() {
    const saved = localStorage.getItem('agenticFlowSettings');
    if (saved) {
        const settings = JSON.parse(saved);
        CONFIG.apiEndpoint = settings.apiEndpoint || CONFIG.apiEndpoint;
        CONFIG.autoApprove = settings.autoApprove || false;
        CONFIG.showTimestamps = settings.showTimestamps !== false;
        CONFIG.theme = settings.theme || 'light';
    }

    // Apply theme
    applyTheme(CONFIG.theme);

    // Update UI
    elements.apiEndpoint.value = CONFIG.apiEndpoint;
    elements.autoApprove.checked = CONFIG.autoApprove;
    elements.showTimestamps.checked = CONFIG.showTimestamps;
}

function applyTheme(theme) {
    const html = document.documentElement;
    const moonIcon = elements.themeToggle.querySelector('.moon-icon');
    const sunIcon = elements.themeToggle.querySelector('.sun-icon');

    if (theme === 'dark') {
        html.setAttribute('data-theme', 'dark');
        moonIcon.classList.add('hidden');
        sunIcon.classList.remove('hidden');
    } else {
        html.removeAttribute('data-theme');
        moonIcon.classList.remove('hidden');
        sunIcon.classList.add('hidden');
    }
}

function toggleTheme() {
    CONFIG.theme = CONFIG.theme === 'light' ? 'dark' : 'light';
    applyTheme(CONFIG.theme);
    saveSettings();
}

function saveSettings() {
    CONFIG.apiEndpoint = elements.apiEndpoint.value;
    CONFIG.autoApprove = elements.autoApprove.checked;
    CONFIG.showTimestamps = elements.showTimestamps.checked;
    // Theme is saved immediately on toggle, but we include it here too

    localStorage.setItem('agenticFlowSettings', JSON.stringify(CONFIG));
    closeModal();
    showNotification('Settings saved successfully', 'success');
}

function initializeSession() {
    STATE.sessionId = generateSessionId();
    console.log('Session initialized:', STATE.sessionId);
}

function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ===================================
// Event Listeners
// ===================================
function setupEventListeners() {
    // Chat
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    elements.clearChat.addEventListener('click', clearChat);
    elements.themeToggle.addEventListener('click', toggleTheme);

    // Browser
    elements.refreshBrowser.addEventListener('click', refreshBrowserView);
    elements.fitToScreen.addEventListener('click', fitBrowserToScreen);

    // Settings
    elements.settingsBtn.addEventListener('click', openModal);
    elements.closeSettings.addEventListener('click', closeModal);
    elements.cancelSettings.addEventListener('click', closeModal);
    elements.saveSettings.addEventListener('click', saveSettings);

    // Close modal on background click
    elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) {
            closeModal();
        }
    });

    // Pinned Plan
    elements.pinnedPlanHeader.addEventListener('click', togglePinnedPlan);
    elements.togglePinnedPlan.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePinnedPlan();
    });
}

// ===================================
// Chat Functions
// ===================================
async function sendMessage() {
    const message = elements.messageInput.value.trim();
    if (!message || STATE.isProcessing) return;

    // Add user message to UI
    addUserMessage(message);
    elements.messageInput.value = '';
    autoResizeTextarea();

    // Update status
    setStatus('processing', 'Processing...');
    STATE.isProcessing = true;
    elements.sendBtn.disabled = true;

    // Show typing indicator
    const typingId = addTypingIndicator();

    try {
        // Send to backend
        const response = await fetch(`${CONFIG.apiEndpoint}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                session_id: STATE.sessionId
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const event = JSON.parse(data);
                        handleStreamEvent(event);
                    } catch (e) {
                        console.error('Error parsing event:', e);
                    }
                }
            }
        }

    } catch (error) {
        console.error('Error sending message:', error);
        removeTypingIndicator(typingId);
        addAssistantMessage(`Error: ${error.message}`, 'error');
        showNotification('Failed to send message', 'error');
    } finally {
        STATE.isProcessing = false;
        elements.sendBtn.disabled = false;
        setStatus('ready', 'Ready');
    }
}

function handleStreamEvent(event) {
    console.log('Stream event:', event);

    switch (event.type) {
        case 'plan':
            handlePlanEvent(event.data);
            break;
        case 'tool_start':
            handleToolStart(event.data);
            break;
        case 'tool_end':
            handleToolEnd(event.data);
            break;
        case 'screenshot':
            handleScreenshotEvent(event.data);
            break;
        case 'approval':
            handleApprovalEvent(event.data);
            break;
        case 'message':
            handleMessageEvent(event.data);
            break;
        case 'error':
            handleErrorEvent(event.data);
            break;
        default:
            console.log('Unknown event type:', event.type);
    }
}

function handlePlanEvent(data) {
    removeLastTypingIndicator();

    // Check if this is a new plan or just a status update
    const isNewPlan = !STATE.currentPlan ||
        STATE.currentPlan.steps.length !== data.steps.length ||
        !STATE.currentPlan.steps.every((s, i) =>
            (s.description || s.content || s.title) ===
            (data.steps[i].description || data.steps[i].content || data.steps[i].title)
        );

    if (isNewPlan) {
        // This is a brand new plan, do a full render
        STATE.currentPlan = data;
        STATE.currentStepIndex = 0;
        setPinnedPlan(data);

        // If auto-approve is enabled, automatically approve the plan
        if (CONFIG.autoApprove) {
            setTimeout(() => approvePlan(), 1000);
        }
    } else {
        // This is just a status update, only update the statuses
        STATE.currentPlan = data;

        // Update each step's status individually
        data.steps.forEach((step, index) => {
            const currentStepEl = document.getElementById(`step-${index}`);
            if (currentStepEl) {
                const newStatus = step.status || 'pending';
                const statusClass = newStatus.toLowerCase().replace('_', '-');

                // Update the main container class
                // Remove old status classes first
                currentStepEl.classList.remove('pending', 'in-progress', 'running', 'completed', 'success', 'failed');
                currentStepEl.classList.add(statusClass);

                // Update the icon
                const iconContainer = currentStepEl.querySelector('.step-icon');
                if (iconContainer) {
                    // Update icon container class
                    iconContainer.className = `step-icon ${statusClass}`;

                    // Update icon content
                    if (statusClass === 'completed' || statusClass === 'success') {
                        iconContainer.innerHTML = `
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>`;
                    } else if (statusClass === 'in-progress' || statusClass === 'running') {
                        iconContainer.innerHTML = `<div class="blinking-dot"></div>`;
                    } else {
                        iconContainer.innerHTML = ``;
                    }
                }
            }
        });

        // Update progress bar
        updateProgressBar(data.steps);
    }
}


function setPinnedPlan(plan) {
    // Show container
    elements.pinnedPlanContainer.classList.remove('hidden');
    elements.pinnedPlanContainer.classList.remove('collapsed');

    // Update badge
    elements.planBadge.textContent = `${plan.steps.length} steps`;

    // Update progress bar
    updateProgressBar(plan.steps);

    // Render steps
    elements.pinnedPlanBody.innerHTML = plan.steps.map((step, index) => {
        const status = step.status || 'pending';
        const statusClass = status.toLowerCase().replace('_', '-'); // e.g. in_progress -> in-progress

        let iconHtml = '';
        if (statusClass === 'completed' || statusClass === 'success') {
            iconHtml = `<div class="step-icon completed">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            </div>`;
        } else if (statusClass === 'in-progress' || statusClass === 'running') {
            iconHtml = `<div class="step-icon in-progress">
                <div class="blinking-dot"></div>
            </div>`;
        } else {
            iconHtml = `<div class="step-icon pending"></div>`;
        }

        return `
        <div class="plan-step ${statusClass}" id="step-${index}">
            ${iconHtml}
            <div class="plan-step-text">${step.description || step.content || step.title}</div>
        </div>
    `}).join('');

    // Add actions if not all completed
    const allCompleted = plan.steps.every(s => s.status === 'completed' || s.status === 'success');
    if (!allCompleted) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'plan-actions';
        actionsDiv.innerHTML = `
            <button class="btn btn-secondary" onclick="rejectPlan()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                Reject
            </button>
            <button class="btn btn-primary" onclick="approvePlan()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                Approve & Execute
            </button>
        `;
        elements.pinnedPlanBody.appendChild(actionsDiv);
    }
}

function togglePinnedPlan() {
    elements.pinnedPlanContainer.classList.toggle('collapsed');
}

function handleToolStart(data) {
    addToolCard(data);
    updateStepStatus(STATE.currentStepIndex, 'running');
}

function handleToolEnd(data) {
    updateToolCard(data);

    if (data.error) {
        updateStepStatus(STATE.currentStepIndex, 'failed');
    } else {
        updateStepStatus(STATE.currentStepIndex, 'completed');
        STATE.currentStepIndex++;
    }

    // Update browser view if screenshot is available
    if (data.output && data.output.screenshot) {
        updateBrowserView(data.output.screenshot);
    }
}

function handleMessageEvent(data) {
    removeLastTypingIndicator();
    addAssistantMessage(data.content);
}

function handleErrorEvent(data) {
    removeLastTypingIndicator();
    addAssistantMessage(`Error: ${data.message}`, 'error');
    showNotification(data.message, 'error');
}

function handleScreenshotEvent(data) {
    if (data.url) {
        updateBrowserView(data.url);
    }
}

function handleApprovalEvent(data) {
    removeLastTypingIndicator();

    // Add the approval question to the chat with AI message styling
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant approval-message';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = 'AI';

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    bubble.innerHTML = `
        <div class="approval-question">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span>${data.question}</span>
        </div>
        <div class="approval-feedback">
            <textarea 
                class="approval-textarea" 
                placeholder="Optional: If Yes, Add instructions or ask a question..."
                rows="2"
            ></textarea>
        </div>
        <div class="approval-actions">
            <button class="btn btn-secondary" onclick="respondToApproval(false)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                No
            </button>
            <button class="btn btn-primary" onclick="respondToApproval(true)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                Yes
            </button>
        </div>
    `;

    messageContent.appendChild(bubble);

    if (CONFIG.showTimestamps) {
        const time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = new Date().toLocaleTimeString();
        messageContent.appendChild(time);
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(messageContent);

    elements.chatMessages.appendChild(messageDiv);
    scrollToBottom(elements.chatMessages);
}

async function respondToApproval(approved) {
    console.log('respondToApproval called with:', approved);

    // Get the approval message and feedback
    const approvalMessage = document.querySelector('.approval-message');
    const feedback = approvalMessage ? approvalMessage.querySelector('.approval-textarea')?.value.trim() : '';

    if (approvalMessage) {
        const buttons = approvalMessage.querySelectorAll('button');
        buttons.forEach(btn => btn.disabled = true);

        // Disable textarea
        const textarea = approvalMessage.querySelector('.approval-textarea');
        if (textarea) textarea.disabled = true;
    }

    // Send the approval response
    try {
        console.log('Sending approval to backend:', {
            session_id: STATE.sessionId,
            approved: approved,
            feedback: feedback
        });

        const response = await fetch(`${CONFIG.apiEndpoint}/approve-plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: STATE.sessionId,
                approved: approved,
                feedback: feedback
            })
        });

        const result = await response.json();
        console.log('Approval response:', result);

        // Update the UI to show the decision
        if (approvalMessage) {
            const actionsDiv = approvalMessage.querySelector('.approval-actions');
            const feedbackDiv = approvalMessage.querySelector('.approval-feedback');

            // Remove feedback textarea
            if (feedbackDiv) feedbackDiv.remove();

            // Show result
            actionsDiv.innerHTML = `<span class="approval-result ${approved ? 'approved' : 'rejected'}">${approved ? '✓ Received Further Instructions' : '✗ Stopped Execution'}</span>`;

            // If feedback was provided and approved, show it
            if (feedback && approved) {
                const feedbackNote = document.createElement('div');
                feedbackNote.className = 'approval-feedback-note';
                feedbackNote.textContent = `Additional instruction: "${feedback}"`;
                actionsDiv.parentElement.insertBefore(feedbackNote, actionsDiv);
            }
        }
    } catch (error) {
        console.error('Failed to send approval:', error);
        showNotification('Failed to send response', 'error');
    }
}



// ===================================
// Message Functions
// ===================================
function addUserMessage(content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = 'U';

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = content;

    messageContent.appendChild(bubble);

    if (CONFIG.showTimestamps) {
        const time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = new Date().toLocaleTimeString();
        messageContent.appendChild(time);
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(messageContent);

    // Remove welcome message if exists
    const welcome = elements.chatMessages.querySelector('.welcome-message');
    if (welcome) {
        welcome.remove();
    }

    elements.chatMessages.appendChild(messageDiv);
    scrollToBottom(elements.chatMessages);

    STATE.messages.push({ role: 'user', content, timestamp: Date.now() });
}

function addAssistantMessage(content, type = 'normal') {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = 'AI';

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = content;

    if (type === 'error') {
        bubble.style.borderColor = 'var(--error)';
    }

    messageContent.appendChild(bubble);

    if (CONFIG.showTimestamps) {
        const time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = new Date().toLocaleTimeString();
        messageContent.appendChild(time);
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(messageContent);

    elements.chatMessages.appendChild(messageDiv);
    scrollToBottom(elements.chatMessages);

    STATE.messages.push({ role: 'assistant', content, timestamp: Date.now() });
}

function addTypingIndicator() {
    const id = `typing-${Date.now()}`;
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    messageDiv.id = id;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = 'AI';

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    const typing = document.createElement('div');
    typing.className = 'typing-indicator';
    typing.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';

    bubble.appendChild(typing);
    messageContent.appendChild(bubble);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(messageContent);

    elements.chatMessages.appendChild(messageDiv);
    scrollToBottom(elements.chatMessages);

    return id;
}

function removeTypingIndicator(id) {
    const indicator = document.getElementById(id);
    if (indicator) {
        indicator.remove();
    }
}

function removeLastTypingIndicator() {
    const indicators = elements.chatMessages.querySelectorAll('.typing-indicator');
    if (indicators.length > 0) {
        indicators[indicators.length - 1].closest('.message').remove();
    }
}

function updateStepStatus(index, status) {
    const stepEl = document.getElementById(`step-${index}`);
    if (!stepEl) return;

    const statusEl = stepEl.querySelector('.plan-step-status');
    statusEl.className = `plan-step-status ${status}`;
    statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);

    // Update the current plan state
    if (STATE.currentPlan && STATE.currentPlan.steps[index]) {
        STATE.currentPlan.steps[index].status = status;
        // Update progress bar
        updateProgressBar(STATE.currentPlan.steps);
    }
}

function updateProgressBar(steps) {
    if (!steps || steps.length === 0) return;

    const completedSteps = steps.filter(s =>
        s.status === 'completed' || s.status === 'success'
    ).length;

    const percentage = (completedSteps / steps.length) * 100;

    const progressFill = document.getElementById('planProgressFill');
    if (progressFill) {
        progressFill.style.width = `${percentage}%`;
    }
}

async function approvePlan() {
    if (!STATE.currentPlan) return;

    try {
        const response = await fetch(`${CONFIG.apiEndpoint}/approve-plan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session_id: STATE.sessionId,
                approved: true
            })
        });

        if (!response.ok) {
            throw new Error('Failed to approve plan');
        }

        // Remove approval buttons
        const actions = elements.pinnedPlanBody.querySelector('.plan-actions');
        if (actions) {
            actions.remove();
        }

        showNotification('Plan approved and executing', 'success');

    } catch (error) {
        console.error('Error approving plan:', error);
        showNotification('Failed to approve plan', 'error');
    }
}

async function rejectPlan() {
    if (!STATE.currentPlan) return;

    try {
        const response = await fetch(`${CONFIG.apiEndpoint}/approve-plan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session_id: STATE.sessionId,
                approved: false
            })
        });

        if (!response.ok) {
            throw new Error('Failed to reject plan');
        }

        // Hide pinned plan
        elements.pinnedPlanContainer.classList.add('hidden');
        STATE.currentPlan = null;

        addAssistantMessage('Plan rejected. Please provide new instructions.');
        showNotification('Plan rejected', 'info');

    } catch (error) {
        console.error('Error rejecting plan:', error);
        showNotification('Failed to reject plan', 'error');
    }
}

// ===================================
// Tool Card Functions
// ===================================
function addToolCard(data) {
    const toolId = `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const toolCard = document.createElement('div');
    toolCard.className = 'tool-card collapsed'; // Default collapsed
    toolCard.id = toolId;

    toolCard.innerHTML = `
        <div class="tool-card-header" onclick="toggleToolCard('${toolId}')">
            <div class="tool-card-info">
                <div class="tool-card-icon">${getToolIcon(data.tool_name)}</div>
                <div class="tool-card-details">
                    <div class="tool-card-name">${data.tool_name}</div>
                    <div class="tool-card-status running">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 6v6l4 2"/>
                        </svg>
                        Running
                    </div>
                </div>
            </div>
            <button class="plan-card-toggle">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                </svg>
            </button>
        </div>
        <div class="tool-card-body">
            <div class="tool-section">
                <div class="tool-section-title">Input</div>
                <div class="tool-code">${JSON.stringify(data.input, null, 2)}</div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">Output</div>
                <div class="tool-code">Executing...</div>
            </div>
        </div>
    `;

    // Create a new assistant message for the tool
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = 'AI';

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.appendChild(toolCard);

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(messageContent);

    elements.chatMessages.appendChild(messageDiv);
    scrollToBottom(elements.chatMessages);

    STATE.toolExecutions.push({ id: toolId, data });
}

function updateToolCard(data) {
    const tool = STATE.toolExecutions.find(t => t.data.tool_name === data.tool_name);
    if (!tool) return;

    const toolCard = document.getElementById(tool.id);
    if (!toolCard) return;

    // Update status
    const statusEl = toolCard.querySelector('.tool-card-status');
    const success = !data.error;
    statusEl.className = `tool-card-status ${success ? 'completed' : 'failed'}`;
    statusEl.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${success
            ? '<polyline points="20 6 9 17 4 12"/>'
            : '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'}
        </svg>
        ${success ? 'Completed' : 'Failed'}
    `;

    // Update output
    const outputEl = toolCard.querySelector('.tool-section:last-child .tool-code');
    if (data.error) {
        outputEl.textContent = `Error: ${data.error}`;
        outputEl.style.color = 'var(--error)';
    } else {
        outputEl.textContent = JSON.stringify(data.output, null, 2);
    }
}

function toggleToolCard(toolId) {
    const toolCard = document.getElementById(toolId);
    if (toolCard) {
        toolCard.classList.toggle('collapsed');
    }
}

function getToolIcon(toolName) {
    const icons = {
        'browser': '🌐',
        'click': '👆',
        'type': '⌨️',
        'screenshot': '📸',
        'navigate': '🧭',
        'search': '🔍',
        'scroll': '📜'
    };

    for (const [key, icon] of Object.entries(icons)) {
        if (toolName.toLowerCase().includes(key)) {
            return icon;
        }
    }

    return '🔧';
}

// ===================================
// Browser View Functions
// ===================================
function updateBrowserView(screenshot) {
    STATE.latestScreenshot = screenshot;

    elements.browserContent.innerHTML = `
        <img src="${screenshot}" alt="Browser Screenshot" class="browser-screenshot" />
    `;
}

function refreshBrowserView() {
    if (STATE.latestScreenshot) {
        updateBrowserView(STATE.latestScreenshot);
        showNotification('Browser view refreshed', 'success');
    }
}

function fitBrowserToScreen() {
    const img = elements.browserContent.querySelector('.browser-screenshot');
    if (img) {
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.width = 'auto';
        img.style.height = 'auto';
    }
}

// ===================================
// UI Helper Functions
// ===================================
function setStatus(type, text) {
    elements.statusIndicator.className = `status-indicator ${type}`;
    elements.statusIndicator.querySelector('.status-text').textContent = text;
}

function autoResizeTextarea() {
    const textarea = elements.messageInput;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

function scrollToBottom(element) {
    setTimeout(() => {
        element.scrollTop = element.scrollHeight;
    }, 100);
}

function openModal() {
    elements.settingsModal.classList.remove('hidden');
}

function closeModal() {
    elements.settingsModal.classList.add('hidden');
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--bg-elevated);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        padding: 1rem 1.5rem;
        box-shadow: var(--shadow-xl);
        z-index: 3000;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        animation: slideIn 0.3s ease-out;
        max-width: 400px;
    `;

    const colors = {
        success: 'var(--success)',
        error: 'var(--error)',
        warning: 'var(--warning)',
        info: 'var(--info)'
    };

    notification.innerHTML = `
        <div style="width: 4px; height: 40px; background: ${colors[type]}; border-radius: 2px;"></div>
        <div style="flex: 1; color: var(--text-primary);">${message}</div>
        <button onclick="this.parentElement.remove()" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 0.25rem;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

function clearChat() {
    if (!confirm('Are you sure you want to clear the chat?')) return;

    STATE.messages = [];
    STATE.currentPlan = null;
    STATE.toolExecutions = [];
    STATE.latestScreenshot = null;

    elements.chatMessages.innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
            </div>
            <h2>Welcome to Agentic Flow</h2>
            <p>I'm your AI assistant with Playwright browser automation. I can browse the web, interact with pages, and execute complex workflows with your approval.</p>
            <div class="welcome-features">
                <div class="feature">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                    </svg>
                    <span>Plan Generation & Approval</span>
                </div>
                <div class="feature">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M16 12l-4-4-4 4M12 8v8"/>
                    </svg>
                    <span>Playwright Browser Control</span>
                </div>
                <div class="feature">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                    </svg>
                    <span>Real-time Execution</span>
                </div>
            </div>
        </div>
    `;

    elements.browserContent.innerHTML = `
        <div class="browser-empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                <circle cx="12" cy="12" r="10"/>
                <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
            </svg>
            <p>No browser session</p>
            <span>Browser view will appear here during automation</span>
        </div>
    `;

    showNotification('Chat cleared', 'success');
}

// ===================================
// Initialize on page load
// ===================================
document.addEventListener('DOMContentLoaded', init);

// Make functions globally accessible
window.togglePinnedPlan = togglePinnedPlan;
window.toggleToolCard = toggleToolCard;
window.approvePlan = approvePlan;
window.rejectPlan = rejectPlan;
window.respondToApproval = respondToApproval;
