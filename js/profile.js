import {
  fetchBuildings,
  fetchCurrentUser,
  fetchBuildingStatuses,
  fetchUserCollections,
  fetchUserCollectionItems,
  fetchUserPrivateLabels,
  updateCurrentUserProfile,
  upsertCurrentProfile,
  createUserCollection,
  createUserPrivateLabel,
  addUserCollectionItem,
  deleteUserCollection,
  deleteUserCollectionItem,
  deleteUserPrivateLabel,
} from './api.js';
import { state, cargarZonaPersonalLocal, guardarZonaPersonalLocal } from './state.js';

const SESSION_KEY = 'nolli_admin_session_token';
const content = document.getElementById('profile-content');
const stats = document.getElementById('profile-stats');
const authRequired = document.getElementById('profile-auth-required');
const app = document.getElementById('profile-app');
let activeTab = 'overview';
let profileState = { user: null, buildings: [], statuses: new Map(), collections: [], items: [], labels: [] };

const text = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
function getSessionToken() {
  const stored = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  try { return JSON.parse(stored).access_token || stored; } catch { return stored; }
}
const obraFor = (id) => profileState.buildings.find((building) => String(building.id) === String(id));
const statusBuildings = (key) => profileState.buildings.filter((building) => profileState.statuses.get(String(building.id))?.[key]);
const savedBuildings = () => [...new Set(profileState.items.map((item) => String(item.building_id)))].map(obraFor).filter(Boolean);

async function init() {
  const storedSession = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
  if (!storedSession) {
    authRequired.classList.remove('hidden');
    return;
  }
  let session;
  try { session = JSON.parse(storedSession); } catch { session = { access_token: storedSession }; }
  const token = session.access_token || storedSession;
  try {
    const user = await fetchCurrentUser(token);
    profileState.user = user;
    const [buildings, statuses, collections, items, labels] = await Promise.all([
      fetchBuildings(),
      fetchBuildingStatuses(user.id, token),
      fetchUserCollections(user.id, token),
      fetchUserCollectionItems(user.id, token),
      fetchUserPrivateLabels(user.id, token),
    ]);
    profileState.buildings = buildings;
    profileState.statuses = new Map(statuses.map((item) => [String(item.building_id), item]));
    profileState.collections = collections;
    profileState.items = items;
    profileState.labels = labels;
    state.userCollections = collections;
    state.userCollectionItems = items;
    state.userPrivateLabels = labels;
    guardarZonaPersonalLocal(user.id);
  } catch (error) {
    profileState.user = profileState.user || { id: '', email: '', user_metadata: {} };
    cargarZonaPersonalLocal(profileState.user.id);
    profileState.collections = state.userCollections;
    profileState.items = state.userCollectionItems;
    profileState.labels = state.userPrivateLabels;
    content.innerHTML = `<div class="profile-error">No se ha podido cargar la información remota. Se muestra el último contenido disponible en este dispositivo.</div>`;
  }
  authRequired.classList.add('hidden');
  app.classList.remove('hidden');
  render();
}

function renderStats() {
  const counts = [statusBuildings('favorite').length, statusBuildings('visited').length, savedBuildings().length, profileState.labels.length];
  stats.innerHTML = counts.map((count, index) => `<div class="profile-stat"><strong>${count}</strong><span>${['FAVORITOS', 'VISITADOS', 'GUARDADOS', 'ETIQUETAS'][index]}</span></div>`).join('');
}

function render() {
  const metadata = profileState.user?.user_metadata || {};
  document.getElementById('profile-title').textContent = `${metadata.first_name || ''} ${metadata.last_name || ''}`.trim() || 'MI PERFIL';
  renderStats();
  if (activeTab === 'overview') renderOverview();
  if (activeTab === 'account') renderAccount();
  if (['favorite', 'visited', 'saved', 'notes'].includes(activeTab)) renderBuildings(activeTab);
  if (activeTab === 'labels') renderLabels();
  if (activeTab === 'collections') renderCollections();
}

function renderOverview() {
  const user = profileState.user || {};
  const metadata = user.user_metadata || {};
  content.innerHTML = `
    <div class="profile-card identity-card">
      <div class="profile-kicker">[ IDENTIDAD ]</div>
      <div class="profile-identity-meta"><span>${text(user.email || 'Email no disponible')}</span><span>${text(metadata.city || 'Ciudad no indicada')} · ${text(metadata.country || 'País no indicado')}</span></div>
    </div>
    <div class="profile-card profile-overview-note">
      <div class="profile-kicker">[ ARCHIVO PERSONAL ]</div>
      <p class="profile-lead">Selecciona una sección del menú para consultar y gestionar tu actividad en NOLLI.</p>
    </div>
  `;
}

