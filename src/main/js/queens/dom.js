import { anticipateOneMutation, getGridDiv } from '../util.js';
import { solveQueens } from './solver.js';

export async function autoSolve() {
  const prioritizedApis = [new QueensDomApiV1(), new QueensDomApiV0()];
  for (let i = 0; i < prioritizedApis.length; ) {
    const api = prioritizedApis[i];
    try {
      await api.autoSolve();
      return;
    } catch (e) {
      if (++i !== prioritizedApis.length) {
        console.debug('Queens: V' + (2-i) + ' API failed, trying V' + (1-i), e.message);
      } else {
        console.error('Queens: All APIs exhausted', e);
      }
    }
  }
}

class QueensDomApi {

  async autoSolve() {
    const gridDiv = this.getQueensGridDiv();
    const [cellDivs, queensGridArg, existingMarks] = this.#transformQueensGridDiv(gridDiv);
    // Debug: log the parsed grid and color indices
    console.info('Queens: Parsed grid for solver:', JSON.stringify(queensGridArg));
    const colorSet = new Set(queensGridArg.map(cell => cell.color));
    console.info('Queens: Unique color indices:', Array.from(colorSet));
    try {
      const queenIndices = solveQueens(queensGridArg);
      console.info('Solution identified:', queenIndices);
      await this.clickQueens(cellDivs, queenIndices, existingMarks);
    } catch (e) {
      console.error('Queens: Solver failed with input:', JSON.stringify(queensGridArg));
      throw e;
    }
  }

  #transformQueensGridDiv(gridDiv) {
    const filtered = Array.from(gridDiv.children)
      .filter(c => this.gridDivChildIsCellDiv(c));
    if (filtered.length === 0) {
      this.orElseThrow(null, 'transformQueensGridDiv', 'gridDiv contained no children that matched cellDiv filter');
    }
    const cellDivs = new Array(filtered.length);
    const colorNames = [];
    // First pass: collect color names in order of idx
    for (const cellDiv of filtered) {
      const idx = this.getCellDivIdx(cellDiv);
      const ariaLabel = cellDiv.attributes?.getNamedItem('aria-label')?.value ?? '';
      const colorMatch = ariaLabel.match(/of color (\w+)/);
      const colorName = colorMatch ? colorMatch[1] : 'Unknown';
      colorNames[idx] = colorName;
    }
    // Build color name to contiguous index map
    const uniqueColors = Array.from(new Set(colorNames));
    const colorMap = new Map(uniqueColors.map((name, i) => [name, i]));
    // Second pass: build queensGridArg with mapped color indices
    const queensGridArg = new Array(filtered.length);
    const existingMarks = new Map();
    for (const cellDiv of filtered) {
      const idx = this.getCellDivIdx(cellDiv);
      const colorName = colorNames[idx];
      const color = colorMap.get(colorName);
      cellDivs[idx] = cellDiv;
      queensGridArg[idx] = { idx: idx, color: color };
      const existingMark = this.getCellDivExistingMark(cellDiv);
      if (existingMark) {
        existingMarks.set(idx, existingMark);
      }
    }
    return [cellDivs, queensGridArg, existingMarks];
  }

  async clickQueens(cellDivs, queenLocations, existingMarks) {
    // Transform any cells that must be marked as queens to queens.
    for (const loc of queenLocations) {
      const existingMark = existingMarks.get(loc) ?? 0, cellDiv = cellDivs[loc];
      for (let i = existingMark; i < 2; i++) {
        await anticipateOneMutation(cellDiv, loc);
      }
      if (existingMark === 2) {
        existingMarks.delete(loc);
      }
    }
    // Transform any cells that were mistakenly marked as queens to blank. Note
    // that doing these two transformations in this order should work even if
    // "Auto-x" mode is on.
    for (const [key, value] of existingMarks) {
      if (value === 2) {
        await anticipateOneMutation(cellDivs[key], key);
      }
    }
  }

}

class QueensDomApiV1 extends QueensDomApi {

  async autoSolve() {
    // Extract
    const rawSolution = this.getSolution();
    const processedSolution = this.processSolution(rawSolution);
    const gridDiv = this.getQueensGridDiv();
    const [cellDivs, existingMarks] = this.transformQueensGridDiv(gridDiv);
    // Dispatch
    this.clickCells(cellDivs, processedSolution, existingMarks);
  }

