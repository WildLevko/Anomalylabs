/* script.js */

/* ================= Configuration & i18n ================= */
const UI_STRINGS = {
  ru: {
    siteTag: "Досье по аномалиям — архивы и репортажи",
    heroTitle: "Досье и репортажи — все про опасные игрушки",
    heroDesc: "В ленте — отчёты, свидетельства и архивы по ряду аномалий.",
    searchPlaceholder: 'Поиск...',
    filters: 'Фильтры',
    settings: 'Настройки',
    addPost: 'Добавить пост',
    loadMore: 'Загрузить ещё',
    settingsTitle: 'Настройки',
    langLabel: 'Язык / Language',
    onlyDarkNote: 'Только тёмная тема (фиксированная).',
    addTitle: 'Добавить пост (локально)',
    viewClose: 'Закрыть',
    spinnerLoading: 'Загрузка...',
    spinnerNoMore: 'Больше нет материалов.',
    noResults: 'По запросу ничего не найдено.',
    footer: '© Аномалия Labs — Организация правительства США.'
  },
  en: {
    siteTag: "Anomaly Files - Archives and Reports",
    heroTitle: "Dossiers and reports – all about dangerous toys",
    heroDesc: "The feed contains reports, testimonies, and archives on a number of anomalies.",
    searchPlaceholder: 'Search...',
    filters: 'Filters',
    settings: 'Settings',
    addPost: 'Add post',
    loadMore: 'Load more',
    settingsTitle: 'Settings',
    langLabel: 'Language / Язык',
    onlyDarkNote: 'Dark theme only (fixed).',
    addTitle: 'Add post (local)',
    viewClose: 'Close',
    spinnerLoading: 'Loading...',
    spinnerNoMore: 'No more items.',
    noResults: 'No results found.',
    footer: '© Anomaly Labs — U.S. government organization.'
  }
};

/* ================= Obfuscated admin password =================
   You asked to hide the password "eroxsayloladminwl".
   We store base64 of the reversed string and reconstruct it at runtime.
   This is obfuscation for casual inspection (not full security).
*/
function getAdminPass(){
  // base64 of 'lwnimadlolysxaore' (which is reversed password)
  const b64 = 'bHduaW1hZGxvbHlzeGFvcmU=';
  try {
    const rev = atob(b64);
    return rev.split('').reverse().join(''); // -> 'eroxsayloladminwl'
  } catch(e){
    return 'eroxsayloladminwl'; // fallback
  }
}

/* ================= State & config ================= */
let LANG = localStorage.getItem('anomaly_lang') || 'ru';
let POSTS = []; // combined fixed + local (objects may have tags in {ru,en} or plain)
const DISPLAY_STEP = 12;
let offset = 0;
let activeTags = new Set();
let observer = null;

/* ========== DOM refs ========== */
const feed = document.getElementById('feed');
const spinner = document.getElementById('spinner');
const viewModal = document.getElementById('viewModal');
const modalContent = document.getElementById('modalContent');
const addModal = document.getElementById('addModal');
const settingsModal = document.getElementById('settingsModal');
const searchInput = document.getElementById('search');
const tagsContainer = document.getElementById('tagsContainer');
const sortSelect = document.getElementById('sortSelect');
const exportBtn = document.getElementById('exportPosts');
const importBtn = document.getElementById('importPosts');
const importFile = document.getElementById('importFile');

/* ================= Utilities: local posts ================= */
function loadLocalPosts(){
  try {
    const raw = localStorage.getItem('anomaly_user_posts_v2');
    if(!raw) return [];
    const arr = JSON.parse(raw);
    if(!Array.isArray(arr)) return [];
    return arr;
  } catch(e){ return []; }
}
function saveLocalPosts(arr){
  try {
    localStorage.setItem('anomaly_user_posts_v2', JSON.stringify(arr));
  } catch(e){}
}

