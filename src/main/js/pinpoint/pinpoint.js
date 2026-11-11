import { autoSolve } from './dom.js';

const polyfilledBrowser = (typeof browser !== 'undefined') ? browser : chrome;

function onSolveMessage(message, sender, sendResponse) {
  if (message?.type === 'LINKEDIN_GAMES_SOLVE' && message?.game === 'pinpoint') {
    autoSolve(message.clues ?? []).then(sendResponse).catch(error => {
      console.error('Pinpoint autoSolve failed', error);
      sendResponse({ solved: false, reason: 'error', message: error.message });
    });
    return true;
  }
}

if (!window.__linkedinGamesPinpointListenerRegistered) {
  polyfilledBrowser.runtime.onMessage.addListener(onSolveMessage);
  window.__linkedinGamesPinpointListenerRegistered = true;
}

window['pinpointPopupButtonOnClick'] = autoSolve;
