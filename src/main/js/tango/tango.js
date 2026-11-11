import { autoSolve } from './dom.js';

const polyfilledBrowser = (typeof browser !== 'undefined') ? browser : chrome;

/**
 * Handles popup solve requests for the Tango game.
 */
function onSolveMessage(message) {
	if (message?.type === 'LINKEDIN_GAMES_SOLVE' && message?.game === 'tango') {
		autoSolve();
	}
}

if (!window.__linkedinGamesTangoListenerRegistered) {
	polyfilledBrowser.runtime.onMessage.addListener(onSolveMessage);
	window.__linkedinGamesTangoListenerRegistered = true;
}

window['tangoPopupButtonOnClick'] = autoSolve;
