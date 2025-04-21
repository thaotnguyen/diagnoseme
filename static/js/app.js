document.addEventListener('DOMContentLoaded', function () {
  // Remove modal creation code and use the HTML element
  let customCaseMode = false;
  const welcomeModal = document.getElementById('welcome-modal');
  const closeWelcomeModal = document.getElementById('close-welcome-modal');
  const startGameButton = document.getElementById('start-game');
  const viewInstructionsButton = document.getElementById('view-instructions');
  // Chat interface functionality
  const chatBox = document.getElementById('chat-box');
  const userInput = document.getElementById('user-input');
  const sendButton = document.getElementById('send-button');

  let vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);

  let timerInterval;
  let elapsedTime = 0;
  let timerStarted = false;

  // Variables to store preloaded game data and loading state
  let preloadedGameData = null;
  let gameLoading = false;
  let caseLoadingError = false;

  let instructionsModalSource = null; // Track where the instructions modal was opened from

  // Check if there's existing chat history
  const existingChatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
  const existingPatientContext = JSON.parse(localStorage.getItem('patientContext'));
  console.log(existingChatHistory);

  const honoluluOptions = { timeZone: "Pacific/Honolulu" };
  const honoluluNow = new Date(new Date().toLocaleString("en-US", honoluluOptions));
  const honoluluToday = honoluluNow.toDateString(); // Format: "Tue Jan 01 2023"

  // Filter chat history to only keep messages from today (Honolulu time)
  const filteredChatHistory = existingChatHistory.filter(message => {
    const messageDate = new Date(message.timestamp);
    const messageDateHonolulu = new Date(messageDate.toLocaleString("en-US", honoluluOptions));
    return messageDateHonolulu.toDateString() === honoluluToday;
  });

  if (window.custom_patient_context) {  // the server sets this variable if using /case/<token>
    customCaseMode = true;
    console.log("Custom case mode detected");
    // Set the patient context from the custom case
    window.patientContext = window.custom_patient_context;
    // Remove any existing history to avoid conflict with the daily case.
    localStorage.removeItem('chatHistory');
    localStorage.removeItem('patientContext');
    console.log("Custom case mode activated", window.patientContext);

    // Optionally, display an indicator that this is a custom case.
    // const customIndicator = document.getElementById('custom-case-indicator');
    // if (customIndicator) {
    //     customIndicator.style.display = 'block';
    //     customIndicator.innerText = "Custom Case Loaded";
    // }
    
    // Hide the welcome modal immediately.
    const welcomeModal = document.getElementById('welcome-modal');
    if (welcomeModal) {
        welcomeModal.style.display = 'none';
    }
  } else {
    console.log("Standard case mode detected");
  }

  // Load chat history and continue game if history exists
  if (filteredChatHistory.length > 0 && !customCaseMode) {    
    // Update localStorage with filtered history
    if (filteredChatHistory.length < existingChatHistory.length) {
      localStorage.setItem('chatHistory', JSON.stringify(filteredChatHistory));
      console.log(`Chat history cleaned.`);
      existingChatHistory = filteredChatHistory;
    } else {
      console.log("All chat messages are from today (Honolulu time).");
    }
    console.log('Existing chat history found, continuing game.');
    welcomeModal.style.display = 'none'; // Hide welcome modal
    
    // Enable user input
    if (!existingPatientContext.completed) {
      userInput.disabled = false;
      sendButton.disabled = false;
      sendButton.classList.remove('disabled');
    } else {
      // Disable user input if the game is completed
      userInput.disabled = true;
      sendButton.disabled = true;
      sendButton.classList.add('disabled');
    }

    // Load saved chat history
    loadChatHistory();
    fixInputToBottom();
    
    // Restore patient context if available
    if (existingPatientContext) {
      window.patientContext = existingPatientContext;
      console.log('Patient context restored:', window.patientContext);
    }

    // Restore timer if it was running
    const savedElapsedTime = localStorage.getItem('elapsedTime');
    console.log('savedElapsedTime:', savedElapsedTime);
    if (savedElapsedTime) {
      elapsedTime = parseInt(savedElapsedTime);
      document.getElementById('timer').textContent = formatTime(elapsedTime);
      
      // Only restart timer if the game wasn't completed
      if (existingPatientContext && !existingPatientContext.completed) {
        startTimer();
        console.log('Timer restored and restarted at', elapsedTime, 'seconds.');
      }
    }

  } else {
  
    // No chat history, show welcome modal
    welcomeModal.style.display = 'block';
    console.log('No chat history found, welcome modal displayed.');

    preloadGameCase();
    
    // Keep inputs disabled until game starts
    userInput.disabled = true;
    sendButton.disabled = true;
    sendButton.classList.add('disabled');
  }

  // Close modal when close button is clicked
  closeWelcomeModal.onclick = function () {
    welcomeModal.style.display = 'none';
    console.log('Welcome modal closed by clicking the close button.');
  };

  function fixInputToBottom() {
    if (window.innerWidth < 768) {
      const inputArea = document.getElementById('input-area');
      const chatBox = document.getElementById('chat-box');
      if (chatBox.scrollHeight > chatBox.clientHeight) {
        console.log('Chat box is scrollable, fixing input area to bottom.');
        inputArea.style.position = 'fixed';
        inputArea.style.bottom = '5px';
        inputArea.style.left = '5px';
        inputArea.style.right = '5px';
      }
    }
  }

  // Audio feedback for correct answer
  
  const jingleAudio = new Audio('/static/audio/jingle.mp3'); // Path to the jingle audio file

  // Function to format time in HH:MM:SS format
  function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs > 0 ? String(hrs).padStart(2, '0') + ':' : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // Function to start the timer
  function startTimer() {
    if (timerStarted) return; // Don't start if already started

    const timerElement = document.getElementById('timer');
    timerStarted = true;
    // Do not reset elapsedTime if it's already set from localStorage
    timerElement.textContent = formatTime(elapsedTime);
    
    timerInterval = setInterval(() => {
        if (!document.hidden) { // Only increment if window is active
            elapsedTime += 1;
            timerElement.textContent = formatTime(elapsedTime);
            if (!customCaseMode) {
              localStorage.setItem('elapsedTime', JSON.stringify(elapsedTime)); // Save elapsed time to local storage
            }
        }
    }, 1000);
    console.log('Timer started at', elapsedTime, 'seconds.');
}

  // Function to stop the timer
  function stopTimer() {
    clearInterval(timerInterval);
    timerStarted = false;
    console.log('Timer stopped at', elapsedTime, 'seconds.');
  }

  // Update the function that handles the correct answer to the high-yield question
  function handleCorrect() {
    // Existing code for displaying celebration graphics
    displayCelebration();
    
    // Launch confetti animation
    if (typeof window.launchConfetti === 'function') {
      window.launchConfetti();
      console.log('Confetti animation launched.');
    } else {
      console.error('Confetti animation function not available.');
    }

    // Play the jingle
    jingleAudio.play()
      .then(() => {
        console.log('Jingle played successfully.');
      })
      .catch(error => {
        console.error('Error playing jingle:', error);
      });

    // Stop the timer when the game ends with the correct diagnosis
    stopTimer();

    // Call endGameSession with the elapsed time when the high-yield question is answered correctly
    endGameSession(elapsedTime); // Pass the total time taken
  }

  // Function to check if the user's answer is correct
  function checkAnswer(response) {
    // Implement the logic to determine if the response is correct
    // This is a placeholder implementation; replace with actual logic
    return response.includes("CORRECT!"); // Example condition
  }

  function initializeUserStats() {
    const userStats = {
        personalBestTime: null,
        dailyStreak: 0,
        longestStreak: 0,
        gamesPlayed: 0,
        gamesCompleted: 0,
        lastPlayed: null,
        gameHistory: []
    };
    localStorage.setItem('userStats', JSON.stringify(userStats));
  }

  // Function to retrieve user stats from local storage
  function getUserStats() {
      const userStats = JSON.parse(localStorage.getItem('userStats'));
      if (!userStats) {
          initializeUserStats(); // Initialize if not present
          return getUserStats(); // Return the newly created stats
      }
      return userStats;
  }

  // Function to save user stats in local storage
  function saveUserStats(userStats) {
      localStorage.setItem('userStats', JSON.stringify(userStats));
      console.log('User stats saved to local storage:', userStats);
  }

  // Function to update personal best time and daily streak
  function endGameSession(finalTime) {
      const userStats = getUserStats(); // Retrieve current user stats

      // Check if the new time is a personal best
      if (userStats.personalBestTime === null || finalTime < userStats.personalBestTime) {
          userStats.personalBestTime = finalTime; // Update personal best time
          console.log('Personal best time updated to:', finalTime);
      }

      // Check if the daily streak should be updated
      userStats.dailyStreak += 1; // Increment daily streak
      console.log('Daily streak incremented to:', userStats.dailyStreak);

      userStats.gamesCompleted = (userStats.gamesCompleted || 0) + 1;
      userStats.gamesPlayed = (userStats.gamesPlayed || 0) + 1;  

      if (userStats.dailyStreak > userStats.longestStreak) {
        userStats.longestStreak = userStats.dailyStreak;
      }

      // Update daily streak only if no game was played today.
      if (userStats.lastPlayed !== honoluluToday) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayString = yesterday.toDateString();

        if (userStats.lastPlayed === yesterdayString) {
            userStats.dailyStreak += 1;
        } else {
            userStats.dailyStreak = 1;
        }
        userStats.lastPlayed = honoluluToday;
      }

      if (!userStats.gameHistory.includes(honoluluToday)) {
        userStats.gameHistory.push(honoluluToday);
      }

      window.patientContext.completed = true; // Mark the game as completed
      console.log('Game session ended. User stats updated:', userStats);
      // Save the updated patient context to local storage
      localStorage.setItem('patientContext', JSON.stringify(window.patientContext));

      // Save updated stats back to local storage
      saveUserStats(userStats); // Call the new function to save user stats

      // Update the leaderboard UI
      updateLeaderboardUI(userStats); // Call a new function to update the UI
  }

  // Update leaderboard UI to show streaks and add a heatmap visualization.
  function updateLeaderboardUI(userStats) {
    // Update personal best time display (formatted as mm:ss)
    const personalBestElement = document.getElementById('personal-best-time');
    if (userStats.personalBestTime !== null) {
        const minutes = Math.floor(userStats.personalBestTime / 60);
        const seconds = userStats.personalBestTime % 60;
        personalBestElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    } else {
        personalBestElement.textContent = 'Not yet achieved';
    }
    
    // Update daily streak text
    const dailyStreakElement = document.getElementById('daily-streak');
    dailyStreakElement.textContent = `${userStats.dailyStreak} day${userStats.dailyStreak !== 1 ? 's' : ''}`;

    // Update games played text
    const gamesPlayedElement = document.getElementById('games-played');
    gamesPlayedElement.textContent = userStats.gamesPlayed !== undefined ? userStats.gamesPlayed : '0';
    
    // Render a GitHub-like heatmap using the gameHistory data
    renderHeatmap(userStats.gameHistory);
  }

  // New function to render a GitHub-style heatmap.
  function renderHeatmap(gameHistory) {
    const heatmapContainer = document.getElementById('heatmap');
    if (!heatmapContainer) return;
    heatmapContainer.innerHTML = '';
    const today = new Date();
    // Create 30 cells representing the last 30 days.
    for (let i = 29; i >= 0; i--) {
        const day = new Date(today);
        day.setDate(today.getDate() - i);
        const dayString = day.toDateString();
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        // If the user played on that day, mark cell green; else gray.
        cell.style.backgroundColor = gameHistory.includes(dayString) ? '#4caf50' : '#ddd';
        cell.title = dayString;
        heatmapContainer.appendChild(cell);
    }
}

  // Insert minimal CSS styling for the heatmap (dynamically add to head).
  if (!document.getElementById('heatmap-style')) {
    const style = document.createElement('style');
    style.id = 'heatmap-style';
    style.textContent = `
        #heatmap {
            display: flex;
            flex-wrap: wrap;
            width: 220px;
            gap: 2px;
            margin-top: 10px;
        }
        .heatmap-cell {
            width: 20px;
            height: 20px;
            background-color: #ddd;
        }
    `;
    document.head.appendChild(style);
  }


  // Function to load user stats from local storage when the app is loaded
  function loadUserStats() {
      const userStats = getUserStats(); // Retrieve user stats from local storage
      updateLeaderboardUI(userStats); // Update the UI with the loaded stats
  }

  // Call this function when the app is loaded to check if user stats exist
  document.addEventListener('DOMContentLoaded', function () {
      // Load user stats when the app is loaded
      loadUserStats(); // Call the new function to load user stats
  });

  function preloadGameCase() {
    console.log('Preloading game case on page load.');
    gameLoading = true;

    // Show the case loading indicator instead of the message typing indicator
    const caseLoadingIndicator = document.getElementById('case-loading-indicator');
    if (caseLoadingIndicator) {
      caseLoadingIndicator.style.display = 'block';
    }

    try {
      console.log('Making POST request to /start_game to preload case');
      fetch(customCaseMode ? '/start_custom_game' : '/start_game', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          custom_patient_context: window.custom_patient_context || null,
        }),
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        console.log('Successfully preloaded game case data');
        console.log(data);

        // Re-enable user input
        userInput.disabled = false;
        sendButton.disabled = false;
        sendButton.classList.remove('disabled');

        // Store the preloaded data for later use when the user clicks "Start Game"
        preloadedGameData = data;
        gameLoading = false;
        
        // Hide the case loading indicator
        if (caseLoadingIndicator) {
          caseLoadingIndicator.style.display = 'none';
        }
      })
      .catch(error => {
        console.error("Error during case preloading:", error);
        caseLoadingError = true;
        gameLoading = false;
        
        // Hide the case loading indicator on error
        if (caseLoadingIndicator) {
          caseLoadingIndicator.style.display = 'none';
        }
      });
    } catch (error) {
      console.error('Error during game case preloading: ', error);
      caseLoadingError = true;
      gameLoading = false;
      
      // Hide the case loading indicator on error
      if (caseLoadingIndicator) {
        caseLoadingIndicator.style.display = 'none';
      }
    }
  }

  // Function to clear chat history and UI
  function clearChatHistoryAndUI() {
    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML = ''; // Clear chat box UI
    localStorage.setItem('chatHistory', JSON.stringify([])); // Clear localStorage chat history
    localStorage.removeItem('patientContext'); // Clear patient context
    localStorage.removeItem('elapsedTime'); // Clear timer state
    console.log('Chat history, patient context and UI cleared.');
  }

  // Start game button click handler - now just displays the preloaded case
  startGameButton.onclick = function () {
    welcomeModal.style.display = 'none';
    console.log('Start game button clicked.');

    // Clear chat history and UI
    clearChatHistoryAndUI();

    if (caseLoadingError) {
      // Show error message if preloading failed
      const chatBox = document.getElementById('chat-box');
      const errorMessage = document.createElement('div');
      errorMessage.className = 'message error-message';
      errorMessage.textContent = 'Error loading game case. Please refresh the page and try again.';
      chatBox.appendChild(errorMessage);
      return;
    }
    
    if (gameLoading) {
      // Show case loading indicator if case is still loading
      const caseLoadingIndicator = document.getElementById('case-loading-indicator');
      if (caseLoadingIndicator) {
        caseLoadingIndicator.style.display = 'block';
      }
      
      // Check every 500ms if the case has loaded
      const loadingCheck = setInterval(() => {
        if (!gameLoading && preloadedGameData) {
          clearInterval(loadingCheck);
          displayPreloadedCase();
          
          // Hide case loading indicator when finished
          if (caseLoadingIndicator) {
            caseLoadingIndicator.style.display = 'none';
          }
        }
      }, 500);
    } else if (preloadedGameData) {
      // Display the preloaded case immediately if it's ready
      displayPreloadedCase();
    }
  };

  // Function to display the preloaded case data
  function displayPreloadedCase() {
    // Disable user input until display is complete
    userInput.disabled = true;
    sendButton.disabled = true;
    sendButton.classList.add('disabled');
    
    // Clear the chat box
    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML = '';
    console.log('Chat box cleared for new game.');
    
    // Clear chat history in local storage
    if (!customCaseMode) {
      localStorage.setItem('chatHistory', JSON.stringify([]));
    }
    console.log('Chat history in local storage cleared.');

    // Store patient context for future messages
    window.patientContext = {
      attempts: 2,
      completed: false,
      history: [],
      disease: preloadedGameData.patient_context.disease,
      case: preloadedGameData.patient_context.case,
    };

    // Reset timer display but don't start it
    const timerElement = document.getElementById('timer');
    timerStarted = false;
    elapsedTime = 0;
    timerElement.textContent = formatTime(elapsedTime);
    clearInterval(timerInterval);

    // Re-enable user input
    userInput.disabled = false;
    sendButton.disabled = false;
    sendButton.classList.remove('disabled');

    // Display the stats in the UI
    const userStats = getUserStats();
    updateLeaderboardUI(userStats);
    
    console.log('Game initialization complete, user input enabled.');
  }

  // Instead, get references to the existing modal and close button:
  const instructionsModal = document.getElementById('instructions-modal');
  const closeInstructionsButton = document.getElementById('close-instructions-modal');

  // Event listener for close button
  closeInstructionsButton.addEventListener('click', function(e) {
    console.log('Close instructions button clicked');
    instructionsModal.style.display = 'none';
    if (instructionsModalSource === 'start') {
      welcomeModal.style.display = 'block';
      console.log('Instructions modal closed, main modal displayed');
    } else {
      console.log('Instructions modal closed, no main modal displayed');
    }
  });

  // View instructions button click handler
  viewInstructionsButton.onclick = function () {
    console.log('Current modal display:', welcomeModal.style.display);
    console.log('Instructions modal display before showing:', instructionsModal.style.display);
    console.log('Instructions modal element exists:', instructionsModal !== null);
    welcomeModal.style.display = 'none';
    instructionsModal.style.display = 'block';
    instructionsModalSource = 'start';  // mark as coming from start game
    closeInstructionsButton.textContent = '←'; // back arrow for start-game modal
    console.log('Instructions modal displayed from start game modal.');
  };

  // Disable the send button
  // sendButton.disabled = true;
  // userInput.disabled = true;
  // sendButton.classList.add('disabled');

  // Add a loading state variable
  let isLoading = false;

  // Load chat history from local storage
  function loadChatHistory() {
      const chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
      const currentDate = new Date(); // Get current date
      const currentTimestamp = currentDate.getTime(); // Get current timestamp in milliseconds

      // Clear chat history if it's older than 24 hours
      const filteredHistory = chatHistory.filter(entry => {
          const entryTimestamp = new Date(entry.timestamp).getTime(); // Get timestamp of the entry
          return (currentTimestamp - entryTimestamp) <= 24 * 60 * 60 * 1000; // Keep only messages from the last 24 hours
      });

      // Update local storage with filtered history
      localStorage.setItem('chatHistory', JSON.stringify(filteredHistory));

      // Display the filtered chat history
      filteredHistory.forEach(entry => {
          const messageElement = document.createElement('div');
          messageElement.className = entry.type === 'user' ? 'message user-message' : 'message llm-message';
          messageElement.textContent = entry.text;
          chatBox.appendChild(messageElement);
      });
  }

  // Function to send user input to the LLM
  function sendMessage() {
      // Don't allow sending if already loading or game is initializing
      if (isLoading || gameLoading) return;
      
      const message = userInput.value.trim();
      if (message) {
          if (!timerStarted) {
            startTimer();
          }
          // Set loading state to true
          isLoading = true;
          
          // Disable the send button
          sendButton.disabled = true;
          sendButton.classList.add('disabled');
          
          // Display user's message in the chat box
          const userMessage = document.createElement('div');
          userMessage.className = 'message user-message'; // Add class for styling
          userMessage.textContent = message;
          chatBox.appendChild(userMessage);

          // Save user message to local storage with timestamp
          const chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
          chatHistory.push({ text: message, type: 'user', timestamp: new Date().toISOString() });
          if (!customCaseMode) {
            localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
          }

          userInput.value = ''; // Clear input

          // Show animated typing indicator for message loading (mid-game)
          const loadingIndicator = document.getElementById('loading-indicator');
          loadingIndicator.style.display = 'inline-flex'; // Show typing indicator
          console.log('Message loading indicator displayed.');

          // Call the LLM with context
          fetch('/ask_llm', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                  question: message,
                  patient_context: window.patientContext // Include patient context
              }),
          })
          .then(response => {
              console.log(window.patientContext);
              if (!response.ok) {
                  console.log(response);
                  throw new Error('Network response was not ok');
              }
              return response;
          })
          .then((data) => {
              console.log(data);

              const reader = data.body.getReader();
              const decoder = new TextDecoder();
              let buffer = '';

              const patientMessage = document.createElement('div');
              patientMessage.className = 'message llm-message';
              patientMessage.textContent = data.patient_introduction;
              chatBox.appendChild(patientMessage);
              fixInputToBottom();
              
              function read() {
                reader.read().then(({ done, value }) => {
                  if (done) {
                    // End of stream, re-enable input.
                    gameLoading = false;
                    
                    // Re-enable user input
                    userInput.disabled = false;
                    sendButton.disabled = false;
                    sendButton.classList.remove('disabled');
                    // Save patient introduction to chat history in local storage
                    const chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
                    chatHistory.push({ 
                      text: patientMessage.innerHTML, 
                      type: 'llm', 
                      timestamp: new Date().toISOString() 
                    });
                    if (!customCaseMode) {
                      localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
                    }
                    return;
                  }
                  let newText = decoder.decode(value, { stream: true });
                  if (newText.includes('%%%') && !window.patientContext.completed) {
                    console.log('Correct answer found');
                    patientMessage.style.maxWidth = '100%';
                    handleCorrect();
                    window.patientContext.completed = true;
                    newText = newText.replace('%%%', '');
                    // Disable inputs when game ends
                    userInput.disabled = true;
                    sendButton.disabled = true;
                    sendButton.classList.add('disabled');
                  }
                  buffer += newText;
                  // Split the buffer by triple newlines which delimit SSE messages.
                  const parts = buffer.split('\n\n\n');
                  // Retain any partial message.
                  buffer = parts.pop();
                  parts.forEach(part => {
                    // if (part.startsWith("data: ")) {
                    //   const text = part.substring(6);
                    //   patientMessage.innerHTML += text;
                    // } else if (part.startsWith("event: complete")) {
                    //   // Optionally mark stream completion.
                    // }
                    if (patientMessage.innerHTML.startsWith('\n')) {
                      patientMessage.innerHTML = patientMessage.innerHTML.substring(1);
                    }
                    patientMessage.innerHTML += part;
                    fixInputToBottom();
                  });
                  patientMessage.innerHTML = patientMessage.innerHTML.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                  if (patientMessage.innerHTML.includes('$$$')) {
                    console.log('Ordered test');
                    patientMessage.style.maxWidth = '100%';
                    patientMessage.innerHTML = patientMessage.innerHTML.replace('$$$', '');
                  }
                  read();
                }).catch(err => {
                  console.error("Error reading stream:", err);
                });
              }
              read();

              // Hide typing indicator
              const loadingIndicator = document.getElementById('loading-indicator');
              loadingIndicator.style.display = 'none'; // Hide typing indicator
              console.log('Loading indicator hidden.');
              
              // Reset loading state
              isLoading = false;
              
              if (!window.patientContext.completed) {
                // Re-enable the send button
                sendButton.disabled = false;
                sendButton.classList.remove('disabled');
              }

              const history = window.patientContext.history;
              history.push('User: ' + message); // Add user's message to the history
              history.push('Patient: ' + patientMessage.innerHTML);
              const patientContext = {
                  attempts: window.patientContext.attempts,
                  completed: window.patientContext.completed,
                  history: history,
                  disease: window.patientContext.disease,
                  case: window.patientContext.case,
              };

              window.patientContext = patientContext; // Update patient context

              if (!customCaseMode) {
                localStorage.setItem('patientContext', JSON.stringify(patientContext));
              }

              
              // Check if the answer is correct and handle accordingly
              const userAnswerIsCorrect = checkAnswer(patientMessage.innerHTML);
              if (userAnswerIsCorrect) {
                  handleCorrect();
              }
          })
          .catch(error => {
              console.error("Error during fetch:", error);
              loadingIndicator.style.display = 'none'; // Hide typing indicator on error
              console.log('Loading indicator hidden due to error.');
              
              // Reset loading state on error
              isLoading = false;
              
              // Re-enable the send button on error
              sendButton.disabled = false;
              sendButton.classList.remove('disabled');
          });
        
      }
  }

  // Function to display celebratory graphics
  function displayCelebration() {
      const celebrationDiv = document.getElementById('celebration');
      celebrationDiv.style.display = 'block'; // Show the celebration graphics

      // Optional: Add confetti effect (you can use a library or create your own)
      const confetti = document.getElementById('confetti');
      // Example of a simple confetti effect (you can replace this with a library like canvas-confetti)
      for (let i = 0; i < 100; i++) {
          const confettiPiece = document.createElement('div');
          confettiPiece.className = 'confetti-piece'; // Add styling for confetti pieces
          confettiPiece.style.position = 'absolute';
          confettiPiece.style.width = '10px';
          confettiPiece.style.height = '10px';
          confettiPiece.style.backgroundColor = 'randomColor'; // Replace with a function to get a random color
          confettiPiece.style.top = Math.random() * window.innerHeight + 'px';
          confettiPiece.style.left = Math.random() * window.innerWidth + 'px';
          confetti.appendChild(confettiPiece);
      }
  }

  // Event listeners for sending messages - update to check loading and game initialization state
  sendButton.onclick = sendMessage;
  userInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !isLoading && !gameLoading) {
          sendMessage();
      }
  });

  document.getElementById('submit-case').addEventListener('click', function() {
      const diseaseName = document.getElementById('disease-name').value;
      const caseDescription = document.getElementById('case-description').value;

      console.log('Submit Case button clicked.'); // Log button click
      console.log('Case Description:', caseDescription); // Log the case description

      if (diseaseName.trim() === "") {
          alert("Please enter a disease name.");
          return;
      }

      // Show loading state
      const submitButton = document.getElementById('submit-case');
      submitButton.innerHTML = '<span class="loading-spinner"></span> Creating...';
      submitButton.disabled = true;

      console.log('Submitting case description:', diseaseName, caseDescription); // Log case description before submission

      // Call the endpoint to submit the case
      fetch('/submit_case', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({ disease: diseaseName, description: caseDescription })
      })
      .then(response => {
          console.log('Received response from /submit_case:', response); // Log the response object
          return response.json();
      })
      .then(data => {
          console.log('Response data:', data); // Log the parsed response data
          
          // Reset button state
          submitButton.innerHTML = 'Create Case';
          submitButton.disabled = false;
          
          if (data.success) {
              // Show the result container with animation
              const resultContainer = document.getElementById('result-container');
              resultContainer.style.display = 'block';
              
              // Format the URL message better with clear instruction
              document.getElementById('case-url-message').innerText = data.url;
              
              // Scroll to the result section with smooth animation
              resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              
              // Trigger checkmark animation (it will play automatically via CSS)
          } else {
              alert("Error creating case. Please try again.");
          }
      })
      .catch(error => {
          console.error('Error during fetch:', error);
          
          // Reset button state
          submitButton.innerHTML = 'Create Case';
          submitButton.disabled = false;
          
          alert("An error occurred. Please try again.");
      });
  });

  // Add this CSS for the loading spinner
  document.head.insertAdjacentHTML('beforeend', `
      <style>
          .loading-spinner {
              display: inline-block;
              width: 16px;
              height: 16px;
              border: 2px solid rgba(255,255,255,0.3);
              border-radius: 50%;
              border-top-color: white;
              animation: spin 0.8s linear infinite;
              margin-right: 8px;
          }
      </style>
  `);

  // Add copy functionality
  document.getElementById('copy-url').addEventListener('click', function() {
      const urlMessage = document.getElementById('case-url-message').innerText;
      const url = urlMessage.split('\n')[1] || urlMessage; // Extract the URL from the message

      if (url) {
          navigator.clipboard.writeText(url).then(() => {
              // Show copy feedback animation
              const feedback = document.querySelector('.copy-feedback');
              feedback.classList.add('visible');
              
              // Log the action
              console.log('URL copied to clipboard:', url);
              
              // Hide the feedback after 2 seconds
              setTimeout(() => {
                  feedback.classList.remove('visible');
              }, 2000);
          }).catch(err => {
              console.error('Could not copy URL: ', err);
              alert('Failed to copy URL. Please try again.');
          });
      } else {
          alert('No URL to copy.');
      }
  });

  // Call this function when the app is loaded to check if user stats exist
  const userStats = getUserStats(); // Ensure user stats are loaded when the app starts

  // Display the stats in the UI
  updateLeaderboardUI(userStats); // Update the UI with the loaded stats

  viewInstructionsButton.onclick = function () {
    console.log('Current modal display:', welcomeModal.style.display);
    console.log('Instructions modal display before showing:', instructionsModal.style.display);
    console.log('Instructions modal element exists:', instructionsModal !== null);
    welcomeModal.style.display = 'none';
    instructionsModal.style.display = 'block';
    instructionsModalSource = 'start';  // mark as coming from start game
    closeInstructionsButton.textContent = '←'; // back arrow for start-game modal
    console.log('Instructions modal displayed from start game modal.');
  };

  document.getElementById('view-instructions-game').addEventListener('click', function() {
    console.log('View Instructions button clicked from the game.');
    instructionsModal.style.display = 'block';
    welcomeModal.style.display = 'none'; // Hide the start game modal
    instructionsModalSource = 'game';
    closeInstructionsButton.textContent = '×';
  });

  closeInstructionsButton.addEventListener('click', function(e) {
    console.log('Close instructions button clicked');
    instructionsModal.style.display = 'none';
    if (instructionsModalSource === 'start') {
        welcomeModal.style.display = 'block';
        console.log('Instructions modal closed, returning to welcome modal.');
    } else {
        welcomeModal.style.display = 'none';
        console.log('Instructions modal closed, returning to game.');
        // Do not show the main modal
    }
    instructionsModalSource = null;
  });
});

