import * as invApi from './osint-api.js';
import { compressData, decompressData } from './api.js';

// ── Node type config ─────────────────────────────────────────────────────────

const TYPE_META = {
  person:   { color: '#6366f1', shape: 'ellipse',         icon: '👤' },
  org:      { color: '#a78bfa', shape: 'round-rectangle', icon: '🏢' },
  domain:   { color: '#34d399', shape: 'diamond',         icon: '🌐' },
  ip:       { color: '#fb923c', shape: 'hexagon',         icon: '🖥️' },
  email:    { color: '#fbbf24', shape: 'tag',             icon: '✉️' },
  username: { color: '#f472b6', shape: 'star',            icon: '👾' },
  phone:    { color: '#67e8f9', shape: 'ellipse',         icon: '📞' },
  url:      { color: '#94a3b8', shape: 'rectangle',       icon: '🔗' },
  unknown:  { color: '#4b4b6a', shape: 'ellipse',         icon: '❓' },
};

// Which OSINT actions are available per entity type
const OSINT_ACTIONS = {
  domain:   ['dns', 'subdomains', 'whois'],
  ip:       ['ipinfo', 'shodan'],
  email:    ['hibp'],
  username: ['usernames'],
  person:   ['linkedin'],
  org:      [],
  phone:    [],
  url:      [],
  unknown:  [],
};

const ACTION_LABEL = {
  dns:       'DNS Lookup',
  subdomains:'Find Subdomains',
  whois:     'WHOIS / RDAP',
  ipinfo:    'IP Info',
  shodan:    'Shodan',
  hibp:      'HIBP Breach Check',
  usernames: 'Social Platforms',
  linkedin:  'LinkedIn Analysis',
};

export class MindMap {
  /**
   * @param {HTMLElement} graphEl      - Cytoscape mount point
   * @param {HTMLElement} detailEl     - entity detail panel container
   * @param {HTMLElement} osintEl      - OSINT results panel container
   * @param {HTMLElement} contextMenuEl- context menu element
   */
  constructor(graphEl, detailEl, osintEl, contextMenuEl) {
    this._graphEl     = graphEl;
    this._detailEl    = detailEl;
    this._osintEl     = osintEl;
    this._menuEl      = contextMenuEl;
    this._invId       = null;
    this._cy          = null;
    this._selectedId  = null;
    this._connectMode = false; // waiting for second node click
    this._connectSrc  = null;
    this._posTimer    = null;
    this.onGraphChange = null; // called when nodes/edges change (for dirty flag)

    this._initCytoscape();
    this._setupContextMenu();
  }

  // ── Cytoscape init ─────────────────────────────────────────────────────────

  _initCytoscape() {
    this._cy = cytoscape({
      container: this._graphEl,
      style: this._buildStyle(),
      layout: { name: 'preset' },
      elements: [],
      minZoom: 0.1,
      maxZoom: 5,
      boxSelectionEnabled: false,
    });

    this._cy.on('tap', 'node', e => this._onNodeTap(e));
    this._cy.on('tap', 'edge', e => this._onEdgeTap(e));
    this._cy.on('tap', e => { if (e.target === this._cy) this._onBgTap(); });
    this._cy.on('cxttap', 'node', e => this._onNodeRightClick(e));
    this._cy.on('dragfreeon', 'node', e => this._onNodeDragged(e));
  }