/* ================= Google Translate integration ================= */
function googleTranslateElementInit() {
  new google.translate.TranslateElement({
    pageLanguage: 'ru',
    includedLanguages: 'en,ru',
    autoDisplay: false
  }, 'google_translate_element');
}
function setGoogleLang(lang){
  const combo = document.querySelector('.goog-te-combo');
  if(combo){
    combo.value = lang;
    combo.dispatchEvent(new Event('change'));
  }
}

/* ================= INIT ================= */
function init(){
  applyLang();
  // Load fixed posts (from fixed-posts.js); there should be window.FIXED_POSTS
  const fixed = window.FIXED_POSTS && Array.isArray(window.FIXED_POSTS) ? window.FIXED_POSTS : [];
  const local = loadLocalPosts() || [];
  // Normalize: ensure user-added posts have userAdded flag, tags normalized to objects {ru,en}
  const normLocal = local.map(p => normalizeUserPost(p));
  POSTS = [...normLocal, ...fixed];
  sortPosts(); // by date (default)
  renderTagControls();
  offset = 0;
  feed.innerHTML = '';
  prepareObserver();
  loadMore();
  attachHandlers();
}
document.addEventListener('DOMContentLoaded', init);

/* ========== i18n UI ========== */
function applyLang(){
  const s = UI_STRINGS[LANG];
  if(!s) return;
  document.getElementById('search').placeholder = s.searchPlaceholder;
  document.getElementById('filterToggle').textContent = s.filters;
  document.getElementById('settingsBtn').textContent = s.settings;
  document.getElementById('addPostBtn').textContent = s.addPost;
  document.getElementById('loadMoreTop').textContent = s.loadMore;
  document.getElementById('settingsTitle').textContent = s.settingsTitle;
  document.getElementById('langLabel').textContent = s.langLabel;
  document.getElementById('uiNote').textContent = s.onlyDarkNote;
  document.getElementById('addTitle').textContent = s.addTitle;
  document.getElementById('footerText').textContent = s.footer;
}

/* ========== Observer for lazy images ========== */
function prepareObserver(){
  if(observer) observer.disconnect();
  observer = new IntersectionObserver((entries, obs)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        const img = e.target;
        if(img.dataset.src){
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
        }
        obs.unobserve(img);
      }
    });
  }, {root:null, rootMargin:'200px', threshold:0.01});
}

/* ========== Helpers: tags normalization & rendering ========= */
function normalizeTagInput(tagStr){
  // tagStr may be 'ru|en' or simple 'tag'
  const parts = tagStr.split('|').map(s=>s.trim()).filter(Boolean);
  if(parts.length === 2) return {ru: parts[0], en: parts[1]};
  // If only one, assume same for both
  return {ru: tagStr.trim(), en: tagStr.trim()};
}

function normalizeUserPost(p){
  const copy = Object.assign({}, p);
  copy.userAdded = true;
  // normalize tags: could be array of strings or already objects
  copy.tags = (p.tags||[]).map(t=>{
    if(typeof t === 'string') return normalizeTagInput(t);
    if(t && typeof t === 'object') {
      if(t.ru && t.en) return {ru: t.ru, en: t.en};
      // if only value present
      if(t.label) return {ru:t.label, en:t.label};
    }
    return {ru: String(t), en: String(t)};
  });
  return copy;
}

// render tag element given tag object or string
function renderTagLabel(tag){
  if(!tag) return '';
  if(typeof tag === 'string') return escapeHtml(tag);
  if(tag.ru && tag.en){
    return escapeHtml(LANG === 'en' ? tag.en : tag.ru);
  }
  // fallback
  return escapeHtml(tag.ru || tag.en || String(tag));
}

/* ========== RENDER FEED ========== */
function loadMore(){
  const q = searchInput.value.toLowerCase().trim();
  let added = 0;
  for(let i = offset; i < POSTS.length && added < DISPLAY_STEP; i++){
    const p = POSTS[i];
    if(!passesFilter(p,q)) continue;
    const card = createCard(p);
    feed.appendChild(card);
    added++;
    offset = i+1;
  }
  if(offset >= POSTS.length) spinner.textContent = UI_STRINGS[LANG].spinnerNoMore;
  else spinner.textContent = '';
  if(added===0 && feed.children.length===0) spinner.textContent = UI_STRINGS[LANG].noResults;
}