// Remove all existing window.onclick assignments and add the following unified handler:
window.addEventListener('click', function (event) {
    // If the clicked element has a class of "modal", then it is the overlay.
    if (event.target.classList.contains('modal') && event.target.id !== 'welcome-modal') {
        event.target.style.display = 'none';
        console.log('Modal closed by clicking outside its content.');
    }
});

if (document.readyState !== 'loading') {
  // Add event listeners for header buttons
  try {
    // Instructions button
    document.getElementById('view-instructions-icon').addEventListener('click', function() {
      console.log('Instructions icon clicked');
      const instructionsModal = document.getElementById('instructions-modal');
      instructionsModal.style.display = 'block';
      instructionsModalSource = 'header';  // mark as coming from header
      document.getElementById('close-instructions-modal').textContent = '×'; // regular close button
      console.log('Instructions modal displayed from header.');
      document.getElementById('welcome-modal').style.display = 'none';

    });
    
    // Create case button
    document.getElementById('create-case-icon').addEventListener('click', function() {
      console.log('Create case icon clicked');
      document.getElementById('create-case-modal').style.display = 'block';
    });
    
    // View leaderboard button
    document.getElementById('view-leaderboard-icon').addEventListener('click', function() {
      console.log('Leaderboard icon clicked');
      document.getElementById('leaderboard-modal').style.display = 'block';
    });
    
    // Set up close buttons for all modals
    document.getElementById('close-leaderboard-modal').addEventListener('click', function() {
      document.getElementById('leaderboard-modal').style.display = 'none';
    });
    
    document.getElementById('close-create-case-modal').addEventListener('click', function() {
      document.getElementById('create-case-modal').style.display = 'none';
      document.getElementById('case-description').value = '';
      document.getElementById('result-container').style.display = 'none';
    });
  } catch (error) {
    console.error('Error setting up event listeners:', error);
  }
}

