import { anticipateOneMutation, getGridDiv } from '../util.js';
import { compressSequence, solveZip } from './solver.js';

export function readRenderedWalls(cellDivs, rows, cols) {
  const downWalls = new Set();
  const rightWalls = new Set();
  for (const [idx, cell] of cellDivs.entries()) {
    if (!cell) continue;
    const view = cell.ownerDocument.defaultView;
    for (const child of cell.children) {
      for (const pseudo of ['::before', '::after']) {
        const style = view.getComputedStyle(child, pseudo);
        if (style.content === 'none' || style.content === 'normal'
            || !style.content || style.display === 'none') continue;
        const hasBorder = side => Number.parseFloat(
          style.getPropertyValue(`border-${side}-width`)) > 0
          && style.getPropertyValue(`border-${side}-style`) === 'solid';
        if (hasBorder('bottom') && idx < (rows - 1) * cols) downWalls.add(idx);
        if (hasBorder('top') && idx >= cols) downWalls.add(idx - cols);
        if (hasBorder('right') && idx % cols < cols - 1) rightWalls.add(idx);
        if (hasBorder('left') && idx % cols > 0) rightWalls.add(idx - 1);
      }
    }
  }
  return { downWalls: [...downWalls], rightWalls: [...rightWalls] };
}

export async function autoSolve() {
  const prioritizedApis = [new ZipDomApiV1(), new ZipDomApiV0()];
  for (let i = 0; i < prioritizedApis.length; ) {
    const api = prioritizedApis[i];
    try {
      await api.autoSolve();
      return;
    } catch (e) {
      if (++i !== prioritizedApis.length) {
        console.warn('Zip: V' + (2-i) + ' API failed, trying V' + (1-i), e);
      } else {
        console.error('Zip: All APIs exhausted', e);
      }
    }
  }
}

class ZipDomApi {

  async autoSolve() {
    const gridDiv = this.getZipGridDiv();
    const [cellDivs, zipGridArgs] = this.transformZipGridDiv(gridDiv);
    console.info('Zip: extracted puzzle data', {
      rows: zipGridArgs[0],
      cols: zipGridArgs[1],
      numberedCells: zipGridArgs[2],
      downWalls: zipGridArgs[3],
      rightWalls: zipGridArgs[4]
    });
    const clickSequence = solveZip(...zipGridArgs);
    console.info('Solution identified:', clickSequence);
    await this.clickCells(gridDiv, cellDivs, clickSequence);
  }

  transformZipGridDiv(gridDiv) {
    const rows = this.getRowsFromGridDiv(gridDiv);
    const cols = this.getColsFromGridDiv(gridDiv);
    const filtered = Array.from(gridDiv.children)
        .filter(c => this.gridDivChildIsCellDiv(c));
    if (filtered.length === 0) {
      this.orElseThrow(null, 'transformZipGridDiv', 'gridDiv contained no '
          + 'children that matched cellDiv filter');
    }
    const cellDivs = new Array(filtered.length);
    const numberedCells = [], downWalls = [], rightWalls = [];
    for (const cellDiv of filtered) {
      const idx = this.getCellDivIdx(cellDiv);
      cellDivs[idx] = cellDiv;
      const content = this.getCellDivContent(cellDiv);
      if (content > 0) {
        numberedCells[content - 1] = idx;
      }
      if (this.cellDivHasDownWall(cellDiv)) {
        downWalls.push(idx);
      }
      if (this.cellDivHasRightWall(cellDiv)) {
        rightWalls.push(idx);
      }
    }
    const renderedWalls = readRenderedWalls(cellDivs, rows, cols);
    return [cellDivs, [rows, cols, numberedCells,
      [...new Set([...downWalls, ...renderedWalls.downWalls])],
      [...new Set([...rightWalls, ...renderedWalls.rightWalls])]]];
  }

  // Dispatches the computed click events one by one. In-progress puzzles are
  // automatically reset by the click sequence unlike with the other games, so
  // there is no extra check to do here.
  async clickCells(gridDiv, cellDivs, clickSequence) {
    for (const loc of clickSequence) {
      const cellDiv = cellDivs[loc];
      if (!cellDiv) {
        throw new Error(`No Zip cell found for index ${loc}`);
      }
      if (loc === clickSequence[0]
          && cellDiv.querySelector('[data-testid="filled-cell"]')
          && gridDiv.querySelectorAll('[data-testid="filled-cell"]').length === 1) {
        continue;
      }
      await anticipateOneMutation(cellDiv, loc, gridDiv);
    }
  }

}

// Obfuscated DOM makes it impossible to deduce walls; luckily, this variation
// includes a hydration script that straight up leaks the solution.
class ZipDomApiV1 extends ZipDomApi {

  async autoSolve() {
    const cellSequence = compressSequence(this.getSolution());
    console.info('Solution identified:', cellSequence);
    const gridDiv = this.getZipGridDiv();
    const cellDivs = this.transformZipGridDiv(gridDiv)[0];
    await this.clickCells(gridDiv, cellDivs, cellSequence);
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
    let depth = 0;
    let end = -1;
    for (let i = start; i < hydrationScript.length; i++) {
      if (hydrationScript[i] === '[') {
        depth++;
      } else if (hydrationScript[i] === ']' && --depth === 0) {
        end = i;
        break;
      }
    }
    if (start < 0 || end < 0) {
      this.orElseThrow(null, 'getSolution', 'Failed to parse solution array');
    }
    const parsed = JSON.parse(
        hydrationScript.substring(start, end + 1).replaceAll('\\', ''));
    if (!Array.isArray(parsed)) {
      this.orElseThrow(null, 'getSolution', 'Solution is not an array');
    }
    if (!Array.isArray(parsed[0])) {
      return parsed;
    }
    if (parsed.every(point => Array.isArray(point) && point.length === 2
        && point.every(Number.isInteger))) {
      const cols = this.getColsFromGridDiv(this.getZipGridDiv());
      return parsed.map(([row, col]) => row * cols + col);
    }
    return parsed.flat();
  }

