document.addEventListener('DOMContentLoaded', () => {
    const gameForm = document.getElementById('game-form');
    const gameSelect = document.getElementById('game-select');

    gameForm.addEventListener('submit', (event) => {
        // Prevents the form from submitting in the traditional way
        event.preventDefault();

        const selectedGame = gameSelect.value;

        // Check if the user has selected a valid game (not the placeholder)
        if (selectedGame) {
            // Create a "loading" message before redirecting
            const button = event.target.querySelector('button');
            button.innerText = 'LOADING...';
            button.disabled = true;

            // Wait a moment to show the loading text, then redirect
            setTimeout(() => {
                window.location.href = selectedGame;
            }, 750); // 0.75 second delay
        } else {
            // If they haven't chosen a game, alert them
            alert('Please select a game from the dropdown menu!');
        }
    });
});