// Function to save user stats in local storage
function saveUserStats(userStats) {
    localStorage.setItem('userStats', JSON.stringify(userStats));
    console.log('User stats saved to local storage:', userStats);
}

// Function to update personal best time and daily streak
function endGameSession(finalTime) {
    const userStats = getUserStats();
    
    // Check if the new time is a personal best
    if (userStats.personalBestTime === null || finalTime < userStats.personalBestTime) {
        userStats.personalBestTime = finalTime;
        console.log('Personal best time updated to:', finalTime);
    }
    
    // Increment games played
    userStats.gamesCompleted = (userStats.gamesCompleted || 0) + 1;
    
    // Check if the daily streak should be updated
    const today = new Date().toDateString();
    if (userStats.lastPlayed !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayString = yesterday.toDateString();
        
        if (userStats.lastPlayed === yesterdayString) {
            // User played yesterday, increment streak
            userStats.dailyStreak += 1;
        } else if (userStats.lastPlayed === null) {
            // First time playing
            userStats.dailyStreak = 1;
        } else {
            // User missed a day, reset streak
            userStats.dailyStreak = 1;
        }
        
        // Update last played date
        userStats.lastPlayed = today;
    }
    
    // Save updated stats back to local storage
    saveUserStats(userStats);
    
    // Update the leaderboard UI
    updateLeaderboardUI(userStats);
}

