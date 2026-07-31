// storage.js – Firebase Firestore avec compression d'images

firebase.initializeApp({
  apiKey: "AIzaSyARV_E4XtJS13CndRnYQqtjVGP7LcxxPzs",
  authDomain: "kiosque-college.firebaseapp.com",
  projectId: "kiosque-college",
  storageBucket: "kiosque-college.firebasestorage.app",
  messagingSenderId: "121180432047",
  appId: "1:121180432047:web:1595afeebc04a17483165a"
});
const db = firebase.firestore();

// Cache mémoire local
const _cache = {
  blogs: [],
  articles: [],
  users: [],
  settings: null
};

// ── Utilitaires ────────────────────────────────────────────────────────
function afficherBanniereKiosque(texte, couleurFond) {
  const banniere = document.createElement('div');
  banniere.setAttribute('role', 'status');
  banniere.textContent = texte;
  banniere.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:16px', 'transform:translateX(-50%)',
    'max-width:90vw', `background:${couleurFond}`, 'color:#FBF6EC',
    'padding:10px 18px', 'border-radius:8px', 'font-family:sans-serif',
    'font-size:13px', 'z-index:9999', 'box-shadow:0 8px 24px rgba(0,0,0,0.3)',
    'text-align:center'
  ].join(';');
  document.body.appendChild(banniere);
  setTimeout(() => banniere.remove(), 9000);
}

