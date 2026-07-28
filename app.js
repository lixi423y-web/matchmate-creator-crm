const OPTIONS = {
  stages: ['Not contacted','DM sent','Follow-up sent','No reply after 2 follow-ups','Replied','Negotiating','Address received','Shipped','Delivered','Posted','Declined','Paused'],
  tiers: ['A','B','C','Rejected'],
  productDirections: ['Scrunchie + Bandana','Necklace','Both Sets','Scrunchie','Bandana','Not a Fit'],
  finalProducts: ['','Rose Bloom Set','Mocha Sky Set','Lavender Mist Set','Rose Bloom Scrunchie','Rose Bloom Bandana','Mocha Sky Scrunchie','Mocha Sky Bandana','Lavender Mist Scrunchie','Lavender Mist Bandana','Wildflower Charm Necklace Set','Ocean Pearl Necklace Set','Emerald Dew Necklace Set','Wildflower Charm Necklace','Ocean Pearl Necklace','Emerald Dew Necklace'],
  accountTypes: ['Lifestyle','Fashion / Beauty','Human + Pet','Pet Only'],
  appearances: ['Human + Pet','Human Only','Pet Only','Unknown'],
  dogSizes: ['Toy / Mini','Small','Medium','Large','Giant / XL'],
  sourceGroups: ['Benchmark brand','Creator platform','Prior list','Organic search','Manual add'],
  fitVerdicts: ['Strong','Maybe','Weak','Reject'],
  linkStatuses: ['Live / Public','Private','Not found','Redirected / renamed','Needs login','Not checked'],
  reviews: ['Not reviewed','Approved','Rejected','Paused'],
  replies: ['Not contacted','DM sent','Follow-up sent','Replied','Declined','No reply'],
  reasons: ['','No reply after 2 follow-ups','Brief sent no reply','Paid only','No repost permission','Usage rights declined','Product not fit','Timing not fit','Manager pending','Address missing','Waiting for content','Other'],
  rights: ['Not discussed','Repost only','Brand channels','Paid ads 6mo','Paid ads 1yr','Declined'],
  shipping: ['Not ready','Address requested','Address received','Shipped','Delivered'],
  payments: ['Gifted','Quoted','Approved under $50','Paid','Not approved'],
  contracts: ['Not needed','Needed','Sent','Signed'],
  rates: ['Unknown','Gifted only','Paid','Gifted + fee','Affiliate']
  ,assetTypes: ['Approved Photo','Approved Video','Raw Photo','Raw Video','Story','UGC Edit','Other']
};

const FIELDS = [
  'id','handle','profile_url','tier','account_type','appearance','dog_size','source_group','source_detail',
  'followers','location','fit_verdict','link_status','stage','reply_status','reason_blocker',
  'rights_status','payment_status','contract_status','rate_type','quoted_rate','approved_budget',
  'product_direction','final_product','shipping_status','shipping_address','pet_details',
  'tracking_number','next_action','last_touch','next_follow','dm_notes','last_message',
  'conversation_link','content_url','posted_date','collab_history','collab_count',
  'last_collab_date','performance_note','contract_url','signed_date','payment_method',
  'paid_date','contact_email','phone','notes','database_notes'
];

const state = {
  creators: [],
  appView: 'dashboard',
  selectedId: '',
  selectedIds: new Set(),
  workflow: 'all',
  activeTab: 'profile',
  roundPage: 'overview',
  roundsByCreator: new Map(),
  selectedRoundByCreator: new Map(),
  roundProductsByCreator: new Map(),
  selectedRoundId: '',
  roundsLoading: new Set(),
  assetsByRound: new Map(),
  assetsLoading: new Set(),
  saving: false,
  roundSaving: false,
  autoSaveTimer: null
  ,roundSaveTimer: null
};

const config = window.MATCHMATE_CONFIG || {};
const $ = selector => document.querySelector(selector);
const form = $('#creatorForm');

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  fillStaticOptions();
  loadCreators();
});

function bindEvents() {
  document.querySelectorAll('.app-nav-button').forEach(button => button.addEventListener('click', () => setAppView(button.dataset.appView)));
  document.querySelectorAll('[data-open-view]').forEach(button => button.addEventListener('click', () => setAppView(button.dataset.openView)));
  $('#refreshBtn').addEventListener('click', loadCreators);
  $('#editBtn').addEventListener('click', () => editCreator(state.selectedId));
  $('#saveBtn').addEventListener('click', () => saveCurrent('Saved creator'));
  $('#deleteBtn').addEventListener('click', () => deleteCreator(state.selectedId));
  $('#addBtn').addEventListener('click', addCreator);
  $('#exportBtn').addEventListener('click', () => exportCsv('filtered'));
  $('#exportAllBtn').addEventListener('click', () => exportCsv('all'));
  $('#importInput').addEventListener('change', importCsv);
  $('#selectFilteredBtn').addEventListener('click', selectFiltered);
  $('#invertFilteredBtn').addEventListener('click', invertFilteredSelection);
  $('#clearSelectedBtn').addEventListener('click', () => { state.selectedIds.clear(); render(); });
  $('#bulkApplyBtn').addEventListener('click', bulkApply);
  $('#resetViewBtn').addEventListener('click', resetView);
  $('#newRoundBtn').addEventListener('click', startNewRound);
  $('#historyNewRoundBtn').addEventListener('click', startNewRound);
  $('#downloadRoundBtn').addEventListener('click', downloadRoundAssets);
  $('#addPostLinkBtn').addEventListener('click', addPostLinkRow);
  $('#assetInput').addEventListener('change', uploadAssets);
  $('#addAssetLinkBtn').addEventListener('click', addAssetLink);
  ['searchInput','stageFilter','tierFilter','accountTypeFilter','appearanceFilter','dogSizeFilter','sourceFilter','productFilter','excludeNoReply']
    .forEach(id => $('#' + id).addEventListener('input', render));
  document.querySelectorAll('.tab-button').forEach(button => button.addEventListener('click', () => {
    state.activeTab = button.dataset.tab;
    renderTabs();
    if (['collaborations','content','history'].includes(state.activeTab)) loadRounds(state.selectedId);
  }));
  document.querySelectorAll('.round-page-button').forEach(button => button.addEventListener('click', () => {
    state.roundPage = button.dataset.roundPage;
    renderRoundPages();
  }));
  document.querySelectorAll('.quick-actions button').forEach(button => button.addEventListener('click', () => quickAction(button.dataset.action)));
  document.querySelectorAll('#tab-collaborations input, #tab-collaborations select, #tab-collaborations textarea')
    .forEach(element => {
      if (element.id === 'assetInput' || element.id === 'assetLinkInput') return;
      element.addEventListener('input', () => scheduleRoundAutoSave(800));
      element.addEventListener('change', () => scheduleRoundAutoSave(150));
    });
  form.addEventListener('input', event => {
    if (event.target.name) scheduleAutoSave(900);
  });
  form.addEventListener('change', event => {
    if (event.target.name) scheduleAutoSave(150);
  });
}

