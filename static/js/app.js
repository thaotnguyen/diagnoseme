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

  // NEW: placeholder installer (initialized only after game is loaded)
  let chatPlaceholderEl = null;
  let chatObserver = null;

  function installChatPlaceholder(snippetText) {
    // Cleanup any prior instance/observer
    if (chatObserver) {
      chatObserver.disconnect();
      chatObserver = null;
    }
    if (chatPlaceholderEl && chatPlaceholderEl.parentNode) {
      chatPlaceholderEl.parentNode.removeChild(chatPlaceholderEl);
    }

    chatPlaceholderEl = document.createElement('div');
    chatPlaceholderEl.id = 'chat-placeholder';
    chatPlaceholderEl.className = 'chat-placeholder';
    // Extremely minimal copy with the generated intro line
    // Example: "Ava, 7-year-old female: stomach pain."
    const intro = (snippetText || 'Your patient: ask a first question to begin.').trim();
    chatPlaceholderEl.textContent = `💬 ${intro}  Ask the patient a question to get started.`;
    chatPlaceholderEl.addEventListener('click', () => userInput?.focus?.());

    function toggle() {
      const hasMessages = !!chatBox.querySelector('.message');
      // Show only when there are no messages
      if (!hasMessages) {
        if (!chatPlaceholderEl.isConnected) chatBox.appendChild(chatPlaceholderEl);
      } else {
        if (chatPlaceholderEl.isConnected) {
          chatPlaceholderEl.textContent = '';
          chatPlaceholderEl.remove();
        }
      }
    }

    // Observe chat mutations to hide/show automatically
    chatObserver = new MutationObserver(toggle);
    chatObserver.observe(chatBox, { childList: true, subtree: false });

    // Initial toggle
    toggle();
  }

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
  // console.log(existingChatHistory);

  const honoluluOptions = { timeZone: "Pacific/Honolulu" };
  const honoluluNow = new Date(new Date().toLocaleString("en-US", honoluluOptions));
  const honoluluToday = honoluluNow.toDateString(); // Format: "Tue Jan 01 2023"

  // Filter chat history to only keep messages from today (Honolulu time)
  let filteredChatHistory = existingChatHistory.filter(message => {
    const messageDate = new Date(message.timestamp);
    const messageDateHonolulu = new Date(messageDate.toLocaleString("en-US", honoluluOptions));
    return messageDateHonolulu.toDateString() === honoluluToday;
  });

  if (filteredChatHistory.filter(message => message.type !== 'user').length === 0) {
    filteredChatHistory = [];
  }

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
    const welcomeModalHeader = document.querySelector('.modal-header--primary');
    if (welcomeModal) {
        welcomeModal.style.display = 'flex';
    }
    preloadGameCase();
    fixInputToBottom();
  } else {
    // console.log("Standard case mode detected");
    // Load chat history and continue game if history exists
    if (filteredChatHistory.length > 0 && !customCaseMode) {    
      // Update localStorage with filtered history
      if (filteredChatHistory.length < existingChatHistory.length) {
        localStorage.setItem('chatHistory', JSON.stringify(filteredChatHistory));
        console.log(`Chat history cleaned.`);
        existingChatHistory = filteredChatHistory;
      } else {
        // console.log("All chat messages are from today (Honolulu time).");
      }
      // console.log('Existing chat history found, continuing game.');
      welcomeModal.style.display = 'none'; // Hide welcome modal
      
      // Enable user input
      if (!existingPatientContext.completed) {
        userInput.disabled = false;
        sendButton.disabled = false;
        sendButton.classList.remove('disabled');
      } else {
        // NEW: Replace input area with "Play a random case" button
        const inputArea = document.getElementById('input-area');
        const textBox = document.getElementById('user-input');
        const sendButton = document.getElementById('send-button');
        const newRandomCaseButton = document.getElementById('play-random-case');
        if (inputArea) {
            
            // Replace with the new play button
            textBox.style.display = 'none';
            sendButton.style.display = 'none';
            newRandomCaseButton.style.display = 'inline-block';
            
            // Add event listener to the new button
            newRandomCaseButton.addEventListener('click', startRandomCase);
        }
      }

      // Load saved chat history
      loadChatHistory();
      fixInputToBottom();
      
      // Restore patient context if available
      if (existingPatientContext) {
        window.patientContext = existingPatientContext;
        // console.log('Patient context restored:', window.patientContext);
      }

      // Restore timer if it was running
      const savedElapsedTime = localStorage.getItem('elapsedTime');
      // console.log('savedElapsedTime:', savedElapsedTime);
      if (savedElapsedTime) {
        elapsedTime = parseInt(savedElapsedTime, 10);
        if (existingPatientContext && !existingPatientContext.completed) {
          startTimer(); // Restart timer only if game is not completed
        } else {
          document.getElementById('timer').textContent = formatTime(elapsedTime); // Show final time if completed
        }
      }
      // Update streak display on load if continuing a game
      if (existingPatientContext) {
          updateStreakDisplay(getUserStats().consecutivePlayStreak);
      }

    } else {
      // Show welcome modal if no history or it's a new day
      welcomeModal.style.display = 'flex';
      // Preload game case when welcome modal is shown for a new game
      preloadGameCase();
      // Update streak display even if starting fresh (might be 0)
      updateStreakDisplay(getUserStats().consecutivePlayStreak);
    }
  }

  // Close modal when close button is clicked
  closeWelcomeModal.onclick = function () {
    welcomeModal.style.display = 'none';
    // console.log('Welcome modal closed by clicking the close button.');
  };

  function fixInputToBottom() {
    if (window.innerWidth < 768) {
      const inputArea = document.getElementById('input-area');
      const chatBox = document.getElementById('chat-box');
      if (chatBox.scrollHeight > chatBox.clientHeight) {
        // console.log('Chat box is scrollable, fixing input area to bottom.');
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
    // console.log('Timer started at', elapsedTime, 'seconds.');
}

  // Function to stop the timer
  function stopTimer() {
    clearInterval(timerInterval);
    timerStarted = false;
    // console.log('Timer stopped at', elapsedTime, 'seconds.');
  }

  // Update the function that handles the correct answer
  function handleEnd(correct) {
      if (correct) {
          // Existing code for displaying celebration graphics
          displayCelebration();

          // Play the jingle
          jingleAudio.play()
          .then(() => {
              console.log('Jingle played successfully.');
          })
          .catch(error => {
              console.error('Error playing jingle:', error);
          });
          
          // Launch confetti animation
          if (typeof window.launchConfetti === 'function') {
              window.launchConfetti();
          }
      }

      // Stop the timer when the game ends with the correct diagnosis
      stopTimer();

      // Call endGameSession with the elapsed time when the high-yield question is answered correctly
      endGameSession(elapsedTime); // Pass the total time taken

      // Ensure the client-side patientContext reflects that the game is completed
      if (window.patientContext) {
          window.patientContext.completed = true;
          localStorage.setItem('patientContext', JSON.stringify(window.patientContext));
      }

      // NEW: Replace input area with "Play a random case" button
      const inputArea = document.getElementById('input-area');
      const textBox = document.getElementById('user-input');
      const sendButton = document.getElementById('send-button');
      const newRandomCaseButton = document.getElementById('play-random-case');
      if (inputArea) {
          
          // Replace with the new play button
          textBox.style.display = 'none';
          sendButton.style.display = 'none';
          newRandomCaseButton.style.display = 'inline-block';
          
          // Add event listener to the new button
          newRandomCaseButton.addEventListener('click', startRandomCase);
      }
  }

  // NEW: Function to start a new random case
  function startRandomCase() {
      // Clear chat history UI
      clearChatHistoryAndUI();
    
      // Show loading indicator
      const caseLoadingIndicator = document.getElementById('case-loading-indicator');
      if (caseLoadingIndicator) {
          caseLoadingIndicator.style.display = 'block';
      }
      
      // Store previous disease to avoid repetition
      const previousDisease = window.patientContext ? window.patientContext.disease : null;

      
      
      // Make API call to get a new random case
      fetch('/new_random_case', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({
              previous_disease: previousDisease
          }),
      })
      .then(response => response.json())
      .then(data => {
          if (data.error) {
              console.error("Error starting new random case:", data.error);
              return;
          }

          isLoading = false;
          gameLoading = false;
                    
          // Reset game state
          window.patientContext = {
              attempts: 2,
              completed: false,
              history: [],
              disease: data.patient_context.disease,
              case: data.patient_context.case,
              placeholder_snippet: data.patient_context.placeholder_snippet
          };

          localStorage.setItem('patientContext', JSON.stringify(window.patientContext));
          localStorage.setItem('chatHistory', JSON.stringify([])); // Clear chat history in local storage
          localStorage.setItem('case', JSON.stringify(window.patientContext.case));
          localStorage.removeItem('elapsedTime');
          
          // Reset timer
          timerStarted = false;
          elapsedTime = 0;
          document.getElementById('timer').textContent = formatTime(elapsedTime);
          clearInterval(timerInterval);

          const textBox = document.getElementById('user-input');
          const sendButton = document.getElementById('send-button');
          const newRandomCaseButton = document.getElementById('play-random-case');
                    
          // Hide loading indicator
          if (caseLoadingIndicator) {
              caseLoadingIndicator.style.display = 'none';
          }

          textBox.style.display = 'inline-block';
          sendButton.style.display = 'inline-block';
          newRandomCaseButton.style.display = 'none';
          textBox.focus();
          fixInputToBottom();

          installChatPlaceholder(data.patient_context.placeholder_snippet);
          
          // Start the timer when ready
          startTimer();
      })
      .catch(error => {
          console.error("Error fetching new random case:", error);
          // Hide loading indicator on error
          if (caseLoadingIndicator) {
              caseLoadingIndicator.style.display = 'none';
          }
          // Show error message
          alert("Failed to load a new case. Please try again.");
      });
  }

  // Function to check if the user's answer is correct
  function checkAnswer(response) {
    // Implement the logic to determine if the response is correct
    // This is a placeholder implementation; replace with actual logic
    return response.includes("CORRECT!"); // Example condition
  }

  function initializeUserStats() {
    return {
      personalBestTime: null,
      gamesCompleted: 0,
      dailyStreak: 0, // This seems to be a different streak, let's keep it
      lastPlayed: null, // This is for the heatmap/leaderboard daily streak
      gameHistory: [],
      consecutivePlayStreak: 0, // New: Tracks consecutive days played
      lastDayOfConsecutivePlay: null, // New: Stores the last date a game was won for streak tracking
      // Detailed wins: Honolulu date string, time taken, and diagnosis label
      winHistory: []
    };
  }

  // Function to retrieve user stats from local storage
  function getUserStats() {
    const stats = localStorage.getItem('userStats');
    const defaultStats = initializeUserStats();
    if (stats) {
      // Merge stored stats with default stats to ensure all keys are present
      const parsed = JSON.parse(stats);
      // Normalize legacy gameHistory entries (objects -> strings)
      if (Array.isArray(parsed.gameHistory)) {
        parsed.gameHistory = parsed.gameHistory
          .map(entry => typeof entry === 'string' ? entry : (entry && entry.date ? entry.date : null))
          .filter(Boolean);
      } else {
        parsed.gameHistory = [];
      }
      if (!Array.isArray(parsed.winHistory)) {
        parsed.winHistory = [];
      }
      return { ...defaultStats, ...parsed };
    }
    return defaultStats;
  }

  // Function to save user stats in local storage
  function saveUserStats(userStats) {
    localStorage.setItem('userStats', JSON.stringify(userStats));
    // console.log('User stats saved to local storage:', userStats);
  }

  // New function to update the streak display in the header
  function updateStreakDisplay(streakValue) {
    const streakElement = document.getElementById('streak-display');
    if (streakElement) {
      if (streakValue > 0) {
        streakElement.innerHTML = `🔥 ${streakValue}`;
      } else {
        streakElement.innerHTML = ''; // Clear if no streak
      }
    }
  }

  // Reset streak to 0 if user skipped a whole Honolulu day since last win
  function ensureStreakFreshness() {
    const honoluluOptions = { timeZone: 'Pacific/Honolulu' };
    const todayHonolulu = new Date(new Date().toLocaleString('en-US', honoluluOptions));
    const todayString = todayHonolulu.toDateString();
    const yesterdayHonolulu = new Date(todayHonolulu);
    yesterdayHonolulu.setDate(todayHonolulu.getDate() - 1);
    const yesterdayString = yesterdayHonolulu.toDateString();

    const stats = getUserStats();
    const last = stats.lastDayOfConsecutivePlay;
    
    // If no last play date, or if it's not today or yesterday, reset streak
    if (!last || (last !== todayString && last !== yesterdayString)) {
      if (stats.consecutivePlayStreak !== 0) {
        stats.consecutivePlayStreak = 0;
        saveUserStats(stats);
      }
    }
  }

  // Function to update personal best time and daily streak
  function endGameSession(finalTime) {
    const userStats = getUserStats();
    
    // Check if the new time is a personal best
    if (userStats.personalBestTime === null || finalTime < userStats.personalBestTime) {
        userStats.personalBestTime = finalTime;
        // console.log('New personal best time:', finalTime);
    }

  const honoluluOptions = { timeZone: "Pacific/Honolulu" };
    
    // Increment games played
    userStats.gamesCompleted = (userStats.gamesCompleted || 0) + 1;
    
    // --- Consecutive Play Streak Logic (Honolulu-based) ---
    const nowHonolulu = new Date(new Date().toLocaleString("en-US", honoluluOptions));
    const todayString = nowHonolulu.toDateString();
    const lastStreakDayString = userStats.lastDayOfConsecutivePlay;

    if (!lastStreakDayString) {
      userStats.consecutivePlayStreak = 1;
    } else if (lastStreakDayString === todayString) {
      // already have a win today; do not increment
    } else {
      const yesterdayHonolulu = new Date(nowHonolulu);
      yesterdayHonolulu.setDate(nowHonolulu.getDate() - 1);
      const yesterdayString = yesterdayHonolulu.toDateString();
      if (lastStreakDayString === yesterdayString) {
        userStats.consecutivePlayStreak = (userStats.consecutivePlayStreak || 0) + 1;
      } else {
        userStats.consecutivePlayStreak = 1; // missed at least one day; start at 1 with today's win
      }
    }
    userStats.lastDayOfConsecutivePlay = todayString; // update last win day

    // --- Existing daily streak logic for leaderboard/heatmap ---
    // Check if the daily streak should be updated (this is the existing one)
    const today = new Date(new Date().toLocaleString("en-US", honoluluOptions)).toDateString(); // todayString can be reused
    if (userStats.lastPlayed !== today) {
        userStats.dailyStreak = (userStats.dailyStreak || 0) + 1; // This increments if lastPlayed was not today.
        userStats.lastPlayed = today; // This updates the general last played day for heatmap.
    }
    
    // Add current win to history (for heatmap) as unique Honolulu day string
    if (!Array.isArray(userStats.gameHistory)) {
      userStats.gameHistory = [];
    }
    if (!userStats.gameHistory.includes(todayString)) {
      userStats.gameHistory.push(todayString);
      userStats.gameHistory = userStats.gameHistory.slice(-365);
    }

    // Record a detailed win entry
    if (!Array.isArray(userStats.winHistory)) {
      userStats.winHistory = [];
    }
    const diagnosis = (window.patientContext && window.patientContext.disease) ? window.patientContext.disease : null;
    userStats.winHistory.push({
      date: todayString,
      timeSeconds: finalTime,
      diagnosis: diagnosis,
      completedAtHonolulu: new Date().toLocaleString('en-US', honoluluOptions),
      completedAtUTC: new Date().toISOString()
    });
    userStats.winHistory = userStats.winHistory.slice(-365);

    saveUserStats(userStats);
    
    // Update the leaderboard UI (existing call)
    updateLeaderboardUI(userStats);
    // Update the new streak display in the header
    updateStreakDisplay(userStats.consecutivePlayStreak);
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
  const gamesCount = (userStats.gamesPlayed !== undefined) ? userStats.gamesPlayed : (userStats.gamesCompleted || 0);
  gamesPlayedElement.textContent = gamesCount;
    
    // Render a GitHub-like heatmap using the gameHistory data
    renderHeatmap(userStats.gameHistory);
  }

  // New function to render a GitHub-style heatmap.
  function renderHeatmap(gameHistory) {
    const heatmapContainer = document.getElementById('heatmap');
    if (!heatmapContainer) return;
    heatmapContainer.innerHTML = '';
  const honoluluOptions = { timeZone: 'Pacific/Honolulu' };
  const nowHonolulu = new Date(new Date().toLocaleString('en-US', honoluluOptions));
  // Create 30 cells representing the last 30 Honolulu days.
  for (let i = 29; i >= 0; i--) {
    const dayHonolulu = new Date(nowHonolulu);
    dayHonolulu.setDate(nowHonolulu.getDate() - i);
    const dayString = dayHonolulu.toDateString();
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

    function preloadGameCase() {
    console.log('Preloading game case on page load.');
    gameLoading = true;

    // Show the case loading indicator instead of the message typing indicator
    const caseLoadingIndicator = document.getElementById('case-loading-indicator');
    if (caseLoadingIndicator) {
      caseLoadingIndicator.style.display = 'block';
    }

    try {
      // console.log('Making POST request to /start_game to preload case');
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
        // console.log('Successfully preloaded game case data');
        // console.log(data);

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
        // console.error("Error during case preloading:", error);
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

    chatBox.innerHTML = '';

    // If a fresh patient_context (with placeholder_snippet) is available later, re-install.
    // This function may run before the new context arrives; the success handler should call installChatPlaceholder again.
  }

  // NEW: role select
const playerRoleSelect = document.getElementById('player-role-select');

// Initialize Player Role selection and Start Game gating
  (function initPlayerRoleGate() {
    if (!playerRoleSelect) return;

    const savedRole = localStorage.getItem('playerRole') || '';
    if (savedRole) {
      playerRoleSelect.value = savedRole;
    }
  })();


  // Start game button click handler - now just displays the preloaded case
  startGameButton.onclick = function () {
    if (playerRoleSelect) {
      const selected = playerRoleSelect.value;
      if (!selected) {
        playerRoleSelect.focus();
        // return;
      }
      // Save selection so it persists
      localStorage.setItem('playerRole', selected);
    }

    welcomeModal.style.display = 'none';
    // console.log('Start game button clicked.');

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
    // console.log('Chat box cleared for new game.');
    
    // Clear chat history in local storage
    if (!customCaseMode) {
      localStorage.setItem('chatHistory', JSON.stringify([]));
      localStorage.setItem('case', JSON.stringify(preloadedGameData.patient_context.case));
    }
    // console.log('Chat history in local storage cleared.');

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

    // NEW: initialize the placeholder AFTER the game is loaded
    const snippet = preloadedGameData?.patient_context?.placeholder_snippet;
    installChatPlaceholder(snippet);

    // Display the stats in the UI
    const userStats = getUserStats();
    updateLeaderboardUI(userStats);
    
    // console.log('Game initialization complete, user input enabled.');
  }

  // Instead, get references to the existing modal and close button:
  const instructionsModal = document.getElementById('instructions-modal');
  const closeInstructionsButton = document.getElementById('close-instructions-modal');



  // Function to load user stats from local storage when the app is loaded
  function loadUserStats() {
      const userStats = getUserStats(); // Retrieve user stats from local storage
      updateLeaderboardUI(userStats); // Update the UI with the loaded stats
  }

  // Call this function when the app is loaded to check if user stats exist
  document.addEventListener('DOMContentLoaded', function () {
    // Load user stats when the app is loaded
    // Ensure streak freshness (Honolulu-day-based) before rendering UI
    ensureStreakFreshness();
    loadUserStats(); // Call the new function to load user stats

    // Call this function when the app is loaded to check if user stats exist
    const userStats = getUserStats(); // Ensure user stats are loaded when the app starts

  // Display the stats in the UI
    updateLeaderboardUI(userStats); // Update the UI with the loaded stats
    updateStreakDisplay(userStats.consecutivePlayStreak); // Display the streak on load

    if (window.custom_patient_context) { // the server sets this variable if using /case/<token>
      customCaseMode = true;
      // console.log("Custom case mode detected");
      // Set the patient context from the custom case
      window.patientContext = window.custom_patient_context;
      // Remove any existing history to avoid conflict with the daily case.
      localStorage.removeItem('chatHistory');
      localStorage.removeItem('patientContext');
      // console.log("Custom case mode activated", window.patientContext);

      // Optionally, display an indicator that this is a custom case.
      // const customIndicator = document.getElementById('custom-case-indicator');
      // if (customIndicator) {
      //     customIndicator.style.display = 'block';
      //     customIndicator.innerText = "Custom Case Loaded";
      // }
      
      // Hide the welcome modal immediately.
      const welcomeModal = document.getElementById('welcome-modal');
      if (welcomeModal) {
          welcomeModal.style.display = 'flex';
      }
    } else {
      // console.log("Standard case mode detected");
      // Load chat history and continue game if history exists
      if (filteredChatHistory.length > 0 && !customCaseMode) {    
        // Update localStorage with filtered history
        if (filteredChatHistory.length < existingChatHistory.length) {
          localStorage.setItem('chatHistory', JSON.stringify(filteredChatHistory));
          // console.log(`Chat history cleaned.`);
          existingChatHistory = filteredChatHistory;
        } else {
          // console.log("All chat messages are from today (Honolulu time).");
        }
        // console.log('Existing chat history found, continuing game.');
        welcomeModal.style.display = 'none'; // Hide welcome modal
        
        // Enable user input
        if (!existingPatientContext.completed) {
          userInput.disabled = false;
          sendButton.disabled = false;
          sendButton.classList.remove('disabled');
        }
        //  else {
        //   // Disable user input if the game is completed
        //   userInput.disabled = true;
        //   sendButton.disabled = true;
        //   sendButton.classList.add('disabled');
        // }

        // Load saved chat history
        loadChatHistory();
        fixInputToBottom();
        
        // Restore patient context if available
        if (existingPatientContext) {
          window.patientContext = existingPatientContext;
          // console.log('Patient context restored:', window.patientContext);
        }

        // Restore timer if it was running
        const savedElapsedTime = localStorage.getItem('elapsedTime');
        // console.log('savedElapsedTime:', savedElapsedTime);
        if (savedElapsedTime) {
          elapsedTime = parseInt(savedElapsedTime, 10);
          if (existingPatientContext && !existingPatientContext.completed) {
            startTimer(); // Restart timer only if game is not completed
          } else {
            document.getElementById('timer').textContent = formatTime(elapsedTime); // Show final time if completed
          }
        }
        // Update streak display on load if continuing a game
        if (existingPatientContext) {
            updateStreakDisplay(getUserStats().consecutivePlayStreak);
        }

      } else {
        // Show welcome modal if no history or it's a new day
        welcomeModal.style.display = 'flex';
        // Preload game case when welcome modal is shown for a new game
        preloadGameCase();
        // Update streak display even if starting fresh (might be 0)
        updateStreakDisplay(getUserStats().consecutivePlayStreak);
      }
    }
  });

  // Close instructions modal when close button is clicked
  closeInstructionsButton.addEventListener('click', function(e) {
    // console.log('Close instructions button clicked');
    instructionsModal.style.display = 'none';
    if (instructionsModalSource === 'start') {
      welcomeModal.style.display = 'block';
      // console.log('Instructions modal closed, main modal displayed');
    } else {
      // console.log('Instructions modal closed, no main modal displayed');
    }
  });

  // View instructions button click handler
  viewInstructionsButton.onclick = function () {
    // console.log('Current modal display:', welcomeModal.style.display);
    // console.log('Instructions modal display before showing:', instructionsModal.style.display);
    // console.log('Instructions modal element exists:', instructionsModal !== null);
    welcomeModal.style.display = 'none';
    instructionsModal.style.display = 'block';
    instructionsModalSource = 'start';  // mark as coming from start game
    closeInstructionsButton.textContent = '←'; // back arrow for start-game modal
    // console.log('Instructions modal displayed from start game modal.');
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
          messageElement.innerHTML = entry.text;
          chatBox.appendChild(messageElement);
      });
  }

  // Helper to flatten chat history into a compact string
  function buildConversationString() {
    const history = JSON.parse(localStorage.getItem('chatHistory')) || [];
    return history.map(h => {
      const who = h.type === 'user' ? 'User' : 'AI';
      return `${who}: ${h.text || h.message || ''}`.trim();
    }).join('\n');
  }

  // Send a best-effort snapshot to the server (fire-and-forget)
  async function saveConversationSnapshot() {
    try {
      const userStats = getUserStats();
      const trainingLevel = (playerRoleSelect && playerRoleSelect.value) ? playerRoleSelect.value : 'unknown';
      const honoluluOptions = { timeZone: 'Pacific/Honolulu' };
      const todayHonolulu = new Date(new Date().toLocaleString('en-US', honoluluOptions)).toDateString();

      await fetch('/save_conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          training_level: trainingLevel,
          date: todayHonolulu, // or omit to let server use UTC
          disease: (window.patientContext && window.patientContext.disease) ? window.patientContext.disease : null,
          daily_streak: userStats.consecutivePlayStreak || 0,
          games_played: Array.isArray(userStats.gameHistory) ? userStats.gameHistory.length : 0,
          games_completed: userStats.gamesCompleted || 0,
          last_played: userStats.lastPlayed || todayHonolulu,
          elapsed_time: typeof elapsedTime === 'number' ? elapsedTime : 0,
          conversation: buildConversationString()
        })
      });
    } catch (e) {
      console.warn('Failed to save conversation snapshot', e);
      // Intentionally non-blocking
    }
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
          // saveConversationSnapshot(); // Fire-and-forget snapshot save

          userInput.value = ''; // Clear input

          // Show animated typing indicator for message loading (mid-game)
          const loadingIndicator = document.getElementById('loading-indicator');
          loadingIndicator.style.display = 'inline-flex'; // Show typing indicator
          // console.log('Message loading indicator displayed.');

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
              // console.log(window.patientContext);
              if (!response.ok) {
                  // console.log(response);
                  throw new Error('Network response was not ok');
              }
              return response;
          })
          .then((data) => {
              // console.log(data);

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
                    saveConversationSnapshot(); // Fire-and-forget snapshot save
                    return;
                  }
                  let newText = decoder.decode(value, { stream: true });
                  console.log('Received chunk:', newText);
                  if (newText.includes('%%%') && !window.patientContext.completed) {
                    // console.log('Correct answer found');
                    patientMessage.style.maxWidth = '100%';
                    handleEnd(true);
                    window.patientContext.completed = true;
                    newText = newText.replace('%%%', '');
                    // Disable inputs when game ends
                    userInput.disabled = true;
                    sendButton.disabled = true;
                    sendButton.classList.add('disabled');
                  }
                  if (newText.includes('~~~') && !window.patientContext.completed) {
                    patientMessage.style.maxWidth = '100%';
                    handleEnd(false);
                    window.patientContext.completed = true;
                    newText = newText.replace('~~~', '');
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
                    // console.log('Ordered test');
                    patientMessage.style.maxWidth = '100%';
                    patientMessage.innerHTML = patientMessage.innerHTML.replace('$$$', '');
                  }
                  read();
                }).catch(err => {
                  // console.error("Error reading stream:", err);
                });
              }
              read();

              // Hide typing indicator
              const loadingIndicator = document.getElementById('loading-indicator');
              loadingIndicator.style.display = 'none'; // Hide typing indicator
              // console.log('Loading indicator hidden.');
              
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
              // console.log('Loading indicator hidden due to error.');
              
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

      // console.log('Submit Case button clicked.'); // Log button click
      // console.log('Case Description:', caseDescription); // Log the case description

      if (diseaseName.trim() === "") {
          alert("Please enter a disease name.");
          return;
      }

      // Show loading state
      const submitButton = document.getElementById('submit-case');
      submitButton.innerHTML = '<span class="loading-spinner"></span> Creating...';
      submitButton.disabled = true;

      // console.log('Submitting case description:', diseaseName, caseDescription); // Log case description before submission

      // Call the endpoint to submit the case
      fetch('/submit_case', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({ disease: diseaseName, description: caseDescription })
      })
      .then(response => {
          // console.log('Received response from /submit_case:', response); // Log the response object
          return response.json();
      })
      .then(data => {
          // console.log('Response data:', data); // Log the parsed response data
          
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

document.getElementById('generate-case-btn').addEventListener('click', function() {
    const chiefComplaint = document.getElementById('chief-complaint').value.trim();
    const specialty = document.getElementById('specialty').value;

    const generateButton = document.getElementById('generate-case-btn');
    generateButton.innerHTML = '<span class="loading-spinner"></span> Generating...';
    generateButton.disabled = true;

    fetch('/generate_case_by_criteria', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            chief_complaint: chiefComplaint,
            specialty: specialty
        })
    })
    .then(response => response.json())
    .then(data => {
        generateButton.innerHTML = 'Generate Case';
        generateButton.disabled = false;

        if (data && data.url) {
            // Store the generated case URL globally so the Play button can use it
            window.generatedCaseUrl = data.url;

            // Reveal the result block (now exists in the HTML)
            const resultContainer = document.getElementById('generate-result-container');
            if (resultContainer) {
                resultContainer.style.display = 'block';
                resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        } else {
            console.error('Invalid response data:', data);
            alert("Error generating case. Please try again.");
        }
    })
    .catch(error => {
        console.error('Error during generate case fetch:', error);
        generateButton.innerHTML = 'Generate Case';
        generateButton.disabled = false;
        alert("An error occurred. Please try again.");
    });
});

