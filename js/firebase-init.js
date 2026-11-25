// firebase-init.js — inicializa Firebase (App, Auth, Firestore) y expone
// un API global (window.FB) para el resto de la app, que no usa módulos ES.
// Se carga como <script type="module">.
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  runTransaction,
  query,
  where,
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(app);

// Firestore con cache offline persistente (multi-pestaña)
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// Expose a small API for the non-module code
window.FB = {
  auth,
  db,
  onAuthStateChanged: (cb) => onAuthStateChanged(auth, cb),
  signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
  signOut: () => signOut(auth),
  // Crea una cuenta de Auth SIN cerrar la sesión del admin: usa una segunda
  // instancia de Firebase que se descarta al terminar. Devuelve el uid.
  createAuthUser: async (email, password) => {
    const sec = initializeApp(window.FIREBASE_CONFIG, 'alta-' + Date.now());
    const secAuth = getAuth(sec);
    try {
      const cred = await createUserWithEmailAndPassword(secAuth, email, password);
      return cred.user.uid;
    } finally {
      try { await signOut(secAuth); } catch (e) {}
      try { await deleteApp(sec); } catch (e) {}
    }
  },
  sendPasswordReset: (email) => sendPasswordResetEmail(auth, email),
  // Firestore helpers
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  // Consultas filtradas (ej. movimientos de inventario de los últimos días)
  query,
  where,
  // Incremento atómico (descuento de stock sin pisarse entre equipos)
  increment,
  // Transacciones: evitan que dos dispositivos (cocina/bar/mozo) se pisen
  // al modificar el mismo documento a la vez. Uso: FB.runTransaction(fn)
  runTransaction: (fn) => runTransaction(db, fn),
  ready: true,
};

// Notify the app that Firebase is ready
window.dispatchEvent(new Event('firebase-ready'));