function apiHeaders(extra = {}) {
  return {
    apikey: config.supabaseAnonKey,
    Authorization: `Bearer ${config.supabaseAnonKey}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function api(path, options = {}) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) throw new Error('Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Netlify.');
  const res = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, { ...options, headers: apiHeaders(options.headers) });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

async function storageApi(path, options = {}) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) throw new Error('Missing Supabase config.');
  const headers = {
    apikey: config.supabaseAnonKey,
    Authorization: `Bearer ${config.supabaseAnonKey}`,
    ...(options.headers || {})
  };
  const res = await fetch(`${config.supabaseUrl}/storage/v1/${path}`, { ...options, headers });
  if (!res.ok) throw new Error(await res.text());
  const contentType = res.headers.get('content-type') || '';
  return contentType.includes('application/json') ? res.json() : null;
}

async function loadCreators() {
  try {
    setStatus('Loading');
    if (!isConfigured()) {
      state.creators = demoCreators();
      state.selectedId = state.creators[0]?.id || '';
      render();
      setStatus(`Demo ${state.creators.length}`);
      return;
    }
    state.creators = await api('creators?select=*&order=updated_at.desc');
    await loadRoundProductIndex();
    state.selectedId = state.selectedId || state.creators[0]?.id || '';
    render();
    setStatus(`Loaded ${state.creators.length}`);
  } catch (error) {
    setStatus('Load error');
    showNotice(friendlyError(error));
  }
}

async function loadRoundProductIndex() {
  state.roundProductsByCreator.clear();
  if (!isConfigured()) return;
  try {
    const rows = await api('collaboration_rounds?select=creator_id,final_product');
    rows.forEach(round => {
      const products = state.roundProductsByCreator.get(round.creator_id) || [];
      state.roundProductsByCreator.set(round.creator_id, [...new Set(products.concat(productList(round.final_product)))]);
    });
  } catch (error) {
    console.warn('Historical product filtering is unavailable.', error);
  }
}

async function saveCreator(creator) {
  const payload = normalizeCreator(creator);
  if (!payload.handle) throw new Error('Handle is required.');
  if (!isConfigured()) {
    return { ...payload, id: payload.id || crypto.randomUUID(), updated_at: new Date().toISOString() };
  }
  if (payload.id) {
    const id = payload.id;
    delete payload.id;
    const rows = await api(`creators?id=eq.${encodeURIComponent(id)}&select=*`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload)
    });
    return rows[0];
  }
  const rows = await api('creators?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify(payload)
  });
  return rows[0];
}

async function saveCurrent(action) {
  if (state.saving) return;
  clearTimeout(state.autoSaveTimer);
  clearTimeout(state.roundSaveTimer);
  try {
    state.saving = true;
    setStatus('Saving');
    if (selectedRound()) await saveRound(roundFromForm());
    const creator = creatorFromForm();
    const saved = await saveCreator(creator);
    upsertLocal(saved);
    state.selectedId = saved.id;
    render();
    setStatus(action || 'Saved');
  } catch (error) {
    setStatus('Save error');
    showNotice(error.message || error);
  } finally {
    state.saving = false;
  }
}

function scheduleAutoSave(delay) {
  if (!selectedCreator()) return;
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = setTimeout(autoSaveCurrent, delay);
  setStatus('Unsaved changes');
}

async function autoSaveCurrent() {
  if (state.saving || !selectedCreator()) return scheduleAutoSave(900);
  const creator = creatorFromForm();
  try {
    state.saving = true;
    setStatus('Autosaving');
    const saved = await saveCreator(creator);
    upsertLocal(saved);
    state.selectedId = saved.id;
    setStatus('Autosaved');
  } catch (error) {
    setStatus('Autosave error');
    console.error(error);
  } finally {
    state.saving = false;
  }
}

function fillStaticOptions() {
  setOptions('#stageFilter', [''].concat(OPTIONS.stages), 'All');
  setOptions('#tierFilter', [''].concat(OPTIONS.tiers), 'All');
  setOptions('#bulkStage', [''].concat(OPTIONS.stages), '');
  setOptions('#bulkProductDirection', [''].concat(OPTIONS.productDirections), '');
  setOptions('#bulkReason', [''].concat(OPTIONS.reasons), '');
  setOptions('#bulkRights', [''].concat(OPTIONS.rights), '');
  setOptions('#roundStage', OPTIONS.stages, '');
  setOptions('#roundProductDirection', OPTIONS.productDirections, '');
  setOptions('#roundReason', OPTIONS.reasons, '');
  setOptions('#roundRights', OPTIONS.rights, '');
  setOptions('#roundPayment', OPTIONS.payments, '');
  setOptions('#roundContract', OPTIONS.contracts, '');
  setOptions('#roundRateType', OPTIONS.rates, '');
  renderFinalProductChoices('');
  fillFormSelect('tier', OPTIONS.tiers);
  fillFormSelect('account_type', OPTIONS.accountTypes);
  fillFormSelect('appearance', OPTIONS.appearances);
  fillFormSelect('dog_size', OPTIONS.dogSizes);
  fillFormSelect('fit_verdict', OPTIONS.fitVerdicts);
  fillFormSelect('source_group', OPTIONS.sourceGroups);
  fillFormSelect('link_status', OPTIONS.linkStatuses);
  fillFormSelect('review', OPTIONS.reviews);
  setOptions('#assetType', OPTIONS.assetTypes, '');
}

function fillFormSelect(name, values) {
  const el = form.elements[name];
  if (el) setOptions(el, values || [], '');
}

function setOptions(selectorOrElement, values, blankLabel) {
  const select = typeof selectorOrElement === 'string' ? $(selectorOrElement) : selectorOrElement;
  if (!select) return;
  const current = select.value;
  select.innerHTML = '';
  values.forEach(value => select.add(new Option(value === '' ? blankLabel : value, value)));
  if (values.includes(current)) select.value = current;
}

function render() {
  renderAppView();
  renderWorkflow();
  renderDynamicFilters();
  renderMetrics();
  renderProductStats();
  renderList();
  renderDetail();
  renderTabs();
}

function setAppView(view) {
  state.appView = view;
  state.workflow = 'all';
  if (view === 'workspace') {
    state.activeTab = 'profile';
  }
  render();
}

function renderAppView() {
  document.body.dataset.appView = state.appView;
  const titles = {
    dashboard: 'Dashboard',
    workspace: 'Creator Workspace'
  };
  $('#viewTitle').textContent = titles[state.appView] || 'Creator CRM';
  $('#listTitle').textContent = 'Creators';
  document.querySelectorAll('.app-nav-button').forEach(button => {
    button.classList.toggle('active', button.dataset.appView === state.appView);
  });
}

function renderWorkflow() {
  const items = [
    ['all', 'All creators'],
    ['dm', 'Not Contacted'],
    ['contacted', 'DM / Follow-up'],
    ['replied', 'Replied'],
    ['ship', 'Ready to ship'],
    ['shipped', 'Shipped'],
    ['delivered', 'Delivered'],
    ['posted', 'Posted']
  ];
  $('#workflow').innerHTML = items.map(([key, label]) => {
    const count = state.creators.filter(c => workflowMatch(c, key)).length;
    return `<button type="button" class="workflow-button ${state.workflow === key ? 'active' : ''}" data-workflow="${key}"><span>${label}</span><strong>${count}</strong></button>`;
  }).join('');
  document.querySelectorAll('.workflow-button').forEach(button => button.addEventListener('click', () => {
    state.workflow = button.dataset.workflow;
    render();
  }));
  const dashboard = $('#dashboardWorkflow');
  if (dashboard) {
    const total = Math.max(1, state.creators.length);
    dashboard.innerHTML = items.slice(1).map(([key, label]) => {
      const count = state.creators.filter(c => workflowMatch(c, key)).length;
      return `<div class="dashboard-progress-row"><span>${label}</span><div class="dashboard-progress-track"><i style="width:${Math.round(count / total * 100)}%"></i></div><strong>${count}</strong></div>`;
    }).join('');
  }
}

function workflowMatch(c, workflow) {
  if (workflow === 'all') return true;
  return workflowBucket(c) === workflow;
}

function workflowBucket(c) {
  const stage = c.stage || '';
  if (stage === 'Not contacted') return 'dm';
  if (['DM sent','Follow-up sent','No reply after 2 follow-ups'].includes(stage)) return 'contacted';
  if (['Replied','Negotiating'].includes(stage)) return 'replied';
  if (stage === 'Address received') return 'ship';
  if (stage === 'Shipped') return 'shipped';
  if (stage === 'Delivered') return 'delivered';
  if (stage === 'Posted') return 'posted';
  return '';
}

function filteredCreators() {
  const q = $('#searchInput').value.toLowerCase().trim();
  const stage = $('#stageFilter').value;
  const tier = $('#tierFilter').value;
  const accountType = $('#accountTypeFilter').value;
  const appearance = $('#appearanceFilter').value;
  const dogSize = $('#dogSizeFilter').value;
  const source = $('#sourceFilter').value;
  const product = $('#productFilter').value;
  const excludeNoReply = $('#excludeNoReply').checked;
  return state.creators.filter(c => {
    const creatorProducts = allProductsForCreator(c);
    const productLabel = creatorProducts.join(' ');
    const text = [
      c.handle, c.profile_url, c.source_group, c.source_detail, c.location,
      c.account_type, c.appearance, c.dog_size, c.fit_verdict, productLabel, c.shipping_address,
      c.pet_details, c.tracking_number, c.notes, c.database_notes, c.content_url
    ].join(' ').toLowerCase();
    return workflowMatch(c, state.workflow)
      && (!q || text.includes(q))
      && (!stage || c.stage === stage)
      && (!tier || c.tier === tier)
      && (!accountType || c.account_type === accountType)
      && (!appearance || c.appearance === appearance)
      && (!dogSize || c.dog_size === dogSize)
      && (!source || c.source_group === source)
      && (!product || creatorProducts.includes(product))
      && (!excludeNoReply || (c.stage !== 'No reply after 2 follow-ups' && c.reason_blocker !== 'No reply after 2 follow-ups'));
  });
}

function renderDynamicFilters() {
  updateFilter('#accountTypeFilter', unique('account_type'));
  updateFilter('#appearanceFilter', unique('appearance'));
  updateFilter('#dogSizeFilter', OPTIONS.dogSizes);
  updateFilter('#sourceFilter', unique('source_group'));
  updateFilter('#productFilter', uniqueProducts());
}

function updateFilter(selector, values) {
  const select = $(selector);
  const current = select.value;
  select.innerHTML = '<option value="">All</option>';
  values.forEach(value => select.add(new Option(value, value)));
  if (values.includes(current)) select.value = current;
}

function unique(field) {
  return [...new Set(state.creators.map(c => c[field]).filter(Boolean))].sort();
}

function uniqueProducts() {
  return [...new Set(state.creators.flatMap(allProductsForCreator).filter(Boolean))].sort();
}

function allProductsForCreator(creator) {
  return [...new Set(
    productList(creator?.final_product).concat(state.roundProductsByCreator.get(creator?.id) || [])
  )];
}

function renderList() {
  const list = $('#creatorList');
  const creators = filteredCreators();
  const selectedCount = state.selectedIds.size;
  $('#listCount').textContent = `${creators.length} shown${selectedCount ? ` · ${selectedCount} selected` : ''}`;
  $('#bulkScope').textContent = selectedCount ? `Applies to ${selectedCount} selected creators.` : `Applies to filtered creators (${creators.length}).`;
  $('#bulkApplyBtn').textContent = selectedCount ? `Apply to Selected (${selectedCount})` : `Apply to Filtered (${creators.length})`;
  list.innerHTML = '';
  creators.forEach(c => {
    const productLabel = finalProduct(c);
    const checked = state.selectedIds.has(c.id);
    const skipDm = c.stage === 'No reply after 2 follow-ups' || c.reason_blocker === 'No reply after 2 follow-ups';
    const card = document.createElement('article');
    card.className = `creator-card ${c.id === state.selectedId ? 'active' : ''} ${checked ? 'checked' : ''}`;
    card.innerHTML = `
      <div class="creator-top">
        <span class="creator-title"><input class="select-box" type="checkbox" ${checked ? 'checked' : ''} aria-label="Select @${escapeHtml(c.handle)}"><span class="handle">@${escapeHtml(c.handle)}</span></span>
        <span class="card-actions">
          <button class="mini secondary edit-card" type="button">Edit</button>
          <button class="mini danger delete-card" type="button">Delete</button>
          <span class="badge blue">${escapeHtml(c.tier || '')}</span>
        </span>
      </div>
      <div class="badge-row">
        ${skipDm ? '<span class="badge warn">Skip DM</span>' : ''}
        <span class="badge rose">${escapeHtml(c.stage || '')}</span>
        <span class="badge green">${escapeHtml(productLabel || '')}</span>
      </div>
      <div class="summary-grid">
        <div class="summary-cell fact-product"><span>Final Product</span><strong>${escapeHtml(productLabel || 'Not selected')}</strong></div>
        <div class="summary-cell fact-tracking"><span>Tracking Number</span><strong>${escapeHtml(c.tracking_number || 'Not filled')}</strong></div>
        <div class="summary-cell fact-address"><span>Shipping Address</span><strong>${escapeHtml(c.shipping_address ? 'Filled' : 'Missing')}</strong></div>
        <div class="summary-cell fact-next"><span>Next Action</span><strong>${escapeHtml(c.next_action || nextHint(c))}</strong></div>
        <div class="summary-cell fact-content"><span>Published Links</span><strong>${contentLinkCount(c)}</strong></div>
        <div class="summary-cell fact-content"><span>Content Status</span><strong>${escapeHtml(contentStatus(c))}</strong></div>
      </div>
      <p class="muted">${escapeHtml([c.account_type, c.appearance, c.location].filter(Boolean).join(' · '))}</p>
    `;
    card.addEventListener('click', () => selectCreator(c.id));
    card.querySelector('.select-box').addEventListener('click', event => {
      event.stopPropagation();
      toggleSelection(c.id);
    });
    card.querySelector('.edit-card').addEventListener('click', event => {
      event.stopPropagation();
      editCreator(c.id);
    });
    card.querySelector('.delete-card').addEventListener('click', event => {
      event.stopPropagation();
      deleteCreator(c.id);
    });
    list.appendChild(card);
  });
}

function contentLinkCount(creator) {
  const direct = creator.content_url ? String(creator.content_url).split(/\s+/).filter(value => /^https?:\/\//i.test(value)).length : 0;
  const history = Array.isArray(creator.collab_history)
    ? creator.collab_history.filter(item => item?.url).length
    : 0;
  return direct + history;
}

function contentStatus(creator) {
  if (creator.stage === 'Posted' || creator.content_url || creator.posted_date) return 'Published';
  if (['Shipped', 'Delivered'].includes(creator.stage)) return 'Awaiting content';
  return 'Planned';
}

function renderDetail() {
  const creator = selectedCreator();
  $('#editBtn').disabled = !creator;
  $('#saveBtn').disabled = !creator;
  $('#deleteBtn').disabled = !creator;
  $('#emptyState').classList.toggle('hidden', !!creator);
  form.classList.toggle('hidden', !creator);
  if (!creator) return;
  $('#detailTitle').textContent = '@' + creator.handle;
  $('#profileLink').href = creator.profile_url || '#';
  FIELDS.forEach(field => {
    if (form.elements[field]) form.elements[field].value = creator[field] || '';
  });
  const cachedRounds = state.roundsByCreator.get(creator.id);
  state.selectedRoundId = state.selectedRoundByCreator.get(creator.id)
    || cachedRounds?.find(round => round.is_current)?.id
    || cachedRounds?.[0]?.id
    || '';
  if (!cachedRounds) clearRoundDetail('Loading collaboration...');
  loadRounds(creator.id);
}

function selectCreator(id) {
  if (!id || id === state.selectedId) return;
  clearTimeout(state.autoSaveTimer);
  clearTimeout(state.roundSaveTimer);
  state.selectedId = id;
  const rounds = state.roundsByCreator.get(id) || [];
  state.selectedRoundId = state.selectedRoundByCreator.get(id)
    || rounds.find(round => round.is_current)?.id
    || rounds[0]?.id
    || '';
  render();
}

function renderTabs() {
  form.dataset.activeTab = state.activeTab;
  document.body.dataset.detailTab = state.activeTab;
  document.querySelectorAll('.tab-button').forEach(button => button.classList.toggle('active', button.dataset.tab === state.activeTab));
  document.querySelectorAll('.tab-panel').forEach(panel => {
    const active = panel.id === `tab-${state.activeTab}`
      || (panel.id === 'tab-collaborations' && state.activeTab === 'content');
    panel.classList.toggle('active', active);
  });
  renderRoundPages();
  renderRoundHistory();
}

function renderRoundPages() {
  document.querySelectorAll('.round-page').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.roundPagePanel === state.roundPage);
  });
}

function renderRoundHistory() {
  const container = $('#roundHistory');
  if (!container) return;
  const rounds = state.roundsByCreator.get(state.selectedId) || [];
  if (!rounds.length) {
    container.innerHTML = '<div class="empty compact-empty">No collaboration rounds yet.</div>';
    return;
  }
  container.innerHTML = rounds.map(round => {
    const products = productList(round.final_product).join(', ') || 'Product not selected';
    const posts = normalizePostLinks(round.post_links).length;
    const current = round.is_current ? '<span class="badge green">Current</span>' : '';
    return `
      <article class="history-round ${round.id === state.selectedRoundId ? 'active' : ''}">
        <div class="history-round-number">R${escapeHtml(round.round_number || 1)}</div>
        <div>
          <div class="history-round-title"><strong>${escapeHtml(products)}</strong>${current}</div>
          <p>${escapeHtml(round.stage || 'Not contacted')} · ${posts} published link${posts === 1 ? '' : 's'}${round.posted_date ? ` · ${escapeHtml(round.posted_date)}` : ''}</p>
        </div>
        <button class="secondary open-history-round" type="button" data-round-id="${escapeHtml(round.id)}">Open Round</button>
      </article>
    `;
  }).join('');
  container.querySelectorAll('.open-history-round').forEach(button => button.addEventListener('click', () => {
    state.selectedRoundId = button.dataset.roundId;
    state.selectedRoundByCreator.set(state.selectedId, state.selectedRoundId);
    state.activeTab = 'collaborations';
    renderTabs();
    renderRounds();
  }));
}

function selectedRound() {
  return (state.roundsByCreator.get(state.selectedId) || []).find(round => round.id === state.selectedRoundId);
}

function legacyRound(creator) {
  return {
    id: `legacy-${creator.id}`,
    creator_id: creator.id,
    round_number: Math.max(1, Number(creator.collab_count || 0) || 1),
    is_current: true,
    stage: creator.stage,
    product_direction: creator.product_direction,
    reason_blocker: creator.reason_blocker,
    rights_status: creator.rights_status,
    payment_status: creator.payment_status,
    contract_status: creator.contract_status,
    rate_type: creator.rate_type,
    next_action: creator.next_action,
    final_product: creator.final_product,
    tracking_number: creator.tracking_number,
    shipping_address: creator.shipping_address,
    pet_details: creator.pet_details,
    posted_date: creator.posted_date,
    performance_note: creator.performance_note,
    post_links: creator.content_url ? [{ platform: 'Instagram', url: creator.content_url, posted_date: creator.posted_date || '' }] : [],
    created_at: creator.updated_at || new Date().toISOString()
  };
}

async function loadRounds(creatorId, force = false) {
  if (!creatorId || state.roundsLoading.has(creatorId)) return;
  if (!force && state.roundsByCreator.has(creatorId)) return renderRounds();
  const creator = state.creators.find(item => item.id === creatorId);
  if (!creator) return;
  try {
    state.roundsLoading.add(creatorId);
    let rows = [];
    if (isConfigured()) {
      try {
        rows = await api(`collaboration_rounds?creator_id=eq.${encodeURIComponent(creatorId)}&select=*&order=round_number.desc`);
      } catch (error) {
        console.warn('Collaboration rounds are not configured yet.', error);
      }
    }
    if (!rows.length) rows = [legacyRound(creator)];
    state.roundsByCreator.set(creatorId, rows);
    const rememberedId = state.selectedRoundByCreator.get(creatorId);
    const nextRoundId = rows.some(round => round.id === rememberedId)
      ? rememberedId
      : (rows.find(round => round.is_current)?.id || rows[0].id);
    state.selectedRoundByCreator.set(creatorId, nextRoundId);
    if (state.selectedId === creatorId) {
      state.selectedRoundId = nextRoundId;
      renderRounds();
    }
  } finally {
    state.roundsLoading.delete(creatorId);
  }
}

function renderRounds() {
  const rounds = state.roundsByCreator.get(state.selectedId) || [];
  const list = $('#roundList');
  if (!list) return;
  if (!rounds.length) {
    list.innerHTML = '';
    clearRoundDetail(state.roundsLoading.has(state.selectedId) ? 'Loading collaboration...' : 'No collaboration yet');
    renderRoundHistory();
    return;
  }
  if (!rounds.some(round => round.id === state.selectedRoundId)) {
    state.selectedRoundId = state.selectedRoundByCreator.get(state.selectedId)
      || rounds.find(round => round.is_current)?.id
      || rounds[0].id;
  }
  list.innerHTML = rounds.map(round => {
    const links = normalizePostLinks(round.post_links);
    const status = round.stage || 'Not contacted';
    const product = productList(round.final_product).join(', ') || 'Product not selected';
    const current = round.is_current ? ' · Current' : '';
    return `<option value="${escapeHtml(round.id)}">Round ${escapeHtml(round.round_number || 1)} · ${escapeHtml(product)} · ${escapeHtml(status)} · ${links.length} posts${current}</option>`;
  }).join('');
  list.value = state.selectedRoundId || '';
  list.onchange = () => {
    state.selectedRoundId = list.value;
    state.selectedRoundByCreator.set(state.selectedId, state.selectedRoundId);
    renderRounds();
  };
  renderRoundDetail();
  renderRoundHistory();
}

function renderRoundDetail() {
  const round = selectedRound();
  if (!round) return clearRoundDetail('No collaboration selected');
  $('#roundEyebrow').textContent = round.is_current ? 'Current Collaboration' : 'Past Collaboration';
  $('#roundTitle').textContent = `Round ${round.round_number || 1}`;
  $('#roundStatus').textContent = round.stage || 'Not contacted';
  $('#roundStage').value = round.stage || 'Not contacted';
  $('#roundProductDirection').value = round.product_direction || 'Scrunchie + Bandana';
  $('#roundReason').value = round.reason_blocker || '';
  $('#roundRights').value = round.rights_status || 'Not discussed';
  $('#roundPayment').value = round.payment_status || 'Gifted';
  $('#roundContract').value = round.contract_status || 'Not needed';
  $('#roundRateType').value = round.rate_type || 'Unknown';
  $('#roundNextAction').value = round.next_action || '';
  $('#roundTracking').value = round.tracking_number || '';
  $('#roundAddress').value = round.shipping_address || '';
  $('#roundPetDetails').value = round.pet_details || '';
  $('#roundPerformance').value = round.performance_note || '';
  renderFinalProductChoices(round.final_product || '');
  renderPostLinks();
  loadAssets(round.id);
}

function clearRoundDetail(message = 'Loading collaboration...') {
  $('#roundEyebrow').textContent = message;
  $('#roundTitle').textContent = '';
  $('#roundStatus').textContent = '';
  ['roundStage','roundProductDirection','roundReason','roundRights','roundPayment','roundContract','roundRateType']
    .forEach(id => { const element = $('#' + id); if (element) element.value = ''; });
  ['roundNextAction','roundTracking','roundAddress','roundPetDetails','roundPerformance']
    .forEach(id => { const element = $('#' + id); if (element) element.value = ''; });
  renderFinalProductChoices('');
  const postList = $('#postLinksList');
  if (postList) postList.innerHTML = '<div class="compact-empty">Loading this creator’s collaboration details...</div>';
  const assetList = $('#assetList');
  if (assetList) assetList.innerHTML = '<div class="compact-empty">Loading this creator’s content sources...</div>';
  const assetCount = $('#assetCount');
  if (assetCount) assetCount.textContent = '0 items';
}

function roundFromForm() {
  const round = { ...(selectedRound() || {}) };
  const postLinks = readPostLinks();
  round.stage = $('#roundStage').value;
  round.product_direction = $('#roundProductDirection').value;
  round.reason_blocker = $('#roundReason').value;
  round.rights_status = $('#roundRights').value;
  round.payment_status = $('#roundPayment').value;
  round.contract_status = $('#roundContract').value;
  round.rate_type = $('#roundRateType').value;
  round.next_action = $('#roundNextAction').value.trim();
  round.final_product = $('#roundFinalProduct').value;
  round.tracking_number = $('#roundTracking').value.trim();
  round.shipping_address = $('#roundAddress').value.trim();
  round.pet_details = $('#roundPetDetails').value.trim();
  round.posted_date = postLinks.map(link => link.posted_date).filter(Boolean).sort().at(-1) || round.posted_date || null;
  round.performance_note = $('#roundPerformance').value.trim();
  round.post_links = postLinks;
  return round;
}

function normalizePostLinks(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try { return JSON.parse(value); } catch { return []; }
}

function renderPostLinks() {
  const container = $('#postLinks');
  const links = normalizePostLinks(selectedRound()?.post_links);
  const rows = links.length ? links : [{ platform: 'Instagram Post', url: '', posted_date: '' }];
  container.innerHTML = rows.map((link, index) => `
    <div class="post-link-row" data-index="${index}">
      <select class="post-platform">
        ${['Instagram Post','Instagram Reel','Instagram Story','TikTok','Other'].map(option => `<option ${link.platform === option ? 'selected' : ''}>${option}</option>`).join('')}
      </select>
      <input class="post-url" type="url" value="${escapeHtml(link.url || '')}" placeholder="Published URL">
      <input class="post-date" type="date" value="${escapeHtml(link.posted_date || '')}">
      <button class="mini danger remove-post-link" type="button">Remove</button>
    </div>
  `).join('');
  container.querySelectorAll('input, select').forEach(element => {
    element.addEventListener('input', () => scheduleRoundAutoSave(800));
    element.addEventListener('change', () => scheduleRoundAutoSave(150));
  });
  container.querySelectorAll('.remove-post-link').forEach(button => button.addEventListener('click', () => {
    const links = readPostLinks();
    links.splice(Number(button.closest('.post-link-row').dataset.index), 1);
    selectedRound().post_links = links;
    renderPostLinks();
    scheduleRoundAutoSave(150);
  }));
}

function readPostLinks() {
  return [...document.querySelectorAll('.post-link-row')].map(row => ({
    platform: row.querySelector('.post-platform').value,
    url: row.querySelector('.post-url').value.trim(),
    posted_date: row.querySelector('.post-date').value
  })).filter(link => link.url || link.posted_date);
}

function addPostLinkRow() {
  const round = selectedRound();
  if (!round) return;
  round.post_links = readPostLinks().concat([{ platform: 'Instagram Post', url: '', posted_date: '' }]);
  renderPostLinks();
  requestAnimationFrame(() => document.querySelector('.post-link-row:last-child .post-url')?.focus());
}

function assetCacheKey(roundId) {
  return roundId || state.selectedRoundId || '';
}

async function loadAssets(roundId, force = false) {
  const key = assetCacheKey(roundId);
  const requestedCreatorId = state.selectedId;
  if (!key || state.assetsLoading.has(key)) return;
  if (!force && state.assetsByRound.has(key)) return renderAssets();
  if (!isConfigured()) {
    state.assetsByRound.set(key, []);
    return renderAssets();
  }
  try {
    state.assetsLoading.add(key);
    setAssetStatus('Loading assets...');
    let rows = [];
    if (String(roundId).startsWith('legacy-')) {
      rows = await api(`creator_assets?creator_id=eq.${encodeURIComponent(state.selectedId)}&select=*&order=created_at.desc`);
    } else {
      rows = await api(`creator_assets?round_id=eq.${encodeURIComponent(roundId)}&select=*&order=created_at.desc`);
    }
    state.assetsByRound.set(key, rows || []);
    if (state.selectedId === requestedCreatorId && state.selectedRoundId === roundId) {
      renderAssets();
      setAssetStatus('');
    }
  } catch (error) {
    setAssetStatus(`Asset load error: ${friendlyError(error)}`);
  } finally {
    state.assetsLoading.delete(key);
  }
}

function renderAssets() {
  const list = $('#assetList');
  const count = $('#assetCount');
  if (!list || !count) return;
  const assets = state.assetsByRound.get(assetCacheKey()) || [];
  count.textContent = `${assets.length} ${assets.length === 1 ? 'item' : 'items'}`;
  $('#downloadRoundBtn').classList.toggle('hidden', !assets.length);
  list.innerHTML = assets.length ? assets.map(asset => `
    <article class="asset-card" data-asset-id="${escapeHtml(asset.id)}">
      <div class="asset-preview">${assetPreview(asset)}</div>
      <div class="asset-info">
        <div class="asset-title-row"><strong>${escapeHtml(asset.file_name || 'Creator asset')}</strong><span class="badge blue">${escapeHtml(asset.asset_type || 'Other')}</span></div>
        <small>${escapeHtml(formatAssetDate(asset.created_at))}</small>
        ${asset.notes ? `<p>${escapeHtml(asset.notes)}</p>` : ''}
      </div>
      <div class="asset-actions">
        <a class="button-link secondary mini" href="${escapeHtml(asset.public_url || '#')}" target="_blank" rel="noreferrer">${asset.storage_path ? 'Download' : 'Open'}</a>
        <button class="mini danger delete-asset" type="button">Delete</button>
      </div>
    </article>
  `).join('') : '<div class="asset-empty compact-empty"><strong>No asset source saved</strong><span>Add a cloud folder or delivered-content link only when needed.</span></div>';
  list.querySelectorAll('.asset-card').forEach(card => {
    const deleteButton = card.querySelector('.delete-asset');
    deleteButton.addEventListener('click', () => deleteAsset(card.dataset.assetId));
  });
}

function assetPreview(asset) {
  const url = escapeHtml(asset.public_url || '');
  const mime = String(asset.mime_type || '');
  if (mime.startsWith('image/')) return `<img src="${url}" alt="">`;
  if (mime.startsWith('video/')) return '<span class="asset-icon">VID</span>';
  if (asset.storage_path) return '<span class="asset-icon">FILE</span>';
  return '<span class="asset-icon">LINK</span>';
}

async function uploadAssets(event) {
  const files = [...(event.target.files || [])];
  const creator = selectedCreator();
  const round = selectedRound();
  if (!creator || !round || !files.length) return;
  if (String(round.id).startsWith('legacy-')) {
    await saveRound(roundFromForm());
  }
  const savedRound = selectedRound();
  if (!isConfigured()) return showNotice('File upload requires the connected CRM database.');
  const type = $('#assetType').value || 'Other';
  try {
    setAssetStatus(`Uploading 0/${files.length}...`);
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const path = `${creator.id}/${savedRound.id}/${Date.now()}-${safeFileName(file.name)}`;
      await storageApi(`object/creator-assets/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' },
        body: file
      });
      const publicUrl = `${config.supabaseUrl}/storage/v1/object/public/creator-assets/${path.split('/').map(encodeURIComponent).join('/')}`;
      await api('creator_assets', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          creator_id: creator.id,
          round_id: savedRound.id,
          file_name: file.name,
          storage_path: path,
          public_url: publicUrl,
          mime_type: file.type || '',
          asset_type: type
        })
      });
      setAssetStatus(`Uploading ${index + 1}/${files.length}...`);
    }
    await loadAssets(savedRound.id, true);
    setAssetStatus(`${files.length} ${files.length === 1 ? 'file' : 'files'} uploaded.`);
  } catch (error) {
    setAssetStatus(`Upload error: ${friendlyError(error)}`);
  } finally {
    event.target.value = '';
  }
}