// Play generated case functionality: redirect to the generated URL
document.getElementById('play-generated-case').addEventListener('click', function() {
    if (window.generatedCaseUrl) {
        // Navigate to the generated URL so the user plays that case
        window.location.href = window.generatedCaseUrl;
    } else {
        alert('Please generate a case first.');
    }
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
              // console.log('URL copied to clipboard:', url);
              
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
  updateStreakDisplay(userStats.consecutivePlayStreak); // Display the streak on load

  viewInstructionsButton.onclick = function () {
    // console.log('Current modal display:', welcomeModal.style.display);
    // console.log('Instructions modal display before showing:', instructionsModal.style.display);
    // console.log('Instructions modal element exists:', instructionsModal !== null);
    welcomeModal.style.display = 'none';
    instructionsModal.style.display = 'block';
    instructionsModalSource = 'start';  // mark as coming from start game
    closeInstructionsButton.textContent = '←'; // back arrow for start-game modal
    // console.log('Instructions modal displayed from start game modal.');
  };

  // document.getElementById('view-instructions-game').addEventListener('click', function() {
  //   // console.log('View Instructions button clicked from the game.');
  //   instructionsModal.style.display = 'block';
  //   welcomeModal.style.display = 'none'; // Hide the start game modal
  //   instructionsModalSource = 'game';
  //   closeInstructionsButton.textContent = '×';
  // });

  closeInstructionsButton.addEventListener('click', function(e) {
    // console.log('Close instructions button clicked');
    instructionsModal.style.display = 'none';
    if (instructionsModalSource === 'start') {
        welcomeModal.style.display = 'block';
        // console.log('Instructions modal closed, returning to welcome modal.');
    } else {
        welcomeModal.style.display = 'none';
        // console.log('Instructions modal closed, returning to game.');
        // Do not show the main modal
    }
    instructionsModalSource = null;
  });
  document.head.insertAdjacentHTML('beforeend', `
      <style>
          .play-again-button {
              background-color: #4caf50;
              color: white;
              border: none;
              padding: 12px 20px;
              text-align: center;
              text-decoration: none;
              display: block;
              font-size: 1em;
              cursor: pointer;
              border-radius: 8px;
              transition: background-color 0.3s;
              margin: 3px auto 0 auto;
              width: 100%;
              height: 100%;
              max-width: 300px;
          }
          
          .play-again-button:hover {
              background-color: #45a049;
          }
          
          .play-again-button:active {
              transform: scale(0.98);
          }
      </style>
  `);
});

