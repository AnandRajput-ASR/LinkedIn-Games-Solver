import { anticipateOneMutation, getGridDiv } from '../util.js';
import { learnMarkStrategy } from './markStrategy.js';
import { solveTango } from './solver.js';

export async function autoSolve() {
  const prioritizedApis = [new TangoDomApiV1(), new TangoDomApiV0()];
  for (let i = 0; i < prioritizedApis.length; ) {
    const api = prioritizedApis[i];
    try {
      await api.autoSolve();
      return;
    } catch (e) {
      if (++i !== prioritizedApis.length) {
        console.debug('Tango: V' + (2-i) + ' API failed, trying V' + (1-i), e.message);
      } else {
        console.error('Tango: All APIs exhausted', e);
      }
    }
  }
}

class TangoDomApiV1 {

  async autoSolve() {
    // Extract
    const hydrationScript = this.getHydrationScript();
    const solution = this.getSolution(hydrationScript);
    console.info('Solution identified:', solution);
    const gridSize = this.getGridSize(hydrationScript);
    const cellCount = gridSize * gridSize;
    const presetCells = this.getPresetCells(hydrationScript, cellCount);
    const gridDiv = this.getTangoGridDiv();
    const [cellDivs, clickableCell] =
        this.transformTangoGridDiv(gridDiv, presetCells, cellCount);
    // Explore
    const markStrategy = await learnMarkStrategy(
        clickableCell,
        c => this.getCellDivIsBlank(c));
    // Dispatch
    await this.clickCells(cellDivs, solution, markStrategy, presetCells);
  }

  getHydrationScript() {
    return this.orElseThrow(
          getGridDiv(d => d.getElementById('rehydrate-data')),
          'getHydrationScript',
          'No script with id rehydrate-data found')
        .textContent;
  }

  getGridSize(hydrationScript) {
    const indicator = '\\"gridSize\\"';
    const anchor = hydrationScript.indexOf(indicator);
    if (anchor < 0) {
      this.orElseThrow(null, 'getGridSize', 'Failed to locate indicator');
    }
    const start = hydrationScript.indexOf(':', anchor + indicator.length) + 1;
    const end = hydrationScript.indexOf(',', start);
    const substring = hydrationScript.substring(start, end);
    return JSON.parse(substring);
  }

  getPresetCells(hydrationScript, cellCount) {
    const indicator = '\\"presetCellIdxes\\"';
    const anchor = hydrationScript.indexOf(indicator);
    if (anchor < 0) {
      this.orElseThrow(null, 'getPresetCells', 'Failed to locate indicator');
    }
    const start = hydrationScript.indexOf('[', anchor + indicator.length);
    const end = hydrationScript.indexOf(']', start);
    const substring = hydrationScript.substring(start, end + 1);
    const result = new Array(cellCount).fill(false);
    const parsed = JSON.parse(substring);
    for (const idx of parsed) {
      if (idx >= cellCount || idx < 0) {
        this.orElseThrow(null, 'getPresetCells', `idx ${idx} out of bounds`);
      }
      result[idx] = true;
    }
    return result;
  }

  getTangoGridDiv() {
    return this.orElseThrow(
        getGridDiv(d => d.querySelector('[data-testid="interactive-grid"]')),
        'getTangoGridDiv', 'TangoGridDiv selector yielded nothing');
  }

  transformTangoGridDiv(gridDiv, presetCells, cellCount) {
    const filtered = Array.from(gridDiv.children)
        .filter(c => this.getCellDivDataCellIdx(c));
    if (filtered.length !== cellCount) {
      this.orElseThrow(null, 'transformTangoGridDiv', 'gridDiv contained '
          + filtered.length + ' cells matching filter, expected ' + cellCount);
    }
    // Collect cellDivs
    const cellDivs = new Array(cellCount);
    for (const cellDiv of filtered) {
      const idx = this.getCellDivIdx(cellDiv);
      cellDivs[idx] = cellDiv;
    }
    const nullIdx = cellDivs.findIndex(e => !e);
    if (nullIdx >= 0) {
      this.orElseThrow(null, 'transformTangoGridDiv',
          `Undefined cell div at position ${nullIdx}`);
    }
    // Identify any clickable cell
    let cellIdx = presetCells.findIndex(e => !e);
    if (cellIdx < 0) {
      this.orElseThrow(null, 'transformTangoGridDiv', 'No free cells found');
    }
    return [cellDivs, cellDivs[cellIdx]];
  }