async function addAssetLink() {
  const creator = selectedCreator();
  const round = selectedRound();
  const url = $('#assetLinkInput').value.trim();
  if (!creator || !round || !url) return;
  try {
    if (String(round.id).startsWith('legacy-')) await saveRound(roundFromForm());
    const savedRound = selectedRound();
    new URL(url);
    const rows = await api('creator_assets?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        creator_id: creator.id,
        round_id: savedRound.id,
        file_name: linkLabel(url),
        public_url: url,
        asset_type: $('#assetType').value || 'Other',
        mime_type: 'text/uri-list'
      })
    });
    const key = assetCacheKey(savedRound.id);
    const assets = state.assetsByRound.get(key) || [];
    state.assetsByRound.set(key, [rows[0], ...assets]);
    $('#assetLinkInput').value = '';
    renderAssets();
    setAssetStatus('Link added.');
  } catch (error) {
    setAssetStatus(`Link error: ${friendlyError(error)}`);
  }
}

async function deleteAsset(assetId) {
  const creator = selectedCreator();
  const key = assetCacheKey();
  const assets = state.assetsByRound.get(key) || [];
  const asset = assets.find(item => item.id === assetId);
  if (!creator || !asset || !confirm(`Delete ${asset.file_name || 'this asset'}?`)) return;
  try {
    if (asset.storage_path) {
      await storageApi('object/creator-assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [asset.storage_path] })
      });
    }
    await api(`creator_assets?id=eq.${encodeURIComponent(asset.id)}`, { method: 'DELETE' });
    state.assetsByRound.set(key, assets.filter(item => item.id !== asset.id));
    renderAssets();
    setAssetStatus('Asset deleted.');
  } catch (error) {
    setAssetStatus(`Delete error: ${friendlyError(error)}`);
  }
}