// ── Compression d'image ──────────────────────────────────────────────
function compresserImage(dataUrl, maxLargeur = 800, qualite = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let largeur = img.width;
      let hauteur = img.height;
      if (largeur > maxLargeur) {
        const ratio = maxLargeur / largeur;
        largeur = maxLargeur;
        hauteur = Math.round(hauteur * ratio);
      }
      canvas.width = largeur;
      canvas.height = hauteur;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, largeur, hauteur);
      resolve(canvas.toDataURL('image/jpeg', qualite));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function generateId(prefix) {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${time}_${rand}`;
}

function now() { return new Date().toISOString(); }

function getSession() {
  try {
    const raw = localStorage.getItem('kiosque_session');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function setSession(session) {
  try { localStorage.setItem('kiosque_session', JSON.stringify(session)); } catch(e) {}
}
function clearSession() {
  try { localStorage.removeItem('kiosque_session'); } catch(e) {}
}

// ── Blogs ────────────────────────────────────────────────────────────
function getBlogs() { return [..._cache.blogs]; }
function getBlogById(id) { return _cache.blogs.find(b => b.id === id) || null; }

function createBlog({ titre, description }) {
  const blog = {
    titre: (titre || '').trim() || 'Publication sans titre',
    description: (description || '').trim(),
    dateCreation: now()
  };
  const id = generateId('blg');
  blog.id = id;
  db.collection('blogs').doc(id).set(blog).catch(e => {
    console.error('Firestore createBlog:', e);
    afficherBanniereKiosque("Erreur d'enregistrement. Vérifiez votre connexion.", '#8C2F39');
  });
  return blog;
}

function updateBlog(id, data) {
  const blog = _cache.blogs.find(b => b.id === id);
  if (!blog) return null;
  const updated = { ...blog, ...data, id };
  db.collection('blogs').doc(id).set(updated).catch(e => console.error('Firestore updateBlog:', e));
  return updated;
}

function deleteBlog(id) {
  db.collection('blogs').doc(id).delete().catch(e => console.error('Firestore deleteBlog:', e));
  _cache.articles
    .filter(a => a.blogId === id)
    .forEach(a => db.collection('articles').doc(a.id).delete().catch(() => {}));
}

// ── Articles ─────────────────────────────────────────────────────────
function getArticles() { return [..._cache.articles]; }
function getArticleById(id) { return _cache.articles.find(a => a.id === id) || null; }
function getArticlesByBlog(blogId) { return _cache.articles.filter(a => a.blogId === blogId); }

const STATUTS = ['Brouillon', 'À valider', 'À publier', 'En ligne', 'Hors ligne', 'À supprimer'];

function nettoyerPiecesJointes(pieces) {
  if (!Array.isArray(pieces)) return [];
  return pieces.map(p => ({
    id: String(p.id || ''),
    nom: String(p.nom || ''),
    taille: Number(p.taille || 0),
    type: String(p.type || ''),
    donnees: String(p.donnees || '')
  }));
}

async function createArticle({ blogId, titre, resume, contenu, auteur, statut, image, pieceJointes }) {
  const horodatage = now();
  const id = generateId('art');

  let imageFinale = null;
  if (image && typeof image === 'string' && image.startsWith('data:')) {
    try {
      imageFinale = await compresserImage(image, 600, 0.6);
    } catch (e) {
      console.warn('Erreur compression image, utilisation brute', e);
      imageFinale = image;
    }
  }

  const piecesNettoyees = nettoyerPiecesJointes(pieceJointes);

  const article = {
    id,
    blogId: String(blogId || ''),
    titre: (titre || '').trim() || 'Article sans titre',
    resume: (resume || '').trim().slice(0, 250),
    contenu: String(contenu || ''),
    image: imageFinale,
    pieceJointes: piecesNettoyees,
    auteur: (auteur || '').trim() || 'Anonyme',
    dateCreation: horodatage,
    dateModification: horodatage,
    statut: STATUTS.includes(statut) ? statut : 'Brouillon'
  };

  const tailleEstimee = JSON.stringify(article).length;
  if (tailleEstimee > 900 * 1024) {
    afficherBanniereKiosque(
      "L'article est trop lourd (images/pieces jointes). Essayez des fichiers plus légers.",
      '#8C2F39'
    );
    throw new Error('Document too large');
  }

  try {
    await db.collection('articles').doc(id).set(article);
  } catch (err) {
    console.error('Firestore createArticle:', err);
    let message = "Erreur d'enregistrement. Vérifiez votre connexion.";
    if (err.message && err.message.includes('exceeds')) {
      message = "L'article est trop lourd. Réduisez les images ou pièces jointes.";
    }
    afficherBanniereKiosque(message, '#8C2F39');
    throw err;
  }
  return article;
}

async function updateArticle(id, data) {
  const article = _cache.articles.find(a => a.id === id);
  if (!article) return null;

  let imageFinale = data.image;
  if (imageFinale && typeof imageFinale === 'string' && imageFinale.startsWith('data:')) {
    try {
      imageFinale = await compresserImage(imageFinale, 600, 0.6);
    } catch (e) {
      console.warn('Erreur compression image mise à jour', e);
    }
  }

  const piecesNettoyees = data.pieceJointes ? nettoyerPiecesJointes(data.pieceJointes) : article.pieceJointes;

  const updated = {
    ...article,
    ...data,
    image: imageFinale,
    pieceJointes: piecesNettoyees,
    dateModification: now(),
    resume: (data.resume || '').trim().slice(0, 250)
  };
  delete updated.id;

  const tailleEstimee = JSON.stringify(updated).length;
  if (tailleEstimee > 900 * 1024) {
    afficherBanniereKiosque(
      "L'article est trop lourd. Réduisez les images ou pièces jointes.",
      '#8C2F39'
    );
    throw new Error('Document too large');
  }

  try {
    await db.collection('articles').doc(id).set(updated);
  } catch (err) {
    console.error('Firestore updateArticle:', err);
    let message = "Erreur de mise à jour. Vérifiez votre connexion.";
    if (err.message && err.message.includes('exceeds')) {
      message = "L'article est trop lourd. Réduisez les images ou pièces jointes.";
    }
    afficherBanniereKiosque(message, '#8C2F39');
    throw err;
  }
  return updated;
}

function setArticleStatut(id, statut) {
  if (!STATUTS.includes(statut)) return null;
  return updateArticle(id, { statut });
}

function deleteArticle(id) {
  db.collection('articles').doc(id).delete().catch(e => console.error('Firestore deleteArticle:', e));
}

// ── Utilisateurs ──────────────────────────────────────────────────────
function getUsers() { return [..._cache.users]; }
function getUserById(id) { return _cache.users.find(u => u.id === id) || null; }
function trouverParIdentifiant(username) {
  const cible = String(username || '').trim().toLowerCase();
  return _cache.users.find(u => u.username.toLowerCase() === cible) || null;
}
function nombreAdmins(utilisateurs) {
  return (utilisateurs || _cache.users).filter(u => u.role === 'admin').length;
}

function createUser({ username, password, nom, role, ddn }) {
  const identifiant = String(username || '').trim();
  if (!identifiant) return { ok: false, erreur: "L'identifiant est obligatoire." };
  if (!password || password.length < 4) return { ok: false, erreur: 'Le mot de passe doit contenir au moins 4 caractères.' };
  if (trouverParIdentifiant(identifiant)) return { ok: false, erreur: 'Cet identifiant est déjà utilisé.' };
  const id = generateId('usr');
  const user = {
    id, username: identifiant,
    password,
    nom: (nom || '').trim() || identifiant,
    role: 'admin',
    ddn: ddn || ''
  };
  db.collection('users').doc(id).set(user).catch(e => console.error('Firestore createUser:', e));
  return { ok: true, user };
}

function updateUser(id, { username, password, nom, role, ddn }) {
  const utilisateurs = _cache.users;
  const idx = utilisateurs.findIndex(u => u.id === id);
  if (idx === -1) return { ok: false, erreur: 'Compte introuvable.' };
  const identifiant = String(username || '').trim();
  if (!identifiant) return { ok: false, erreur: "L'identifiant est obligatoire." };
  const doublon = trouverParIdentifiant(identifiant);
  if (doublon && doublon.id !== id) return { ok: false, erreur: 'Identifiant déjà utilisé.' };
  const nouveauRole = role === 'admin' ? 'admin' : 'admin';
  if (utilisateurs[idx].role === 'admin' && nouveauRole !== 'admin' && nombreAdmins() <= 1) {
    return { ok: false, erreur: "Impossible de retirer les droits du dernier administrateur." };
  }
  if (password && password.length > 0 && password.length < 4) {
    return { ok: false, erreur: 'Le mot de passe doit contenir au moins 4 caractères.' };
  }
  const updated = {
    ...utilisateurs[idx],
    username: identifiant,
    nom: (nom || '').trim() || identifiant,
    role: nouveauRole,
    ddn: ddn !== undefined ? ddn : utilisateurs[idx].ddn,
    ...(password && password.length > 0 ? { password } : {})
  };
  db.collection('users').doc(id).set(updated).catch(e => console.error('Firestore updateUser:', e));
  const session = getSession();
  if (session && session.userId === id) {
    setSession({ ...session, username: updated.username, nom: updated.nom, role: updated.role });
  }
  return { ok: true, user: updated };
}

function deleteUser(id) {
  const cible = _cache.users.find(u => u.id === id);
  if (!cible) return { ok: false, erreur: 'Compte introuvable.' };
  const session = getSession();
  if (session && session.userId === id) return { ok: false, erreur: 'Impossible de supprimer votre propre compte.' };
  if (cible.role === 'admin' && nombreAdmins() <= 1) return { ok: false, erreur: 'Impossible de supprimer le dernier administrateur.' };
  db.collection('users').doc(id).delete().catch(e => console.error('Firestore deleteUser:', e));
  return { ok: true };
}

// ── Paramètres ────────────────────────────────────────────────────────
function getSettings() {
  return _cache.settings || {
    siteName: 'Kiosque',
    tagline: 'Le kiosque des publications du moment',
    articlesParPage: 9,
    copyright: '© ' + new Date().getFullYear() + ' Kiosque — Tous droits réservés.',
    emailContact: '',
    logoEmoji: '📰',
    couleurPrincipale: '#0A3A8C',
    couleurAccent: '#CC1533',
    couleurFond: '#F0F4FF',
    modeSombre: true,
    ddnRequis: true,
    modeMaintenance: false,
    msgMaintenance: 'Le site est temporairement en maintenance. Revenez bientôt !',
    ageMinimum: 0,
    moderationAuto: false,
    commentairesActifs: false,
    statutDefaut: 'Brouillon',
    auteurAffichage: 'nom',
    mentionsLegales: '<h3>Éditeur du site</h3><p>Ce site est géré par l\'équipe de rédaction du Kiosque.</p>'
  };
}

function saveSettings(settings) {
  _cache.settings = settings;
  db.doc('settings/global').set(settings).catch(e => console.error('Firestore saveSettings:', e));
}

// ── Statistiques ──────────────────────────────────────────────────────
function getStats() {
  const blogs = _cache.blogs;
  const articles = _cache.articles;
  return {
    nbBlogs: blogs.length,
    nbArticles: articles.length,
    nbBrouillons: articles.filter(a => a.statut === 'Brouillon').length,
    nbPublies: articles.filter(a => a.statut === 'En ligne').length,
    nbAValider: articles.filter(a => a.statut === 'À valider').length,
    nbAPublier: articles.filter(a => a.statut === 'À publier').length,
    nbHorsLigne: articles.filter(a => a.statut === 'Hors ligne').length,
    nbASupprimer: articles.filter(a => a.statut === 'À supprimer').length
  };
}

// ── Réinitialisation ──────────────────────────────────────────────────
async function reinitialiser() {
  const [blogsSnap, articlesSnap, usersSnap] = await Promise.all([
    db.collection('blogs').get(),
    db.collection('articles').get(),
    db.collection('users').get()
  ]);
  const batch = db.batch();
  [...blogsSnap.docs, ...articlesSnap.docs, ...usersSnap.docs].forEach(d => batch.delete(d.ref));

  const adminId = generateId('usr');
  const blogUrbanId = generateId('blg');
  const horodatage = now();

  batch.set(db.collection('users').doc(adminId), {
    id: adminId, username: 'admin', password: 'admin123',
    nom: 'Administrateur', role: 'admin', ddn: '1990-01-01'
  });

  batch.set(db.doc('settings/global'), {
    siteName: 'Kiosque',
    tagline: 'Le kiosque des publications du moment',
    articlesParPage: 9,
    copyright: '© ' + new Date().getFullYear() + ' Kiosque — Tous droits réservés.',
    emailContact: '', logoEmoji: '📰',
    couleurPrincipale: '#0A3A8C', couleurAccent: '#CC1533', couleurFond: '#F0F4FF',
    modeSombre: true, ddnRequis: true, modeMaintenance: false,
    msgMaintenance: 'Le site est temporairement en maintenance.',
    ageMinimum: 0, moderationAuto: false, commentairesActifs: false,
    statutDefaut: 'Brouillon', auteurAffichage: 'nom',
    mentionsLegales: '<h3>Éditeur du site</h3><p>Ce site est géré par l\'équipe de rédaction du Kiosque.</p>'
  });

  batch.set(db.collection('blogs').doc(blogUrbanId), {
    id: blogUrbanId, titre: 'Chroniques Urbaines',
    description: 'Les transformations de nos villes, racontées au fil des rues.',
    dateCreation: horodatage
  });

  const artId = generateId('art');
  batch.set(db.collection('articles').doc(artId), {
    id: artId, blogId: blogUrbanId,
    titre: 'La renaissance des friches industrielles',
    resume: 'Comment les anciennes usines deviennent des lieux de vie créatifs.',
    contenu: '<p>De nombreuses villes françaises réinventent leurs friches industrielles en tiers-lieux culturels.</p>',
    image: null, pieceJointes: [], auteur: 'Administrateur',
    dateCreation: horodatage, dateModification: horodatage, statut: 'En ligne'
  });

  await batch.commit();
}

// ── Export ────────────────────────────────────────────────────────────
const Storage = {
  getBlogs, saveBlogs: (list) => {},
  getBlogById, createBlog, updateBlog, deleteBlog,
  getArticles, saveArticles: (list) => {},
  getArticleById, getArticlesByBlog,
  createArticle, updateArticle, setArticleStatut, deleteArticle,
  getUsers, getUserById, createUser, updateUser, deleteUser,
  getSession, setSession, clearSession,
  getSettings, saveSettings,
  getStats,
  reinitialiser,
  STATUTS
};

window.Storage = Storage;
