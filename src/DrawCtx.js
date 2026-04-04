/**
 * DrawCtx.js
 *
 * Thin adapter that lets shared renderers target either the global p5 drawing
 * API or an offscreen p5.Graphics buffer through one small surface.
 */
class DrawCtx {
  /** @param {p5.Graphics|null} pg - null uses the global p5 drawing API */
  constructor(pg = null) {
    this._g = pg;
  }

  push() { this._g ? this._g.push() : push(); }
  pop() { this._g ? this._g.pop() : pop(); }
  translate(x, y) { this._g ? this._g.translate(x, y) : translate(x, y); }
  rotate(angle) { this._g ? this._g.rotate(angle) : rotate(angle); }
  fill(...args) { this._g ? this._g.fill(...args) : fill(...args); }
  noFill() { this._g ? this._g.noFill() : noFill(); }
  stroke(...args) { this._g ? this._g.stroke(...args) : stroke(...args); }
  noStroke() { this._g ? this._g.noStroke() : noStroke(); }
  strokeWeight(weight) { this._g ? this._g.strokeWeight(weight) : strokeWeight(weight); }
  rect(...args) { this._g ? this._g.rect(...args) : rect(...args); }
  line(x1, y1, x2, y2) { this._g ? this._g.line(x1, y1, x2, y2) : line(x1, y1, x2, y2); }
  circle(x, y, diameter) { this._g ? this._g.circle(x, y, diameter) : circle(x, y, diameter); }
  triangle(...args) { this._g ? this._g.triangle(...args) : triangle(...args); }
  text(...args) { this._g ? this._g.text(...args) : text(...args); }
  textSize(size) { this._g ? this._g.textSize(size) : textSize(size); }
  textAlign(horizontal, vertical) {
    this._g ? this._g.textAlign(horizontal, vertical) : textAlign(horizontal, vertical);
  }
  textWidth(textValue) { return this._g ? this._g.textWidth(textValue) : textWidth(textValue); }

  get LEFT() { return this._g ? this._g.LEFT : LEFT; }
  get CENTER() { return this._g ? this._g.CENTER : CENTER; }
  get TOP() { return this._g ? this._g.TOP : TOP; }
  get BOTTOM() { return this._g ? this._g.BOTTOM : BOTTOM; }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DrawCtx;
}

if (typeof window !== 'undefined') {
  window.DrawCtx = DrawCtx;
}
