const polyfilledBrowser = (typeof browser !== 'undefined') ? browser : chrome;
let lexiconPromise;

export function loadLocalLexicon() {
  if (!lexiconPromise) {
    const url = polyfilledBrowser.runtime.getURL('lexicon.json');
    lexiconPromise = fetch(url).then(response => {
      if (!response.ok) {
        throw new Error(`Local lexicon request failed (${response.status})`);
      }
      return response.json();
    });
  }
  return lexiconPromise;
}
