const button = document.querySelector("button");
const pinpointClues = document.querySelector('#pinpoint-clues');
const pinpointCluesLabel = document.querySelector('#pinpoint-clues-label');
const pinpointCluesHelp = document.querySelector('#pinpoint-clues-help');
const status = document.querySelector('#popup-status');

// Support both browser.* and chrome.* APIs.
const polyfilledBrowser = (typeof browser !== 'undefined') ? browser : chrome;
polyfilledBrowser.tabs.query({ active: true, currentWindow: true })
    .then(([tab]) => {
      const url = tab.url || "";
      const isQueens = url.includes("linkedin.com/games/queens");
      const isSudoku = url.includes("linkedin.com/games/sudo")
          || url.includes("linkedin.com/games/mini-sudo")
          || url.includes("linkedin.com/games/minisudoku");
      const isZip = url.includes("linkedin.com/games/zip");
      const isTango = url.includes("linkedin.com/games/tango");
      const isPatches = url.includes("linkedin.com/games/patches");
      const isWend = url.includes("linkedin.com/games/wend");
      const isCrossclimb = url.includes("linkedin.com/games/crossclimb");
      const isPinpoint = url.includes("linkedin.com/games/pinpoint");

      if (isQueens) {
        enableButtonExecuteScript(button, 'Solve Queens', tab, 'queens');
      } else if (isSudoku) {
        enableButtonExecuteScript(button, 'Solve Mini-Sudoku', tab, 'sudoku');
      } else if (isZip) {
        enableButtonExecuteScript(button, 'Solve Zip', tab, 'zip');
      } else if (isTango) {
        enableButtonExecuteScript(button, 'Solve Tango', tab, 'tango');
      } else if (isPatches) {
        enableButtonExecuteScript(button, 'Solve Patches', tab, 'patches');
      } else if (isWend) {
        enableButtonExecuteScript(button, 'Solve Wend', tab, 'wend');
      } else if (isCrossclimb) {
        enableButtonExecuteScript(button, 'Solve Crossclimb', tab, 'crossclimb');
      } else if (isPinpoint) {
        pinpointClues.hidden = false;
        pinpointCluesLabel.hidden = false;
        pinpointCluesHelp.hidden = false;
        enableButtonExecuteScript(button, 'Find Pinpoint category', tab,
          'pinpoint', () => ({ clues: pinpointClues.value.split(/\r?\n/)
            .map(clue => clue.trim()).filter(Boolean) }));
      } else {
        disableButton(button);
      }
    });

/**
 * Sends a solve request to the game content script and falls back to injecting
 * the game script first when the listener is not yet attached.
 */
function enableButtonExecuteScript(button, textContent, tab, gameName,
  payloadProvider) {
  enableButton(button);
  button.textContent = textContent;
  button.addEventListener("click", async () => {
    const payload = payloadProvider?.() ?? {};
    status.textContent = gameName === 'pinpoint' ? 'Working...' : '';
    const message = { type: 'LINKEDIN_GAMES_SOLVE', game: gameName, ...payload };
    let response;
    try {
      response = await polyfilledBrowser.tabs.sendMessage(tab.id, message);
    } catch (err) {
      try {
        await polyfilledBrowser.scripting.executeScript({
          target: { tabId: tab.id },
          files: [`${gameName}.js`],
        });
        response = await polyfilledBrowser.tabs.sendMessage(tab.id, message);
      } catch (innerErr) {
        console.error('Failed to trigger solver', innerErr || err);
        if (gameName === 'pinpoint') {
          status.textContent = innerErr?.message || err.message
            || 'Could not reach the Pinpoint solver.';
          return;
        }
      }
    }
    updatePinpointStatus(gameName, response);
  });
}

function updatePinpointStatus(gameName, response) {
  if (gameName !== 'pinpoint') return;
  if (!response) {
    status.textContent = 'No response from the Pinpoint solver. Reload the page and try again.';
  } else if (response.solved) {
    status.textContent = `Submitted category: ${response.category}`;
  } else if (response.reason === 'needs-more-clues') {
    status.textContent = `Tried ${response.guessesTried} local guess(es); add another readable clue and retry.`;
  } else if (response.reason === 'guess-did-not-reveal-clue') {
    status.textContent = `Tried "${response.lastGuess}" but no readable clue appeared. Reveal another clue and retry.`;
  } else if (response.reason === 'probe-limit-reached') {
    status.textContent = `Tried ${response.guessesTried} local guesses without solving. Add more clue text and retry.`;
  } else {
    status.textContent = response.message || 'No confident local category found.';
  }
}

function enableButton(button) {
  button.disabled = false;
  button.style.opacity = "1";
  button.style.cursor = "pointer";
}

function disableButton(button) {
  button.disabled = true;
  button.style.opacity = "0.5";
  button.style.cursor = "not-allowed";
  button.title = "Not currently visiting supported Linkedin game URL";
}
