// ===== Firebase Sync Module =====
// FIREBASE_CONFIG is loaded from firebase-config.js (gitignored)

// State
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let currentUser = null;

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

  // Store module references for later use
  window._fb = { signInWithPopup, GoogleAuthProvider, signOut, doc, getDoc, setDoc };

  onAuthStateChanged(firebaseAuth, (user) => {
    currentUser = user;
    updateSyncUI();
  });
}

// ===== Auth =====
async function firebaseLogin() {
  if (!firebaseAuth) await initFirebase();
  const { signInWithPopup, GoogleAuthProvider } = window._fb;
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
  const { signOut } = window._fb;
  await signOut(firebaseAuth);
  currentUser = null;
  updateSyncUI();
  showToast('ログアウトしました', 'info');
}

// ===== Sync =====
function getDocRef() {
  const { doc } = window._fb;
  return doc(firebaseDb, 'users', currentUser.uid);
}

async function syncUpload() {
  if (!currentUser) { showToast('ログインしてください', 'warn'); return; }
  try {
    const { setDoc } = window._fb;
    const data = {
      battles: JSON.parse(localStorage.getItem('pokemon-battle-log') || '[]'),
      presets: JSON.parse(localStorage.getItem('pokemon-party-presets') || '[]'),
      updatedAt: new Date().toISOString()
    };
    await setDoc(getDocRef(), data);
    showToast('アップロード完了', 'success');
  } catch (e) {
    console.error('Upload error:', e);
    showToast('アップロードに失敗しました', 'error');
  }
}

async function syncDownload() {
  if (!currentUser) { showToast('ログインしてください', 'warn'); return; }
  try {
    const { getDoc } = window._fb;
    const snap = await getDoc(getDocRef());
    if (!snap.exists()) {
      showToast('クラウドにデータがありません', 'warn');
      return;
    }
    const data = snap.data();
    if (data.battles) localStorage.setItem('pokemon-battle-log', JSON.stringify(data.battles));
    if (data.presets) localStorage.setItem('pokemon-party-presets', JSON.stringify(data.presets));
    // Reload app state
    battles = loadBattles();
    renderTable();
    renderPartiesTab();
    renderPresetOptions();
    showToast(`ダウンロード完了（${data.updatedAt ? new Date(data.updatedAt).toLocaleString('ja-JP') : ''}）`, 'success');
  } catch (e) {
    console.error('Download error:', e);
    showToast('ダウンロードに失敗しました', 'error');
  }
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
document.addEventListener('DOMContentLoaded', () => {
  if (!isFirebaseConfigured()) {
    // Hide sync UI if not configured
    const syncSection = document.getElementById('sync-section');
    if (syncSection) syncSection.style.display = 'none';
    return;
  }
  initFirebase();

  document.getElementById('sync-login-btn').addEventListener('click', firebaseLogin);
  document.getElementById('sync-upload-btn').addEventListener('click', syncUpload);
  document.getElementById('sync-download-btn').addEventListener('click', syncDownload);
  document.getElementById('sync-logout-btn').addEventListener('click', firebaseLogout);
});