function renderAccount() {
  const metadata = profileState.user?.user_metadata || {};
  content.innerHTML = `<div class="profile-card"><div class="profile-kicker">[ DATOS PERSONALES ]</div><h2 class="profile-section-title">EDITAR PERFIL</h2><div class="profile-form"><div class="profile-field"><label for="account-first-name">NOMBRE</label><input id="account-first-name" class="tech-input" value="${text(metadata.first_name)}"></div><div class="profile-field"><label for="account-last-name">APELLIDO</label><input id="account-last-name" class="tech-input" value="${text(metadata.last_name)}"></div><div class="profile-field"><label for="account-city">CIUDAD</label><input id="account-city" class="tech-input" value="${text(metadata.city)}"></div><div class="profile-field"><label for="account-country">PAÍS</label><input id="account-country" class="tech-input" value="${text(metadata.country)}"></div></div><div class="profile-actions"><button type="button" class="btn" data-save-account>GUARDAR CAMBIOS</button><span class="profile-message" id="account-message"></span></div></div><div class="profile-card"><h2 class="profile-section-title">CUENTA</h2><p class="profile-lead">EMAIL: ${text(profileState.user?.email)}<br>ID: ${text(profileState.user?.id)}</p></div>`;
}

function renderBuildings(type) {
  const buildings = type === 'saved' ? savedBuildings() : type === 'notes' ? profileState.buildings.filter((building) => profileState.statuses.get(String(building.id))?.notas?.trim()) : statusBuildings(type);
  const title = { favorite: 'FAVORITOS', visited: 'VISITADOS', saved: 'GUARDADOS EN LISTAS', notes: 'NOTAS PRIVADAS' }[type];
  content.innerHTML = `<h2 class="profile-section-title">${title} <span class="nearby-meta">${buildings.length}</span></h2>${buildings.length ? `<div class="profile-items">${buildings.map((building) => `<div class="profile-item"><div class="profile-item-main"><strong>${text(building.nombre_obra)}</strong><span>${text(building.arquitecto || '')}${type === 'notes' ? ` · ${text(profileState.statuses.get(String(building.id))?.notas)}` : ''}</span></div><a class="profile-item-tag" href="./index.html">VER EN MAPA →</a></div>`).join('')}</div>` : '<div class="profile-empty">Todavía no hay contenido en esta sección. Puedes añadirlo desde la ficha de cualquier obra en el mapa.</div>'}`;
}

function renderLabels() {
  content.innerHTML = `<h2 class="profile-section-title">ETIQUETAS PRIVADAS <span class="nearby-meta">${profileState.labels.length}</span></h2><div class="profile-create-row"><select id="profile-label-building" class="tech-input"><option value="">SELECCIONA UNA OBRA</option>${profileState.buildings.map((building) => `<option value="${text(building.id)}">${text(building.nombre_obra)}</option>`).join('')}</select><input id="profile-label-name" class="tech-input" placeholder="NUEVA ETIQUETA"><button type="button" class="btn" data-profile-create-label>CREAR</button></div><p class="profile-lead profile-section-help">Clasificaciones personales visibles solo para ti. Una misma etiqueta puede usarse en varias obras.</p>${profileState.labels.length ? `<div class="profile-items">${profileState.labels.map((label) => `<div class="profile-item"><div class="profile-item-main"><strong>#${text(label.label)}</strong><span>${text(obraFor(label.building_id)?.nombre_obra || 'Obra no disponible')}</span></div><button type="button" class="profile-delete" data-delete-label="${text(label.id)}">QUITAR</button></div>`).join('')}</div>` : '<div class="profile-empty">No tienes etiquetas todavía. Puedes crearlas aquí o desde una ficha del mapa.</div>'}`;
}

function renderCollections() {
  content.innerHTML = `<h2 class="profile-section-title">LISTAS PERSONALIZADAS <span class="nearby-meta">${profileState.collections.length}</span></h2><div class="profile-create-row"><input id="profile-collection-name" class="tech-input" placeholder="NUEVA LISTA"><button type="button" class="btn" data-profile-create-collection>CREAR LISTA</button></div>${profileState.collections.length ? profileState.collections.map((collection) => { const items = profileState.items.filter((item) => String(item.collection_id) === String(collection.id)); return `<div class="profile-card"><div class="profile-item"><div class="profile-item-main"><strong>${text(collection.name)}</strong><span>${items.length} obras guardadas</span></div><button type="button" class="profile-delete" data-delete-collection="${text(collection.id)}">BORRAR LISTA</button></div>${items.length ? `<div class="profile-items">${items.map((item) => { const otherCollections = profileState.collections.filter((option) => String(option.id) !== String(collection.id) && !profileState.items.some((saved) => String(saved.collection_id) === String(option.id) && String(saved.building_id) === String(item.building_id))); return `<div class="profile-item"><div class="profile-item-main"><strong>${text(obraFor(item.building_id)?.nombre_obra || 'Obra no disponible')}</strong></div><div class="profile-item-actions">${otherCollections.length ? `<select class="profile-move-select" data-add-item-building="${text(item.building_id)}" aria-label="Añadir obra a otra lista"><option value="">AÑADIR A...</option>${otherCollections.map((option) => `<option value="${text(option.id)}">${text(option.name)}</option>`).join('')}</select>` : ''}<button type="button" class="profile-delete" data-delete-item="${text(item.collection_id)}" data-building-id="${text(item.building_id)}">QUITAR</button></div></div>`; }).join('')}</div>` : ''}</div>`; }).join('') : '<div class="profile-empty">Todavía no tienes listas. Créala aquí o desde una ficha del mapa.</div>'}`;
}

