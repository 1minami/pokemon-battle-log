// ===== Firebase Sync Module =====
import { FIREBASE_CONFIG } from './firebase-config.js';
import { loadBattles, setBattles, battles, saveBattlesData, loadPresets, savePresetsData, LOCAL_UPDATED_KEY, addLocalUpdateListener } from './state.js';
import { showToast } from './utils.js';
import { renderTable } from './render.js';
import { renderPartiesTab, renderPresetOptions } from './modal.js';

// State
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let currentUser = null;
let syncStatusTimer = null;

// Firebase module references (loaded dynamically)
let fbModules = null;

// ===== Initialization =====
async function initFirebase() {
  if (firebaseApp) return;
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/11.7.1/firebase-app.js');
  const { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } =
    await import('https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js');
  const { getFirestore, doc, getDoc, setDoc } =
    await import('https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js');

  firebaseApp = initializeApp(FIREBASE_CONFIG);
  firebaseAuth = getAuth(firebaseApp);
  firebaseDb = getFirestore(firebaseApp);

  fbModules = { signInWithPopup, GoogleAuthProvider, signOut, doc, getDoc, setDoc };

  onAuthStateChanged(firebaseAuth, (user) => {
    currentUser = user;
    updateSyncUI();
  });
}

// ===== Auth =====
async function firebaseLogin() {
  if (!firebaseAuth) await initFirebase();
  const { signInWithPopup, GoogleAuthProvider } = fbModules;
  try {
    await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
    showToast('ログインしました', 'success');
  } catch (e) {
    if (e.code === 'auth/popup-closed-by-user') return;
    console.error('Login error:', e);
    showToast('ログインに失敗しました', 'error');
  }
}

async function firebaseLogout() {
  if (!firebaseAuth) return;
  const { signOut } = fbModules;
  await signOut(firebaseAuth);
  currentUser = null;
  updateSyncUI();
  showToast('ログアウトしました', 'info');
}

// ===== Sync =====
const LAST_SYNC_KEY = 'firebase-last-sync';
const AUTO_SYNC_DEBOUNCE_MS = 30000;
let autoSyncTimer = null;

function scheduleAutoSync() {
  if (!currentUser) return;
  if (autoSyncTimer) clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => {
    autoSyncTimer = null;
    syncAuto();
  }, AUTO_SYNC_DEBOUNCE_MS);
}

function getDocRef() {
  const { doc } = fbModules;
  return doc(firebaseDb, 'users', currentUser.uid);
}

function getLocalUpdatedAt() {
  return localStorage.getItem(LOCAL_UPDATED_KEY) || '';
}

function getLastSync() {
  return localStorage.getItem(LAST_SYNC_KEY) || '';
}

function hasLocalChanges() {
  const local = getLocalUpdatedAt();
  const lastSync = getLastSync();
  if (!local) return false;
  if (!lastSync) return true;
  return local > lastSync;
}

// ===== Auto Sync (smart) =====
async function syncAuto() {
  if (!currentUser) { showToast('ログインしてください', 'warn'); return; }
  setSyncStatus('同期中…', 'sync-syncing');
  try {
    const { getDoc } = fbModules;
    const snap = await getDoc(getDocRef());

    const localChanged = hasLocalChanges();
    const remoteUpdatedAt = snap.exists() ? snap.data().updatedAt : null;
    const lastSync = getLastSync();
    const remoteChanged = remoteUpdatedAt && (!lastSync || remoteUpdatedAt > lastSync);

    if (!snap.exists()) {
      await doUpload();
      return;
    }
    if (!localChanged && !remoteChanged) {
      showToast('最新です', 'info');
      updateSyncUI();
      return;
    }
    if (localChanged && !remoteChanged) {
      await doUpload();
      return;
    }
    if (!localChanged && remoteChanged) {
      await doDownload(snap.data());
      return;
    }
    // both changed → conflict
    const remoteDate = new Date(remoteUpdatedAt).toLocaleString('ja-JP');
    showSyncConflictModal(remoteDate);
    updateSyncUI();
  } catch (e) {
    console.error('Sync error:', e);
    showToast('同期に失敗しました', 'error');
    updateSyncUI();
  }
}

async function doUpload() {
  const { setDoc } = fbModules;
  const now = new Date().toISOString();
  const data = {
    battles: JSON.parse(localStorage.getItem('pokemon-battle-log') || '[]'),
    presets: JSON.parse(localStorage.getItem('pokemon-party-presets') || '[]'),
    updatedAt: now
  };
  await setDoc(getDocRef(), data);
  localStorage.setItem(LAST_SYNC_KEY, now);
  localStorage.setItem(LOCAL_UPDATED_KEY, now);
  showToast('アップロード完了', 'success');
  updateSyncUI();
}

