export class ColorPicker {
  constructor(container, onChange) {
    this.onChange = onChange;
    this.h = 0; this.s = 1; this.v = 1; this.a = 1;
    this._build(container);
    this._update();
  }

  setColor(hex, alpha = 1) {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    const [h, s, v] = rgbToHsv(rgb.r, rgb.g, rgb.b);
    this.h = h; this.s = s; this.v = v; this.a = alpha;
    this._update();
  }

  getHex() { return hsvToHex(this.h, this.s, this.v); }
  getAlpha() { return this.a; }

  _build(container) {
    container.innerHTML = `
      <div class="cp-sv" id="cp-sv">
        <div class="cp-sv-white"></div>
        <div class="cp-sv-black"></div>
        <div class="cp-sv-cursor" id="cp-sv-cursor"></div>
      </div>
      <div class="cp-sliders">
        <div class="cp-hue-track">
          <div class="cp-hue-slider" id="cp-hue-slider">
            <div class="cp-hue-thumb" id="cp-hue-thumb"></div>
          </div>
        </div>
        <div class="cp-alpha-track" id="cp-alpha-track">
          <div class="cp-alpha-slider" id="cp-alpha-slider">
            <div class="cp-alpha-thumb" id="cp-alpha-thumb"></div>
          </div>
        </div>
      </div>
      <div class="cp-preview-row">
        <div class="cp-preview" id="cp-preview"></div>
        <input class="cp-hex-input" id="cp-hex-input" type="text" maxlength="7" spellcheck="false" />
      </div>
    `;

    this.svBox = container.querySelector('#cp-sv');
    this.svCursor = container.querySelector('#cp-sv-cursor');
    this.hueSlider = container.querySelector('#cp-hue-slider');
    this.hueThumb = container.querySelector('#cp-hue-thumb');
    this.alphaTrack = container.querySelector('#cp-alpha-track');
    this.alphaSlider = container.querySelector('#cp-alpha-slider');
    this.alphaThumb = container.querySelector('#cp-alpha-thumb');
    this.preview = container.querySelector('#cp-preview');
    this.hexInput = container.querySelector('#cp-hex-input');

    this._setupSV();
    this._setupHue();
    this._setupAlpha();

    this.hexInput.addEventListener('input', () => {
      const val = this.hexInput.value;
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        const rgb = hexToRgb(val);
        if (rgb) {
          const [h, s, v] = rgbToHsv(rgb.r, rgb.g, rgb.b);
          this.h = h; this.s = s; this.v = v;
          this._update(true);
          this.onChange?.(this.getHex(), this.a);
        }
      }
    });
  }

  _setupSV() {
    let dragging = false, capturedId = null;
    const move = (e) => {
      if (!dragging || e.pointerId !== capturedId) return;
      const rect = this.svBox.getBoundingClientRect();
      this.s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
      this._update();
      this.onChange?.(this.getHex(), this.a);
    };
    this.svBox.addEventListener('pointerdown', e => {
      dragging = true; capturedId = e.pointerId;
      this.svBox.setPointerCapture(e.pointerId);
      move(e);
    });
    this.svBox.addEventListener('pointermove', move);
    this.svBox.addEventListener('pointerup', () => dragging = false);
    this.svBox.addEventListener('pointercancel', () => dragging = false);
  }

  _setupHue() {
    let dragging = false, capturedId = null;
    const move = (e) => {
      if (!dragging || e.pointerId !== capturedId) return;
      const rect = this.hueSlider.getBoundingClientRect();
      this.h = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
      this._update();
      this.onChange?.(this.getHex(), this.a);
    };
    this.hueSlider.addEventListener('pointerdown', e => {
      dragging = true; capturedId = e.pointerId;
      this.hueSlider.setPointerCapture(e.pointerId);
      move(e);
    });
    this.hueSlider.addEventListener('pointermove', move);
    this.hueSlider.addEventListener('pointerup', () => dragging = false);
    this.hueSlider.addEventListener('pointercancel', () => dragging = false);
  }

  _setupAlpha() {
    let dragging = false, capturedId = null;
    const move = (e) => {
      if (!dragging || e.pointerId !== capturedId) return;
      const rect = this.alphaSlider.getBoundingClientRect();
      this.a = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this._update();
      this.onChange?.(this.getHex(), this.a);
    };
    this.alphaSlider.addEventListener('pointerdown', e => {
      dragging = true; capturedId = e.pointerId;
      this.alphaSlider.setPointerCapture(e.pointerId);
      move(e);
    });
    this.alphaSlider.addEventListener('pointermove', move);
    this.alphaSlider.addEventListener('pointerup', () => dragging = false);
    this.alphaSlider.addEventListener('pointercancel', () => dragging = false);
  }

  _update(skipHex = false) {
    // SV box background
    this.svBox.style.background = `hsl(${this.h}, 100%, 50%)`;
    // SV cursor
    this.svCursor.style.left = (this.s * 100) + '%';
    this.svCursor.style.top = ((1 - this.v) * 100) + '%';
    this.svCursor.style.background = this.getHex();
    // Hue thumb
    this.hueThumb.style.left = (this.h / 360 * 100) + '%';
    // Alpha
    const hex = this.getHex();
    this.alphaTrack.style.background = `linear-gradient(to right, transparent, ${hex})`;
    this.alphaThumb.style.left = (this.a * 100) + '%';
    // Preview
    this.preview.style.background = hexToRgba(hex, this.a);
    // Hex input
    if (!skipHex) this.hexInput.value = hex;
  }
}

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : null;
}

function hexToRgba(hex, a) {
  const rgb = hexToRgb(hex);
  if (!rgb) return '';
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0, s = max === 0 ? 0 : d / max, v = max;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s, v];
}

function hsvToHex(h, s, v) {
  h = h / 360;
  let r, g, b;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
    default: r = g = b = 0;
  }
  return '#' + [r, g, b].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