document.addEventListener('click', async (event) => {
  const tab = event.target.closest('[data-profile-tab]');
  if (tab) { activeTab = tab.dataset.profileTab; document.querySelectorAll('[data-profile-tab]').forEach((item) => item.classList.toggle('active', item.dataset.profileTab === activeTab)); render(); return; }
  const createCollection = event.target.closest('[data-profile-create-collection]');
  if (createCollection) {
    const nameInput = document.getElementById('profile-collection-name');
    const name = nameInput.value.trim();
    if (!name) return;
    try {
      const created = await createUserCollection({ id: `COL-${Date.now()}`, user_id: profileState.user.id, name }, getSessionToken());
      if (created[0]) profileState.collections.push(created[0]);
    } catch {
      profileState.collections.push({ id: `COL-${Date.now()}`, user_id: profileState.user.id, name });
      guardarZonaPersonalLocal(profileState.user.id);
    }
    render();
    return;
  }
  const createLabel = event.target.closest('[data-profile-create-label]');
  if (createLabel) {
    const buildingId = document.getElementById('profile-label-building').value;
    const name = document.getElementById('profile-label-name').value.trim();
    if (!buildingId || !name) return;
    try {
      const created = await createUserPrivateLabel({ user_id: profileState.user.id, building_id: buildingId, label: name }, getSessionToken());
      if (created[0]) profileState.labels.unshift(created[0]);
    } catch {
      profileState.labels.unshift({ id: `LBL-${Date.now()}`, user_id: profileState.user.id, building_id: buildingId, label: name });
      guardarZonaPersonalLocal(profileState.user.id);
    }
    render();
    return;
  }
  const addItem = event.target.closest('[data-add-item-building]');
  if (addItem && addItem.value) {
    const buildingId = addItem.dataset.addItemBuilding;
    const existing = profileState.items.some((item) => String(item.collection_id) === String(addItem.value) && String(item.building_id) === buildingId);
    if (!existing) {
      const saved = await addUserCollectionItem({ id: `CLI-${Date.now()}-${addItem.value}`, user_id: profileState.user.id, collection_id: addItem.value, building_id: buildingId }, getSessionToken()).catch(() => []);
      profileState.items.push(saved[0] || { id: `CLI-${Date.now()}`, user_id: profileState.user.id, collection_id: addItem.value, building_id: buildingId });
      guardarZonaPersonalLocal(profileState.user.id);
    }
    render();
    return;
  }
  const save = event.target.closest('[data-save-account]');
  if (save) { const metadata = { firstName: document.getElementById('account-first-name').value.trim(), lastName: document.getElementById('account-last-name').value.trim(), city: document.getElementById('account-city').value.trim(), country: document.getElementById('account-country').value.trim() }; const token = getSessionToken(); try { await updateCurrentUserProfile(token, metadata); await upsertCurrentProfile(profileState.user, metadata, token); profileState.user.user_metadata = { ...profileState.user.user_metadata, first_name: metadata.firstName, last_name: metadata.lastName, city: metadata.city, country: metadata.country }; document.getElementById('account-message').textContent = 'PERFIL ACTUALIZADO'; } catch (error) { document.getElementById('account-message').textContent = error.message || 'NO SE PUDO GUARDAR'; } return; }
  const label = event.target.closest('[data-delete-label]');
  if (label) { await deleteUserPrivateLabel(label.dataset.deleteLabel, profileState.user.id, getSessionToken()).catch(() => {}); profileState.labels = profileState.labels.filter((item) => String(item.id) !== String(label.dataset.deleteLabel)); render(); return; }
  const collection = event.target.closest('[data-delete-collection]');
  if (collection) { await deleteUserCollection(collection.dataset.deleteCollection, profileState.user.id, getSessionToken()).catch(() => {}); profileState.collections = profileState.collections.filter((item) => String(item.id) !== String(collection.dataset.deleteCollection)); profileState.items = profileState.items.filter((item) => String(item.collection_id) !== String(collection.dataset.deleteCollection)); render(); return; }
  const item = event.target.closest('[data-delete-item]');
  if (item) { await deleteUserCollectionItem(item.dataset.deleteItem, profileState.user.id, item.dataset.buildingId, getSessionToken()).catch(() => {}); profileState.items = profileState.items.filter((entry) => !(String(entry.collection_id) === String(item.dataset.deleteItem) && String(entry.building_id) === String(item.dataset.buildingId))); render(); }
});

init();
