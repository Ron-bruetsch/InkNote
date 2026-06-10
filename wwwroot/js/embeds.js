import { getLinkPreview, generateId } from './api.js';

export class EmbedManager {
  constructor(engine, embedsLayer) {
    this.engine = engine;
    this.layer = embedsLayer;
    this.elements = new Map(); // id -> DOM element

    engine.onEmbedsChange = (embeds) => this.syncAll(embeds);
  }

  syncAll(embeds) {
    const ids = new Set(embeds.map(e => e.id));

    // Remove deleted
    for (const [id, el] of this.elements) {
      if (!ids.has(id)) {
        el.remove();
        this.elements.delete(id);
      }
    }

    // Add or update
    for (const embed of embeds) {
      if (!this.elements.has(embed.id)) {
        this._createElement(embed);
      } else {
        this._updatePosition(embed);
      }
    }
  }

  async handlePaste(text) {
    const trimmed = text.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;

    // Center of visible canvas
    const rect = this.engine.container.getBoundingClientRect();
    const cx = (rect.width / 2 - this.engine.tx) / this.engine.scale;
    const cy = (rect.height / 2 - this.engine.ty) / this.engine.scale;

    const preview = await getLinkPreview(trimmed);

    let embed;
    if (preview.isYoutube) {
      embed = {
        id: generateId(),
        type: 'youtube',
        url: trimmed,
        videoId: preview.youtubeId,
        title: preview.title,
        x: cx - 320,
        y: cy - 180,
        width: 640,
        height: 360
      };
    } else {
      embed = {
        id: generateId(),
        type: 'link',
        url: trimmed,
        title: preview.title,
        description: preview.description,
        imageUrl: preview.imageUrl,
        siteName: preview.siteName,
        x: cx - 180,
        y: cy - 75,
        width: 360,
        height: 150
      };
    }

    this.engine.addEmbed(embed);
    return true;
  }

  _createElement(embed) {
    const el = document.createElement('div');
    el.className = 'embed-card';
    el.dataset.id = embed.id;
    el.style.left = embed.x + 'px';
    el.style.top = embed.y + 'px';
    el.style.width = embed.width + 'px';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'embed-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.engine.removeEmbed(embed.id);
    });

    if (embed.type === 'youtube') {
      el.classList.add('embed-video');
      el.style.height = embed.height + 'px';
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${embed.videoId}?rel=0`;
      iframe.allowFullscreen = true;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.style.cssText = 'width:100%;height:100%;border:none;border-radius:8px;';
      el.appendChild(iframe);
    } else {
      el.classList.add('embed-link');
      el.style.height = 'auto';
      el.innerHTML = this._linkCardHTML(embed);
      el.querySelector('a')?.addEventListener('click', e => e.stopPropagation());
    }

    el.appendChild(closeBtn);
    this._makeDraggable(el, embed);
    this.layer.appendChild(el);
    this.elements.set(embed.id, el);
  }

  _linkCardHTML(embed) {
    const img = embed.imageUrl
      ? `<div class="embed-thumb" style="background-image:url('${escapeHtml(embed.imageUrl)}')"></div>`
      : '';
    const site = embed.siteName ? `<span class="embed-site">${escapeHtml(embed.siteName)}</span>` : '';
    const title = embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : '';
    const desc = embed.description ? `<div class="embed-desc">${escapeHtml(embed.description)}</div>` : '';
    return `
      ${img}
      <div class="embed-info">
        ${site}
        ${title}
        ${desc}
        <a href="${escapeHtml(embed.url)}" target="_blank" rel="noopener" class="embed-url">${escapeHtml(embed.url.slice(0, 60))}${embed.url.length > 60 ? '...' : ''}</a>
      </div>`;
  }

  _updatePosition(embed) {
    const el = this.elements.get(embed.id);
    if (el) {
      el.style.left = embed.x + 'px';
      el.style.top = embed.y + 'px';
    }
  }

  _makeDraggable(el, embed) {
    let dragging = false;
    let startX, startY, startEX, startEY, capturedId;

    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('iframe') || e.target.closest('a') || e.target.closest('.embed-close')) return;
      e.stopPropagation();
      e.preventDefault();
      dragging = true;
      capturedId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startEX = embed.x;
      startEY = embed.y;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    });

    el.addEventListener('pointermove', e => {
      if (!dragging || e.pointerId !== capturedId) return;
      const dx = (e.clientX - startX) / this.engine.scale;
      const dy = (e.clientY - startY) / this.engine.scale;
      embed.x = startEX + dx;
      embed.y = startEY + dy;
      el.style.left = embed.x + 'px';
      el.style.top = embed.y + 'px';
    });

    const endDrag = e => {
      if (!dragging || e.pointerId !== capturedId) return;
      dragging = false;
      el.style.cursor = '';
      this.engine.updateEmbedPosition(embed.id, embed.x, embed.y);
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
  }
}

function escapeHtml(s) {
  return s?.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') ?? '';
}