// Move these variables to global scope (before the DOMContentLoaded event)
let interactiveFeedbackActive = false;
let feedbackMoments = [];
let currentFeedbackIndex = 0;

// Move all interactive feedback functions to global scope
function startInteractiveFeedback() {
  if (!window.patientContext || !window.patientContext.completed) {
    console.error('Cannot start interactive feedback: game not completed');
    return;
  }

  // Fetch interactive feedback data
  fetch('/get_interactive_feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      patient_context: window.patientContext
    }),
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      feedbackMoments = data.feedback_data.feedback_moments || [];
      currentFeedbackIndex = 0;
      interactiveFeedbackActive = true;
      
      if (feedbackMoments.length > 0) {
        // Hide the interactive feedback button
        const feedbackButton = document.getElementById('interactive-feedback-button');
        if (feedbackButton) {
          feedbackButton.style.display = 'none';
        }
        
        // Show the first feedback moment
        showFeedbackMoment(0);
      } else {
        alert('No feedback moments available for this session.');
      }
    } else {
      console.error('Failed to get interactive feedback:', data.error);
      alert('Failed to load interactive feedback. Please try again.');
    }
  })
  .catch(error => {
    console.error('Error fetching interactive feedback:', error);
    alert('Error loading interactive feedback. Please try again.');
  });
}