async function doDownload(data) {
  if (!data) {
    const { getDoc } = fbModules;
    const snap = await getDoc(getDocRef());
    if (!snap.exists()) {
      showToast('クラウドにデータがありません', 'warn');
      updateSyncUI();
      return;
    }
    data = snap.data();
  }
  if (data.battles) localStorage.setItem('pokemon-battle-log', JSON.stringify(data.battles));
  if (data.presets) localStorage.setItem('pokemon-party-presets', JSON.stringify(data.presets));

  if (data.updatedAt) {
    localStorage.setItem(LAST_SYNC_KEY, data.updatedAt);
    localStorage.setItem(LOCAL_UPDATED_KEY, data.updatedAt);
  }

  setBattles(loadBattles());
  renderTable();
  renderPartiesTab();
  renderPresetOptions();
  showToast('ダウンロード完了', 'success');
  updateSyncUI();
}

async function forceUpload() {
  if (!currentUser) return;
  try {
    await doUpload();
  } catch (e) {
    console.error('Force upload error:', e);
    showToast('アップロードに失敗しました', 'error');
  }
}

async function forceDownload() {
  if (!currentUser) return;
  try {
    await doDownload(null);
  } catch (e) {
    console.error('Force download error:', e);
    showToast('ダウンロードに失敗しました', 'error');
  }
}

// ===== Conflict Modal =====
function showSyncConflictModal(remoteDate) {
  const $overlay = document.getElementById('sync-conflict-overlay');
  const $msg = document.getElementById('sync-conflict-message');
  if (!$overlay || !$msg) return;
  $msg.textContent = `クラウドに他の端末からの更新があります（${remoteDate}）。上書きしますか？`;
  $overlay.classList.add('active');
}

function closeSyncConflictModal() {
  const $overlay = document.getElementById('sync-conflict-overlay');
  if ($overlay) $overlay.classList.remove('active');
}

// ===== UI =====
function setSyncStatus(text, cls) {
  const $status = document.getElementById('sync-status');
  if (!$status) return;
  $status.textContent = text;
  $status.classList.remove('sync-syncing', 'sync-conflict');
  if (cls) $status.classList.add(cls);
}

function formatRelative(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'たった今';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}日前`;
  return new Date(iso).toLocaleDateString('ja-JP');
}

function computeStatusText() {
  const lastSync = getLastSync();
  if (!lastSync) return '未同期';
  const localChanged = hasLocalChanges();
  const rel = formatRelative(lastSync);
  if (localChanged) return `未同期の変更あり（最終: ${rel}）`;
  return `最終同期: ${rel}`;
}

function updateSyncUI() {
  const $loginBtn = document.getElementById('sync-login-btn');
  const $syncActions = document.getElementById('sync-actions');
  const $userName = document.getElementById('sync-user-name');

  if (currentUser) {
    $loginBtn.style.display = 'none';
    $syncActions.style.display = 'flex';
    $syncActions.style.flexDirection = 'column';
    $userName.textContent = currentUser.displayName || currentUser.email || '';
    setSyncStatus(computeStatusText(), null);
  } else {
    $loginBtn.style.display = '';
    $syncActions.style.display = 'none';
    $userName.textContent = '';
  }
}

function startStatusTicker() {
  if (syncStatusTimer) return;
  syncStatusTimer = setInterval(() => {
    if (currentUser) {
      const $status = document.getElementById('sync-status');
      // skip if currently syncing/conflict to avoid clobbering
      if ($status && !$status.classList.contains('sync-syncing')) {
        setSyncStatus(computeStatusText(), null);
      }
    }
  }, 30000);
}

function isFirebaseConfigured() {
  return FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId;
}

// ===== Init on load =====
if (isFirebaseConfigured()) {
  initFirebase();

  document.getElementById('sync-login-btn').addEventListener('click', firebaseLogin);
  document.getElementById('sync-btn').addEventListener('click', syncAuto);
  document.getElementById('sync-logout-btn').addEventListener('click', firebaseLogout);
  startStatusTicker();
  addLocalUpdateListener(scheduleAutoSync);

  // Conflict modal handlers
  const $conflictOverlay = document.getElementById('sync-conflict-overlay');
  if ($conflictOverlay) {
    document.getElementById('sync-conflict-download').addEventListener('click', async () => {
      closeSyncConflictModal();
      await forceDownload();
    });
    document.getElementById('sync-conflict-force').addEventListener('click', async () => {
      closeSyncConflictModal();
      await forceUpload();
    });
    document.getElementById('sync-conflict-cancel').addEventListener('click', closeSyncConflictModal);
    document.getElementById('sync-conflict-close').addEventListener('click', closeSyncConflictModal);
    $conflictOverlay.addEventListener('click', (e) => {
      if (e.target === $conflictOverlay) closeSyncConflictModal();
    });
  }
} else {
  // Hide sync UI if not configured
  const syncSection = document.getElementById('sync-section');
  if (syncSection) syncSection.style.display = 'none';
}