function setAssetStatus(text) {
  const el = $('#assetStatus');
  if (el) el.textContent = text || '';
}

function safeFileName(name) {
  return String(name || 'asset').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'asset';
}

function linkLabel(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Content link'; }
}

function formatAssetDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

function scheduleRoundAutoSave(delay) {
  if (!selectedRound()) return;
  clearTimeout(state.roundSaveTimer);
  state.roundSaveTimer = setTimeout(autoSaveRound, delay);
  setStatus('Unsaved round');
}

async function autoSaveRound() {
  if (state.roundSaving || !selectedRound()) return scheduleRoundAutoSave(700);
  try {
    state.roundSaving = true;
    setStatus('Saving round');
    await saveRound(roundFromForm());
    setStatus('Round saved');
  } catch (error) {
    setStatus('Round save error');
    console.error(error);
  } finally {
    state.roundSaving = false;
  }
}

async function saveRound(round) {
  const creator = selectedCreator();
  if (!creator || !round) return null;
  const payload = {
    creator_id: creator.id,
    round_number: Number(round.round_number || 1),
    is_current: round.is_current !== false,
    stage: round.stage || 'Not contacted',
    product_direction: round.product_direction || 'Scrunchie + Bandana',
    reason_blocker: round.reason_blocker || '',
    rights_status: round.rights_status || 'Not discussed',
    payment_status: round.payment_status || 'Gifted',
    contract_status: round.contract_status || 'Not needed',
    rate_type: round.rate_type || 'Unknown',
    next_action: round.next_action || '',
    final_product: round.final_product || '',
    tracking_number: round.tracking_number || '',
    shipping_address: round.shipping_address || '',
    pet_details: round.pet_details || '',
    post_links: normalizePostLinks(round.post_links),
    posted_date: round.posted_date || null,
    performance_note: round.performance_note || ''
  };
  let saved = { ...round, ...payload };
  if (isConfigured()) {
    if (String(round.id).startsWith('legacy-')) {
      const rows = await api('collaboration_rounds?select=*', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload)
      });
      saved = rows[0];
    } else {
      const rows = await api(`collaboration_rounds?id=eq.${encodeURIComponent(round.id)}&select=*`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload)
      });
      saved = rows[0];
    }
  } else if (String(round.id).startsWith('legacy-')) {
    saved.id = crypto.randomUUID();
  }
  const rounds = state.roundsByCreator.get(creator.id) || [];
  const oldId = round.id;
  const index = rounds.findIndex(item => item.id === oldId);
  if (index >= 0) rounds[index] = saved;
  else rounds.unshift(saved);
  state.roundsByCreator.set(creator.id, rounds);
  state.roundProductsByCreator.set(
    creator.id,
    [...new Set(rounds.flatMap(item => productList(item.final_product)))]
  );
  state.selectedRoundByCreator.set(creator.id, saved.id);
  if (state.selectedId === creator.id) state.selectedRoundId = saved.id;
  if (state.assetsByRound.has(oldId) && oldId !== saved.id) {
    state.assetsByRound.set(saved.id, state.assetsByRound.get(oldId));
    state.assetsByRound.delete(oldId);
  }
  await syncCreatorFromRound(saved);
  if (state.selectedId === creator.id) renderRounds();
  return saved;
}