function createCard(post){
  const article = document.createElement('article');
  article.className = 'card';
  const lang = LANG;
  const title = (post.title && (post.title[lang] || post.title.ru)) || (typeof post.title === 'string'?post.title:'(no title)');
  const excerpt = (post.excerpt && (post.excerpt[lang] || post.excerpt.ru)) || (typeof post.excerpt === 'string'?post.excerpt:'');
  const imgSrc = post.image || `https://picsum.photos/seed/post-${post.id}/1200/800`;
  const placeholder = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'><rect width='100%' height='100%' fill='%2307080b'/><text x='50%' y='50%' font-size='36' fill='%23cccccc' text-anchor='middle'>Изображение ${encodeURIComponent(post.id)}</text></svg>`;

  article.innerHTML = `
    <div class="media"><img src="${placeholder}" data-src="${imgSrc}" alt="${escapeHtml(title)}" loading="lazy"/></div>
    <div class="body">
      <div class="meta">${post.date || ''}</div>
      <div class="title">${escapeHtml(title)}</div>
      <div class="excerpt">${escapeHtml(excerpt)}</div>
      <div class="tags">${(post.tags||[]).map(t=>`<span class="tag">${renderTagLabel(t)}</span>`).join('')}</div>
    </div>
  `;
  const img = article.querySelector('img');
  if(img) observer.observe(img);

  article.querySelector('.media').addEventListener('click', ()=> openView(post));
  article.querySelector('.title').addEventListener('click', ()=> openView(post));
  return article;
}

/* ========== FILTERS & SEARCH ========== */
function passesFilter(post, q){
  if(q){
    const lang = LANG;
    const title = (post.title && (post.title[lang] || post.title.ru)) || '';
    const excerpt = (post.excerpt && (post.excerpt[lang] || post.excerpt.ru)) || '';
    const content = (post.content && (post.content[lang] || post.content.ru)) || '';
    const hay = (title + ' ' + excerpt + ' ' + content).toLowerCase();
    if(!hay.includes(q.toLowerCase())) {
      // also check tags
      const tagMatch = (post.tags||[]).some(t => {
        const tr = (typeof t === 'string' ? t : (t[lang] || t.ru || ''));
        return tr.toLowerCase().includes(q.toLowerCase());
      });
      if(!tagMatch) return false;
    }
  }
  if(activeTags.size > 0){
    const tags = post.tags || [];
    // check that all activeTags are present (compare by ru or en)
    for(const at of activeTags){
      const found = tags.some(t=>{
        const tr = (typeof t === 'string' ? t.toLowerCase() : (t.ru && t.ru.toLowerCase()));
        const te = (typeof t === 'string' ? t.toLowerCase() : (t.en && t.en.toLowerCase()));
        if(tr === undefined) return false;
        return tr === at.toLowerCase() || te === at.toLowerCase();
      });
      if(!found) return false;
    }
  }
  return true;
}

