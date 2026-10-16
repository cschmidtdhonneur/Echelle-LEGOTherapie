/* Sauvegarde explicite par compte. Aucun transfert au démarrage. */
(() => {
  'use strict';
  const CHANNEL = 'PTB_WIX_BACKUP_V1';
  const HOSTS = ['https://www.pose-ta-brique.fr', 'https://pose-ta-brique.fr'];
  let parentOrigin = '';
  try { const origin = new URL(document.referrer).origin; if (HOSTS.includes(origin)) parentOrigin = origin; } catch (_) {}
  const pending = new Map();
  let memberId = '', busy = false, next = null, queuedFile = '';
  const panel = document.createElement('dialog');
  panel.style.cssText = 'max-width:680px;width:90%;max-height:85vh;overflow:auto;border:1px solid #b7d6cf;border-radius:20px;padding:24px;color:#074b55';
  panel.innerHTML = '<h2>Mes dossiers sur mon espace membre</h2><p>Le bouton Enregistrer conserve votre dossier sur cet appareil et sur votre espace membre. Retrouvez ici vos versions enregistrées.</p><p id="wixBackupStatus" role="status" aria-live="polite"></p><p><button type="button" data-op="list">Retrouver mes versions sauvegardées</button></p><div id="wixBackupList"></div><p><button type="button" data-op="more" hidden>Voir les versions suivantes</button> <button type="button" data-op="close">Fermer</button></p>';
  document.body.appendChild(panel);
  const status = text => { panel.querySelector('#wixBackupStatus').textContent = text; };
  window.addEventListener('message', event => {
    if (!parentOrigin || event.origin !== parentOrigin || event.source !== window.parent) return;
    const data = event.data;
    if (data?.channel !== CHANNEL || !pending.has(data.requestId)) return;
    const item = pending.get(data.requestId); pending.delete(data.requestId); clearTimeout(item.timer);
    if (data.error) item.reject(new Error(data.error)); else item.resolve(data.result);
  });
  function request(action, body = {}) {
    if (!parentOrigin || window.parent === window) return Promise.reject(new Error('Ouvrez LBT Tracker depuis votre espace membre sur pose-ta-brique.fr.'));
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('L’espace membre ne répond pas : sauvegarde sur le compte non confirmée. La copie locale reste disponible.')); }, 25000);
      pending.set(requestId, { resolve, reject, timer });
      window.parent.postMessage({ channel: CHANNEL, requestId, action, body }, parentOrigin);
    });
  }
  async function connect() {
    const result = await request('HELLO');
    if (!result?.ok || result.protocol !== 1 || typeof result.memberId !== 'string') throw new Error('Connexion à votre espace membre nécessaire. Si vous êtes déjà connecté, rechargez la page.');
    if (memberId && memberId !== result.memberId) {
      memberId = result.memberId;
      panel.querySelector('#wixBackupList').replaceChildren(); next = null;
      panel.querySelector('[data-op="more"]').hidden = true;
      throw new Error('Le compte a changé. Votre dossier reste sur cet appareil. Reconnectez-vous au compte utilisé pour ce dossier.');
    }
    memberId = result.memberId;
  }
  function localSave() {
    if (!upsertCurrentFile('manual')) throw new Error('Sauvegarde locale impossible. Téléchargez une copie JSON avant de continuer.');
  }
  async function save() {
    const fileId = getCurrentFileId();
    await connect();
    if (state.fileId !== fileId) throw new Error('Le dossier a changé pendant la connexion. Le précédent reste enregistré sur cet appareil ; rouvrez-le pour le sauvegarder sur votre espace membre.');
    if (state.wixBackup && state.wixBackup.memberId !== memberId) throw new Error('Ce dossier est lié à un autre compte. Reconnectez-vous au bon compte ; la copie sur cet appareil est conservée.');
    localSave();
    const metadata = state.wixBackup;
    const same = metadata?.memberId === memberId;
    const dossierId = same ? metadata.dossierId : crypto.randomUUID();
    const revision = same ? metadata.revision : 0;
    state.wixBackup = { memberId, dossierId, revision };
    localSave();
    const copy = serializeCurrentState();
    delete copy.wixBackup;
    status('Enregistrement sur votre espace membre en cours…');
    updateSaveStatus('Sur cet appareil : enregistré · Espace membre : en cours…');
    const result = await request('SAVE', { memberId, dossierId, revision, payload: { state: copy } });
    if (!result?.ok) {
      if (result?.code === 'CONFLICT') throw new Error('Une autre version existe déjà sur le compte. Votre saisie locale est conservée. Retrouvez les versions sauvegardées avant de poursuivre.');
      throw new Error('Sauvegarde sur le compte non confirmée.');
    }
    if (result.dossierId !== dossierId || result.revision !== revision + 1) throw new Error('Réponse de sauvegarde invalide.');
    // Une navigation pendant la requête ne doit jamais modifier le nouveau dossier.
    if (state.fileId === fileId) {
      state.wixBackup = { memberId, dossierId, revision: result.revision };
      localSave();
    }
    status('Enregistré et relu sur votre compte — version ' + result.revision + '.');
    if (state.fileId === fileId) updateSaveStatus('Enregistré sur cet appareil et sur votre espace membre');
    showSaveToast('Enregistré sur cet appareil et sur votre espace membre');
  }
  async function list(append) {
    await connect();
    const result = await request('LIST', { memberId, skip: append ? next : 0 });
    if (!result?.ok || !Array.isArray(result.items)) throw new Error('Liste non confirmée.');
    const target = panel.querySelector('#wixBackupList');
    if (!append) target.replaceChildren();
    for (const item of result.items) {
      const row = document.createElement('p');
      const label = document.createElement('span');
      label.textContent = item.name + ' — version ' + item.revision + ' — ' + new Date(item.savedAt).toLocaleString('fr-FR') + ' ';
      const open = document.createElement('button'); open.textContent = 'Récupérer une copie';
      open.addEventListener('click', () => run(() => restore(item.recordId)));
      row.append(label, open); target.appendChild(row);
    }
    next = result.next;
    panel.querySelector('[data-op="more"]').hidden = next === null;
    status(result.items.length ? 'Vos versions sont affichées ci-dessous. La suppression locale ne supprime pas ces copies sur le compte.' : 'Aucune version sur cette page.');
  }
  async function restore(recordId) {
    await connect();
    const result = await request('LOAD', { memberId, recordId });
    if (!result?.ok || !result.payload?.state?.patient || !Array.isArray(result.payload.state.evals)) throw new Error('Dossier récupéré invalide.');
    if (!confirm('Récupérer cette version dans un nouveau dossier local ? Votre dossier ouvert sera conservé.')) return;
    localSave();
    clearTimeout(autosaveTimer); clearTimeout(window.ptbDraftSaveTimer);
    const previous = state;
    try {
      state = JSON.parse(JSON.stringify(result.payload.state));
      state.fileId = 'ptb_cloud_' + crypto.randomUUID();
      // Une version ancienne devient une branche indépendante à la prochaine sauvegarde.
      if (result.revision === result.latestRevision) state.wixBackup = { memberId, dossierId: result.dossierId, revision: result.revision };
      else delete state.wixBackup;
      ensureStateShape(); state.view = 'info';
      localSave(); render();
    } catch (error) { state = previous; throw error; }
    status('Dossier récupéré sur cet appareil. Le bouton Enregistrer sauvegardera aussi sur votre espace membre.');
    showSaveToast('Dossier récupéré depuis votre compte Wix');
  }
  async function run(operation) {
    if (busy) return;
    busy = true;
    try { await operation(); } catch (error) { status(error.message); updateSaveStatus('Espace membre : non confirmé — ' + error.message); showSaveToast(error.message); }
    finally {
      busy = false;
      const queued = queuedFile; queuedFile = '';
      if (queued && state.fileId === queued) run(() => save());
      else if (queued) showSaveToast('Les dernières modifications restent sur cet appareil. Rouvrez le dossier pour les envoyer sur le compte.');
    }
  }
  window.ptbOpenMemberFiles = function () { panel.showModal(); run(() => list(false)); };
  if (typeof viewSaves === 'function') {
    const previousViewSaves = viewSaves;
    viewSaves = function () { return '<div class="exportTopActions noPrint"><button class="primary" onclick="ptbOpenMemberFiles()">Retrouver mes dossiers sur mon espace membre</button></div>' + previousViewSaves(); };
  }
  panel.addEventListener('click', event => {
    const op = event.target.dataset.op;
    if (op === 'close') return panel.close();
    if (op === 'list') run(() => list(false));
    if (op === 'more' && next !== null) run(() => list(true));
  });
  saveLocal = function () {
    try { localSave(); } catch (error) { updateSaveStatus(error.message); showSaveToast(error.message); return; }
    updateSaveStatus('Sur cet appareil : enregistré · Espace membre : en cours…');
    if (busy) { queuedFile = state.fileId; return; }
    run(() => save());
  };
})();