function showFeedbackMoment(index) {
  if (index >= feedbackMoments.length || index < 0) {
    endInteractiveFeedback();
    return;
  }

  const moment = feedbackMoments[index];
  currentFeedbackIndex = index;
  
  // Find the target message in the chat
  const chatMessages = document.querySelectorAll('.message');
  let targetMessage = null;
  
  // Find the message that matches the feedback moment
  chatMessages.forEach((msg, msgIndex) => {
    if (msg.textContent.includes(moment.message_text) || 
        (moment.message_index && msgIndex === moment.message_index)) {
      targetMessage = msg;
    }
  });
  
  if (targetMessage) {
    // Clear any existing highlights
    clearFeedbackHighlights();
    
    // Add highlight to the target message
    targetMessage.classList.add('feedback-highlight');
    
    // Scroll to the message
    targetMessage.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center' 
    });
    
    // Create and show the feedback panel
    showFeedbackPanel(moment, index);
  } else {
    console.warn('Could not find target message for feedback moment:', moment);
    // Skip to next moment if message not found
    showFeedbackMoment(index + 1);
  }
}

function showFeedbackPanel(moment, index) {
  // Remove any existing feedback panel
  const existingPanel = document.getElementById('feedback-panel');
  if (existingPanel) {
    existingPanel.remove();
  }
  
  // Create feedback panel
  const feedbackPanel = document.createElement('div');
  feedbackPanel.id = 'feedback-panel';
  feedbackPanel.className = 'feedback-panel';
  
  // Determine the icon and color based on feedback type
  let icon = '💡';
  let panelClass = 'feedback-panel';
  
  if (moment.feedback_type === 'skillful') {
    icon = '🎯';
    panelClass += ' feedback-skillful';
  } else if (moment.feedback_type === 'improvement') {
    icon = '📈';
    panelClass += ' feedback-improvement';
  } else if (moment.feedback_type === 'crucial') {
    icon = '🔑';
    panelClass += ' feedback-crucial';
  }
  
  feedbackPanel.className = panelClass;
  
  feedbackPanel.innerHTML = `
    <div class="feedback-header">
      <span class="feedback-icon">${icon}</span>
      <h3 class="feedback-title">${moment.title}</h3>
      <div class="feedback-counter">${index + 1} of ${feedbackMoments.length}</div>
    </div>
    <div class="feedback-content">
      <p class="feedback-message">${moment.coaching_message}</p>
    </div>
    <div class="feedback-controls">
      ${index > 0 ? '<button class="feedback-btn feedback-btn-secondary" onclick="showFeedbackMoment(' + (index - 1) + ')">Previous</button>' : ''}
      <button class="feedback-btn feedback-btn-primary" onclick="showFeedbackMoment(' + (index + 1) + ')">
        ${index < feedbackMoments.length - 1 ? 'Next' : 'Finish'}
      </button>
    </div>
  `;
  
  // Add panel to the page
  document.body.appendChild(feedbackPanel);
  
  // Position the panel
  setTimeout(() => {
    feedbackPanel.style.opacity = '1';
    feedbackPanel.style.transform = 'translateY(0)';
  }, 100);
}