function renderTagControls(){
  // collect tags from POSTS (both fixed and user)
  const map = new Map(); // key = ru||en, value = {ru,en}
  POSTS.forEach(p=>{
    (p.tags||[]).forEach(t=>{
      if(typeof t === 'string'){
        const obj = normalizeTagInput(t);
        map.set(obj.ru + '|' + obj.en, obj);
      } else if(t && typeof t === 'object'){
        const key = (t.ru || t.en) + '|' + (t.en || t.ru);
        map.set(key, {ru: t.ru || t.en, en: t.en || t.ru});
      }
    });
  });
  const arr = Array.from(map.values()).sort((a,b)=> a.ru.localeCompare(b.ru));
  tagsContainer.innerHTML = '';
  arr.forEach(tag=>{
    const btn = document.createElement('button');
    btn.className = 'tagBtn';
    btn.textContent = renderTagLabel(tag);
    btn.dataset.ru = tag.ru;
    btn.dataset.en = tag.en;
    btn.addEventListener('click', ()=>{
      // toggle by ru value
      const key = tag.ru;
      if(activeTags.has(key)) activeTags.delete(key);
      else activeTags.add(key);
      updateTagButtons();
      feed.innerHTML=''; offset=0; loadMore();
    });
    tagsContainer.appendChild(btn);
  });
  updateTagButtons();
}
function updateTagButtons(){
  document.querySelectorAll('.tagBtn').forEach(b=>{
    const ru = b.dataset.ru;
    if(activeTags.has(ru)) b.classList.add('active'); else b.classList.remove('active');
  });
}

/* ========== VIEW / MODAL (view, edit, delete) ========== */
function openView(post){
  const lang = LANG;
  const title = post.title && (post.title[lang] || post.title.ru) || (typeof post.title==='string'?post.title:'(no title)');
  const excerpt = post.excerpt && (post.excerpt[lang] || post.excerpt.ru) || '';
  const content = post.content && (post.content[lang] || post.content.ru) || (typeof post.content==='string'?post.content:'');
  const img = post.image || `https://picsum.photos/seed/post-${post.id}/1600/1000`;
  modalContent.innerHTML = `
    <div class="meta">Дата: ${post.date || ''} ${post.id ? '— ID:' + post.id : ''}</div>
    <h2>${escapeHtml(title)}</h2>
    <p class="excerpt">${escapeHtml(excerpt)}</p>
    <div class="full">${content}</div>
    <div style="margin-top:12px;"><img src="${img}" alt="${escapeHtml(title)}" style="max-width:100%;border-radius:8px;"></div>
    <div style="margin-top:10px; font-size:13px; color:rgba(255,255,255,0.75)">Теги: ${(post.tags||[]).map(t=>renderTagLabel(t)).join(', ')}</div>
    <div style="margin-top:12px;" id="viewActions"></div>
  `;
  const actions = document.getElementById('viewActions');

  // If post is user-created -> show edit/delete (with password)
  if(post.userAdded){
    const editBtn = document.createElement('button'); editBtn.className='btn'; editBtn.textContent = 'Редактировать';
    const editImgBtn = document.createElement('button'); editImgBtn.className='btn'; editImgBtn.textContent = 'Изменить картинку';
    const deleteBtn = document.createElement('button'); deleteBtn.className='btn'; deleteBtn.textContent = 'Удалить пост';
    actions.appendChild(editBtn); actions.appendChild(editImgBtn); actions.appendChild(deleteBtn);

    editBtn.addEventListener('click', ()=>{
      // open addModal in edit mode (prefill)
      openEditPost(post);
    });

    editImgBtn.addEventListener('click', ()=>{
      const newUrl = prompt('Новый URL картинки:', post.image || '');
      if(newUrl !== null){
        // Update in localStorage
        post.image = newUrl;
        persistUserPost(post);
        rebuildPostsAndRefresh();
        openView(post);
      }
    });

    deleteBtn.addEventListener('click', ()=>{
      // require admin password
      const p = prompt('Введите пароль администратора для удаления:');
      if(p === getAdminPass()){
        // delete
        const local = loadLocalPosts();
        const remain = local.filter(x=> x.id !== post.id);
        saveLocalPosts(remain);
        rebuildPostsAndRefresh();
        closeView();
        alert('Пост удалён.');
      } else {
        alert('Неверный пароль. Удаление отменено.');
      }
    });
  }

  // For fixed posts, optionally allow "report" or "bookmark" (no persistence)
  else {
    const note = document.createElement('div'); note.className='small-note'; note.textContent = 'Это зафиксированный системный пост (не может быть удалён).';
    actions.appendChild(note);
  }

  viewModal.classList.add('open');
  window.scrollTo({top:0, behavior:'smooth'});
}
function closeView(){ viewModal.classList.remove('open'); }