async function syncCreatorFromRound(round) {
  const creator = selectedCreator();
  if (!creator || !round.is_current) return;
  Object.assign(creator, {
    stage: round.stage,
    product_direction: round.product_direction,
    reason_blocker: round.reason_blocker,
    rights_status: round.rights_status,
    payment_status: round.payment_status,
    contract_status: round.contract_status,
    rate_type: round.rate_type,
    next_action: round.next_action,
    final_product: round.final_product,
    tracking_number: round.tracking_number,
    shipping_address: round.shipping_address,
    pet_details: round.pet_details,
    content_url: normalizePostLinks(round.post_links)[0]?.url || '',
    posted_date: round.posted_date,
    performance_note: round.performance_note,
    collab_count: Math.max(Number(creator.collab_count || 0), Number(round.round_number || 1)),
    last_collab_date: round.posted_date || creator.last_collab_date
  });
  const saved = await saveCreator(creator);
  upsertLocal(saved);
}

async function downloadRoundAssets() {
  const round = selectedRound();
  const assets = state.assetsByRound.get(assetCacheKey()) || [];
  if (!round || !assets.length) return showNotice('This round has no uploaded files or links yet.');
  const downloadable = assets.filter(asset => asset.storage_path && asset.public_url);
  const links = assets.filter(asset => !asset.storage_path && asset.public_url);
  setAssetStatus(`Preparing ${downloadable.length} files...`);
  for (const asset of downloadable) {
    try {
      const response = await fetch(asset.public_url);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = asset.file_name || 'creator-asset';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      await new Promise(resolve => setTimeout(resolve, 250));
    } catch (error) {
      console.warn(error);
    }
  }
  links.forEach(asset => window.open(asset.public_url, '_blank', 'noopener'));
  setAssetStatus(`Downloaded ${downloadable.length} files${links.length ? ` · opened ${links.length} external links` : ''}.`);
}

