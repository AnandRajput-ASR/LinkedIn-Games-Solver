const button = document.querySelector("button");

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
    const message = { type: 'LINKEDIN_GAMES_SOLVE', game: gameName };
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
      }
    }
  });
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
