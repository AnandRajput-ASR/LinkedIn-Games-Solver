import { autoSolve } from './dom.js';

const polyfilledBrowser = (typeof browser !== 'undefined') ? browser : chrome;

function onSolveMessage(message) {
  if (message?.type === 'LINKEDIN_GAMES_SOLVE' && message?.game === 'crossclimb') {
    autoSolve().catch(error => console.error('Crossclimb autoSolve failed', error));
  }
}

if (!window.__linkedinGamesCrossclimbListenerRegistered) {
  polyfilledBrowser.runtime.onMessage.addListener(onSolveMessage);
  window.__linkedinGamesCrossclimbListenerRegistered = true;
}

window['crossclimbPopupButtonOnClick'] = autoSolve;