function friendlyError(error) {
  const text = String(error?.message || error || 'Unknown error');
  if (/Failed to fetch/i.test(text)) return 'Database connection unavailable. Refresh the CRM and check Supabase project status.';
  return text.length > 220 ? `${text.slice(0, 220)}...` : text;
}

function renderMetrics() {
  const all = state.creators;
  const repliedStages = ['Replied','Negotiating','Address received','Shipped','Delivered','Posted'];
  const seededStages = ['Address received','Shipped','Delivered','Posted'];
  const shippedStages = ['Shipped','Delivered','Posted'];
  const contacted = dmCount();
  const replied = all.filter(c => repliedStages.includes(c.stage)).length;
  const seeded = all.filter(c => seededStages.includes(c.stage)).length;
  const shipped = all.filter(c => shippedStages.includes(c.stage)).length;
  const posted = all.filter(c => c.stage === 'Posted' || c.content_url || c.posted_date).length;
  const rate = (a, b) => b ? Math.round(a / b * 100) : 0;
  const html = `
    <div class="metric"><span>Reply</span><strong>${rate(replied, contacted)}%</strong><small>${replied}/${contacted}</small></div>
    <div class="metric"><span>Collab</span><strong>${rate(seeded, replied)}%</strong><small>${seeded}/${replied}</small></div>
    <div class="metric"><span>Shipping</span><strong>${rate(shipped, seeded)}%</strong><small>${shipped}/${seeded}</small></div>
    <div class="metric"><span>Post</span><strong>${rate(posted, seeded)}%</strong><small>${posted}/${seeded}</small></div>
  `;
  const workspaceMetrics = $('#metrics');
  if (workspaceMetrics) workspaceMetrics.innerHTML = html;
  const dashboard = $('#dashboardMetrics');
  if (dashboard) dashboard.innerHTML = html;
}

function dmCount() {
  return state.creators.filter(c => dmStages().includes(c.stage)).length;
}

function dmStages() {
  return ['DM sent','Follow-up sent','No reply after 2 follow-ups','Replied','Negotiating','Address received','Shipped','Delivered','Posted','Declined'];
}

function renderProductStats() {
  const counts = {};
  state.creators.forEach(c => {
    if (!['Address received','Shipped','Delivered','Posted'].includes(c.stage)) return;
    productList(c.final_product).forEach(product => {
      counts[product] = (counts[product] || 0) + 1;
    });
  });
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 14);
  const html = rows.length
    ? rows.map(([product, count]) => `<div class="product-line"><span>${escapeHtml(product)}</span><strong>${count}</strong></div>`).join('')
    : '<p class="muted">No product data yet.</p>';
  const productStats = $('#productStats');
  if (productStats) productStats.innerHTML = html;
  const dashboard = $('#dashboardProducts');
  if (dashboard) dashboard.innerHTML = html;
}


function selectedCreator() {
  return state.creators.find(c => c.id === state.selectedId);
}

function editCreator(id) {
  if (!id) return;
  if (state.selectedId !== id) {
    clearTimeout(state.autoSaveTimer);
    clearTimeout(state.roundSaveTimer);
    state.selectedId = id;
    const rounds = state.roundsByCreator.get(id) || [];
    state.selectedRoundId = state.selectedRoundByCreator.get(id)
      || rounds.find(round => round.is_current)?.id
      || rounds[0]?.id
      || '';
  }
  state.activeTab = 'profile';
  render();
  requestAnimationFrame(() => {
    const target = form.elements.handle || form.querySelector('input, select, textarea');
    if (target) target.focus();
  });
  setStatus('Editing');
}