  _buildStyle() {
    return [
      {
        selector: 'node',
        style: {
          'background-color':   'data(color)',
          'shape':              'data(shape)',
          'label':              'data(shortLabel)',
          'color':              '#e8e8f5',
          'text-valign':        'bottom',
          'text-halign':        'center',
          'font-size':          '11px',
          'font-family':        'Inter, system-ui, sans-serif',
          'text-margin-y':      '5px',
          'text-max-width':     '120px',
          'text-wrap':          'ellipsis',
          'width':              '44px',
          'height':             '44px',
          'border-width':       '2px',
          'border-color':       'rgba(255,255,255,0.15)',
          'text-background-color':   '#0c0c12',
          'text-background-opacity': '0.65',
          'text-background-padding': '2px',
          'text-background-shape':   'roundrectangle',
          'overlay-padding':    '4px',
        }
      },
      {
        selector: 'node:selected',
        style: {
          'border-color': '#fff',
          'border-width': '3px',
          'background-blacken': -0.15,
        }
      },
      {
        selector: 'node.connect-source',
        style: { 'border-color': '#fbbf24', 'border-width': '3px' }
      },
      {
        selector: 'node.connect-target',
        style: { 'border-color': '#34d399', 'border-width': '3px' }
      },
      {
        selector: 'edge',
        style: {
          'width':                  '1.5',
          'line-color':             'rgba(180,180,220,0.25)',
          'target-arrow-color':     'rgba(180,180,220,0.35)',
          'target-arrow-shape':     'triangle',
          'curve-style':            'bezier',
          'label':                  'data(label)',
          'font-size':              '9px',
          'color':                  'rgba(200,200,230,0.6)',
          'text-background-color':  '#0c0c12',
          'text-background-opacity':'0.7',
          'text-background-padding':'2px',
          'text-background-shape':  'roundrectangle',
          'edge-text-rotation':     'autorotate',
        }
      },
      {
        selector: 'edge:selected',
        style: { 'line-color': '#6366f1', 'target-arrow-color': '#6366f1' }
      },
    ];
  }

  // ── Load investigation ─────────────────────────────────────────────────────

  load(investigation) {
    this._invId = investigation.id;
    this._cy.elements().remove();
    this._selectedId = null;
    this._hideDetail();
    this._hideOsint();

    const elements = [];
    for (const e of investigation.entities) {
      elements.push(this._entityToCyNode(e));
    }
    for (const r of investigation.relations) {
      elements.push({ data: { id: `r${r.id}`, ridId: r.id, source: `e${r.sourceId}`, target: `e${r.targetId}`, label: r.label ?? '' } });
    }
    this._cy.add(elements);

    // If no nodes have positions, run layout
    const hasPositions = investigation.entities.some(e => e.x !== 0 || e.y !== 0);
    if (!hasPositions && investigation.entities.length > 0) {
      this._cy.layout({ name: 'cose', animate: false, randomize: true, idealEdgeLength: 120 }).run();
    }
  }

  _entityToCyNode(e) {
    const meta = TYPE_META[e.type] ?? TYPE_META.unknown;
    return {
      data: {
        id: `e${e.id}`,
        entityId: e.id,
        type: e.type,
        label: e.label,
        shortLabel: e.label.length > 20 ? e.label.slice(0, 18) + '…' : e.label,
        color: meta.color,
        shape: meta.shape,
        icon: meta.icon,
        notes: e.notes ?? '',
      },
      position: { x: e.x || 0, y: e.y || 0 },
    };
  }

  // ── Add / remove ──────────────────────────────────────────────────────────

  addEntity(entity) {
    const meta = TYPE_META[entity.type] ?? TYPE_META.unknown;
    // Place near center of current viewport if no position
    const pos = (entity.x === 0 && entity.y === 0)
      ? this._cy.extent() && { x: (this._cy.extent().x1 + this._cy.extent().x2) / 2 + (Math.random() - 0.5) * 200, y: (this._cy.extent().y1 + this._cy.extent().y2) / 2 + (Math.random() - 0.5) * 200 }
      : { x: entity.x, y: entity.y };
    this._cy.add({
      data: {
        id: `e${entity.id}`,
        entityId: entity.id,
        type: entity.type,
        label: entity.label,
        shortLabel: entity.label.length > 20 ? entity.label.slice(0, 18) + '…' : entity.label,
        color: meta.color,
        shape: meta.shape,
        icon: meta.icon,
        notes: entity.notes ?? '',
      },
      position: pos || { x: 0, y: 0 },
    });
  }

