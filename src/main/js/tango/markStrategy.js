import { doOneClick } from '../util.js';

export async function learnMarkStrategy(clickableCell, getCellDivIsBlank) {
  const blankCell = await clearCell(clickableCell, getCellDivIsBlank);
  return await exploreMarkStrategy(blankCell, getCellDivIsBlank);
}

async function clearCell(clickableCell, getCellDivIsBlank) {
  // If already blank, return immediately.
  if (getCellDivIsBlank.call(null, clickableCell)) {
    return clickableCell;
  }
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(observerCallback);
    const timeoutRef = setTimeout(() => {
      observer.disconnect();
      return reject(new Error('Timed out trying to clear cell'));
    }, 10000);
    let callCount = 0;
    let clickScheduled = false;
    // Track innerHTML fingerprints to detect full cycle (blank → s1 → s2 → blank)
    const seenFingerprints = new Map();
    observer.observe(clickableCell, {
      attributes: true,
      subtree: true,
      childList: true
    });
    // Defer first click so any in-progress React render settles first
    scheduleClick();

    function scheduleClick() {
      if (clickScheduled) return;
      clickScheduled = true;
      // setTimeout(0) ensures we never click mid-transition:
      // React removes old SVG (mutation → callback), then adds new SVG
      // (mutation → callback). Without deferral we'd click on the empty
      // interim state before the new SVG is attached.
      setTimeout(() => {
        clickScheduled = false;
        doOneClick(clickableCell);
      }, 0);
    }

    function observerCallback(mutations, observer) {
      // Check added nodes first — catches blank state even mid-transition
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && (
              node.getAttribute?.('data-testid') === 'cell-empty' ||
              node.getAttribute?.('aria-label')?.toLowerCase() === 'empty' ||
              node.querySelector?.('[data-testid="cell-empty"]'))) {
            clearTimeout(timeoutRef);
            observer.disconnect();
            return resolve(clickableCell);
          }
        }
      }
      if (getCellDivIsBlank.call(null, clickableCell)) {
        clearTimeout(timeoutRef);
        observer.disconnect();
        return resolve(clickableCell);
      }
      // Fingerprint to detect full cycle
      const fp = clickableCell.innerHTML;
      if (seenFingerprints.has(fp)) {
        clearTimeout(timeoutRef);
        observer.disconnect();
        console.warn('clearCell: completed full cycle without detecting blank.',
            'outerHTML:', clickableCell.outerHTML?.substring(0, 600));
        return resolve(clickableCell);
      }
      seenFingerprints.set(fp, callCount);
      if (++callCount >= 30) {
        clearTimeout(timeoutRef);
        observer.disconnect();
        console.debug('clearCell: cell outerHTML at failure:', clickableCell.outerHTML?.substring(0, 600));
        return reject(new Error('Failed to clear cell after 30 clicks'));
      }
      scheduleClick();
    }
  });
}

async function exploreMarkStrategy(blankCell, getCellDivIsBlank) {
  return new Promise((resolve, reject) => {
    // The strategy to return.
    let strategy = undefined;
    // Descriptors of the strategy to return.
    let sunLabel, moonLabel;

    // Instantiate mutation listener that drives strategy learning.
    const observer = new MutationObserver(observerCallback);
    // The number of times observerCallback() has been invoked.
    let callCount = 0;
    // Timeout-based safeguard to prevent hanging if DOM mutations break.
    const timeoutRef = setTimeout(() => {
      observer.disconnect();
      console.error('Timed out learning strategy; fallback to default. Dump:',
          'sunAriaLabel=' + sunLabel + ',',
          'moonAriaLabel=' + moonLabel);
      resolve(new AriaLabelStrategy('Sun', 'Moon', getCellDivIsBlank));
    }, 10000);
    observer.observe(blankCell, {
      attributes: true,
      subtree: true,
      childList: true
    });

    // Pre-seed sunLabel from the cell's current state ONLY if it is not blank.
    // This handles 2-state cells (Sun ↔ Moon, no blank) where clearCell
    // resolved via cycle detection rather than reaching a true blank state.
    const existingSvg = blankCell.querySelector(
        'svg[aria-label]:not([data-testid="cell-empty"])');
    const existingLabel = existingSvg?.getAttribute('aria-label');
    if (existingLabel && existingLabel.toLowerCase() !== 'empty') {
      sunLabel = existingLabel;
    }

    // Kickoff!
    doOneClick(blankCell);

    function observerCallback(mutations, observer) {
      if (strategy) {
        resolveStrategy(strategy);
        return;
      }
      // Bound the number of times we click the div, even if we learned nothing.
      // 30 click-then-examine cycles should be plenty.
      if (callCount++ >= 30) {
        console.error('Failed to learn strategy within 30 clicks;',
            'falling back to default. Dump:',
            'sunAriaLabel=' + sunLabel + ',',
            'moonAriaLabel=' + moonLabel);
        resolveStrategy(
            new AriaLabelStrategy('Sun', 'Moon', getCellDivIsBlank));
        return;
      }
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') {
          continue;
        }
        for (const node of mutation.addedNodes) {
          tryProcessNode(node);
          // Delay resolve() to next callback iteration in order to guarantee
          // that blankCell is blank by the time the learnStrategy caller uses
          // the result.
          if (strategy) {
            return;
          }
        }
      }

      function tryProcessNode(node) {
        const tagName = node.tagName?.toLowerCase();
        // Only consider IMG or SVG nodes.
        if (tagName && ('img' === tagName || 'svg' === tagName)) {
          const label = node.getAttribute('aria-label');
          if (label) {
            if (!sunLabel) {
              sunLabel = label;
              // Hopefully trigger sun -> moon.
              doOneClick(blankCell);
            } else if (label !== sunLabel) {
              moonLabel = label;
              // Hopefully trigger moon -> blank.
              doOneClick(blankCell);
              console.info(`Deduced mark strategy with sunLabel=${sunLabel},`,
                  `moonLabel=${moonLabel}`);
              strategy = new AriaLabelStrategy(
                  sunLabel,
                  moonLabel,
                  getCellDivIsBlank);
            }
          }
        }
      }

      function resolveStrategy(strategy) {
        observer.disconnect();
        clearTimeout(timeoutRef);
        resolve(strategy);
      }
    }
  });
}

class AriaLabelStrategy {

  #sunLabel;
  #moonLabel;
  #getCellDivIsBlank;

  constructor(sunLabel, moonLabel, getCellDivIsBlank) {
    this.#sunLabel = sunLabel;
    this.#moonLabel = moonLabel;
    this.#getCellDivIsBlank = getCellDivIsBlank;
  }

  getCellDivColor(cellDiv) {
    if (this.#getCellDivIsBlank.call(null, cellDiv)) {
      return 0;
    }
    const label = this.getCellDivAriaLabel(cellDiv);
    // Treat missing label or 'empty' as blank (handles mid-transition reads)
    if (!label || label.toLowerCase() === 'empty') return 0;
    if (this.#sunLabel === label) {
      return 1;
    } else if (this.#moonLabel === label) {
      return 2;
    } else {
      console.error('Failed to deduce color from', cellDiv);
      throw new Error('Failed to deduce color');
    }
  }

  getCellDivAriaLabel(cellDiv) {
    return cellDiv.querySelector('img[aria-label], svg[aria-label]')
        ?.getAttribute('aria-label');
  }

}
