import { autoSolve } from './dom.js';

const polyfilledBrowser = (typeof browser !== 'undefined') ? browser : chrome;

function onSolveMessage(message) {
  if (message?.type === 'LINKEDIN_GAMES_SOLVE' && message?.game === 'wend') {
    autoSolve().catch(error => console.error('Wend autoSolve failed', error));
  }
}

if (!window.__linkedinGamesWendListenerRegistered) {
  polyfilledBrowser.runtime.onMessage.addListener(onSolveMessage);
  window.__linkedinGamesWendListenerRegistered = true;
}

window['wendPopupButtonOnClick'] = autoSolve;