// Add animation when opening the leaderboard modal
document.getElementById('view-leaderboard-icon').addEventListener('click', function() {
    const leaderboardModal = document.getElementById('leaderboard-modal');
    leaderboardModal.style.display = 'block';
    
    // Refresh the leaderboard data
    updateLeaderboardUI(getUserStats());
    
    // Add entrance animation
    const modalContent = leaderboardModal.querySelector('.modal-content');
    modalContent.style.animation = 'slideIn 0.3s ease';
    
    // Add this style if not already defined
    if (!document.getElementById('leaderboard-animation-style')) {
        const style = document.createElement('style');
        style.id = 'leaderboard-animation-style';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateY(-50px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
});

// Add animation when opening the instructions modal
document.getElementById('view-instructions-icon').addEventListener('click', function() {
  const instructionsModal = document.getElementById('instructions-modal');
  instructionsModal.style.display = 'block';
  instructionsModalSource = 'header';  // mark as coming from header
  document.getElementById('close-instructions-modal').textContent = '×'; // regular close button
  console.log('Instructions modal displayed from header.');
  
  // Add entrance animation
  const modalContent = instructionsModal.querySelector('.modal-content');
  modalContent.style.animation = 'slideIn 0.3s ease';
});

// Also add animation when opening from the main welcome modal
document.getElementById('view-instructions').addEventListener('click', function() {
  const instructionsModal = document.getElementById('instructions-modal');
  instructionsModal.style.display = 'block';
  welcomeModal.style.display = 'none';
  
  // Add entrance animation
  const modalContent = instructionsModal.querySelector('.modal-content');
  modalContent.style.animation = 'slideIn 0.3s ease';
  
  // Set source flag for return navigation
  instructionsModalSource = 'start';
});