  getCellDivIdx(cellDiv) {
    const dataCellIdx = this.getCellDivDataCellIdx(cellDiv);
    return parseInt(this.orElseThrow(dataCellIdx, 'getIdFromCellDiv',
        `Failed to parse an integer data cell ID from ${dataCellIdx}`));
  }

  getCellDivDataCellIdx(gridDivChild) {
    return gridDivChild.attributes?.getNamedItem('data-cell-idx')?.value;
  }

  getCellDivIsBlank(cellDiv) {
    // Explicit blank-state checks
    if (cellDiv.querySelector('[data-testid="cell-empty"]')) return true;
    const svgLabel = cellDiv.querySelector('svg[aria-label]')?.getAttribute('aria-label');
    if (svgLabel && svgLabel.toLowerCase() === 'empty') return true;
    // V0-style class check
    if (cellDiv.querySelector('.lotka-cell-empty')) return true;
    // aria-label on cell itself
    const cellLabel = (cellDiv.getAttribute('aria-label') || '').toLowerCase();
    if (cellLabel.includes('empty') || cellLabel.includes('blank')) return true;
    // data-cell-state attribute
    const state = (cellDiv.getAttribute('data-cell-state') || '').toLowerCase();
    if (state === 'empty' || state === 'none' || state === '0') return true;
    return false;
  }

  getSolution(hydrationScript) {
    return this.processSolution(this.getRawSolution(hydrationScript));
  }

  getRawSolution(hydrationScript) {
    const keys = ['"solution"', '"gameAnswer"', '"answers"', '"cellValues"',
        '"lotkaValues"', '"boardValues"'];
    for (const indicator of keys) {
      const anchor = hydrationScript.indexOf(indicator);
      if (anchor < 0) continue;
      // Find '[' allowing only whitespace/colon between key and value
      let pos = anchor + indicator.length;
      while (pos < hydrationScript.length &&
          (hydrationScript[pos] === ':' || hydrationScript[pos] === ' '
            || hydrationScript[pos] === '\t')) pos++;
      if (hydrationScript[pos] !== '[') continue;
      // Proper bracket-depth matching to handle nested arrays
      let depth = 0, end = -1;
      for (let j = pos; j < hydrationScript.length; j++) {
        if (hydrationScript[j] === '[') depth++;
        else if (hydrationScript[j] === ']') {
          if (--depth === 0) { end = j; break; }
        }
      }
      if (end < 0) continue;
      try {
        const raw = hydrationScript.substring(pos, end + 1);
        const parsed = JSON.parse(raw.replaceAll('\\', ''));
        const flat = Array.isArray(parsed[0]) ? parsed.flat() : parsed;
        if (flat.length > 0) {
          console.info('Tango V1: found solution under key', indicator,
              'length', flat.length);
          return flat;
        }
      } catch(e) { continue; }
    }
    // Debug: show all top-level keys found in hydration script
    const foundKeys = [...new Set(hydrationScript.match(/"[a-zA-Z][a-zA-Z0-9]*":/g) || [])]
        .slice(0, 40);
    console.warn('Tango V1: no solution found. Keys in hydration script:', foundKeys);
    this.orElseThrow(null, 'getRawSolution',
        'No non-empty solution array found — V0 fallback needed');
  }

  processSolution(rawSolution) {
    return rawSolution.map((x) => {
      // Numeric format (0 = sun, 1 = moon)
      if (x === 0 || x === '0') return 1;
      if (x === 1 || x === '1') return 2;
      // Enum string format
      const s = String(x).toUpperCase();
      if (s.includes('ZERO') || s.includes('SUN') || s === 'A') return 1;
      if (s.includes('ONE') || s.includes('MOON') || s === 'B') return 2;
      this.orElseThrow(null, 'processSolution',
          `Unexpected rawSolution entry ${x} in ${rawSolution}`);
    });
  }