function openEditPost(post){
  // require admin password to enter edit mode
  const p = prompt('Введите пароль администратора для редактирования поста:');
  if(p !== getAdminPass()){
    alert('Неверный пароль. Редактирование недоступно.');
    return;
  }
  // fill form
  document.getElementById('editingId').value = post.id;
  document.getElementById('postDate').value = post.date || new Date().toISOString().slice(0,10);
  document.getElementById('postTitleRu').value = post.title?.ru || '';
  document.getElementById('postTitleEn').value = post.title?.en || '';
  document.getElementById('postExcerptRu').value = post.excerpt?.ru || '';
  document.getElementById('postExcerptEn').value = post.excerpt?.en || '';
  document.getElementById('postContentRu').value = post.content?.ru || '';
  document.getElementById('postContentEn').value = post.content?.en || '';
  // tags: present as ru|en,comma separated
  const tagsStr = (post.tags||[]).map(t=>{
    if(typeof t === 'string') return t;
    return `${t.ru}|${t.en}`;
  }).join(',');
  document.getElementById('postTags').value = tagsStr;
  document.getElementById('postImage').value = post.image || '';
  addModal.classList.add('open');
}

/* ========== Add new post (and edit) ========== */
function openAdd(){
  // require admin password
  const pass = prompt('Введите пароль администратора (требуется для добавления постов):');
  if(pass !== getAdminPass()){
    alert('Неверный пароль. Доступ запрещён.');
    return;
  }
  // clear editing id
  document.getElementById('editingId').value = '';
  addModal.classList.add('open');
  document.getElementById('postDate').value = new Date().toISOString().slice(0,10);
}
function closeAdd(){ addModal.classList.remove('open'); document.getElementById('addPostForm').reset(); }

function handleAdd(e){
  e.preventDefault();
  const editingId = document.getElementById('editingId').value;
  const date = document.getElementById('postDate').value;
  const titleRu = document.getElementById('postTitleRu').value.trim();
  const titleEn = document.getElementById('postTitleEn').value.trim();
  const exRu = document.getElementById('postExcerptRu').value.trim();
  const exEn = document.getElementById('postExcerptEn').value.trim();
  const contRu = document.getElementById('postContentRu').value.trim();
  const contEn = document.getElementById('postContentEn').value.trim();
  const tagsRaw = document.getElementById('postTags').value;
  const tags = tagsRaw.split(',').map(s=>s.trim()).filter(Boolean).map(normalizeTagInput);
  const image = document.getElementById('postImage').value.trim() || null;

  if(!date || !titleRu || !titleEn) return alert('Заполните дату и заголовки');

  if(editingId){
    // edit existing local post -> must require admin password again
    const pass = prompt('Введите пароль администратора для сохранения изменений:');
    if(pass !== getAdminPass()){
      alert('Неверный пароль. Сохранение отменено.');
      return;
    }
    const local = loadLocalPosts();
    const idx = local.findIndex(p=> String(p.id) === String(editingId));
    if(idx === -1){ alert('Не удалось найти пост для редактирования.'); return; }
    local[idx] = {
      ...local[idx],
      id: Number(editingId),
      date,
      title:{ru:titleRu, en:titleEn},
      excerpt:{ru:exRu, en:exEn},
      content:{ru:contRu, en:contEn},
      tags,
      image
    };
    saveLocalPosts(local);
    rebuildPostsAndRefresh();
    closeAdd();
    alert('Пост обновлён.');
    return;
  }

  // new post
  const newId = Date.now() + Math.floor(Math.random()*1000);
  const newPost = {
    id: newId,
    date,
    title:{ru:titleRu, en:titleEn},
    excerpt:{ru:exRu, en:exEn},
    content:{ru:contRu, en:contEn},
    tags,
    image,
    userAdded: true
  };
  const local = loadLocalPosts();
  local.unshift(newPost);
  saveLocalPosts(local);
  rebuildPostsAndRefresh();
  closeAdd();
  alert('Пост добавлен.');
}

