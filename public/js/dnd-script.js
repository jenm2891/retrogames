document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const storyTextElement = document.getElementById('story-text');
    const choicesContainer = document.getElementById('choices-container');
    const storyImageElement = document.getElementById('story-image');
    const imagePlaceholder = document.querySelector('.image-placeholder');
    const loadingOverlay = document.getElementById('loading-overlay');

    // --- Secure API Configuration ---
    const workerProxyUrl = '/api/proxy'; 

    // --- Game State ---
    let chatHistory = [{
        role: "user",
        parts: [{
            text: "You are a creative and descriptive Dungeons and Dragons Dungeon Master. Your task is to guide a player through a dark fantasy adventure. Start by describing the player character waking up at the entrance of a mossy, ancient cave, compelled by a forgotten purpose. From now on, you must guide the adventure. For every turn, you MUST respond with a JSON object that strictly follows this schema: { \"description\": \"A detailed, paragraph-long description of the current scene and events.\", \"choices\": [{\"text\": \"A concise string describing the first action the player can take.\", \"type\": \"A single word describing the nature of this choice (e.g., brave, sneaky, wise, foolish)\"}, {\"text\": \"A concise string for the second action.\", \"type\": \"A single word nature for the choice\"}, {\"text\": \"A concise string for the third action.\", \"type\": \"A single word nature for the choice\"}] }. Do not include any text outside of the JSON object. The adventure begins now."
        }]
    }];

    // --- Core Functions ---

    function showLoading(isLoading) {
        loadingOverlay.style.display = isLoading ? 'flex' : 'none';
    }

    async function generateImage(description) {
        const imagePrompt = `A dark fantasy digital painting of: ${description}. Moody lighting, intricate details, epic style.`;
        const destinationApi = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict';
        
        try {
            const response = await fetch(workerProxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Destination-Url': destinationApi
                },
                body: JSON.stringify({ instances: [{ prompt: imagePrompt }], parameters: { sampleCount: 1 } })
            });
            if (!response.ok) throw new Error(`Image API request failed with status ${response.status}`);
            
            const result = await response.json();

            if (result.predictions && result.predictions[0]?.bytesBase64Encoded) {
                storyImageElement.src = `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
                storyImageElement.style.display = 'block';
                imagePlaceholder.style.display = 'none';
            } else {
                throw new Error("Invalid image data received from API.");
            }
        } catch (error) {
            console.error('Image Generation Error:', error);
            storyImageElement.style.display = 'none';
            imagePlaceholder.style.display = 'flex';
            imagePlaceholder.textContent = "The vision fades...";
        }
    }

    function updateUI(description, choices) {
        storyTextElement.innerHTML = `<p>${description.replace(/\n/g, '<br>')}</p>`;
        choicesContainer.innerHTML = ''; 

        choices.forEach(choice => {
            const button = document.createElement('button');
            button.classList.add('choice-button');
            button.textContent = choice.text;
            button.dataset.type = choice.type; 
            button.onclick = () => handleChoice(choice);
            choicesContainer.appendChild(button);
        });
    }
    
    async function getNextStep(playerInput = null) {
        showLoading(true);

        if(playerInput) {
            chatHistory.push({ role: "user", parts: [{ text: `I choose to: "${playerInput}"` }] });
        }

        const generationConfig = {
            response_mime_type: "application/json",
            response_schema: {
                type: "OBJECT",
                properties: {
                    "description": { "type": "STRING" },
                    "choices": { "type": "ARRAY", "items": { "type": "OBJECT", "properties": { "text": { "type": "STRING" }, "type": { "type": "STRING" } }, "required": ["text", "type"] } }
                }, "required": ["description", "choices"]
            }
        };

        const payload = { contents: chatHistory, generationConfig: generationConfig };
        const destinationApi = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

        try {
            const response = await fetch(workerProxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Destination-Url': destinationApi
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`AI API request failed with status ${response.status}`);
            
            const result = await response.json();
            
            if (!result.candidates || !result.candidates[0].content.parts[0].text) {
                throw new Error("Invalid AI response structure.");
            }

            const responseText = result.candidates[0].content.parts[0].text;
            const responseData = JSON.parse(responseText);

            chatHistory.push({ role: "model", parts: [{ text: responseText }] });
            
            updateUI(responseData.description, responseData.choices);
            await generateImage(responseData.description);

        } catch (error) {
            console.error('AI Story Generation Error:', error);
            storyTextElement.innerHTML = `<p>The ancient magics sputter and fail. Please refresh the page to try again.</p>`;
            choicesContainer.innerHTML = '';
        } finally {
            showLoading(false);
        }
    }

    function handleChoice(choice) {
        storyTextElement.innerHTML = '';
        choicesContainer.innerHTML = '';
        getNextStep(choice.text);
    }

    getNextStep();
});
