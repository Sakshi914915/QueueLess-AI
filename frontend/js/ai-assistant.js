/**
 * QueueLess AI: Floating AI Assistant Widget
 */

const initAIAssistant = (mode = 'customer') => {
  // Prevent duplicate insertion
  if (document.getElementById('ai-assistant-wrapper')) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'ai-assistant-wrapper';

  const user = window.AUTH ? window.AUTH.getUser() : null;
  const isAdmin = mode === 'admin' || user?.role === 'org_admin' || user?.role === 'super_admin';

  const quickChips = isAdmin
    ? [
        'How many customers were served today?',
        'Which service has the longest queue?',
        'Summarize today\'s performance'
      ]
    : [
        'What is my queue status?',
        'How much time will I have to wait?',
        'मेरी कतार स्थिति क्या है?'
      ];

  wrapper.innerHTML = `
    <!-- Floating Trigger Button -->
    <button class="ai-chat-btn" id="ai-chat-trigger" title="Ask QueueLess AI">
      <i class="bi bi-stars"></i>
    </button>

    <!-- Chat Window (Hidden initially) -->
    <div class="ai-chat-window d-none" id="ai-chat-window">
      <div class="ai-chat-header">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-robot fs-5 text-warning"></i>
          <div>
            <div class="fw-bold" style="font-size: 0.95rem;">QueueLess AI Assistant</div>
            <div style="font-size: 0.72rem; color: #94a3b8;">${isAdmin ? 'Executive Admin Analyst' : 'Live Queue & Token Guide'}</div>
          </div>
        </div>
        <button class="btn btn-sm text-white" id="ai-chat-close"><i class="bi bi-x-lg"></i></button>
      </div>

      <div class="ai-chat-messages" id="ai-chat-messages">
        <div class="ai-msg bot">
          Hello ${user ? user.full_name : 'there'}! I am your QueueLess AI assistant. How can I help you today?
        </div>
        <div class="d-flex flex-wrap gap-1 px-1" id="ai-quick-chips">
          ${quickChips.map(q => `<button class="btn btn-outline-secondary btn-sm rounded-pill chip-btn" style="font-size:0.75rem;" onclick="sendChipQuestion('${q}')">${q}</button>`).join('')}
        </div>
      </div>

      <div class="ai-chat-input-area">
        <input type="text" id="ai-chat-input" class="form-control form-control-sm" placeholder="Ask in English or हिन्दी..." />
        <button class="btn btn-primary btn-sm px-3" id="ai-chat-send"><i class="bi bi-send-fill"></i></button>
      </div>
    </div>
  `;

  document.body.appendChild(wrapper);

  const trigger = document.getElementById('ai-chat-trigger');
  const windowEl = document.getElementById('ai-chat-window');
  const closeBtn = document.getElementById('ai-chat-close');
  const inputEl = document.getElementById('ai-chat-input');
  const sendBtn = document.getElementById('ai-chat-send');
  const messagesEl = document.getElementById('ai-chat-messages');

  trigger.addEventListener('click', () => {
    windowEl.classList.toggle('d-none');
    if (!windowEl.classList.contains('d-none')) {
      inputEl.focus();
    }
  });

  closeBtn.addEventListener('click', () => {
    windowEl.classList.add('d-none');
  });

  const appendMsg = (text, sender = 'user') => {
    const msg = document.createElement('div');
    msg.className = `ai-msg ${sender}`;
    msg.innerHTML = text.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };

  const handleSend = async (customQuery = null) => {
    const text = customQuery || inputEl.value.trim();
    if (!text) return;

    if (!customQuery) inputEl.value = '';
    appendMsg(text, 'user');

    // Show typing loader
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'ai-msg bot typing-ind';
    typingIndicator.innerHTML = '<span class="spinner-grow spinner-grow-sm text-primary"></span> Analyzing live queue data...';
    messagesEl.appendChild(typingIndicator);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const endpoint = isAdmin ? '/ai/admin-assistant' : '/ai/queue-assistant';
      const lang = window.I18N ? window.I18N.getLanguage() : 'en';

      const res = await window.API.post(endpoint, {
        question: text,
        language: lang
      });

      typingIndicator.remove();
      if (res && res.data && res.data.reply) {
        appendMsg(res.data.reply, 'bot');
      } else {
        appendMsg('I could not process this question right now. Please try again.', 'bot');
      }
    } catch (err) {
      typingIndicator.remove();
      appendMsg(`Notice: ${err.message || 'Unable to connect to AI engine.'}`, 'bot');
    }
  };

  sendBtn.addEventListener('click', () => handleSend());
  inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSend();
  });

  window.sendChipQuestion = (q) => handleSend(q);
};

window.initAIAssistant = initAIAssistant;