  removeEntity(entityId) {
    this._cy.$(`#e${entityId}`).remove();
    if (this._selectedId === entityId) this._hideDetail();
  }

  addRelation(relation) {
    this._cy.add({
      data: {
        id: `r${relation.id}`,
        ridId: relation.id,
        source: `e${relation.sourceId}`,
        target: `e${relation.targetId}`,
        label: relation.label ?? '',
      }
    });
  }

  removeRelation(relationId) {
    this._cy.$(`#r${relationId}`).remove();
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  runLayout() {
    this._cy.layout({ name: 'cose', animate: true, animationDuration: 500, idealEdgeLength: 130 }).run();
  }

  fit() {
    this._cy.fit(undefined, 40);
  }

  // ── Position persistence ──────────────────────────────────────────────────

  _onNodeDragged(e) {
    const node = e.target;
    const pos = node.position();
    const entityId = node.data('entityId');
    clearTimeout(this._posTimer);
    this._posTimer = setTimeout(async () => {
      if (this._invId && entityId) {
        await invApi.updateEntity(this._invId, entityId, { x: pos.x, y: pos.y });
      }
    }, 800);
    this.onGraphChange?.();
  }

  // ── Node tap / selection ──────────────────────────────────────────────────

  _onNodeTap(e) {
    const node = e.target;
    const entityId = node.data('entityId');

    if (this._connectMode) {
      if (!this._connectSrc) {
        // First click: set source
        this._connectSrc = entityId;
        this._cy.nodes().removeClass('connect-source connect-target');
        node.addClass('connect-source');
      } else if (this._connectSrc !== entityId) {
        // Second click: create relation
        this._finishConnect(entityId);
      }
      return;
    }

    this._selectedId = entityId;
    this._showDetail(entityId, node.data());
    this._hideOsint();
  }

  _onEdgeTap(e) {
    const rid = e.target.data('ridId');
    if (!this._invId || !rid) return;
    // Show edge label; clicking background deselects
  }

  _onBgTap() {
    if (this._connectMode) { this._cancelConnect(); return; }
    this._selectedId = null;
    this._hideDetail();
  }

  // ── Right-click context menu ──────────────────────────────────────────────

  _setupContextMenu() {
    document.addEventListener('click', () => this._menuEl.classList.remove('visible'));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { this._menuEl.classList.remove('visible'); this._cancelConnect(); } });
  }

  _onNodeRightClick(e) {
    e.preventDefault();
    const node = e.target;
    const entityId = node.data('entityId');
    const type = node.data('type');
    const rendPos = node.renderedPosition();
    const graphRect = this._graphEl.getBoundingClientRect();

    this._menuEl.innerHTML = this._buildContextMenu(entityId, type, node.data('label'));
    this._menuEl.style.left = (graphRect.left + rendPos.x + 10) + 'px';
    this._menuEl.style.top  = (graphRect.top  + rendPos.y + 10) + 'px';
    this._menuEl.classList.add('visible');

    this._menuEl.onclick = async ev => {
      const action = ev.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      this._menuEl.classList.remove('visible');
      await this._handleMenuAction(action, entityId, type, node.data('label'));
    };
  }

  _buildContextMenu(entityId, type, label) {
    const osintActions = (OSINT_ACTIONS[type] ?? [])
      .map(a => `<button class="cm-item" data-action="osint:${a}">${ACTION_LABEL[a]}</button>`)
      .join('');
    const osintSection = osintActions
      ? `<div class="cm-section">Enrich</div>${osintActions}<div class="cm-divider"></div>`
      : '';
    const openSection = (type === 'url' && /^https?:\/\//.test(label))
      ? `<a class="cm-item cm-item-open" href="${_esc(label)}" target="_blank" rel="noopener noreferrer">Open in browser ↗</a><div class="cm-divider"></div>`
      : '';
    return `
      ${openSection}
      ${osintSection}
      <button class="cm-item" data-action="connect">Connect to…</button>
      <button class="cm-item" data-action="edit">Edit label</button>
      <button class="cm-item cm-item-danger" data-action="delete">Delete</button>
    `;
  }

  async _handleMenuAction(action, entityId, type, label) {
    if (action.startsWith('osint:')) {
      const osintType = action.slice(6);
      await this._runOsint(entityId, type, label, osintType);
    } else if (action === 'connect') {
      this._startConnect(entityId);
    } else if (action === 'edit') {
      const newLabel = prompt('New label:', label);
      if (newLabel && newLabel.trim() && newLabel.trim() !== label) {
        await invApi.updateEntity(this._invId, entityId, { label: newLabel.trim() });
        const node = this._cy.$(`#e${entityId}`);
        const nl = newLabel.trim();
        node.data('label', nl);
        node.data('shortLabel', nl.length > 20 ? nl.slice(0, 18) + '…' : nl);
        this.onGraphChange?.();
        if (this._selectedId === entityId) this._refreshDetail(entityId, node.data());
      }
    } else if (action === 'delete') {
      if (!confirm(`Delete "${label}"?`)) return;
      await invApi.deleteEntity(this._invId, entityId);
      this.removeEntity(entityId);
      this.onGraphChange?.();
    }
  }

  // ── Connect mode ──────────────────────────────────────────────────────────

  _startConnect(entityId) {
    this._connectMode = true;
    this._connectSrc  = entityId;
    this._cy.nodes().removeClass('connect-source connect-target');
    this._cy.$(`#e${entityId}`).addClass('connect-source');
    this._graphEl.classList.add('connect-mode');
  }

  async _finishConnect(targetEntityId) {
    const srcId = this._connectSrc;
    this._cancelConnect();
    const label = prompt('Relation label (optional):', '') ?? '';
    const relation = await invApi.addRelation(this._invId, srcId, targetEntityId, label || null);
    this.addRelation(relation);
    this.onGraphChange?.();
  }

  _cancelConnect() {
    this._connectMode = false;
    this._connectSrc  = null;
    this._cy.nodes().removeClass('connect-source connect-target');
    this._graphEl.classList.remove('connect-mode');
  }

  // ── OSINT enrichment ──────────────────────────────────────────────────────

  async _runOsint(entityId, type, label, osintAction) {
    // LinkedIn is special — needs user input first
    if (osintAction === 'linkedin') {
      this._showLinkedInInput(entityId, label);
      return;
    }

    this._showOsintLoading(ACTION_LABEL[osintAction] ?? osintAction, label);

    let result;
    try {
      switch (osintAction) {
        case 'dns':        result = await invApi.osintDns(label);        break;
        case 'subdomains': result = await invApi.osintSubdomains(label);  break;
        case 'whois':      result = await invApi.osintWhois(label);       break;
        case 'ipinfo':     result = await invApi.osintIp(label);          break;
        case 'shodan':     result = await invApi.osintShodan(label);      break;
        case 'hibp':       result = await invApi.osintHibp(label);        break;
        case 'usernames':  result = await invApi.osintUsernames(label);   break;
        default:           result = { success: false, error: 'Unknown action' };
      }
    } catch (err) {
      result = { success: false, error: String(err) };
    }

    this._showOsintResults(entityId, label, ACTION_LABEL[osintAction] ?? osintAction, result);

    // Append raw OSINT data to the entity's OsintJson
    if (result.success && this._invId) {
      const node = this._cy.$(`#e${entityId}`);
      let existing = {};
      try { existing = JSON.parse(node.data('osintJson') || '{}'); } catch { }
      existing[osintAction] = result.data;
      const newJson = JSON.stringify(existing);
      node.data('osintJson', newJson);
      await invApi.updateEntity(this._invId, entityId, { osintJson: newJson });
    }
  }

  // ── LinkedIn input form ────────────────────────────────────────────────────

  _showLinkedInInput(entityId, label) {
    this._osintEl.style.display = 'flex';
    this._osintEl.innerHTML = `
      <div class="osint-header">
        <span>LinkedIn Analysis → <strong>${_esc(label)}</strong></span>
        <button class="osint-close" onclick="this.closest('#mindmap-osint-panel').style.display='none'">×</button>
      </div>
      <div class="osint-body li-input-body">
        <div class="li-mode">
          <div class="li-mode-label">Fetch public profile by URL</div>
          <div class="li-url-row">
            <input class="li-url-input" id="li-url" type="text" placeholder="https://linkedin.com/in/username">
            <button class="li-fetch-btn" id="li-fetch-btn">Fetch</button>
          </div>
          <p class="li-hint">LinkedIn may block server-side requests — if it fails, use the text option below.</p>
        </div>
        <div class="li-divider">— or —</div>
        <div class="li-mode">
          <div class="li-mode-label">Paste profile text</div>
          <p class="li-hint">While logged in to LinkedIn, open the profile and copy all the text (Ctrl+A, Ctrl+C). Paste it below for full analysis including skills, interests and experience.</p>
          <textarea class="li-text-input" id="li-text" placeholder="Paste full LinkedIn profile text here…" rows="8"></textarea>
          <button class="li-analyze-btn" id="li-analyze-btn">Analyze pasted text</button>
        </div>
      </div>
    `;

    document.getElementById('li-fetch-btn').addEventListener('click', async () => {
      const url = document.getElementById('li-url').value.trim();
      if (!url) return;
      await this._runLinkedIn(entityId, label, url, null);
    });

    document.getElementById('li-analyze-btn').addEventListener('click', async () => {
      const text = document.getElementById('li-text').value.trim();
      if (!text) return;
      await this._runLinkedIn(entityId, label, null, text);
    });
  }

  async _runLinkedIn(entityId, label, url, text) {
    this._showOsintLoading('LinkedIn Analysis', label);
    let result;
    try {
      result = url
        ? await invApi.osintLinkedInUrl(url)
        : await invApi.osintLinkedInText(text);
    } catch (err) {
      result = { success: false, error: String(err) };
    }

    if (!result.success) {
      this._osintEl.innerHTML = `
        <div class="osint-header">
          <span>LinkedIn Analysis</span>
          <button class="osint-close" onclick="this.closest('#mindmap-osint-panel').style.display='none'">×</button>
        </div>
        <div class="osint-body osint-error">
          ${_esc(result.error ?? 'Unknown error')}
          <br><br>
          <button class="li-retry-btn" id="li-retry">Try with pasted text instead</button>
        </div>
      `;
      document.getElementById('li-retry')?.addEventListener('click', () => this._showLinkedInInput(entityId, label));
      return;
    }

    this._showLinkedInResults(entityId, label, result);

    // Save OSINT data to entity
    if (this._invId) {
      const node = this._cy.$(`#e${entityId}`);
      let existing = {};
      try { existing = JSON.parse(node.data('osintJson') || '{}'); } catch {}
      existing.linkedin = { profile: result.profile, socialEngineering: result.socialEngineering };
      const newJson = JSON.stringify(existing);
      node.data('osintJson', newJson);
      await invApi.updateEntity(this._invId, entityId, { osintJson: newJson });
    }
  }

  _showLinkedInResults(entityId, label, result) {
    const p = result.profile ?? {};
    const se = result.socialEngineering ?? {};
    const suggestions = result.suggestions ?? [];

    const riskColor = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22d3ee' };
    const sevIcon   = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' };

    const riskBadge = se.riskRating
      ? `<span class="li-risk-badge" style="background:${riskColor[se.riskRating]}22;color:${riskColor[se.riskRating]};border-color:${riskColor[se.riskRating]}55">
           ${sevIcon[se.riskRating] ?? ''} Risk: ${se.riskRating.toUpperCase()}
         </span>`
      : '';

    const profileHtml = `
      <div class="li-profile-header">
        ${riskBadge}
        <div class="li-profile-name">${_esc(p.name ?? label)}</div>
        ${p.headline ? `<div class="li-profile-headline">${_esc(p.headline)}</div>` : ''}
        ${p.location ? `<div class="li-profile-loc">📍 ${_esc(p.location)}</div>` : ''}
        ${p.parseMode ? `<div class="li-parse-mode">Source: ${_esc(p.parseMode.replace(/_/g,' '))}</div>` : ''}
      </div>
    `;

    // Attack surface
    const attackSurface = [
      se.technicalExposure?.length ? `<div class="li-section-title">Technical exposure</div><div class="li-tag-list">${(se.technicalExposure ?? []).map(t => `<span class="li-tag">${_esc(t)}</span>`).join('')}</div>` : '',
      se.contactVectors?.length ? `<div class="li-section-title">Contact vectors</div><ul class="li-list">${(se.contactVectors ?? []).map(v => `<li>${_esc(v)}</li>`).join('')}</ul>` : '',
      se.trustNetworks?.length  ? `<div class="li-section-title">Trust networks / rapport</div><ul class="li-list">${(se.trustNetworks ?? []).slice(0,5).map(n => `<li>${_esc(n)}</li>`).join('')}</ul>` : '',
    ].filter(Boolean).join('');

    // Vulnerabilities
    const vulnsHtml = (se.vulnerabilities ?? []).map(v => `
      <div class="li-vuln-item li-sev-${_esc(v.severity)}">
        <div class="li-vuln-header">
          <span class="li-sev-badge">${sevIcon[v.severity] ?? ''} ${_esc(v.severity?.toUpperCase())}</span>
          <span class="li-vuln-cat">${_esc(v.category?.replace(/_/g,' '))}</span>
        </div>
        <div class="li-vuln-indicator">🔍 ${_esc(v.indicator)}</div>
        <div class="li-vuln-vector">${_esc(v.vector)}</div>
        ${v.lures?.length ? `<details class="li-lures-details"><summary>Example lures / scripts</summary><ul class="li-lure-list">${v.lures.map(l => `<li>${_esc(l)}</li>`).join('')}</ul></details>` : ''}
      </div>
    `).join('');

    // Suggested pretext
    const pretextHtml = se.recommendedPretext?.length
      ? `<div class="li-section-title">Recommended pretext approaches</div><ul class="li-list">${se.recommendedPretext.map(p => `<li>${_esc(p)}</li>`).join('')}</ul>`
      : '';

    // Graph suggestions
    const suggestHtml = suggestions.length > 0 ? `
      <div class="li-section-title">Add to graph (${suggestions.length})</div>
      <div class="osint-suggestions">
        ${suggestions.map((s, i) => `
          <label class="osint-suggest-row">
            <input type="checkbox" class="osint-cb" data-idx="${i}" checked>
            <span class="osint-suggest-type osint-type-${_esc(s.type)}">${_esc(s.type)}</span>
            ${_suggestLabelHtml(s, 38)}
            <span class="osint-suggest-rel">${_esc(s.relationLabel)}</span>
          </label>
        `).join('')}
        <button class="osint-add-btn" id="li-add-btn">Add selected to graph</button>
      </div>
    ` : '';

    this._osintEl.innerHTML = `
      <div class="osint-header">
        <span>LinkedIn Analysis → <strong>${_esc(p.name ?? label)}</strong></span>
        <button class="osint-close" onclick="this.closest('#mindmap-osint-panel').style.display='none'">×</button>
      </div>
      <div class="osint-body li-results-body">
        ${profileHtml}
        ${attackSurface ? `<div class="li-section">${attackSurface}</div>` : ''}
        ${vulnsHtml ? `<div class="li-section"><div class="li-section-title">Attack vectors (${(se.vulnerabilities??[]).length})</div>${vulnsHtml}</div>` : ''}
        ${pretextHtml ? `<div class="li-section">${pretextHtml}</div>` : ''}
        ${suggestHtml ? `<div class="li-section">${suggestHtml}</div>` : ''}
        <details class="osint-raw-details">
          <summary>Raw data</summary>
          <pre class="osint-raw">${_rawJsonWithLinks(result)}</pre>
        </details>
      </div>
    `;

    document.getElementById('li-add-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('li-add-btn');
      if (!btn) return;
      const checked = [...this._osintEl.querySelectorAll('.osint-cb:checked')]
        .map(cb => suggestions[parseInt(cb.dataset.idx)]);
      if (checked.length === 0) return;
      btn.disabled = true; btn.textContent = 'Adding…';
      for (const s of checked) {
        const entity  = await invApi.addEntity(this._invId, s.type, s.label);
        this.addEntity(entity);
        const relation = await invApi.addRelation(this._invId, entityId, entity.id, s.relationLabel);
        this.addRelation(relation);
      }
      this.onGraphChange?.();
      btn.textContent = `Added ${checked.length} node${checked.length > 1 ? 's' : ''}`;
    });
  }

  // ── OSINT results panel ───────────────────────────────────────────────────

  _showOsintLoading(actionName, target) {
    this._osintEl.style.display = 'flex';
    this._osintEl.innerHTML = `
      <div class="osint-header">
        <span>${_esc(actionName)} → <strong>${_esc(target)}</strong></span>
        <button class="osint-close" onclick="this.closest('#mindmap-osint-panel').style.display='none'">×</button>
      </div>
      <div class="osint-body osint-loading">Running query…</div>
    `;
  }

  _showOsintResults(sourceEntityId, sourceLabel, actionName, result) {
    if (!result.success) {
      this._osintEl.innerHTML = `
        <div class="osint-header">
          <span>${_esc(actionName)}</span>
          <button class="osint-close" onclick="this.closest('#mindmap-osint-panel').style.display='none'">×</button>
        </div>
        <div class="osint-body osint-error">Error: ${_esc(result.error ?? 'Unknown error')}</div>
      `;
      return;
    }

    const suggestions = result.suggestions ?? [];
    const suggestionsHtml = suggestions.length > 0 ? `
      <div class="osint-suggestions">
        <div class="osint-suggest-title">Add to graph (${suggestions.length} found)</div>
        ${suggestions.map((s, i) => `
          <label class="osint-suggest-row">
            <input type="checkbox" class="osint-cb" data-idx="${i}" checked>
            <span class="osint-suggest-type osint-type-${_esc(s.type)}">${_esc(s.type)}</span>
            ${_suggestLabelHtml(s)}
            <span class="osint-suggest-rel">${_esc(s.relationLabel)}</span>
          </label>
        `).join('')}
        <button class="osint-add-btn" id="osint-add-selected">Add selected to graph</button>
      </div>
    ` : '<div class="osint-no-suggest">No graph suggestions from this query.</div>';

    this._osintEl.innerHTML = `
      <div class="osint-header">
        <span>${_esc(actionName)} → <strong>${_esc(sourceLabel)}</strong></span>
        <button class="osint-close" onclick="this.closest('#mindmap-osint-panel').style.display='none'">×</button>
      </div>
      <div class="osint-body">
        ${this._renderPlatformLinks(result.data)}
        ${suggestionsHtml}
        <details class="osint-raw-details">
          <summary>Raw data</summary>
          <pre class="osint-raw">${_rawJsonWithLinks(result.data)}</pre>
        </details>
      </div>
    `;

    const addBtn = document.getElementById('osint-add-selected');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const checked = [...this._osintEl.querySelectorAll('.osint-cb:checked')]
          .map(cb => suggestions[parseInt(cb.dataset.idx)]);
        if (checked.length === 0) return;
        addBtn.disabled = true;
        addBtn.textContent = 'Adding…';
        for (const s of checked) {
          const entity = await invApi.addEntity(this._invId, s.type, s.label);
          this.addEntity(entity);
          const relation = await invApi.addRelation(this._invId, sourceEntityId, entity.id, s.relationLabel);
          this.addRelation(relation);
        }
        this.onGraphChange?.();
        addBtn.textContent = `Added ${checked.length} node${checked.length > 1 ? 's' : ''}`;
      });
    }
  }

  _hideOsint() {
    this._osintEl.style.display = 'none';
  }

  _renderPlatformLinks(data) {
    if (!data?.results || !Array.isArray(data.results) || !data.results[0]?.Platform) return '';
    const found = data.results.filter(r => r.Status === 'found');
    if (found.length === 0) return '';
    return `
      <div class="osint-platform-links">
        <div class="osint-suggest-title">Found accounts (${found.length})</div>
        ${found.map(r => `
          <a class="osint-platform-link" href="${_esc(r.Url)}" target="_blank" rel="noopener noreferrer">
            <span class="osint-platform-name">${_esc(r.Platform)}</span>
            <span class="osint-platform-url">${_esc(r.Url)}</span>
            <span class="osint-ext-icon">↗</span>
          </a>
        `).join('')}
      </div>
    `;
  }

  // ── Entity detail panel ───────────────────────────────────────────────────

  _showDetail(entityId, nodeData) {
    const meta = TYPE_META[nodeData.type] ?? TYPE_META.unknown;
    this._detailEl.style.display = 'flex';
    this._detailEl.innerHTML = `
      <div class="detail-type-badge" style="background:${meta.color}22;color:${meta.color};border-color:${meta.color}44">
        ${meta.icon} ${_esc(nodeData.type)}
      </div>
      <div class="detail-label">${_esc(nodeData.label)}</div>
      <div class="detail-osint-btns" id="detail-osint-btns"></div>
      <textarea class="detail-notes" id="detail-notes" placeholder="Notes…"></textarea>
    `;

    // OSINT action buttons
    const btnsEl = document.getElementById('detail-osint-btns');
    if (nodeData.type === 'url' && /^https?:\/\//.test(nodeData.label)) {
      const link = document.createElement('a');
      link.className = 'detail-osint-btn detail-open-link';
      link.textContent = 'Open ↗';
      link.href = nodeData.label;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      btnsEl.appendChild(link);
    }
    const actions = OSINT_ACTIONS[nodeData.type] ?? [];
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.className = 'detail-osint-btn';
      btn.textContent = ACTION_LABEL[a];
      btn.onclick = () => this._runOsint(entityId, nodeData.type, nodeData.label, a);
      btnsEl.appendChild(btn);
    }

    // Notes
    const notesEl = document.getElementById('detail-notes');
    if (notesEl) {
      notesEl.value = nodeData.notes ?? '';
      let notesTimer;
      notesEl.addEventListener('input', () => {
        clearTimeout(notesTimer);
        notesTimer = setTimeout(async () => {
          const n = notesEl.value;
          await invApi.updateEntity(this._invId, entityId, { notes: n });
          this._cy.$(`#e${entityId}`).data('notes', n);
        }, 800);
      });
    }
  }

  _refreshDetail(entityId, nodeData) {
    if (this._selectedId === entityId && this._detailEl.style.display !== 'none') {
      this._showDetail(entityId, nodeData);
    }
  }

  _hideDetail() {
    this._detailEl.style.display = 'none';
    this._detailEl.innerHTML = '';
  }
}

function _esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _suggestLabelHtml(s, maxLen = 40) {
  const truncated = s.label.length > maxLen ? s.label.slice(0, maxLen - 2) + '…' : s.label;
  const display = _esc(truncated);
  const title = _esc(s.label);
  if (/^https?:\/\//.test(s.label)) {
    return `<a class="osint-suggest-label osint-suggest-link" href="${title}" target="_blank" rel="noopener noreferrer" title="${title}">${display}</a>`;
  }
  return `<span class="osint-suggest-label" title="${title}">${display}</span>`;
}

function _rawJsonWithLinks(data) {
  const json = _esc(JSON.stringify(data, null, 2));
  return json.replace(/https?:\/\/[^&<>\s"]+/g, url =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer" class="osint-raw-link">${url}</a>`
  );
}
