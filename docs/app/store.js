// Armazenamento dos editais e do progresso.
// - firebaseStore: Firebase Auth (conta Google) + Firestore em usuarios/{uid}/editais/{id}
// - demoStore (?demo): usuário fictício e dados no localStorage, para testar sem login
import { firebaseConfig } from './config.js';

const FB = 'https://www.gstatic.com/firebasejs/12.19.0';

// aplica {"a.b.c": valor} num objeto (mesma semântica do updateDoc com caminhos)
export function aplicarCaminhos(obj, patch) {
  for (const [path, val] of Object.entries(patch)) {
    const ks = path.split('.');
    let o = obj;
    for (const k of ks.slice(0, -1)) o = (o[k] && typeof o[k] === 'object') ? o[k] : (o[k] = {});
    if (val === undefined) delete o[ks.at(-1)]; else o[ks.at(-1)] = val;
  }
  return obj;
}

export async function firebaseStore() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${FB}/firebase-app.js`), import(`${FB}/firebase-auth.js`), import(`${FB}/firebase-firestore.js`)]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  let db;
  try {
    db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch { db = F.getFirestore(app); }
  const col = () => F.collection(db, 'usuarios', auth.currentUser.uid, 'editais');
  const ref = id => F.doc(col(), id);
  const conv = patch => Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined ? F.deleteField() : v]));
  return {
    demo: false,
    onUser: cb => A.onAuthStateChanged(auth, u => cb(u && { uid: u.uid, email: u.email, nome: u.displayName })),
    async login() {
      const p = new A.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      try { await A.signInWithPopup(auth, p); }
      catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')
          return A.signInWithRedirect(auth, p);
        if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') throw e;
      }
    },
    logout: () => A.signOut(auth),
    async listar() {
      const s = await F.getDocs(col());
      return s.docs.map(d => ({ id: d.id, ...d.data() }));
    },
    observar(id, cb, erro) {
      return F.onSnapshot(ref(id), { includeMetadataChanges: false },
        s => cb(s.exists() ? s.data() : null, s.metadata.hasPendingWrites), erro);
    },
    async criar(dados) { return (await F.addDoc(col(), dados)).id; },
    atualizar: (id, patch) => F.updateDoc(ref(id), conv(patch)),
    excluir: id => F.deleteDoc(ref(id)),
  };
}

export function demoStore() {
  const KEY = 'ev-demo';
  const ler = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const gravar = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
  const obs = new Map();
  const avisar = id => (obs.get(id) || []).forEach(cb => cb(structuredClone(ler()[id] ?? null), false));
  const user = { uid: 'demo', email: 'demo@exemplo', nome: 'Demonstração' };
  let logado = true;
  let userCb = () => {};
  return {
    demo: true,
    onUser: cb => { userCb = cb; cb(logado ? user : null); },
    login: async () => { logado = true; userCb(user); },
    logout: async () => { logado = false; userCb(null); },
    listar: async () => Object.entries(ler()).map(([id, d]) => ({ id, ...d })),
    observar(id, cb) {
      obs.set(id, [...(obs.get(id) || []), cb]);
      queueMicrotask(() => cb(structuredClone(ler()[id] ?? null), false));
      return () => obs.set(id, (obs.get(id) || []).filter(f => f !== cb));
    },
    async criar(dados) {
      const s = ler(); const id = 'd' + Date.now().toString(36);
      s[id] = structuredClone(dados); gravar(s); return id;
    },
    async atualizar(id, patch) {
      const s = ler(); if (!s[id]) throw new Error('não encontrado');
      aplicarCaminhos(s[id], patch); gravar(s);
    },
    async excluir(id) { const s = ler(); delete s[id]; gravar(s); avisar(id); },
  };
}
