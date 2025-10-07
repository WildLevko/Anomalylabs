/* script.js
   Firebase (compat) + Firestore posts management
*/

/* ================== UI STRINGS (i18n) ================== */
const UI = {
  ru: {
    siteTag: "Досье по аномалиям — архивы и репортажи",
    heroTitle: "Досье и репортажи — все про опасные игрушки",
    heroDesc: "В ленте — отчёты, свидетельства и архивы по ряду аномалий.",
    searchPlaceholder: "Поиск...",
    filters: "Фильтры",
    settings: "Настройки",
    addPost: "Добавить пост",
    loadMore: "Загрузить ещё",
    settingsTitle: "Настройки",
    langLabel: "Язык / Language",
    onlyDarkNote: "Только тёмная тема (фиксированная).",
    addTitle: "Добавить пост (локально)",
    viewClose: "Закрыть",
    spinnerLoading: "Загрузка...",
    spinnerNoMore: "Больше нет материалов.",
    noResults: "По запросу ничего не найдено.",
    footer: "© Аномалия Labs — Организация правительства США.",
    needAdmin: "Требуются права администратора.",
    login: "Войти",
    logout: "Выйти",
    register: "Зарегистрироваться",
    noAccount: "Нет аккаунта? Зарегистрироваться",
    haveAccount: "Уже есть аккаунт? Войти",
    loginTitle: "Вход",
    registerTitle: "Регистрация",
    // NEW: Error messages
    errorDbConnection: "Ошибка подключения к базе данных. Проверьте консоль (F12) и настройки Firebase.",
    errorLoadingPosts: "Не удалось загрузить посты. Попробуйте обновить страницу."
  },
  en: {
    siteTag: "Anomaly Files - Archives and Reports",
    heroTitle: "Dossiers and reports – all about dangerous toys",
    heroDesc: "The feed contains reports, testimonies, and archives on a number of anomalies.",
    searchPlaceholder: "Search...",
    filters: "Filters",
    settings: "Settings",
    addPost: "Add post",
    loadMore: "Load more",
    settingsTitle: "Settings",
    langLabel: "Language / Язык",
    onlyDarkNote: "Dark theme only (fixed).",
    addTitle: "Add post (local)",
    viewClose: "Close",
    spinnerLoading: "Loading...",
    spinnerNoMore: "No more items.",
    noResults: "No results found.",
    footer: "© Anomaly Labs — U.S. government organization.",
    needAdmin: "Administrator privileges required.",
    login: "Login",
    logout: "Logout",
    register: "Register",
    noAccount: "No account? Register",
    haveAccount: "Already have an account? Login",
    loginTitle: "Login",
    registerTitle: "Register",
    // NEW: Error messages
    errorDbConnection: "Database connection error. Check console (F12) and Firebase settings.",
    errorLoadingPosts: "Failed to load posts. Please try refreshing the page."
  }
};

/* ========== State ========== */
let LANG = localStorage.getItem('anomaly_lang') || 'ru';
let db = null, auth = null;
let currentUser = null;
let isAdmin = false;
let isRegisterMode = false;
let POSTS_CACHE = [];
let lastVisible = null;
const PAGE_LIMIT = 12;
let isFetching = false;
let hasMore = true;

/* ========== DOM refs (populated on init) ========== */
let feedEl, spinnerEl, tagsContainerEl, searchInputEl, filtersPanelEl, sortSelectEl;
let addPostBtnEl, addModalEl, addFormEl, closeAddModalBtn;
let viewModalEl, modalContentEl, closeViewBtn;
let settingsModalEl, langRuBtn, langEnBtn, settingsBtn, closeSettingsBtn;
let authModalEl, authFormEl, closeAuthModalBtn, loginBtn;
let adminZoneEl;