async function deleteCreator(id) {
  const creator = state.creators.find(c => c.id === id);
  if (!creator) return;
  if (state.saving) return showNotice('Please wait for the current save to finish before deleting.');
  const confirmed = confirm(`Delete @${creator.handle} from CRM?\n\nThis cannot be undone.`);
  if (!confirmed) return;
  clearTimeout(state.autoSaveTimer);
  try {
    setStatus('Deleting');
    if (isConfigured()) await api(`creators?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    state.creators = state.creators.filter(c => c.id !== id);
    state.selectedIds.delete(id);
    if (state.selectedId === id) state.selectedId = filteredCreators()[0]?.id || state.creators[0]?.id || '';
    render();
    setStatus('Deleted');
  } catch (error) {
    setStatus('Delete error');
    showNotice(error.message || error);
  }
}

function creatorFromForm() {
  const creator = selectedCreator() ? { ...selectedCreator() } : {};
  FIELDS.forEach(field => {
    if (form.elements[field]) creator[field] = normalizeInputValue(form.elements[field].value);
  });
  return normalizeCreator(creator);
}

function normalizeCreator(raw) {
  const c = { ...raw };
  c.handle = normalizeHandle(c.handle);
  c.profile_url = c.profile_url || (c.handle ? `https://www.instagram.com/${c.handle}` : '');
  c.tier = c.tier || 'B';
  c.stage = normalizeStage(c.stage, c.review);
  c.product_direction = c.product_direction || c.product || 'Scrunchie + Bandana';
  c.shipping_status = c.shipping_status || 'Not ready';
  c.payment_status = c.payment_status || 'Gifted';
  c.contract_status = c.contract_status || 'Not needed';
  c.rate_type = c.rate_type || 'Unknown';
  c.review = c.review || 'Not reviewed';
  if (c.stage === 'No reply after 2 follow-ups') c.reason_blocker = 'No reply after 2 follow-ups';
  if (c.collab_count === '') c.collab_count = 0;
  return keepFields(c);
}

function keepFields(c) {
  const out = {};
  const dateFields = new Set(['last_touch','next_follow','posted_date','last_collab_date','signed_date','paid_date']);
  FIELDS.forEach(field => {
    if (dateFields.has(field)) out[field] = c[field] || null;
    else if (field === 'collab_count') out[field] = Number(c[field] || 0);
    else if (c[field] !== undefined && c[field] !== null) out[field] = c[field];
  });
  return out;
}

function normalizeInputValue(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeHandle(value) {
  return String(value || '').replace(/^@/, '').trim().toLowerCase();
}

function normalizeStage(stage, review) {
  if (OPTIONS.stages.includes(stage)) return stage;
  if (stage === 'Rejected') return 'Declined';
  if (stage === 'To review' && review === 'Paused') return 'Paused';
  if (stage === 'To review') return 'Not contacted';
  return stage || 'Not contacted';
}

function quickAction(action) {
  const current = roundFromForm();
  if (!current) return;
  const today = new Date().toISOString().slice(0, 10);
  if (action === 'DM sent') {
    current.stage = 'DM sent';
  }
  if (action === 'Follow-up') {
    current.stage = current.stage === 'Follow-up sent' ? 'No reply after 2 follow-ups' : 'Follow-up sent';
    if (current.stage === 'No reply after 2 follow-ups') current.reason_blocker = 'No reply after 2 follow-ups';
  }
  if (action === 'Address') {
    current.stage = 'Address received';
    current.next_action = current.next_action || 'Prepare shipment';
  }
  if (action === 'Shipped') {
    current.stage = 'Shipped';
  }
  if (action === 'Delivered') {
    current.stage = 'Delivered';
  }
  if (action === 'Posted') {
    current.stage = 'Posted';
    current.posted_date = current.posted_date || today;
  }
  saveRound(current).then(() => setStatus(action));
}

async function bulkApply() {
  const targets = bulkTargets();
  if (!targets.length) return showNotice('No creators selected or filtered.');
  const changes = {};
  if ($('#bulkStage').value) changes.stage = $('#bulkStage').value;
  if ($('#bulkProductDirection').value) changes.product_direction = $('#bulkProductDirection').value;
  if ($('#bulkReason').value) changes.reason_blocker = $('#bulkReason').value;
  if ($('#bulkRights').value) changes.rights_status = $('#bulkRights').value;
  if (!Object.keys(changes).length) return showNotice('Choose at least one bulk field.');
  if (!confirm(`Update ${targets.length} creators?`)) return;
  try {
    setStatus('Bulk saving');
    if (!isConfigured()) {
      targets.forEach(c => Object.assign(c, changes));
      render();
      setStatus('Demo bulk saved');
      return;
    }
    await Promise.all(targets.map(c => api(`creators?id=eq.${encodeURIComponent(c.id)}`, {
      method: 'PATCH',
      body: JSON.stringify(changes)
    })));
    await loadCreators();
    setStatus('Bulk saved');
  } catch (error) {
    setStatus('Bulk error');
    showNotice(error.message || error);
  }
}

function bulkTargets() {
  if (state.selectedIds.size) return state.creators.filter(c => state.selectedIds.has(c.id));
  return filteredCreators();
}

function toggleSelection(id) {
  if (state.selectedIds.has(id)) state.selectedIds.delete(id);
  else state.selectedIds.add(id);
  render();
}

function selectFiltered() {
  filteredCreators().forEach(c => state.selectedIds.add(c.id));
  render();
}

function invertFilteredSelection() {
  filteredCreators().forEach(c => {
    if (state.selectedIds.has(c.id)) state.selectedIds.delete(c.id);
    else state.selectedIds.add(c.id);
  });
  render();
}

function resetView() {
  state.workflow = 'all';
  state.selectedIds.clear();
  ['searchInput','stageFilter','tierFilter','accountTypeFilter','appearanceFilter','dogSizeFilter','sourceFilter','productFilter'].forEach(id => {
    const el = $('#' + id);
    if (el) el.value = '';
  });
  $('#excludeNoReply').checked = false;
  render();
}

async function addCreator() {
  const handle = prompt('Creator handle');
  if (!handle) return;
  const cleanHandle = normalizeHandle(handle);
  const creator = normalizeCreator({
    handle: cleanHandle,
    profile_url: `https://www.instagram.com/${cleanHandle}`,
    tier: 'B',
    account_type: 'Human + Pet',
    appearance: 'Unknown',
    dog_size: '',
    source_group: 'Manual add',
    fit_verdict: 'Maybe',
    link_status: 'Not checked',
    stage: 'Not contacted',
    reply_status: 'Not contacted',
    rights_status: 'Not discussed',
    product_direction: 'Scrunchie + Bandana',
    shipping_status: 'Not ready',
    payment_status: 'Gifted',
    contract_status: 'Not needed'
  });
  try {
    setStatus('Adding');
    const saved = await saveCreator(creator);
    state.creators.unshift(saved);
    state.selectedId = saved.id;
    render();
    setStatus('Added');
  } catch (error) {
    setStatus('Add error');
    showNotice(error.message || error);
  }
}

async function importCsv(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    setStatus('Importing');
    const text = await file.text();
    const creators = parseCsv(text).map(mapImportRow).filter(c => c.handle);
    if (!creators.length) throw new Error('No creator rows found.');
    if (!isConfigured()) {
      creators.forEach(c => upsertLocal({ ...c, id: c.id || crypto.randomUUID() }));
      render();
      setStatus(`Demo imported ${creators.length}`);
      return;
    }
    await api('creators?on_conflict=handle', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(creators)
    });
    await loadCreators();
    setStatus(`Imported ${creators.length}`);
  } catch (error) {
    setStatus('Import error');
    showNotice(error.message || error);
  } finally {
    event.target.value = '';
  }
}

function mapImportRow(row) {
  const get = (...keys) => keys.map(key => row[key]).find(value => value !== undefined && String(value).trim() !== '') || '';
  const legacyAddress = [
    get('shippingName'),
    get('shippingAddress1'),
    get('shippingAddress2'),
    get('shippingCity'),
    get('shippingState'),
    get('shippingZip'),
    get('shippingCountry')
  ].filter(value => value && !trackingLike(value)).join('\n');
  const petText = get('petDetails') || extractPetDetails([get('shippingAddress'), legacyAddress, get('lastMessage'), get('notes'), get('databaseNotes')].join('\n'));
  return normalizeCreator({
    handle: get('handle','nickname','昵称'),
    profile_url: get('profile_url','profileUrl','profile','主页链接'),
    tier: get('tier','级别'),
    account_type: get('account_type','accountType','类别'),
    appearance: get('appearance','appearanceType'),
    dog_size: get('dog_size','dogSize','Dog Size','犬体型','犬只体型'),
    source_group: get('source_group','sourceGroup','source','source group'),
    source_detail: get('source_detail','sourceDetail','source detail'),
    followers: get('followers','粉丝数'),
    location: get('location','所在地'),
    fit_verdict: get('fit_verdict','fitVerdict'),
    link_status: get('link_status','linkStatus'),
    stage: get('stage'),
    reply_status: get('reply_status','reply','replyStatus'),
    reason_blocker: get('reason_blocker','outreachFlag','reasonBlocker'),
    rights_status: get('rights_status','rights','rightsStatus'),
    payment_status: get('payment_status','payment','paymentStatus'),
    contract_status: get('contract_status','contract','contractStatus'),
    rate_type: get('rate_type','rateType'),
    quoted_rate: get('quoted_rate','quotedRate'),
    approved_budget: get('approved_budget','approvedBudget'),
    product_direction: get('product_direction','productDirection','product','适合商品'),
    final_product: get('final_product','finalProduct'),
    shipping_status: get('shipping_status','shipping','shippingStatus'),
    shipping_address: get('shipping_address','shippingAddress') || legacyAddress,
    pet_details: petText,
    tracking_number: get('tracking_number','trackingNumber') || [get('shippingAddress2'), get('shippingCity'), get('shippingZip')].find(trackingLike) || '',
    next_action: get('next_action','nextAction'),
    last_touch: dateValue(get('last_touch','lastTouch')),
    next_follow: dateValue(get('next_follow','nextFollow')),
    dm_notes: get('dm_notes','dmNotes'),
    last_message: get('last_message','lastMessage'),
    conversation_link: get('conversation_link','conversationLink'),
    content_url: get('content_url','contentUrl'),
    posted_date: dateValue(get('posted_date','postedDate')),
    collab_history: get('collab_history','collabHistory'),
    collab_count: Number(get('collab_count','collabCount') || 0),
    last_collab_date: dateValue(get('last_collab_date','lastCollabDate')),
    performance_note: get('performance_note','performanceNote'),
    contract_url: get('contract_url','contractUrl'),
    signed_date: dateValue(get('signed_date','signedDate')),
    payment_method: get('payment_method','paymentMethod'),
    paid_date: dateValue(get('paid_date','paidDate')),
    contact_email: get('contact_email','contactEmail'),
    phone: get('phone'),
    notes: get('notes'),
    database_notes: get('database_notes','databaseNotes')
  });
}

async function exportCsv(scope = 'filtered') {
  const source = scope === 'all' ? state.creators : filteredCreators();
  const exportFields = FIELDS.concat(['collaboration_round_count', 'collaboration_rounds', 'asset_count', 'asset_links']);
  const assetsByCreator = new Map();
  const roundsByCreator = new Map();
  if (isConfigured()) {
    try {
      const [assets, rounds] = await Promise.all([
        api('creator_assets?select=creator_id,round_id,file_name,asset_type,public_url,created_at&order=created_at.desc'),
        api('collaboration_rounds?select=*&order=round_number.desc')
      ]);
      assets.forEach(asset => {
        const list = assetsByCreator.get(asset.creator_id) || [];
        list.push(asset);
        assetsByCreator.set(asset.creator_id, list);
      });
      rounds.forEach(round => {
        const list = roundsByCreator.get(round.creator_id) || [];
        list.push(round);
        roundsByCreator.set(round.creator_id, list);
      });
    } catch (error) {
      showNotice(`Creator data exported, but round or asset details could not be added: ${friendlyError(error)}`);
    }
  }
  const rows = [exportFields].concat(source.map(c => {
    const assets = assetsByCreator.get(c.id) || [];
    const rounds = roundsByCreator.get(c.id) || state.roundsByCreator.get(c.id) || [];
    const assetLinks = assets.map(asset => `${asset.asset_type || 'Asset'}: ${asset.file_name || 'Link'} - ${asset.public_url || ''}`).join('\n');
    const roundSummary = rounds.map(round => {
      const posts = normalizePostLinks(round.post_links).map(link => `${link.platform}: ${link.url}`).join(' | ');
      return `Round ${round.round_number}: ${round.stage || ''} | ${round.final_product || ''} | Tracking: ${round.tracking_number || ''} | Posts: ${posts}`;
    }).join('\n');
    return FIELDS.map(field => c[field] || '').concat([rounds.length, roundSummary, assets.length, assetLinks]);
  }));
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `matchmate_creator_crm_${scope}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function isConfigured() {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}

function demoCreators() {
  return [
    normalizeCreator({
      id: 'demo-1',
      handle: 'maevemanor',
      profile_url: 'https://www.instagram.com/maevemanor/',
      tier: 'A',
      account_type: 'Human + Pet',
      appearance: 'Human + Pet',
      source_group: 'Organic search',
      followers: '649',
      location: 'Seattle, WA',
      fit_verdict: 'Strong',
      stage: 'Address received',
      reply_status: 'Replied',
      product_direction: 'Scrunchie + Bandana',
      final_product: 'Rose Bloom Set',
      shipping_status: 'Address received',
      shipping_address: 'Riley Richardson\\n3706 NE 42nd st\\nSeattle WA 98105',
      pet_details: 'Maeve - 70 lbs, neck about 17 inches',
      next_action: 'Prepare shipment'
    }),
    normalizeCreator({
      id: 'demo-2',
      handle: 'suzy_baer',
      profile_url: 'https://www.instagram.com/suzy_baer',
      tier: 'A',
      account_type: 'Human + Pet',
      appearance: 'Human + Pet',
      source_group: 'Benchmark brand',
      followers: '1640',
      location: 'United States',
      fit_verdict: 'Strong',
      stage: 'Delivered',
      reply_status: 'Replied',
      product_direction: 'Necklace',
      final_product: 'Wildflower Charm Necklace Set',
      shipping_status: 'Delivered',
      shipping_address: 'Cynthia Mae Cortez\\n6812 Maurice Ave Woodside NY 11377',
      pet_details: 'Suzy - neck 41cm',
      tracking_number: '9500115987546175871230',
      next_action: 'Wait for content'
    }),
    normalizeCreator({
      id: 'demo-3',
      handle: 'st0rrey',
      profile_url: 'https://www.instagram.com/st0rrey/',
      tier: 'A',
      account_type: 'Human + Pet',
      appearance: 'Human + Pet',
      source_group: 'Organic search',
      followers: '1605',
      location: 'New York, NY',
      fit_verdict: 'Strong',
      stage: 'Address received',
      reply_status: 'Replied',
      product_direction: 'Necklace',
      final_product: 'Ocean Pearl Necklace Set',
      shipping_status: 'Address received',
      shipping_address: 'Storrey Lance\\n951 Carroll St. 6C\\nBrooklyn, NY 11225',
      pet_details: 'Roxy - neck about 11 inches',
      next_action: 'Prepare shipment'
    }),
    normalizeCreator({
      id: 'demo-4',
      handle: 'paigecren',
      profile_url: 'https://www.instagram.com/paigecren/',
      tier: 'B',
      account_type: 'Human + Pet',
      appearance: 'Human + Pet',
      source_group: 'Organic search',
      followers: '1951',
      location: 'New York, NY',
      fit_verdict: 'Strong',
      stage: 'DM sent',
      reply_status: 'DM sent',
      product_direction: 'Scrunchie + Bandana',
      shipping_status: 'Not ready',
      reason_blocker: '',
      next_action: 'Follow up if no reply'
    }),
    normalizeCreator({
      id: 'demo-5',
      handle: 'no_reply_demo',
      profile_url: 'https://www.instagram.com/no_reply_demo',
      tier: 'C',
      account_type: 'Fashion / Beauty',
      appearance: 'Human Only',
      source_group: 'Creator platform',
      followers: '3200',
      location: 'Los Angeles, CA',
      fit_verdict: 'Maybe',
      stage: 'No reply after 2 follow-ups',
      reply_status: 'No reply',
      reason_blocker: 'No reply after 2 follow-ups',
      product_direction: 'Scrunchie',
      shipping_status: 'Not ready',
      next_action: 'Skip next DM batch'
    })
  ];
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  row.push(cell);
  if (row.some(value => value !== '')) rows.push(row);
  const headers = (rows.shift() || []).map(h => h.trim());
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

function finalProduct(c) {
  return c.final_product || c.product_direction || '';
}

function productList(value) {
  return String(value || '').split(/\s*[;|]\s*/).map(item => item.trim()).filter(Boolean);
}

function setFinalProduct(value) {
  const input = $('#roundFinalProduct');
  if (input) input.value = productList(value).join('; ');
}

function renderFinalProductChoices(value) {
  const container = $('#finalProductChoices');
  if (!container) return;
  const selected = new Set(productList(value));
  setFinalProduct(value);
  const groups = productGroups();
  container.innerHTML = Object.entries(groups).map(([group, products]) => `
    <div class="choice-group">
      <div class="choice-group-title">${escapeHtml(group)}</div>
      <div class="choice-group-items">
        ${products.map(product => `
          <label class="choice-pill">
            <input type="checkbox" value="${escapeHtml(product)}" ${selected.has(product) ? 'checked' : ''}>
            <span>${escapeHtml(product)}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `).join('');
  container.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
    const values = [...container.querySelectorAll('input:checked')].map(box => box.value);
    setFinalProduct(values.join('; '));
    scheduleRoundAutoSave(150);
    renderProductStats();
  }));
}

