import { autoSolve } from './dom.js';

const polyfilledBrowser = (typeof browser !== 'undefined') ? browser : chrome;

/**
 * Handles popup solve requests for the Queens game.
 */
function onSolveMessage(message) {
	if (message?.type === 'LINKEDIN_GAMES_SOLVE' && message?.game === 'queens') {
		autoSolve();
	}
}

if (!window.__linkedinGamesQueensListenerRegistered) {
	polyfilledBrowser.runtime.onMessage.addListener(onSolveMessage);
	window.__linkedinGamesQueensListenerRegistered = true;
}

window['queensPopupButtonOnClick'] = autoSolve;