/* ================= Utilities ================== */
function byId(id){ return document.getElementById(id); }
function escapeHtml(s){ if(s===null||s===undefined) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
function normalizeTagInput(tagStr){
  const parts = String(tagStr||'').split('|').map(x=>x.trim()).filter(Boolean);
  if(parts.length === 2) return { ru: parts[0], en: parts[1] };
  return { ru: tagStr.trim(), en: tagStr.trim() };
}
function showToast(msg){ alert(msg); }

/* ================= Firebase init ================= */
function initializeFirebaseIfPossible(){
  const s = UI[LANG] || UI.ru;
  if (typeof firebase === 'undefined') {
    spinnerEl && (spinnerEl.textContent = 'Firebase SDK not loaded');
    return;
  }
  try {
    if (!firebase.apps.length) {
      if (typeof firebaseConfig === 'undefined') {
        spinnerEl && (spinnerEl.textContent = 'firebaseConfig not found');
        return;
      }
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    auth = firebase.auth();
    setupAuthStateListener();
  } catch (e) {
    console.error('initializeFirebase error', e);
    spinnerEl && (spinnerEl.textContent = s.errorDbConnection); // Better error message
  }
}

/* ================= Auth ================= */
function setupAuthStateListener(){
  if (!auth) return;
  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if(user){
      try {
        const doc = await db.collection('admins').doc(user.uid).get();
        isAdmin = !!(doc.exists && doc.data().isAdmin === true);
      } catch (e) { console.error('check admin error', e); isAdmin = false; }
      authModalEl && authModalEl.classList.remove('open');
    } else {
      isAdmin = false;
    }
    
    addPostBtnEl && (addPostBtnEl.style.display = isAdmin ? 'flex' : 'none');
    adminZoneEl.style.display = isAdmin ? 'flex' : 'none';
    
    applyLang();
    await resetAndLoad();
  });
}

/* ================= UI rendering ================= */
function applyLang(){
  const s = UI[LANG] || UI.ru;
  byId('siteTag').textContent = s.siteTag;
  byId('heroTitle').textContent = s.heroTitle;
  byId('heroDesc').textContent = s.heroDesc;
  if (searchInputEl) searchInputEl.placeholder = s.searchPlaceholder;
  if (settingsBtn) settingsBtn.textContent = s.settings;
  if (addPostBtnEl) addPostBtnEl.textContent = s.addPost;
  if (byId('settingsTitle')) byId('settingsTitle').textContent = s.settingsTitle;
  if (byId('langLabel')) byId('langLabel').textContent = s.langLabel;
  if (byId('uiNote')) byId('uiNote').textContent = s.onlyDarkNote;
  if (byId('addTitle')) byId('addTitle').textContent = s.addTitle;
  byId('footerText').innerHTML = `© <strong>Anomaly Labs</strong> &mdash; ${s.footer.split('— ')[1]}`;

  if(loginBtn) loginBtn.textContent = currentUser ? s.logout : s.login;
}

/* ================= Posts load/render ================= */
async function loadPostsPage(){
  const s = UI[LANG] || UI.ru;
  if (!db) { spinnerEl.textContent = s.errorDbConnection; return; }
  if (isFetching || !hasMore) return;
  isFetching = true;
  spinnerEl.textContent = s.spinnerLoading;

  try {
    let q = db.collection('posts').orderBy('date','desc').limit(PAGE_LIMIT);
    if (lastVisible) q = q.startAfter(lastVisible);

    const snap = await q.get();
    if (POSTS_CACHE.length === 0 && snap.empty) { // Handle case where collection is empty
        feedEl.innerHTML = '';
    }
    const newPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    hasMore = snap.docs.length === PAGE_LIMIT;
    lastVisible = snap.docs.length ? snap.docs[snap.docs.length-1] : lastVisible;

    POSTS_CACHE.push(...newPosts);
    renderFeedAppend(newPosts);
  } catch (e) {
    console.error('loadPostsPage error', e);
    spinnerEl.textContent = s.errorLoadingPosts; // Better error message
  } finally {
    isFetching = false;
    if (spinnerEl.textContent === s.spinnerLoading) { // Only clear if it was loading
        spinnerEl.textContent = hasMore ? '' : s.spinnerNoMore;
    }
  }
}