function productGroups() {
  const groups = {
    Sets: [],
    Scrunchies: [],
    Bandanas: [],
    Necklaces: []
  };
  OPTIONS.finalProducts.filter(Boolean).forEach(product => {
    if (product.includes('Set')) groups.Sets.push(product);
    else if (product.includes('Scrunchie')) groups.Scrunchies.push(product);
    else if (product.includes('Bandana')) groups.Bandanas.push(product);
    else if (product.includes('Necklace')) groups.Necklaces.push(product);
    else groups.Sets.push(product);
  });
  return groups;
}

async function startNewRound() {
  const creator = selectedCreator();
  const current = roundFromForm();
  if (!creator || !current) return;
  const confirmed = confirm(`Start a new collaboration round for @${creator.handle}?\n\nThe current round, its files, and published links will stay unchanged.`);
  if (!confirmed) return;
  try {
    setStatus('Starting new round');
    const savedCurrent = await saveRound({ ...current, is_current: false });
    const rounds = state.roundsByCreator.get(creator.id) || [];
    const nextNumber = Math.max(...rounds.map(round => Number(round.round_number || 0)), 0) + 1;
    const payload = {
      creator_id: creator.id,
      round_number: nextNumber,
      is_current: true,
      stage: 'Replied',
      product_direction: 'Both Sets',
      rights_status: savedCurrent.rights_status || 'Not discussed',
      payment_status: 'Gifted',
      contract_status: 'Not needed',
      rate_type: savedCurrent.rate_type || 'Unknown',
      next_action: 'Choose product for repeat collaboration',
      final_product: '',
      tracking_number: '',
      shipping_address: savedCurrent.shipping_address || '',
      pet_details: savedCurrent.pet_details || '',
      post_links: [],
      posted_date: null,
      performance_note: ''
    };
    let nextRound = { ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    if (isConfigured()) {
      const rows = await api('collaboration_rounds?select=*', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload)
      });
      nextRound = rows[0];
    }
    const updatedRounds = [nextRound, savedCurrent, ...rounds]
      .filter((round, index, array) => array.findIndex(item => item.id === round.id) === index)
      .map(round => ({ ...round, is_current: round.id === nextRound.id }))
      .sort((a, b) => Number(b.round_number) - Number(a.round_number));
    state.roundsByCreator.set(creator.id, updatedRounds);
    state.selectedRoundId = nextRound.id;
    state.selectedRoundByCreator.set(creator.id, nextRound.id);
    await syncCreatorFromRound(nextRound);
    renderRounds();
    setStatus('New round ready');
  } catch (error) {
    setStatus('New round error');
    showNotice(friendlyError(error));
  }
}

function nextHint(c) {
  if (!c.shipping_address && c.stage === 'Address received') return 'Waiting for address';
  if (!finalProduct(c)) return 'Choose final product';
  if (!c.tracking_number && ['Shipped','Delivered'].includes(c.stage)) return 'Add tracking';
  if (c.stage === 'Delivered' && !c.content_url) return 'Wait for post';
  return 'Ready';
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateValue(value) {
  value = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function trackingLike(value) {
  value = String(value || '').trim();
  return /^[A-Z0-9]{10,34}$/i.test(value) && /\d{6,}/.test(value);
}

function extractPetDetails(text) {
  const matches = String(text || '').match(/(pet|dog|neck|breed|weight|脖围|cm|inch|inches)[^\n]*/ig) || [];
  return [...new Set(matches)].slice(0, 8).join('\n');
}

function upsertLocal(saved) {
  const index = state.creators.findIndex(c => c.id === saved.id);
  if (index >= 0) state.creators[index] = saved;
  else state.creators.unshift(saved);
}

function csvEscape(value) {
  value = String(value || '');
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function setStatus(text) {
  $('#status').textContent = text;
}

function showNotice(message) {
  alert(String(message || 'Unknown error'));
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}
