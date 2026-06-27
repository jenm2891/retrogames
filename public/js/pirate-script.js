document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const chatLog = document.getElementById('chat-log');
    const optionsContainer = document.getElementById('options-container');
    const sceneImageElement = document.getElementById('scene-image');
    const imagePlaceholder = document.querySelector('.image-placeholder');
    const loadingOverlay = document.getElementById('loading-overlay');

    // --- Secure API Configuration ---
    const workerProxyUrl = '/api/proxy';

    // --- Game State ---
    let dialogueHistory = []; 

    // --- Core Functions ---

    function showLoading(isLoading) {
        loadingOverlay.style.display = isLoading ? 'flex' : 'none';
    }

    function addMessage(text, sender) {
        const message = document.createElement('div');
        message.classList.add('message', `${sender}-message`);
        message.innerText = text;
        chatLog.appendChild(message);
        chatLog.scrollTop = chatLog.scrollHeight;
    }

    async function generateImage(prompt) {
        const fullPrompt = `Digital painting of a dramatic scene on a pirate ship, high seas. The scene shows: ${prompt}. Cinematic, detailed, fantasy art style.`;
        const destinationApi = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict';

        try {
            const response = await fetch(workerProxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Destination-Url': destinationApi
                },
                body: JSON.stringify({ instances: [{ prompt: fullPrompt }], parameters: { sampleCount: 1 } })
            });
            if (!response.ok) throw new Error(`Image API error: ${response.statusText}`);
            const result = await response.json();
            if (result.predictions && result.predictions[0]?.bytesBase64Encoded) {
                sceneImageElement.src = `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
                sceneImageElement.style.display = 'block';
                imagePlaceholder.style.display = 'none';
            }
        } catch (error) {
            console.error('Image Generation Error:', error);
            imagePlaceholder.textContent = "The sea fog is too thick...";
        }
    }

    function updateUI(dialogue, choices) {
        addMessage(dialogue, 'pirate');
        optionsContainer.innerHTML = '';

        if (choices && choices.length > 0) {
            choices.forEach(choiceText => {
                const button = document.createElement('button');
                button.classList.add('option-button');
                button.textContent = choiceText;
                button.onclick = () => handleChoice(choiceText);
                optionsContainer.appendChild(button);
            });
        } else {
            const button = document.createElement('button');
            button.classList.add('option-button');
            button.textContent = 'Play Again?';
            button.onclick = () => location.reload();
            optionsContainer.appendChild(button);
        }
    }

    async function getNextStep(playerChoiceText = null) {
        showLoading(true);

        if (playerChoiceText) {
            addMessage(playerChoiceText, 'player');
            dialogueHistory.push(`Stowaway: "${playerChoiceText}"`);
        }
        
        const systemPrompt = `You are the salty and cunning pirate captain, Blackheart. Your crew just found me, a stowaway, on your ship. Your goal is to decide my fate through negotiation. You MUST respond with a single JSON object with no other text. The JSON object must strictly follow this schema: { "dialogue": "What you say to the player.", "imagePrompt": "A short prompt for an image generator describing the scene on deck.", "choices": ["A clever choice for the player.", "A brave choice for the player.", "A foolish choice for the player."] }. When you decide the game is over, provide a final "dialogue", a final "imagePrompt", and an empty "choices" array.`;
        
        // **FIX:** Create a clean, simple history for each API call.
        const requestHistory = [];
        if (dialogueHistory.length === 0) {
            // First turn: Just send the system prompt.
            requestHistory.push({ role: "user", parts: [{ text: `${systemPrompt} Begin the negotiation.` }] });
        } else {
            // Subsequent turns: Provide the history as context.
            const context = `Here is the story so far:\n${dialogueHistory.join('\n')}\n\nBased on the last thing the stowaway said, continue the negotiation.`;
            requestHistory.push({ role: "user", parts: [{ text: `${systemPrompt}\n\n${context}` }] });
        }
        
        const destinationApi = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

        try {
            // Send exactly the data structure the worker's security check demands
            const response = await fetch(workerProxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Destination-Url': 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
                },
                body: JSON.stringify({ 
                    contents: [{ parts: [{ text: prompt }] }] 
                })
            });

            if (!response.ok) throw new Error(`AI API error: ${response.status} ${response.statusText}`);
            const result = await response.json();

            if (!result.candidates || !result.candidates[0].content) {
                throw new Error("Invalid AI response structure received.");
            }

            const responseText = result.candidates[0].content.parts[0].text;
            const responseData = JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '').trim());
            
            dialogueHistory.push(`Captain Blackheart: "${responseData.dialogue}"`);

            updateUI(responseData.dialogue, responseData.choices);
            await generateImage(responseData.imagePrompt);

        } catch (error) {
            // **FIX:** Added more detailed error logging.
            console.error('--- AN ERROR OCCURRED ---');
            console.error('Error details:', error);
            // This log can be expanded in the developer console to see the exact data sent.
            console.error('Data sent to AI:', JSON.stringify(requestHistory, null, 2)); 
            addMessage("The captain stares blankly, lost in a sea haze. The connection is lost. Please refresh.", "pirate");
        } finally {
            showLoading(false);
        }
    }

    function handleChoice(choiceText) {
        optionsContainer.innerHTML = '';
        getNextStep(choiceText);
    }

    // Start the game
    getNextStep();
});
