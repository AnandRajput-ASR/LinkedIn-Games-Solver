export function getGridDiv(extractFromDocument) {
  const pendingDocuments = [document];
  const visitedDocuments = new Set();
  while (pendingDocuments.length > 0) {
    const currentDocument = pendingDocuments.shift();
    if (!currentDocument || visitedDocuments.has(currentDocument)) continue;
    visitedDocuments.add(currentDocument);

    const gridDiv = extractFromDocument.call(null, currentDocument);
    if (gridDiv) return gridDiv;

    for (const frame of currentDocument.querySelectorAll('iframe')) {
      let frameDocument;
      try {
        frameDocument = frame.contentDocument || frame.contentWindow?.document;
      } catch {
        continue;
      }
      if (frameDocument && !visitedDocuments.has(frameDocument)) {
        pendingDocuments.push(frameDocument);
      }
    }
  }
  throw new Error('Could not extract div corresponding to grid');
}

export function doOneMouseCycle(clickTarget) {
  const w = clickTarget.ownerDocument.defaultView;
  const commonClickArgs = { bubbles: true, cancelable: true, view: w};
  clickTarget.dispatchEvent(new MouseEvent('mousedown', commonClickArgs));
  clickTarget.dispatchEvent(new MouseEvent('mouseup', commonClickArgs));
}

export function doOneClick(clickTarget) {
  const w = clickTarget.ownerDocument.defaultView;
  const commonArgs = { bubbles: true, cancelable: true, view: w };
  const pointerArgs = { ...commonArgs, isPrimary: true, pointerId: 1 };
  clickTarget.dispatchEvent(new PointerEvent('pointerover', pointerArgs));
  clickTarget.dispatchEvent(new PointerEvent('pointerenter', pointerArgs));
  clickTarget.dispatchEvent(new PointerEvent('pointerdown', pointerArgs));
  clickTarget.dispatchEvent(new MouseEvent('mousedown', commonArgs));
  clickTarget.dispatchEvent(new PointerEvent('pointerup', pointerArgs));
  clickTarget.dispatchEvent(new MouseEvent('mouseup', commonArgs));
  clickTarget.dispatchEvent(new MouseEvent('click', commonArgs));
}

export async function anticipateOneMutation(cellDiv, loc, observationRoot = cellDiv) {
  return new Promise((resolve, reject) => {
    // Timeout-based cleanup (in case no mutations are observed)
    let timeoutRef = setTimeout(() => {
      observer.disconnect();
      console.error('Timed out anticipating mutation on', cellDiv);
      return reject(new Error('Timed out trying to clear cell ' + loc));
    }, 10000);
    // Clean up (including aforementioned timeout) if mutation is observed
    const observer = new MutationObserver(() => {
      clearTimeout(timeoutRef);
      observer.disconnect();
      return resolve();
    });
    // Register the observer
    observer.observe(observationRoot, {
      attributes: true,
      childList: true,
      subtree: true
    });
    // Fire a full click (pointer + mouse + click events).
    // doOneMouseCycle is intentionally omitted — firing it in addition to
    // doOneClick would cause 2 state-changes per call on games that respond
    // to pointer/mousedown events (e.g. Tango), corrupting the click sequence.
    doOneClick(cellDiv);
  });
}
