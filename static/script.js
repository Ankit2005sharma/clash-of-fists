document.addEventListener('DOMContentLoaded', function() {
    // Detect page type by presence of elements
    const isAIGamePage = !!document.getElementById('play-btn');
    const isLobbyPage = !!document.querySelector('.list-group');
    const isMultiplayerGamePage = !!document.getElementById('game-area');

    // Common Socket.IO setup for multiplayer pages
    let socket = null;
    if (isLobbyPage || isMultiplayerGamePage) {
        socket = io();

        socket.on('connect', () => {
            console.log('Connected to server');
        });

        socket.on('error', data => {
            alert(data.message);
        });
    }

    // ---------------- AI Game Page Logic ----------------
    if (isAIGamePage) {
        // DOM elements
        const playerScoreEl = document.getElementById('player-score');
        const computerScoreEl = document.getElementById('computer-score');
        const roundEl = document.getElementById('round');
        const playerChoiceTextEl = document.getElementById('player-choice-text');
        const computerChoiceTextEl = document.getElementById('computer-choice-text');
        const playerResultIconEl = document.getElementById('player-result-icon');
        const computerResultIconEl = document.getElementById('computer-result-icon');
        const resultTextEl = document.getElementById('result-text');
        const resultDisplayEl = document.getElementById('result-display');
        const playBtn = document.getElementById('play-btn');
        const resetBtn = document.getElementById('reset-btn');
        const historyListEl = document.getElementById('history-list');
        const choiceButtons = document.querySelectorAll('.choice-btn');

        let currentPlayerChoice = null;  // Local temp for UI selection

        // Load initial state from backend (on page load)
        loadGameState();

        // Select choice (local UI only; sent to backend on play)
        choiceButtons.forEach(button => {
            button.addEventListener('click', function() {
                choiceButtons.forEach(btn => btn.classList.remove('selected'));
                this.classList.add('selected');
                currentPlayerChoice = this.dataset.choice;
                playerChoiceTextEl.textContent = capitalize(currentPlayerChoice);
                playerChoiceTextEl.style.color = '#f1f5f9'; 
            });
        });

        // Play round (no countdown - immediate processing)
        playBtn.addEventListener('click', async function() {
            if (!currentPlayerChoice) {
                showError('Please select a choice first!');
                return;
            }

            // Disable UI during round
            playBtn.disabled = true;
            resetBtn.disabled = true;
            choiceButtons.forEach(btn => btn.disabled = true);

            // Process round immediately
            await processRound();

            // Re-enable UI
            playBtn.disabled = false;
            resetBtn.disabled = false;
            choiceButtons.forEach(btn => btn.disabled = false);
        });

        // Process round via backend
        async function processRound() {
            try {
                const response = await fetch('/play', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ choice: currentPlayerChoice })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    showError(errorData.error || 'Something went wrong!');
                    return;
                }

                const data = await response.json();
                updateUIFromData(data);

            } catch (err) {
                showError('Network error! Check if the server is running.');
            }
        }

        // Reset game via backend
        resetBtn.addEventListener('click', async function() {
            try {
                const response = await fetch('/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (response.ok) {
                    const data = await response.json();
                    updateUIFromData(data);
                    choiceButtons.forEach(btn => btn.classList.remove('selected'));
                    currentPlayerChoice = null;
                    playerChoiceTextEl.textContent = '-';
                    // Remove any ongoing animations
                    resultDisplayEl.classList.remove('victory');
                }
            } catch (err) {
                showError('Reset failed!');
            }
        });

        // Load initial game state
        async function loadGameState() {
            // On load, state is initialized in backend, but we can fetch if needed
            // For simplicity, UI starts at defaults; first /play will populate
            historyListEl.innerHTML = '<div class="history-item"><span>Game started</span><span>Welcome!</span></div>';
        }

        // Update UI from backend data
        function updateUIFromData(data) {
            // Scores and round
            playerScoreEl.textContent = data.player_score;
            computerScoreEl.textContent = data.computer_score;
            roundEl.textContent = data.round;

            // Choices and emojis
            playerChoiceTextEl.textContent = capitalize(data.player_choice);
            computerChoiceTextEl.textContent = capitalize(data.computer_choice);
            playerResultIconEl.textContent = data.player_emoji;
            computerResultIconEl.textContent = data.computer_emoji;

            // Result
            let resultMsg, resultClass;
            if (data.result === 'win') {
                resultMsg = "You win!";
                resultClass = 'win';
                // Trigger win animation
                resultDisplayEl.classList.add('victory');
                setTimeout(() => {
                    resultDisplayEl.classList.remove('victory');
                }, 1500); // Remove after 1.5s
            } else if (data.result === 'lose') {
                resultMsg = "Computer wins!";
                resultClass = 'lose';
            } else if (data.result === 'tie') {
                resultMsg = "It's a tie!";
                resultClass = 'tie';
            }
            resultTextEl.textContent = resultMsg;
            resultTextEl.className = `result-text ${resultClass}`;

            // Update history
            updateHistory(data.history);
        }

        // Update history UI
        function updateHistory(history) {
            historyListEl.innerHTML = '';
            history.forEach(entry => {
                const historyItem = document.createElement('div');
                historyItem.className = 'history-item';

                let message, resultClass;
                if (entry.result === 'win') {
                    message = `You won with ${entry.player_choice} vs ${entry.computer_choice}`;
                    resultClass = 'win';
                } else if (entry.result === 'lose') {
                    message = `Computer won with ${entry.computer_choice} vs ${entry.player_choice}`;
                    resultClass = 'lose';
                } else {
                    message = `Tie with ${entry.player_choice}`;
                    resultClass = 'tie';
                }

                historyItem.innerHTML = `
                    <span>Round ${entry.round}</span>
                    <span class="${resultClass}">${message}</span>
                `;
                historyListEl.appendChild(historyItem);
            });

            if (history.length === 0) {
                historyListEl.innerHTML = '<div class="history-item"><span>Game reset</span><span>Start fresh!</span></div>';
            }
        }

        // Error handling
        function showError(message) {
            resultTextEl.textContent = message;
            resultTextEl.className = 'result-text';
            resultDisplayEl.classList.add('shake');
            setTimeout(() => {
                resultDisplayEl.classList.remove('shake');
            }, 500);
        }

        // Utility
        function capitalize(str) {
            if (!str) return '';
            return str.charAt(0).toUpperCase() + str.slice(1);
        }
    }

    // ---------------- Lobby Page Logic ----------------
    if (isLobbyPage) {
        // Listen for incoming game requests
        socket.on('game_request', data => {
            if (confirm(`Game request from ${data.from}. Accept?`)) {
                socket.emit('accept_game_request', { from_username: data.from });
                // Redirect to game page with room param
                window.location.href = '/game?room=game_' + [data.from, getCurrentUsername()].sort().join('_');
            } else {
                socket.emit('reject_game_request', { from_username: data.from });
            }
        });

        socket.on('game_request_rejected', data => {
            alert(`Your game request was rejected by ${data.by}`);
        });

        // Send game request function
        window.sendGameRequest = function(username) {
            socket.emit('send_game_request', { to_username: username });
            alert(`Game request sent to ${username}`);
        };

        // Helper to get current username from navbar
        function getCurrentUsername() {
            const navText = document.querySelector('.navbar-text');
            if (navText) {
                return navText.textContent.trim();
            }
            return '';
        }
    }

    // ---------------- Multiplayer Game Page Logic ----------------
    if (isMultiplayerGamePage) {
        const urlParams = new URLSearchParams(window.location.search);
        const room = urlParams.get('room');
        const statusEl = document.getElementById('status');
        const gameArea = document.getElementById('game-area');
        const roundResult = document.getElementById('round-result');
        let hasMoved = false;

        if (!room) {
            statusEl.textContent = 'No game room specified.';
            return;
        }

        socket.emit('join_room', { room: room });
        statusEl.textContent = 'Connected to game room. Waiting for moves...';
        gameArea.style.display = 'block';

        socket.on('start_game', data => {
            statusEl.textContent = 'Game started! Make your move.';
            gameArea.style.display = 'block';
        });

        socket.on('round_result', data => {
            const you = getCurrentUsername();
            const opponent = data.player1 === you ? data.player2 : data.player1;
            const yourChoice = data.player1 === you ? data.choice1 : data.choice2;
            const opponentChoice = data.player1 === you ? data.choice2 : data.choice1;
            const winner = data.result;

            let message = `You chose ${yourChoice}. Opponent chose ${opponentChoice}. `;

            if (winner === 'tie') {
                message += "It's a tie!";
                roundResult.style.color = 'var(--warning)';
                roundResult.style.textShadow = 'none';
            } else if ((winner === 'player1' && data.player1 === you) || (winner === 'player2' && data.player2 === you)) {
                message += "You win this round!";
                roundResult.style.color = 'var(--success)';
                roundResult.style.textShadow = 'none';
            } else {
                message += "You lose this round.";
                roundResult.style.color = 'var(--danger)';
                roundResult.style.textShadow = 'none';
            }
            roundResult.textContent = message;
            hasMoved = false;
            statusEl.textContent = 'Make your move.';
        });

        socket.on('error', data => {
            alert(data.message);
        });

        window.makeMove = function(choice) {
            if (hasMoved) {
                alert('You already made your move this round.');
                return;
            }
            socket.emit('make_move', { room: room, choice: choice });
            statusEl.textContent = `You chose ${choice}. Waiting for opponent...`;
            hasMoved = true;
        };

        // Helper to get current username from navbar
        function getCurrentUsername() {
            const navText = document.querySelector('.navbar-text');
            if (navText) {
                return navText.textContent.trim();
            }
            return '';
        }
    }
});
