import { autoSolve } from './dom.js';

const polyfilledBrowser = (typeof browser !== 'undefined') ? browser : chrome;

/**
 * Handles popup solve requests for the Zip game.
 */
function onSolveMessage(message) {
	if (message?.type === 'LINKEDIN_GAMES_SOLVE' && message?.game === 'zip') {
		autoSolve();
	}
}

if (!window.__linkedinGamesZipListenerRegistered) {
	polyfilledBrowser.runtime.onMessage.addListener(onSolveMessage);
	window.__linkedinGamesZipListenerRegistered = true;
}

window['zipPopupButtonOnClick'] = autoSolve;