function clearFeedbackHighlights() {
  const highlightedMessages = document.querySelectorAll('.feedback-highlight');
  highlightedMessages.forEach(msg => {
    msg.classList.remove('feedback-highlight');
  });
}

function endInteractiveFeedback() {
  interactiveFeedbackActive = false;
  currentFeedbackIndex = 0;
  feedbackMoments = [];
  
  // Clear highlights
  clearFeedbackHighlights();
  
  // Remove feedback panel
  const feedbackPanel = document.getElementById('feedback-panel');
  if (feedbackPanel) {
    feedbackPanel.remove();
  }
  
  // Show completion message
  const completionMessage = document.createElement('div');
  completionMessage.className = 'message llm-message';
  completionMessage.innerHTML = `
    <div style="text-align: center; padding: 20px;">
      <h3>🎉 Feedback Session Complete!</h3>
      <p>Great job working through the feedback. Continue practicing to improve your clinical reasoning skills!</p>
    </div>
  `;
  
  const chatBox = document.getElementById('chat-box');
  chatBox.appendChild(completionMessage);
  
  // Scroll to bottom
  chatBox.scrollTop = chatBox.scrollHeight;
}



// Remove all existing window.onclick assignments and add the following unified handler:
window.addEventListener('click', function (event) {
    // If the clicked element has a class of "modal", then it is the overlay.
    if (event.target.classList.contains('modal') && event.target.id !== 'welcome-modal') {
        event.target.style.display = 'none';
        // console.log('Modal closed by clicking outside its content.');
    }
});