  getSolution() {
    const hydrationScript = this.orElseThrow(
          getGridDiv(d => d.getElementById('rehydrate-data')), 'getSolution',
          'No script with id rehydrate-data found')
        .textContent;
    const indicator = '\\"solution\\"';
    const anchor = hydrationScript.indexOf(indicator);
    if (anchor < 0) {
      this.orElseThrow(null, 'getSolution', 'Failed to locate indicator');
    }
    const start = hydrationScript.indexOf('[', anchor + indicator.length);
    const end = hydrationScript.indexOf(']', start);
    const substring = hydrationScript.substring(start, end + 1);
    return JSON.parse(substring.replaceAll('\\', ''));
  }

  processSolution(rawSolution) {
    const n = rawSolution.length;
    const result = rawSolution.map((x) => n * x.row + x.col);
    console.info('Solution identified:', result);
    return rawSolution.map((x) => n * x.row + x.col);
  }

  getQueensGridDiv() {
    return this.orElseThrow(
        getGridDiv(d => d.querySelector('[data-testid="interactive-grid"]')),
        'getQueensGridDiv', 'QueensGridDiv selector yielded nothing');
  }

  transformQueensGridDiv(gridDiv) {
    const filtered = Array.from(gridDiv.children)
        .filter(c => this.gridDivChildIsCellDiv(c));
    if (filtered.length === 0) {
      this.orElseThrow(null, 'transformQueensGridDiv', 'gridDiv contained no '
          + 'children that matched cellDiv filter');
    }
    const cellDivs = new Array(filtered.length);
    const existingMarks = new Map();
    for (const cellDiv of filtered) {
      const idx = this.getCellDivIdx(cellDiv);
      cellDivs[idx] = cellDiv;
      const existingMark = this.getCellDivExistingMark(cellDiv);
      if (existingMark) {
        existingMarks.set(idx, existingMark);
      }
    }
    return [cellDivs, existingMarks];
  }

  gridDivChildIsCellDiv(gridDivChild) {
    return gridDivChild.attributes?.getNamedItem('data-cell-idx');
  }

  getCellDivIdx(cellDiv) {
    const dataCellIdx = cellDiv.attributes
        ?.getNamedItem('data-cell-idx')?.value;
    return parseInt(this.orElseThrow(dataCellIdx, 'getIdFromCellDiv',
        `Failed to parse an integer data cell ID from ${dataCellIdx}`));
  }

  getCellDivExistingMark(cellDiv) {
    const mark = cellDiv.attributes
        ?.getNamedItem('aria-label')?.value?.toLowerCase();
    return !mark ? 0 : mark.includes('cross') ? 1 : mark.includes('queen') ? 2
        : 0;
  }

  orElseThrow(result, fname, cause) {
    if (result != null) {
      return result;
    }
    throw new Error(`${fname} failed using QueensDomApiV1: ${cause}`);
  }

  async clickCells(cellDivs, clickSequence, existingMarks) {
    // Transform any cells that must be marked as queens to queens.
    for (const loc of clickSequence) {
      const existingMark = existingMarks.get(loc) ?? 0, cellDiv = cellDivs[loc];
      for (let i = existingMark; i < 2; i++) {
        await anticipateOneMutation(cellDiv, loc);
      }
      if (existingMark === 2) {
        existingMarks.delete(loc);
      }
    }
    // Transform any cells that were mistakenly marked as queens to blank. Note
    // that doing these two transformations in this order should work even if
    // "Auto-x" mode is on.
    for (const [key, value] of existingMarks) {
      if (value === 2) {
        await anticipateOneMutation(cellDivs[key], key);
      }
    }
  }

}

class QueensDomApiV0 extends QueensDomApi {

  getQueensGridDiv() {
    return this.orElseThrow(getGridDiv(d => d.querySelector('[data-testid="interactive-grid"]')),
        'getQueensGridDiv', 'QueensGridDiv selector yielded nothing');
  }

  gridDivChildIsCellDiv(gridDivChild) {
    return gridDivChild.attributes?.getNamedItem('data-cell-idx');
  }

  getCellDivIdx(cellDiv) {
    const dataCellIdx = cellDiv.attributes
        ?.getNamedItem('data-cell-idx')?.value;
    return parseInt(this.orElseThrow(dataCellIdx, 'getCellDivIdx',
        `Failed to parse an integer data cell ID from ${dataCellIdx}`));
  }

  // getCellDivColor is now handled in #transformQueensGridDiv

  getCellDivExistingMark(cellDiv) {
    const mark = cellDiv.attributes
        ?.getNamedItem('aria-label')?.value?.toLowerCase();
    return !mark ? 0 : mark.includes('cross') ? 1 : mark.includes('queen') ? 2
        : 0;
  }

  orElseThrow(result, fname, cause) {
    if (result != null) {
      return result;
    }
    throw new Error(`${fname} failed using QueensDomApiV0: ${cause}`);
  }

}