  getZipGridDiv() {
    return this.orElseThrow(
        getGridDiv(d => d.querySelector('[data-testid="interactive-grid"]')),
        'getZipGridDiv', 'ZipGridDiv selector yielded nothing');
  }

  getRowsFromGridDiv(gridDiv) {
    return this.getColsFromGridDiv(gridDiv);
  }

  getColsFromGridDiv(gridDiv) {
    const candidates = Object.fromEntries(
      Array.from(gridDiv.style)
        .filter(p => p.startsWith("--") && /^\d+$/.test(gridDiv.style.getPropertyValue(p).trim()))
        .map(p => [p, parseInt(gridDiv.style.getPropertyValue(p))])
    );
    const candidateCount = Object.keys(candidates).length;
    if (candidateCount === 0) {
      this.orElseThrow(null, 'getDimensionFromGridDiv', 'No appropriate dimension in gridDiv');
    } else if (candidateCount > 1) {
      console.warn('Multiple dimension candidates found in style; dump:', candidates);
    }
    const elem = candidates[Object.keys(candidates)[0]];
    return parseInt(elem);
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

  getCellDivContent(cellDiv) {
    const subCellDiv = cellDiv.querySelector('[data-cell-content="true"]');
    if (subCellDiv) {
      const parsed = parseInt(subCellDiv.textContent);
      return this.orElseThrow(Number.isNaN(parsed) ? null : parsed,
          'getCellDivContent', `Expected number, found ${subCellDiv.textContent}`);
    }
    return -1;
  }

  // TODO: refactor (unused in V1)
  cellDivHasDownWall(cellDiv) {
    return false;
  }

  // TODO: refactor (unused in V1)
  cellDivHasRightWall(cellDiv) {
    return false;
  }

  orElseThrow(result, fname, cause) {
    if (result != null) {
      return result;
    }
    throw new Error(`${fname} failed using ZipDomApiV1: ${cause}`);
  }

}

class ZipDomApiV0 extends ZipDomApi {

  getZipGridDiv() {
    const gridDiv = getGridDiv(
        d => d.querySelector('.grid-game-board')
            || d.querySelector('[data-testid="interactive-grid"]'));
    return this.orElseThrow(gridDiv, 'getZipGridDiv',
        'ZipGridDiv selector yielded nothing');
  }

  #getCssProp(gridDiv, ...names) {
    for (const name of names) {
      const inline = gridDiv.style?.getPropertyValue(name)?.trim();
      if (inline) return inline;
      const computed = gridDiv.ownerDocument.defaultView.getComputedStyle(gridDiv)
        .getPropertyValue(name)?.trim();
      if (computed) return computed;
    }
    return null;
  }

  getRowsFromGridDiv(gridDiv) {
    const prop = this.#getCssProp(gridDiv, '--rows', '--row-count', '--grid-rows');
    if (prop) {
      const rows = parseInt(prop);
      return this.orElseThrow(Number.isNaN(rows) ? null : rows,
          'getRowFromGridDiv', `--rows property ${prop} is not a number`);
    }
    // Final fallback: same generic scan as V1 (assumes square grid)
    return this.getColsFromGridDiv(gridDiv);
  }

  getColsFromGridDiv(gridDiv) {
    const prop = this.#getCssProp(gridDiv, '--cols', '--col-count', '--grid-cols', '--grid-size');
    if (prop) {
      const cols = parseInt(prop);
      return this.orElseThrow(Number.isNaN(cols) ? null : cols,
          'getColFromGridDiv', `--cols property ${prop} is not a number`);
    }
    // Generic scan: find any inline CSS var with a single integer value
    const candidates = Array.from(gridDiv.style)
        .filter(p => p.startsWith('--') && /^\d+$/.test(gridDiv.style.getPropertyValue(p).trim()))
        .map(p => parseInt(gridDiv.style.getPropertyValue(p)));
    return this.orElseThrow(
        candidates.length > 0 ? candidates[0] : null,
        'getColFromGridDiv', 'No numeric CSS variable found for grid dimension');
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

  getCellDivContent(cellDiv) {
    // Try old CSS class first, then fall back to data-attribute style (new DOM)
    const content = cellDiv.querySelector('.trail-cell-content')
        || cellDiv.querySelector('[data-cell-content="true"]');
    if (content && content.textContent) {
      const parsed = parseInt(content.textContent);
      return this.orElseThrow(Number.isNaN(parsed) ? null : parsed,
          'getCellDivContent', `Expected number, found ${content.textContent}`);
    }
    return -1;
  }

  cellDivHasDownWall(cellDiv) {
    return cellDiv.querySelector('.trail-cell-wall--down') != null;
  }

  cellDivHasRightWall(cellDiv) {
    return cellDiv.querySelector('.trail-cell-wall--right') != null;
  }

  orElseThrow(result, fname, cause) {
    if (result != null) {
      return result;
    }
    throw new Error(`${fname} failed using ZipDomApiV0: ${cause}`);
  }

}