async function resetAndLoad(){
  POSTS_CACHE = [];
  lastVisible = null;
  hasMore = true;
  feedEl.innerHTML = '';
  await loadPostsPage();
  renderTagControls();
}

function createPostElement(post){
  const title = (post.title && (post.title[LANG] || post.title.ru)) || '(no title)';
  const excerpt = (post.excerpt && (post.excerpt[LANG] || post.excerpt.ru)) || '';
  const wrapper = document.createElement('div');
  wrapper.className = 'post-card';
  wrapper.innerHTML = `
    ${ post.image ? `<img src="${escapeHtml(post.image)}" alt="${escapeHtml(title)}"/>` : '' }
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(excerpt)}</p>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:0 12px 12px 12px">
      <div style="font-size:12px;color:rgba(255,255,255,0.7)">${escapeHtml(post.date || '')}</div>
      <div>${(post.tags||[]).map(t=>`<span class="tag">${escapeHtml( (typeof t === 'string') ? t : (t[LANG]||t.ru) )}</span>`).join('')}</div>
    </div>
  `;
  wrapper.addEventListener('click', () => openViewModal(post));

  if(isAdmin){
    const delBtn = document.createElement('button');
    delBtn.className = 'btn';
    delBtn.textContent = 'Del';
    delBtn.style.cssText = 'position:absolute; right:10px; top:10px; z-index:5; padding: 4px 8px; font-size: 12px;';
    delBtn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if(!confirm(LANG==='en' ? 'Delete this post?' : 'Удалить этот пост?')) return;
      try {
        await db.collection('posts').doc(post.id).delete();
        wrapper.remove();
        POSTS_CACHE = POSTS_CACHE.filter(p=>p.id !== post.id);
        showToast(LANG==='en' ? 'Deleted' : 'Удалено');
      } catch (err) { console.error('delete post error', err); showToast('Delete failed'); }
    });
    wrapper.appendChild(delBtn);
  }
  return wrapper;
}

function renderFeedAppend(posts){
  if(!Array.isArray(posts)) return;
  posts.forEach(p => feedEl.appendChild(createPostElement(p)));
}

function renderTagControls(){
  if(!tagsContainerEl) return;
  const map = new Map();
  POSTS_CACHE.forEach(p=>{
    (p.tags||[]).forEach(t=>{
      const obj = (typeof t === 'string') ? normalizeTagInput(t) : { ru: t.ru||'', en: t.en||'' };
      const key = obj.ru + '|' + obj.en;
      if (!map.has(key)) map.set(key, { ...obj, count: 0 });
      map.get(key).count++;
    });
  });
  tagsContainerEl.innerHTML = '';
  Array.from(map.values()).sort((a,b)=>b.count - a.count).forEach(item=>{
    const btn = document.createElement('button');
    btn.className = 'tagBtn';
    btn.textContent = (LANG==='en' ? item.en : item.ru) + ` (${item.count})`;
    btn.dataset.ru = item.ru;
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      filterPostsFromCache();
    });
    tagsContainerEl.appendChild(btn);
  });
}

function filterPostsFromCache() {
  const query = (searchInputEl.value||'').trim().toLowerCase();
  const selectedTags = Array.from(document.querySelectorAll('#tagsContainer .tagBtn.active')).map(b => b.dataset.ru);
  
  const filtered = POSTS_CACHE.filter(p => {
    const hay = [
        (p.title && (p.title[LANG]||p.title.ru))||'',
        (p.excerpt && (p.excerpt[LANG]||p.excerpt.ru))||'',
        (p.content && (p.content[LANG]||p.content.ru))||''
      ].join(' ').toLowerCase();

    const matchesQuery = !query || hay.includes(query);
    
    const postTags = (p.tags||[]).map(t => typeof t === 'string' ? t.split('|')[0].trim() : t.ru);
    const matchesTags = selectedTags.length === 0 || selectedTags.every(selTag => postTags.includes(selTag));
    
    return matchesQuery && matchesTags;
  });

  feedEl.innerHTML = '';
  renderFeedAppend(filtered);
}

