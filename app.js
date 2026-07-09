const OPTIONS = {
  stages: ['Not contacted','DM sent','Follow-up sent','No reply after 2 follow-ups','Replied','Negotiating','Address received','Shipped','Delivered','Posted','Declined','Paused'],
  tiers: ['A','B','C','Rejected'],
  productDirections: ['Scrunchie + Bandana','Necklace','Both Sets','Scrunchie','Bandana','Not a Fit'],
  finalProducts: ['','Rose Bloom Set','Mocha Sky Set','Lavender Mist Set','Rose Bloom Scrunchie','Rose Bloom Bandana','Mocha Sky Scrunchie','Mocha Sky Bandana','Lavender Mist Scrunchie','Lavender Mist Bandana','Wildflower Charm Necklace Set','Ocean Pearl Necklace Set','Emerald Dew Necklace Set','Wildflower Charm Necklace','Ocean Pearl Necklace','Emerald Dew Necklace'],
  accountTypes: ['Lifestyle','Fashion / Beauty','Human + Pet','Pet Only'],
  appearances: ['Human + Pet','Human Only','Pet Only','Unknown'],
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
};

const FIELDS = [
  'id','handle','profile_url','tier','account_type','appearance','source_group','source_detail',
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
  selectedId: '',
  selectedIds: new Set(),
  workflow: 'all',
  activeTab: 'workflow',
  saving: false,
  autoSaveTimer: null
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
  ['searchInput','stageFilter','tierFilter','accountTypeFilter','appearanceFilter','sourceFilter','productFilter','excludeNoReply']
    .forEach(id => $('#' + id).addEventListener('input', render));
  document.querySelectorAll('.tab-button').forEach(button => button.addEventListener('click', () => {
    state.activeTab = button.dataset.tab;
    renderTabs();
  }));
  document.querySelectorAll('.quick-actions button').forEach(button => button.addEventListener('click', () => quickAction(button.dataset.action)));
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
    state.selectedId = state.selectedId || state.creators[0]?.id || '';
    render();
    setStatus(`Loaded ${state.creators.length}`);
  } catch (error) {
    setStatus('Load error');
    showNotice(error.message || error);
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
  const creator = creatorFromForm();
  try {
    state.saving = true;
    setStatus('Saving');
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
  fillFormSelect('stage', OPTIONS.stages);
  fillFormSelect('product_direction', OPTIONS.productDirections);
  fillFormSelect('reason_blocker', OPTIONS.reasons);
  fillFormSelect('rights_status', OPTIONS.rights);
  fillFormSelect('payment_status', OPTIONS.payments);
  fillFormSelect('contract_status', OPTIONS.contracts);
  fillFormSelect('rate_type', OPTIONS.rates);
  renderFinalProductChoices('');
  fillFormSelect('tier', OPTIONS.tiers);
  fillFormSelect('account_type', OPTIONS.accountTypes);
  fillFormSelect('appearance', OPTIONS.appearances);
  fillFormSelect('fit_verdict', OPTIONS.fitVerdicts);
  fillFormSelect('source_group', OPTIONS.sourceGroups);
  fillFormSelect('link_status', OPTIONS.linkStatuses);
  fillFormSelect('review', OPTIONS.reviews);
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
  renderWorkflow();
  renderDynamicFilters();
  renderMetrics();
  renderProductStats();
  renderList();
  renderDetail();
  renderTabs();
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
  const source = $('#sourceFilter').value;
  const product = $('#productFilter').value;
  const excludeNoReply = $('#excludeNoReply').checked;
  return state.creators.filter(c => {
    const productLabel = finalProduct(c);
    const text = [
      c.handle, c.profile_url, c.source_group, c.source_detail, c.location,
      c.account_type, c.appearance, c.fit_verdict, productLabel, c.shipping_address,
      c.pet_details, c.tracking_number, c.notes, c.database_notes, c.content_url
    ].join(' ').toLowerCase();
    return workflowMatch(c, state.workflow)
      && (!q || text.includes(q))
      && (!stage || c.stage === stage)
      && (!tier || c.tier === tier)
      && (!accountType || c.account_type === accountType)
      && (!appearance || c.appearance === appearance)
      && (!source || c.source_group === source)
      && (!product || productList(c.final_product).includes(product))
      && (!excludeNoReply || (c.stage !== 'No reply after 2 follow-ups' && c.reason_blocker !== 'No reply after 2 follow-ups'));
  });
}

function renderDynamicFilters() {
  updateFilter('#accountTypeFilter', unique('account_type'));
  updateFilter('#appearanceFilter', unique('appearance'));
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
  return [...new Set(state.creators.flatMap(c => productList(c.final_product)).filter(Boolean))].sort();
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
        <div class="summary-cell"><span>Final Product</span><strong>${escapeHtml(productLabel || 'Not selected')}</strong></div>
        <div class="summary-cell"><span>Tracking Number</span><strong>${escapeHtml(c.tracking_number || 'Not filled')}</strong></div>
        <div class="summary-cell"><span>Shipping Address</span><strong>${escapeHtml(c.shipping_address ? 'Filled' : 'Missing')}</strong></div>
        <div class="summary-cell"><span>Next Action</span><strong>${escapeHtml(c.next_action || nextHint(c))}</strong></div>
      </div>
      <p class="muted">${escapeHtml([c.account_type, c.appearance, c.location].filter(Boolean).join(' · '))}</p>
    `;
    card.addEventListener('click', () => { state.selectedId = c.id; render(); });
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
  renderFinalProductChoices(creator.final_product || '');
}

function renderTabs() {
  document.querySelectorAll('.tab-button').forEach(button => button.classList.toggle('active', button.dataset.tab === state.activeTab));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === `tab-${state.activeTab}`));
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
  $('#metrics').innerHTML = `
    <div class="metric"><span>Reply</span><strong>${rate(replied, contacted)}%</strong><small>${replied}/${contacted}</small></div>
    <div class="metric"><span>Collab</span><strong>${rate(seeded, replied)}%</strong><small>${seeded}/${replied}</small></div>
    <div class="metric"><span>Shipping</span><strong>${rate(shipped, seeded)}%</strong><small>${shipped}/${seeded}</small></div>
    <div class="metric"><span>Post</span><strong>${rate(posted, seeded)}%</strong><small>${posted}/${seeded}</small></div>
  `;
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
  $('#productStats').innerHTML = rows.length
    ? rows.map(([product, count]) => `<div class="product-line"><span>${escapeHtml(product)}</span><strong>${count}</strong></div>`).join('')
    : '<p class="muted">No product data yet.</p>';
}

function selectedCreator() {
  return state.creators.find(c => c.id === state.selectedId);
}

function editCreator(id) {
  if (!id) return;
  state.selectedId = id;
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
  const current = creatorFromForm();
  const today = new Date().toISOString().slice(0, 10);
  const nextFollow = addDays(3);
  if (action === 'DM sent') {
    current.reply_status = 'DM sent';
    current.stage = 'DM sent';
    current.last_touch = today;
    current.next_follow = nextFollow;
  }
  if (action === 'Follow-up') {
    current.stage = current.stage === 'Follow-up sent' ? 'No reply after 2 follow-ups' : 'Follow-up sent';
    current.reply_status = current.stage === 'No reply after 2 follow-ups' ? 'No reply' : 'Follow-up sent';
    current.last_touch = today;
    current.next_follow = nextFollow;
    if (current.stage === 'No reply after 2 follow-ups') current.reason_blocker = 'No reply after 2 follow-ups';
  }
  if (action === 'Address') {
    current.shipping_status = 'Address received';
    current.stage = 'Address received';
    current.next_action = current.next_action || 'Prepare shipment';
  }
  if (action === 'Shipped') {
    current.shipping_status = 'Shipped';
    current.stage = 'Shipped';
  }
  if (action === 'Delivered') {
    current.shipping_status = 'Delivered';
    current.stage = 'Delivered';
  }
  if (action === 'Posted') {
    current.stage = 'Posted';
    current.posted_date = current.posted_date || today;
  }
  FIELDS.forEach(field => {
    if (form.elements[field]) form.elements[field].value = current[field] || '';
  });
  renderFinalProductChoices(current.final_product || '');
  saveCurrent(action);
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
  ['searchInput','stageFilter','tierFilter','accountTypeFilter','appearanceFilter','sourceFilter','productFilter'].forEach(id => {
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

function exportCsv(scope = 'filtered') {
  const source = scope === 'all' ? state.creators : filteredCreators();
  const rows = [FIELDS].concat(source.map(c => FIELDS.map(field => c[field] || '')));
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
  const input = form.elements.final_product;
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
    scheduleAutoSave(150);
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

function startNewRound() {
  const current = creatorFromForm();
  const products = finalProduct(current);
  const hasCurrent = products || current.tracking_number || current.content_url || current.posted_date;
  if (!hasCurrent) return showNotice('No current shipment or content to archive yet.');
  const today = new Date().toISOString().slice(0, 10);
  const line = [
    current.posted_date || current.last_collab_date || today,
    products ? `Products: ${products}` : '',
    current.content_url ? `Content: ${current.content_url}` : '',
    current.tracking_number ? `Tracking: ${current.tracking_number}` : ''
  ].filter(Boolean).join(' | ');
  const confirmed = confirm([
    `Start a new round for @${current.handle}?`,
    '',
    'This will archive:',
    line,
    '',
    'Then it will clear current Final Product, Tracking Number, Content URL, and Posted Date.'
  ].join('\n'));
  if (!confirmed) return;
  current.collab_history = [line, current.collab_history].filter(Boolean).join('\n');
  current.collab_count = Number(current.collab_count || 0) + 1;
  current.last_collab_date = current.posted_date || current.last_collab_date || today;
  current.stage = 'Replied';
  current.product_direction = 'Both Sets';
  current.final_product = '';
  current.tracking_number = '';
  current.content_url = '';
  current.posted_date = '';
  current.next_action = 'Choose new product for repeat collaboration';
  FIELDS.forEach(field => {
    if (form.elements[field]) form.elements[field].value = current[field] || '';
  });
  renderFinalProductChoices('');
  saveCurrent('New round started');
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