if (document.readyState !== 'loading') {
  // Add event listeners for header buttons
  try {
    // Instructions button
    document.getElementById('view-instructions-icon').addEventListener('click', function() {
      // console.log('Instructions icon clicked');
      const instructionsModal = document.getElementById('instructions-modal');
      instructionsModal.style.display = 'block';
      instructionsModalSource = 'header';  // mark as coming from header
      document.getElementById('close-instructions-modal').textContent = '×'; // regular close button
      // console.log('Instructions modal displayed from header.');
      document.getElementById('welcome-modal').style.display = 'none';

    });
    
    // Create case button
    document.getElementById('create-case-icon').addEventListener('click', function() {
      // console.log('Create case icon clicked');
      document.getElementById('create-case-modal').style.display = 'block';
    });
    
    // Generate case button
    document.getElementById('generate-case-icon').addEventListener('click', function() {
      // console.log('Generate case icon clicked');
      document.getElementById('generate-case-modal').style.display = 'block';
    });
    
    // View leaderboard button
    document.getElementById('view-leaderboard-icon').addEventListener('click', function() {
      // console.log('Leaderboard icon clicked');
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
    
    document.getElementById('close-generate-case-modal').addEventListener('click', function() {
      document.getElementById('generate-case-modal').style.display = 'none';
      document.getElementById('chief-complaint').value = '';
      document.getElementById('specialty').value = '';
      document.getElementById('generate-result-container').style.display = 'none';
    });
  } catch (error) {
    console.error('Error setting up event listeners:', error);
  }
}

// Function to save user stats in local storage
function saveUserStats(userStats) {
    localStorage.setItem('userStats', JSON.stringify(userStats));
    // console.log('User stats saved to local storage:', userStats);
}

// Function to update personal best time and daily streak
function endGameSession(finalTime) {
    const userStats = getUserStats();
    // console.log('[endGameSession] Initial userStats loaded:', JSON.parse(JSON.stringify(userStats))); // Log loaded stats

    // Check if the new time is a personal best
    if (userStats.personalBestTime === null || finalTime < userStats.personalBestTime) {
        userStats.personalBestTime = finalTime;
        // console.log('[endGameSession] New personal best time:', finalTime);
    }
    
    // Increment games played
    userStats.gamesCompleted = (userStats.gamesCompleted || 0) + 1;
    
    // --- Consecutive Play Streak Logic (Honolulu-based) ---
    const honoluluOptions = { timeZone: 'Pacific/Honolulu' };
    const nowHonolulu = new Date(new Date().toLocaleString('en-US', honoluluOptions));
    const todayString = nowHonolulu.toDateString();
    const lastStreakDayString = userStats.lastDayOfConsecutivePlay;
    // console.log(`[endGameSession] StreakLogic: todayString='${todayString}', lastStreakDayString='${lastStreakDayString}', current loaded consecutivePlayStreak=${userStats.consecutivePlayStreak}`);

    if (lastStreakDayString === null) { 
      userStats.consecutivePlayStreak = 1;
      // console.log("[endGameSession] StreakLogic: First game, streak set to 1");
    } else if (lastStreakDayString === todayString) {
      // console.log("[endGameSession] StreakLogic: Already played today, streak remains " + userStats.consecutivePlayStreak);
      // do not increment on multiple wins in the same Honolulu day
    } else { 
      const yesterdayHonolulu = new Date(nowHonolulu);
      yesterdayHonolulu.setDate(nowHonolulu.getDate() - 1);
      const yesterdayString = yesterdayHonolulu.toDateString();

      if (lastStreakDayString === yesterdayString) { 
        userStats.consecutivePlayStreak = (userStats.consecutivePlayStreak || 0) + 1;
        // console.log("[endGameSession] StreakLogic: Played yesterday, streak incremented to " + userStats.consecutivePlayStreak);
      } else { 
        userStats.consecutivePlayStreak = 1; 
        // console.log("[endGameSession] StreakLogic: Missed a day, streak reset to 1");
      }
    }
    userStats.lastDayOfConsecutivePlay = todayString; 
    // console.log('[endGameSession] StreakLogic: userStats.consecutivePlayStreak is now ' + userStats.consecutivePlayStreak + ', lastDayOfConsecutivePlay is now ' + userStats.lastDayOfConsecutivePlay);

    // --- Existing daily streak logic for leaderboard/heatmap ---
    if (userStats.lastPlayed !== todayString) { 
        userStats.dailyStreak = (userStats.dailyStreak || 0) + 1; 
        userStats.lastPlayed = todayString; 
    }
    
    if (!Array.isArray(userStats.gameHistory)) {
      userStats.gameHistory = [];
    }
    if (!userStats.gameHistory.includes(todayString)) {
      userStats.gameHistory.push(todayString);
      userStats.gameHistory = userStats.gameHistory.slice(-365);
    }

    // Append winHistory entry
    if (!Array.isArray(userStats.winHistory)) {
      userStats.winHistory = [];
    }
    const diagnosis = (window.patientContext && window.patientContext.disease) ? window.patientContext.disease : null;
    userStats.winHistory.push({
      date: todayString,
      timeSeconds: finalTime,
      diagnosis: diagnosis,
      completedAtHonolulu: new Date().toLocaleString('en-US', honoluluOptions),
      completedAtUTC: new Date().toISOString()
    });
    userStats.winHistory = userStats.winHistory.slice(-365);

    // console.log('[endGameSession] UserStats before saving:', JSON.parse(JSON.stringify(userStats)));
    saveUserStats(userStats); 
    
    updateLeaderboardUI(userStats); 
    // console.log('[endGameSession] Calling updateStreakDisplay with:', userStats.consecutivePlayStreak);
    updateStreakDisplay(userStats.consecutivePlayStreak); 
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
  // console.log('Instructions modal displayed from header.');
  
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