/* ================= Modals ================= */
function openViewModal(post){
  if(!modalContentEl || !viewModalEl) return;
  const title = (post.title && (post.title[LANG] || post.title.ru)) || '';
  const content = (post.content && (post.content[LANG] || post.content.ru)) || '';
  modalContentEl.innerHTML = `
    <h2>${escapeHtml(title)}</h2>
    <div class="full">${content}</div>
    ${ post.image ? `<img src="${escapeHtml(post.image)}">` : '' }
    <div style="margin-top:8px;font-size:11px;color:rgba(255,255,255,0.5)">ID: ${post.id || '(local)'}</div>
  `;
  viewModalEl.classList.add('open');
}

/* ================= Admin Actions ================= */
async function handleAddPostSubmit(e){
  e.preventDefault();
  if(!isAdmin) { showToast(UI[LANG].needAdmin); return; }
  const payload = {
    date: byId('postDate').value,
    title: { ru: byId('postTitleRu').value.trim(), en: byId('postTitleEn').value.trim() },
    excerpt: { ru: byId('postExcerptRu').value.trim(), en: byId('postExcerptEn').value.trim() },
    content: { ru: byId('postContentRu').value.trim(), en: byId('postContentEn').value.trim() },
    tags: byId('postTags').value.trim() ? byId('postTags').value.split(',').map(t=>normalizeTagInput(t.trim())) : [],
    image: byId('postImage').value.trim() || null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: currentUser ? currentUser.uid : null
  };
  if(!payload.date || !payload.title.ru) { showToast('Заполните дату и заголовок RU'); return; }
  try {
    const ref = await db.collection('posts').add(payload);
    showToast('Пост добавлен. Перезагрузка...');
    resetAndLoad();
    addFormEl.reset();
    addModalEl.classList.remove('open');
  } catch (err) { console.error('add post error', err); showToast('Add failed'); }
}

function handleImportFile(file){
  if(!file || !isAdmin) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const arr = JSON.parse(ev.target.result);
      if(!confirm(`Импортировать ${arr.length} элементов?`)) return;
      for(const p of arr){
        const payload = {
          date: p.date || new Date().toISOString().slice(0,10),
          title: p.title || { ru: 'Imported', en: 'Imported' },
          excerpt: p.excerpt || { ru: '', en: '' },
          content: p.content || { ru: '', en: '' },
          tags: (p.tags||[]).map(t => typeof t === 'string' ? normalizeTagInput(t) : t),
          image: p.image || null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdBy: currentUser ? currentUser.uid : null
        };
        await db.collection('posts').add(payload);
      }
      showToast(`Импорт завершён. Перезагрузка...`);
      resetAndLoad();
    } catch (err) { console.error('import error', err); showToast('Import failed: ' + err.message); }
  };
  reader.readAsText(file);
}

