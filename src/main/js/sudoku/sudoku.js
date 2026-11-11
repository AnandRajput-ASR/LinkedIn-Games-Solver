import { autoSolve } from './dom.js';

const polyfilledBrowser = (typeof browser !== 'undefined') ? browser : chrome;

/**
 * Handles popup solve requests for the Sudoku game.
 */
function onSolveMessage(message) {
	if (message?.type === 'LINKEDIN_GAMES_SOLVE' && message?.game === 'sudoku') {
		autoSolve();
	}
}

if (!window.__linkedinGamesSudokuListenerRegistered) {
	polyfilledBrowser.runtime.onMessage.addListener(onSolveMessage);
	window.__linkedinGamesSudokuListenerRegistered = true;
}

window['sudokuPopupButtonOnClick'] = autoSolve;
