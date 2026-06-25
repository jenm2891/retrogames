document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const resourceSpans = {
        turn: document.querySelector('#turn-display span'),
        population: document.querySelector('#population-display span'),
        food: document.querySelector('#food-display span'),
        wood: document.querySelector('#wood-display span'),
        gold: document.querySelector('#gold-display span'),
        military: document.querySelector('#military-display span'),
    };
    const eventNameElement = document.getElementById('event-name');
    const eventDescriptionElement = document.getElementById('event-description');
    const choicesContainer = document.getElementById('choices-container');
    const empireImageElement = document.getElementById('empire-image');
    const imagePlaceholder = document.querySelector('.image-placeholder');
    const loadingOverlay = document.getElementById('loading-overlay');
    const empireNameElement = document.getElementById('empire-name');

    // --- Secure API Configuration ---
    const workerProxyUrl = '/api/proxy';

    // --- Game State ---
    let empireState = {
        turn: 1, population: 100, food: 50, wood: 50, gold: 10, military: 5,
        empireName: "The Verdant Valley"
    };
    let chatHistory = [];

    // --- Core Functions ---

    function showLoading(isLoading) {
        loadingOverlay.style.display = isLoading ? 'flex' : 'none';
    }

    function updateResourceUI() {
        empireNameElement.textContent = empireState.empireName;
        for (const key in resourceSpans) {
            if (empireState.hasOwnProperty(key)) {
                resourceSpans[key].textContent = Math.floor(empireState[key]);
            }
        }
    }

    function applyResourceChanges(changes) {
        for (const key in changes) {
            if (empireState.hasOwnProperty(key)) {
                empireState[key] += changes[key];
                if (empireState[key] < 0) empireState[key] = 0;
            }
        }
        empireState.turn++;
    }

    async function generateImage(prompt) {
        const fullPrompt = `A beautiful fantasy digital painting of a civilization, showing: ${prompt}. Cinematic lighting, epic scale, detailed.`;
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
            if (!response.ok) throw new Error(`Image API error: ${response.status}`);
            const result = await response.json();
            if (result.predictions && result.predictions[0]?.bytesBase64Encoded) {
                empireImageElement.src = `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
                empireImageElement.style.display = 'block';
                imagePlaceholder.style.display = 'none';
            } else {
                throw new Error("No image data in response.");
            }
        } catch (error) {
            console.error('Image Generation Error:', error);
            imagePlaceholder.textContent = "The mists of time obscure your vision...";
        }
    }

    function updateEventUI(eventName, description, choices) {
        eventNameElement.textContent = eventName;
        eventDescriptionElement.innerHTML = `<p>${description.replace(/\n/g, '<br>')}</p>`;
        choicesContainer.innerHTML = '';
        choices.forEach(choice => {
            const button = document.createElement('button');
            button.classList.add('choice-button');
            button.textContent = choice.text;
            button.onclick = () => handleChoice(choice);
            choicesContainer.appendChild(button);
        });
    }

    async function nextTurn(playerChoice = null) {
        showLoading(true);

        const lastChoiceText = playerChoice ? `For my turn, I chose to: "${playerChoice.text}"` : "This is the first turn. Begin the story.";
        const prompt = `You are a Civilization-style game AI. Guide a player in building a fantasy empire. The current state of their empire is: ${JSON.stringify(empireState)}. The player's last action was: ${lastChoiceText}. Based on this, generate the next turn's event. Population consumes food each turn. You MUST respond with a single JSON object that strictly follows this schema: { "eventName": "A short, thematic title for the event.", "eventDescription": "A paragraph describing the event and the state of the empire.", "imagePrompt": "A short, descriptive prompt for an AI image generator to create a view of the empire based on the event.", "choices": [{"text": "A concise string for the first strategic choice."}, {"text": "A concise string for the second strategic choice."}, {"text": "A concise string for the third strategic choice."}], "resourceChanges": { "population": 0, "food": 0, "wood": 0, "gold": 0, "military": 0 } }`;

        chatHistory.push({ role: "user", parts: [{ text: prompt }] });
        const destinationApi = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

        try {
            const response = await fetch(workerProxyUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Destination-Url': destinationApi
                },
                body: JSON.stringify({ contents: chatHistory, generationConfig: { responseMimeType: "application/json" } })
            });
            if (!response.ok) throw new Error(`AI API error: ${response.status}`);

            const result = await response.json();
            const responseText = result.candidates[0].content.parts[0].text;
            const responseData = JSON.parse(responseText);
            
            chatHistory.push({ role: "model", parts: [{text: responseText}]});

            applyResourceChanges(responseData.resourceChanges);
            updateResourceUI();
            updateEventUI(responseData.eventName, responseData.eventDescription, responseData.choices);
            await generateImage(responseData.imagePrompt);

        } catch (error) {
            console.error('Game Logic Error:', error);
            eventDescriptionElement.textContent = "The seers cannot divine the future. Please refresh the page.";
        } finally {
            showLoading(false);
        }
    }

    function handleChoice(choice) {
        choicesContainer.innerHTML = '';
        nextTurn(choice);
    }

    updateResourceUI();
    nextTurn();
});