/* ================= UI attach handlers ================= */
function attachHandlers(){
  searchInputEl.addEventListener('input', filterPostsFromCache);
  
  byId('clearFilters').addEventListener('click', () => {
    searchInputEl.value = '';
    document.querySelectorAll('#tagsContainer .tagBtn.active').forEach(btn => btn.classList.remove('active'));
    filterPostsFromCache();
  });

  settingsBtn.addEventListener('click', () => settingsModalEl.classList.add('open'));
  closeSettingsBtn.addEventListener('click', () => settingsModalEl.classList.remove('open'));

  loginBtn.addEventListener('click', () => {
    if (currentUser) auth.signOut();
    else authModalEl.classList.add('open');
  });
  closeAuthModalBtn.addEventListener('click', () => authModalEl.classList.remove('open'));
  
  const authTitle = byId('authTitle'), authSubmitBtn = byId('authSubmitBtn'), toggleAuthModeBtn = byId('toggleAuthMode'), authMessage = byId('authMessage');
  toggleAuthModeBtn.addEventListener('click', () => {
    isRegisterMode = !isRegisterMode;
    const s = UI[LANG];
    authTitle.textContent = isRegisterMode ? s.registerTitle : s.loginTitle;
    authSubmitBtn.textContent = isRegisterMode ? s.register : s.login;
    toggleAuthModeBtn.textContent = isRegisterMode ? s.haveAccount : s.noAccount;
    authMessage.textContent = '';
  });

  authFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    authMessage.textContent = '';
    try {
      if (isRegisterMode) await auth.createUserWithEmailAndPassword(byId('authEmail').value, byId('authPassword').value);
      else await auth.signInWithEmailAndPassword(byId('authEmail').value, byId('authPassword').value);
    } catch (error) { authMessage.textContent = error.message; }
  });

  addPostBtnEl.addEventListener('click', () => {
    if(!isAdmin) { showToast(UI[LANG].needAdmin); return; }
    addModalEl.classList.add('open');
    byId('postDate').valueAsDate = new Date();
  });
  closeAddModalBtn.addEventListener('click', () => addModalEl.classList.remove('open'));
  addFormEl.addEventListener('submit', handleAddPostSubmit);

  byId('importPosts').addEventListener('click', () => byId('importFile').click());
  byId('importFile').addEventListener('change', (e) => handleImportFile(e.target.files[0]));
  byId('exportPosts').addEventListener('click', async () => {
    if(!isAdmin) { showToast(UI[LANG].needAdmin); return; }
    const snap = await db.collection('posts').orderBy('date','desc').get();
    const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(arr, null, 2)], { type: 'application/json' })); 
    a.download = 'posts_export.json';
    a.click(); URL.revokeObjectURL(a.href);
  });

  closeViewBtn.addEventListener('click', () => viewModalEl.classList.remove('open'));
  [viewModalEl, settingsModalEl, authModalEl, addModalEl].forEach(modal => {
      modal.addEventListener('click', (e) => { if(e.target === modal) modal.classList.remove('open'); });
  });

  langRuBtn.addEventListener('click', () => setLang('ru'));
  langEnBtn.addEventListener('click', () => setLang('en'));
}

/* ================= Language change ================= */
function setLang(l){
  LANG = l;
  localStorage.setItem('anomaly_lang', l);
  applyLang();
  feedEl.innerHTML = '';
  renderFeedAppend(POSTS_CACHE);
  renderTagControls();
}

/* ================= Init ================= */
function init(){
  feedEl = byId('feed');
  spinnerEl = byId('spinner');
  tagsContainerEl = byId('tagsContainer');
  searchInputEl = byId('search');
  filtersPanelEl = byId('filtersPanel');
  sortSelectEl = byId('sortSelect');
  addPostBtnEl = byId('addPostBtn');
  addModalEl = byId('addModal');
  addFormEl = byId('addPostForm');
  closeAddModalBtn = byId('closeAddModal');
  viewModalEl = byId('viewModal');
  modalContentEl = byId('modalContent');
  closeViewBtn = byId('closeView');
  settingsModalEl = byId('settingsModal');
  settingsBtn = byId('settingsBtn');
  closeSettingsBtn = byId('closeSettings');
  authModalEl = byId('authModal');
  authFormEl = byId('authForm');
  closeAuthModalBtn = byId('closeAuthModal');
  loginBtn = byId('loginBtn');
  langRuBtn = byId('langRu');
  langEnBtn = byId('langEn');
  adminZoneEl = document.querySelector('.admin-zone');

  applyLang();
  attachHandlers();
  initializeFirebaseIfPossible();

  if(typeof firebase === 'undefined') {
    spinnerEl.textContent = 'Firebase SDK not loaded. Check scripts.';
  }
}

document.addEventListener('DOMContentLoaded', init);