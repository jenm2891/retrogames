document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const descriptionText = document.getElementById('description-text');
    const verbContainer = document.getElementById('verb-container');
    const inventoryList = document.getElementById('inventory-list');
    const roomImageElement = document.getElementById('room-image');
    const imagePlaceholder = document.querySelector('.image-placeholder');
    const loadingOverlay = document.getElementById('loading-overlay');

    // --- Secure API Configuration ---
    const workerProxyUrl = '/api/proxy';

    // --- Game State ---
    let gameState = {
        currentRoom: "Lobby",
        inventory: [],
        roomObjects: ["Dusty 'Welcome' Mat", "Flickering Terminal", "Locked 'Server Room' Door"],
        selectedVerb: null,
        selectedObject: null,
    };
    let chatHistory = [];

    const verbs = ["Look at", "Use", "Go to", "Pick up"];

    // --- Core Functions ---

    function showLoading(isLoading) {
        loadingOverlay.style.display = isLoading ? 'flex' : 'none';
    }

    async function generateImage(prompt) {
        // Worker is currently locked to text-only JSON mode for safety/stability.
        // Using a text-based visual placeholder instead.
        console.warn("Image generation skipped: Worker is currently locked to text-only JSON mode.");
        roomImageElement.style.display = 'none';
        imagePlaceholder.style.display = 'flex';
        imagePlaceholder.style.flexDirection = 'column';
        imagePlaceholder.innerHTML = `<p style="color: #0f0; margin-bottom: 10px;">[ SCENE VISUAL ]</p><p style="font-size: 0.9em; text-align: center; padding: 0 10px;">${prompt}</p>`;
    }

    function renderUI() {
        verbContainer.innerHTML = '';

        // 1. Render the Verbs (Actions)
        const verbHeader = document.createElement('h3');
        verbHeader.textContent = "ACTIONS:";
        verbHeader.style.width = "100%";
        verbHeader.style.marginBottom = "5px";
        verbContainer.appendChild(verbHeader);

        verbs.forEach(verb => {
            const button = document.createElement('button');
            button.classList.add('verb-button');
            button.textContent = verb;
            if (gameState.selectedVerb === verb) button.classList.add('selected');
            button.onclick = () => selectVerb(verb);
            verbContainer.appendChild(button);
        });

        // 2. Render the Room Objects (The missing piece!)
        const objectsHeader = document.createElement('h3');
        objectsHeader.textContent = "IN ROOM:";
        objectsHeader.style.width = "100%";
        objectsHeader.style.marginTop = "15px";
        objectsHeader.style.marginBottom = "5px";
        verbContainer.appendChild(objectsHeader);

        if (gameState.roomObjects.length === 0) {
            const noObjects = document.createElement('p');
            noObjects.textContent = "Nothing of interest.";
            verbContainer.appendChild(noObjects);
        } else {
            gameState.roomObjects.forEach(object => {
                const button = document.createElement('button');
                button.classList.add('verb-button'); 
                button.style.borderColor = "#0f0"; // Differentiates objects from verbs visually
                button.textContent = object;
                if (gameState.selectedObject === object) button.classList.add('selected');
                button.onclick = () => selectObject(object);
                verbContainer.appendChild(button);
            });
        }

        // 3. Render Inventory items
        inventoryList.innerHTML = '';
        if (gameState.inventory.length === 0) {
            inventoryList.innerHTML = '<li>Empty</li>';
        } else {
            gameState.inventory.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item;
                li.classList.add('item');
                if (gameState.selectedObject === item) li.classList.add('selected');
                li.onclick = () => selectObject(item);
                inventoryList.appendChild(li);
            });
        }
    }

    function selectVerb(verb) {
        gameState.selectedVerb = verb;
        renderUI();
        checkActionReady();
    }

    function selectObject(object) {
        gameState.selectedObject = object;
        renderUI();
        checkActionReady();
    }

    function checkActionReady() {
        if (gameState.selectedVerb && gameState.selectedObject) {
            const action = `${gameState.selectedVerb} "${gameState.selectedObject}"`;
            descriptionText.textContent = `> ${action}`;
            performAction(gameState.selectedVerb, gameState.selectedObject);
        }
    }

    async function performAction(verb, object) {
        showLoading(true);

        const prompt = `You are the game engine for a 'Maniac Mansion' style AppSec adventure game. The player's current state is: ${JSON.stringify(gameState)}. The player performs the action: "${verb} ${object}". Based on this, generate the outcome. The puzzles are metaphors for application security concepts. You MUST respond with a single JSON object with no other text. The JSON object must strictly follow this schema: { "description": "A description of what happens.", "imagePrompt": "A new, short image prompt for the room's visual state.", "newRoom": "The name of the new room if the player moved, otherwise the same as currentRoom.", "updatedInventory": ["An array of all items in the player's inventory after the action."], "updatedRoomObjects": ["An array of all objects in the current room after the action."] }`;
        
        try {
            // Send exactly the data structure the worker's security check demands
            const response = await fetch(workerProxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    contents: [{ parts: [{ text: prompt }] }] 
                })
            });
            
            if (!response.ok) throw new Error(`AI API error: ${response.status}`);

            const result = await response.json();
            
            // Catch custom errors thrown by the backend guardrails
            if (result.error) {
                throw new Error(result.message);
            }

            const responseText = result.candidates[0].content.parts[0].text;
            
            // Parse the JSON exactly as it comes from the worker
            const responseData = JSON.parse(responseText);

            gameState.currentRoom = responseData.newRoom;
            gameState.inventory = responseData.updatedInventory;
            gameState.roomObjects = responseData.updatedRoomObjects;
            gameState.selectedVerb = null;
            gameState.selectedObject = null;
            
            descriptionText.textContent = responseData.description;
            
            await generateImage(responseData.imagePrompt);
            
        } catch (error) {
            console.error('Game Logic Error:', error);
            descriptionText.textContent = "ERROR: " + error.message;
        } finally {
            renderUI();
            showLoading(false);
        }
    }

    renderUI();
    generateImage("A grand, dusty lobby of a deserted high-tech building. A flickering computer terminal sits on a reception desk.");
});