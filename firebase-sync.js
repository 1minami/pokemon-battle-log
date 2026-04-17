// ===== Firebase Sync Module =====
import { FIREBASE_CONFIG } from './firebase-config.js';
import { loadBattles, setBattles, battles, saveBattlesData, loadPresets, savePresetsData } from './state.js';
import { showToast } from './utils.js';
import { renderTable } from './render.js';
import { renderPartiesTab, renderPresetOptions } from './modal.js';

// State
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let currentUser = null;

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

function getDocRef() {
  const { doc } = fbModules;
  return doc(firebaseDb, 'users', currentUser.uid);
}

async function syncUpload() {
  if (!currentUser) { showToast('ログインしてください', 'warn'); return; }
  try {
    const { getDoc, setDoc } = fbModules;

    // Conflict detection: check remote updatedAt
    const snap = await getDoc(getDocRef());
    if (snap.exists()) {
      const remoteUpdatedAt = snap.data().updatedAt;
      const lastSync = localStorage.getItem(LAST_SYNC_KEY);
      if (remoteUpdatedAt && lastSync && remoteUpdatedAt > lastSync) {
        const remoteDate = new Date(remoteUpdatedAt).toLocaleString('ja-JP');
        showSyncConflictModal(remoteDate);
        return;
      }
    }

    await doUpload();
  } catch (e) {
    console.error('Upload error:', e);
    showToast('アップロードに失敗しました', 'error');
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
  showToast('アップロード完了', 'success');
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

async function syncDownload() {
  if (!currentUser) { showToast('ログインしてください', 'warn'); return; }
  try {
    const { getDoc } = fbModules;
    const snap = await getDoc(getDocRef());
    if (!snap.exists()) {
      showToast('クラウドにデータがありません', 'warn');
      return;
    }
    const data = snap.data();
    if (data.battles) localStorage.setItem('pokemon-battle-log', JSON.stringify(data.battles));
    if (data.presets) localStorage.setItem('pokemon-party-presets', JSON.stringify(data.presets));

    // Save remote updatedAt as last sync time
    if (data.updatedAt) localStorage.setItem(LAST_SYNC_KEY, data.updatedAt);

    // Reload app state
    setBattles(loadBattles());
    renderTable();
    renderPartiesTab();
    renderPresetOptions();
    showToast(`ダウンロード完了（${data.updatedAt ? new Date(data.updatedAt).toLocaleString('ja-JP') : ''}）`, 'success');
  } catch (e) {
    console.error('Download error:', e);
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
function updateSyncUI() {
  const $loginBtn = document.getElementById('sync-login-btn');
  const $syncActions = document.getElementById('sync-actions');
  const $userName = document.getElementById('sync-user-name');

  if (currentUser) {
    $loginBtn.style.display = 'none';
    $syncActions.style.display = 'flex';
    $userName.textContent = currentUser.displayName || currentUser.email || '';
  } else {
    $loginBtn.style.display = '';
    $syncActions.style.display = 'none';
    $userName.textContent = '';
  }
}

function isFirebaseConfigured() {
  return FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId;
}

// ===== Init on load =====
if (isFirebaseConfigured()) {
  initFirebase();

  document.getElementById('sync-login-btn').addEventListener('click', firebaseLogin);
  document.getElementById('sync-upload-btn').addEventListener('click', syncUpload);
  document.getElementById('sync-download-btn').addEventListener('click', syncDownload);
  document.getElementById('sync-logout-btn').addEventListener('click', firebaseLogout);

  // Conflict modal handlers
  const $conflictOverlay = document.getElementById('sync-conflict-overlay');
  if ($conflictOverlay) {
    document.getElementById('sync-conflict-download').addEventListener('click', async () => {
      closeSyncConflictModal();
      await syncDownload();
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