  orElseThrow(result, fname, cause) {
    if (result != null) {
      return result;
    }
    throw new Error(`${fname} failed using TangoDomApiV1: ${cause}`);
  }

  async clickCells(cellDivs, solution, markStrategy, presetCells) {
    if (cellDivs.length !== solution.length) {
      throw new Error(`cellDivs length ${cellDivs.length} does not match `
          + `solution length ${solution.length}`);
    }
    for (let i = 0; i < solution.length; i++) {
      if (presetCells[i]) {
        continue;
      }
      const cellDiv = cellDivs[i];
      const currentMark = markStrategy.getCellDivColor(cellDiv);
      const desiredMark = solution[i];
      for (let j = currentMark; j !== desiredMark; j = (j + 1) % 3) {
        await anticipateOneMutation(cellDiv, i);
      }
    }
  }

}

class TangoDomApiV0 {

  async autoSolve() {
    // Extract
    const gridDiv = this.getTangoGridDiv();
    const cellDivs = this.#getCellDivsFromGridDiv(gridDiv);
    const clickableCell = this.getClickableCell(cellDivs);
    const probeCellIdx = this.getCellDivIdx(clickableCell);
    // Explore
    const markStrategy = await learnMarkStrategy(
        clickableCell,
        c => this.cellDivIsBlank(c));
    // probeCellIdx is excluded from preset detection because strategy learning
    // may have left it in a non-blank state even though it is a free cell.
    const tangoGridArgs = this.#transformTangoGridDiv(cellDivs, markStrategy, probeCellIdx);
    // Solve
    const markSequence = solveTango(...tangoGridArgs);
    console.info('Solution identified:', markSequence);
    // Dispatch
    this.clickCells(cellDivs, markSequence, markStrategy);
  }

  getTangoGridDiv() {
    return this.orElseThrow(
        getGridDiv(d => d.querySelector('.lotka-grid')
            || d.querySelector('[data-testid="interactive-grid"]')),
        'getTangoGridDiv', 'TangoGridDiv selector yielded nothing');
  }

