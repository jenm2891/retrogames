document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    const userStatus = document.getElementById('user-status');

    // --- State ---
    let userId = null;
    let userName = null;

    // --- Functions ---
    
    function addMessageToUI(sender, text) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('message-wrapper', `${sender}-message`);
        
        const message = document.createElement('div');
        message.classList.add('message');
        message.textContent = text;
        
        wrapper.appendChild(message);
        chatWindow.prepend(wrapper); // Prepend to add new messages at the top, which appears as bottom due to flex-direction
    }

    async function loadChatHistory() {
        if (!userId) return;
        
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'load', userId: userId }),
            });

            if (!response.ok) throw new Error('Failed to load chat history.');
            
            const { history } = await response.json();
            
            chatWindow.innerHTML = ''; // Clear window
            if(history && history.length > 0) {
                history.forEach(msg => addMessageToUI(msg.role, msg.text));
            } else {
                 addMessageToUI('ai', `Hello ${userName}! It's great to meet you. What's on your mind today?`);
            }
        } catch (error) {
            console.error("Error loading chat:", error);
            addMessageToUI('ai', "I'm having trouble remembering our past chats. Let's start fresh!");
        }
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        const userMessage = chatInput.value.trim();
        if (!userMessage || !userId) return;

        addMessageToUI('user', userMessage);
        chatInput.value = '';
        chatInput.disabled = true;
        sendButton.disabled = true;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'send', userId: userId, message: userMessage }),
            });
            if (!response.ok) throw new Error('Failed to get AI response.');
            
            const { reply } = await response.json();
            addMessageToUI('ai', reply);
            
        } catch (error) {
            console.error("Error sending message:", error);
            addMessageToUI('ai', "Sorry, I'm having a bit of trouble connecting right now.");
        } finally {
            chatInput.disabled = false;
            sendButton.disabled = false;
            chatInput.focus();
        }
    }

    // --- Initialization ---
    function initialize() {
        // In a real app, this would come from a proper login system.
        // For now, we'll simulate it with a prompt and store it in localStorage.
        userName = localStorage.getItem('chatbot_username');
        if (!userName) {
            userName = prompt("Welcome! To save your chat, please enter your name:");
            if (userName) {
                localStorage.setItem('chatbot_username', userName);
            }
        }

        if (userName) {
            userId = 'user_' + userName.toLowerCase().replace(/\s+/g, '_'); // Create a simple user ID
            userStatus.textContent = `Logged in as: ${userName}`;
            chatInput.disabled = false;
            sendButton.disabled = false;
            loadChatHistory();
        } else {
            userStatus.textContent = 'Please provide a name to start chatting.';
            addMessageToUI('ai', "Hello! Please refresh the page and enter a name so I can get to know you.");
        }
        
        chatForm.addEventListener('submit', handleFormSubmit);
    }

    initialize();
});