/* persist helper */
function persistUserPost(post){
  const local = loadLocalPosts();
  const idx = local.findIndex(p=> p.id === post.id);
  if(idx >= 0) local[idx] = post;
  else local.unshift(post);
  saveLocalPosts(local);
}

/* rebuild POSTS array and refresh */
function rebuildPostsAndRefresh(){
  const fixed = window.FIXED_POSTS || [];
  const local = loadLocalPosts().map(normalizeUserPost);
  POSTS = [...local, ...fixed];
  sortPosts();
  renderTagControls();
  feed.innerHTML=''; offset=0; loadMore();
}

/* ========== Sorting & Export/Import ========== */
function sortPosts(){
  const mode = sortSelect ? sortSelect.value : 'new';
  POSTS.sort((a,b)=>{
    const da = a.date || '';
    const db = b.date || '';
    if(da === db){
      return (b.id || 0) - (a.id || 0);
    }
    // descending by date if new
    if(mode === 'new') return db.localeCompare(da);
    return da.localeCompare(db);
  });
}

/* export user posts */
function exportUserPosts(){
  const local = loadLocalPosts();
  const data = JSON.stringify(local, null, 2);
  const blob = new Blob([data], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'anomaly_user_posts.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* import user posts */
function importUserPosts(file){
  const reader = new FileReader();
  reader.onload = (ev)=>{
    try {
      const arr = JSON.parse(ev.target.result);
      if(!Array.isArray(arr)) throw new Error('Invalid JSON');
      // basic validation and assign ids if missing
      const normalized = arr.map(p=>{
        return {
          id: p.id || Date.now() + Math.floor(Math.random()*1000),
          date: p.date || new Date().toISOString().slice(0,10),
          title: p.title || {ru:p.titleRu||'Imported', en:p.titleEn||p.titleRu||'Imported'},
          excerpt: p.excerpt || {ru:p.excerptRu||'', en:p.excerptEn||''},
          content: p.content || {ru:p.contentRu||'', en:p.contentEn||''},
          tags: (p.tags||[]).map(t => typeof t === 'string' ? normalizeTagInput(t) : (t.ru ? t : normalizeTagInput(String(t)))),
          image: p.image || null,
          userAdded: true
        };
      });
      // save after admin password check
      const pass = prompt('Введите пароль администратора для импорта постов:');
      if(pass !== getAdminPass()){ alert('Неверный пароль. Импорт отменён.'); return; }
      saveLocalPosts(normalized);
      rebuildPostsAndRefresh();
      alert('Импорт завершён.');
    } catch(e){
      alert('Ошибка импорта: ' + e.message);
    }
  };
  reader.readAsText(file);
}

/* ========== UI Handlers & events ========= */
function attachHandlers(){
  document.getElementById('loadMoreTop').addEventListener('click', ()=> loadMore());
  document.getElementById('filterToggle').addEventListener('click', ()=> {
    const p = document.getElementById('filtersPanel');
    p.classList.toggle('hidden');
    p.setAttribute('aria-hidden', p.classList.contains('hidden') ? 'true' : 'false');
  });
  document.getElementById('clearFilters').addEventListener('click', ()=> { activeTags.clear(); renderTagControls(); feed.innerHTML=''; offset=0; loadMore(); });
  document.getElementById('addPostBtn').addEventListener('click', ()=> openAdd());
  document.getElementById('closeAddModal').addEventListener('click', ()=> closeAdd());
  document.getElementById('addPostForm').addEventListener('submit', handleAdd);
  document.getElementById('settingsBtn').addEventListener('click', ()=> { settingsModal.classList.add('open'); updateLangButtons(); });
  document.getElementById('closeSettings').addEventListener('click', ()=> settingsModal.classList.remove('open'));
  document.getElementById('langRu').addEventListener('click', ()=> { setLang('ru'); updateLangButtons(); });
  document.getElementById('langEn').addEventListener('click', ()=> { setLang('en'); updateLangButtons(); });

  document.getElementById('closeView').addEventListener('click', ()=> closeView());
  viewModal.addEventListener('click', (e)=> { if(e.target === viewModal) closeView(); });
  addModal.addEventListener('click', (e)=> { if(e.target === addModal) closeAdd(); });
  settingsModal.addEventListener('click', (e)=> { if(e.target === settingsModal) settingsModal.classList.remove('open'); });

  document.getElementById('search').addEventListener('input', ()=> { feed.innerHTML=''; offset=0; loadMore(); });
  if(sortSelect) sortSelect.addEventListener('change', ()=> { sortPosts(); feed.innerHTML=''; offset=0; loadMore(); });

  // export/import
  if(exportBtn) exportBtn.addEventListener('click', ()=> exportUserPosts());
  if(importBtn) importBtn.addEventListener('click', ()=> importFile.click());
  if(importFile) importFile.addEventListener('change', (ev)=> {
    const f = ev.target.files && ev.target.files[0];
    if(f) importUserPosts(f);
    importFile.value = '';
  });

  // preview button
  const previewBtn = document.getElementById('previewPostBtn');
  if(previewBtn){
    previewBtn.addEventListener('click', ()=>{
      // gather fields and open temporary view (no save)
      const date = document.getElementById('postDate').value;
      const titleRu = document.getElementById('postTitleRu').value.trim();
      const titleEn = document.getElementById('postTitleEn').value.trim();
      const exRu = document.getElementById('postExcerptRu').value.trim();
      const exEn = document.getElementById('postExcerptEn').value.trim();
      const contRu = document.getElementById('postContentRu').value.trim();
      const contEn = document.getElementById('postContentEn').value.trim();
      const tagsRaw = document.getElementById('postTags').value;
      const tags = tagsRaw.split(',').map(s=>s.trim()).filter(Boolean).map(normalizeTagInput);
      const image = document.getElementById('postImage').value.trim() || null;
      const tmp = {
        id: 'preview',
        date,
        title:{ru:titleRu||'(no title ru)', en:titleEn||'(no title en)'},
        excerpt:{ru:exRu, en:exEn},
        content:{ru:contRu, en:contEn},
        tags,
        image
      };
      openView(tmp);
    });
  }

  // infinite scroll
  window.addEventListener('scroll', onScroll);
}

/* ========== Helpers ========== */
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]); }
function onScroll(){
  const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 700;
  if(nearBottom) loadMore();
}
function scrollToFeed(){ document.getElementById('feed').scrollIntoView({behavior:'smooth', block:'start'}); }

function updateLangButtons(){
  document.querySelectorAll('[data-lang]').forEach(b=>{
    if(b.dataset.lang === LANG) b.style.background = 'linear-gradient(90deg,#7a2bff,#00d4ff)';
    else b.style.background = '';
  });
}

/* ========== Set language (local UI + try google translate) ========== */
function setLang(l){
  LANG = l;
  localStorage.setItem('anomaly_lang', l);
  applyLang();
  updateLangButtons();
  // try to switch Google Translate combo (will translate DOM)
  if(window.google && document.querySelector('.goog-te-combo')) {
    setGoogleLang(l);
  }
  // re-render feed UI texts & tags
  feed.innerHTML=''; offset=0; loadMore();
}

/* ========== Persist / rebuild helpers ========== */
function rebuildFromStorage(){
  const fixed = window.FIXED_POSTS || [];
  const local = loadLocalPosts().map(normalizeUserPost);
  POSTS = [...local, ...fixed];
  sortPosts();
  renderTagControls();
  feed.innerHTML=''; offset=0; loadMore();
}

/* ========== Init event wiring for closures (after definitions) ========== */
document.addEventListener('DOMContentLoaded', ()=> {
  updateLangButtons();
});