  #getCellDivsFromGridDiv(gridDiv) {
    const filtered = Array.from(gridDiv.children)
      .filter(c => this.gridDivChildIsCellDiv(c));
    if (filtered.length === 0) {
      this.orElseThrow(null, 'getCellDivsFromGridDiv', 'gridDiv contained no '
          + 'children that matched cellDiv filter');
    }
    const cellDivs = new Array(filtered.length);
    for (const cellDiv of filtered) {
      cellDivs[this.getCellDivIdx(cellDiv)] = cellDiv;
    }
    const nullIdx = cellDivs.findIndex(e => !e);
    if (nullIdx >= 0) {
      this.orElseThrow(null, 'getCellDivsFromGridDiv',
          `Undefined cell div at position ${nullIdx}`);
    }
    return cellDivs;
  }

  #transformTangoGridDiv(cellDivs, markStrategy, probeCellIdx = -1) {
    const presetSuns = [];
    const presetMoons = [];
    const downEqualSigns = [];
    const downCrosses = [];
    const rightEqualSigns = [];
    const rightCrosses = [];
    // Diagnostic: dump outerHTML of any cell with unusual child count so we
    // can identify the sign element structure in the new DOM.
    const firstSignCell = cellDivs.find(
        c => c.children.length > 2 ||
             c.querySelectorAll('[aria-label]').length > 1);
    if (firstSignCell) {
      console.info('Tango V0 sign diagnostic — cell outerHTML sample:',
          firstSignCell.outerHTML?.substring(0, 800));
    } else {
      console.warn('Tango V0: no cell with sign-like structure found.',
          'Sample cell outerHTML:', cellDivs[0]?.outerHTML?.substring(0, 400));
    }
    for (let i = 0; i < cellDivs.length; i++) {
      const cellDiv = cellDivs[i];
      // Skip the probe cell — strategy learning may have left it non-blank
      // even though it is a genuinely free cell.
      if (i !== probeCellIdx) {
        this.#checkPreset(markStrategy, cellDiv, i, presetSuns, presetMoons);
      }
      this.#checkHasSign(cellDiv, i, downEqualSigns, downCrosses,
          rightEqualSigns, rightCrosses);
    }
    console.info('Tango V0 constraints:',
        'presetSuns=', presetSuns,
        'presetMoons=', presetMoons,
        'rightCrosses=', rightCrosses,
        'rightEquals=', rightEqualSigns,
        'downCrosses=', downCrosses,
        'downEquals=', downEqualSigns);
    return [presetSuns, presetMoons, downEqualSigns, downCrosses,
        rightEqualSigns, rightCrosses];
  }

  gridDivChildIsCellDiv(gridDivChild) {
    return gridDivChild.attributes?.getNamedItem('data-cell-idx');
  }

  cellDivIsBlank(cellDiv) {
    // New DOM: blank state uses data-testid="cell-empty" on the SVG
    if (cellDiv.querySelector('[data-testid="cell-empty"]')) return true;
    const svgLabel = cellDiv.querySelector('svg[aria-label]')?.getAttribute('aria-label');
    if (svgLabel && svgLabel.toLowerCase() === 'empty') return true;
    // Old DOM fallback
    return !cellDiv.classList.contains('lotka-cell--locked')
        && !!cellDiv.querySelector('.lotka-cell-empty');
  }

  getClickableCell(cellDivs) {
    // Prefer blank cells — they are definitely free (not preset)
    for (const cellDiv of cellDivs) {
      if (this.cellDivIsBlank(cellDiv)) {
        return cellDiv;
      }
    }
    // Fallback: first non-preset cell (old DOM where blank detection may fail)
    for (const cellDiv of cellDivs) {
      if (!this.cellDivIsPreset(cellDiv)) {
        return cellDiv;
      }
    }
    this.orElseThrow(null, 'getClickableCell', 'No free cells found');
  }

  cellDivIsPreset(cellDiv) {
    // New DOM: preset cells are disabled via aria-disabled
    if (cellDiv.getAttribute('aria-disabled') === 'true') return true;
    // Old DOM fallback
    return cellDiv.classList.contains('lotka-cell--locked');
  }

  getCellDivIdx(cellDiv) {
    const dataCellIdx = cellDiv.attributes
        ?.getNamedItem('data-cell-idx')?.value;
    return parseInt(this.orElseThrow(dataCellIdx, 'getCellDivIdx',
        `Failed to parse an integer data cell ID from ${dataCellIdx}`));
  }

  // Determines the type of sign (Equal/Cross) from a sign container element.
  #getSignType(signEl) {
    // New DOM: data-testid="edge-cross" or data-testid="edge-equal" on the SVG
    for (const el of signEl.querySelectorAll('[data-testid]')) {
      const t = el.getAttribute('data-testid').toLowerCase();
      if (t.includes('equal')) return 'Equal';
      if (t.includes('cross')) return 'Cross';
    }
    // Fallback: aria-label on any descendant
    for (const el of [signEl, ...signEl.querySelectorAll('[aria-label]')]) {
      const l = (el.getAttribute?.('aria-label') || '').toUpperCase();
      if (l === 'EQUAL' || l.includes('EQUAL') || l.includes('SAME')) return 'Equal';
      if (l === 'CROSS' || l.includes('CROSS') || l.includes('NOT')) return 'Cross';
    }
    // Legacy: SVG ariaLabel property (old DOM)
    const svgLabel = (signEl.querySelector('svg')?.ariaLabel || '').toUpperCase();
    if (svgLabel.includes('EQUAL') || svgLabel.includes('SAME')) return 'Equal';
    if (svgLabel.includes('CROSS') || svgLabel.includes('NOT')) return 'Cross';
    return undefined;
  }

  // Determines if a sign child is a RIGHT or DOWN sign using bounding rects.
  // The new DOM has no directional info in the HTML — the sign div is
  // positioned at the edge between two cells, so its center relative to the
  // cell's right vs bottom edge tells us the direction unambiguously.
  #getSignDirection(cellDiv, signEl) {
    const cellRect = cellDiv.getBoundingClientRect();
    const signRect = signEl.getBoundingClientRect();
    const signCX = signRect.left + signRect.width / 2;
    const signCY = signRect.top + signRect.height / 2;
    const distRight  = Math.abs(signCX - cellRect.right);
    const distBottom = Math.abs(signCY - cellRect.bottom);
    return distRight <= distBottom ? 'right' : 'down';
  }

  #checkPreset(markStrategy, cellDiv, idx, presetSuns, presetMoons) {
    if (this.cellDivIsBlank(cellDiv)) return;
    // Primary: data-testid on inner SVG (new DOM, most reliable — no aria-label needed)
    // cell-zero = Sun (LotkaCellValue_ZERO), cell-one = Moon (LotkaCellValue_ONE)
    if (cellDiv.querySelector('[data-testid="cell-zero"]')) {
      presetSuns.push(idx); return;
    }
    if (cellDiv.querySelector('[data-testid="cell-one"]')) {
      presetMoons.push(idx); return;
    }
    // Fallback: aria-label strategy (only works when SVG has aria-label)
    try {
      const color = markStrategy.getCellDivColor(cellDiv);
      if (color === 1) presetSuns.push(idx);
      else if (color === 2) presetMoons.push(idx);
      else console.warn('Tango V0: non-blank cell idx', idx, 'color unknown, skipping');
    } catch(e) {
      console.warn('Tango V0: getCellDivColor threw for idx', idx, e.message);
    }
  }

  #checkHasSign(cellDiv, idx, downEqualSigns, downCrosses, rightEqualSigns,
      rightCrosses) {
    for (const child of cellDiv.children) {
      // Skip the cell content div (contains cell-state SVGs like cell-empty/cell-zero/cell-one)
      if (child.querySelector('[data-testid^="cell-"]')) continue;
      // Old DOM: skip the content wrapper class
      if (child.classList?.contains('lotka-cell-content')) continue;
      const sign = this.#getSignType(child);
      if (!sign) continue;
      const dir = this.#getSignDirection(cellDiv, child);
      if (dir === 'right') {
        if (sign === 'Equal') rightEqualSigns.push(idx);
        else if (sign === 'Cross') rightCrosses.push(idx);
      } else {
        if (sign === 'Equal') downEqualSigns.push(idx);
        else if (sign === 'Cross') downCrosses.push(idx);
      }
    }
    // Fallback for old DOM: explicit edge class selectors
    const downEl = cellDiv.querySelector('.lotka-cell-edge--down, [data-edge="down"]');
    if (downEl) {
      const sign = this.#getSignType(downEl);
      if (sign === 'Equal' && !downEqualSigns.includes(idx)) downEqualSigns.push(idx);
      else if (sign === 'Cross' && !downCrosses.includes(idx)) downCrosses.push(idx);
    }
    const rightEl = cellDiv.querySelector('.lotka-cell-edge--right, [data-edge="right"]');
    if (rightEl) {
      const sign = this.#getSignType(rightEl);
      if (sign === 'Equal' && !rightEqualSigns.includes(idx)) rightEqualSigns.push(idx);
      else if (sign === 'Cross' && !rightCrosses.includes(idx)) rightCrosses.push(idx);
    }
  }

  orElseThrow(result, fname, cause) {
    if (result != null) {
      return result;
    }
    throw new Error(`${fname} failed using TangoDomApiV0: ${cause}`);
  }

  async clickCells(cellDivs, solution, markStrategy) {
    for (const move of solution) {
      const cellDiv = cellDivs[move.idx];
      const targetColor = move.color;
      const currentColor = markStrategy.getCellDivColor(cellDiv);
      for (let i = currentColor; i !== targetColor; i = (i + 1) % 3) {
        await anticipateOneMutation(cellDiv, move.idx);
      }
    }
  }

}
