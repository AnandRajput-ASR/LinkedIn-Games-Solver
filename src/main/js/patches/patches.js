import { autoSolve } from './dom.js';

const polyfilledBrowser = (typeof browser !== 'undefined') ? browser : chrome;

function onSolveMessage(message) {
  if (message?.type === 'LINKEDIN_GAMES_SOLVE' && message?.game === 'patches') {
    autoSolve().catch(e => console.error('Patches autoSolve failed', e));
  }
}

if (!window.__linkedinGamesPatchesListenerRegistered) {
  polyfilledBrowser.runtime.onMessage.addListener(onSolveMessage);
  window.__linkedinGamesPatchesListenerRegistered = true;
}

window['patchesPopupButtonOnClick'] = autoSolve;
