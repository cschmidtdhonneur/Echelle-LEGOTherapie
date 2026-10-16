/* Sauvegarde explicite par compte. Aucun transfert au démarrage. */
(() => {
  'use strict';
  const CHANNEL = 'PTB_WIX_BACKUP_V1';
  const HOSTS = ['https://www.pose-ta-brique.fr', 'https://pose-ta-brique.fr'];
  let parentOrigin = '';
  try { const origin = new URL(document.referrer).origin; if (HOSTS.includes(origin)) parentOrigin = origin; } catch (_) {}
  const pending = new Map();
  let memberId = '', enabled = new Set(), busy = false, next = null;
  const button = document.createElement('button');
  button.textContent = 'Sauvegarde compte Wix';
  button.className = 'secondary noPrint';
  button.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:9999;box-shadow:0 3px 18px #0003';
  document.body.appendChild(button);
  const panel = document.createElement('dialog');
  panel.style.cssText = 'max-width:680px;width:90%;max-height:85vh;overflow:auto;border:1px solid #b7d6cf;border-radius:20px;padding:24px;color:#074b55';
  panel.innerHTML = '<h2>Sauvegarde sur mon compte Wix</h2><p>Les copies sur cet appareil et celles sur votre compte sont distinctes. Chaque enregistrement sur le compte conserve une nouvelle version.</p><p id="wixBackupStatus" role="status" aria-live="polite"></p><p><button type="button" data-op="save">Sauvegarder le dossier ouvert sur mon compte</button></p><p><button type="button" data-op="list">Retrouver mes versions sauvegardées</button></p><div id="wixBackupList"></div><p><button type="button" data-op="more" hidden>Voir les versions suivantes</button> <button type="button" data-op="close">Fermer</button></p>';
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
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Wix ne répond pas : sauvegarde sur le compte non confirmée. La copie locale reste disponible.')); }, 25000);
      pending.set(requestId, { resolve, reject, timer });
      window.parent.postMessage({ channel: CHANNEL, requestId, action, body }, parentOrigin);
    });
  }
  async function connect() {
    const result = await request('HELLO');
    if (!result?.ok || result.protocol !== 1 || typeof result.memberId !== 'string') throw new Error('Le raccordement Wix doit être installé ou votre compte doit être connecté.');
    if (memberId && memberId !== result.memberId) {
      enabled = new Set(); memberId = result.memberId;
      panel.querySelector('#wixBackupList').replaceChildren(); next = null;
      panel.querySelector('[data-op="more"]').hidden = true;
      throw new Error('Le compte a changé. Rouvrez la sauvegarde avant de continuer.');
    }
    memberId = result.memberId;
  }
  function localSave() {
    if (!upsertCurrentFile('manual')) throw new Error('Sauvegarde locale impossible. Téléchargez une copie JSON avant de continuer.');
  }
  async function save(ask) {
    await connect();
    const fileId = getCurrentFileId();
    if (ask && !confirm('Envoyer le dossier actuellement ouvert sur votre compte Wix connecté ? Vérifiez que ce dossier appartient bien à ce compte. Les versions précédentes seront conservées.')) return;
    localSave();
    const metadata = state.wixBackup;
    const same = metadata?.memberId === memberId;
    const dossierId = same ? metadata.dossierId : crypto.randomUUID();
    const revision = same ? metadata.revision : 0;
    state.wixBackup = { memberId, dossierId, revision };
    localSave();
    const copy = serializeCurrentState();
    delete copy.wixBackup;
    status('Enregistrement sur le compte en cours…');
    const result = await request('SAVE', { memberId, dossierId, revision, payload: { state: copy } });
    if (!result?.ok) {
      enabled.delete(fileId);
      if (result?.code === 'CONFLICT') throw new Error('Une autre version existe déjà sur le compte. Votre saisie locale est conservée. Retrouvez les versions sauvegardées avant de poursuivre.');
      throw new Error('Sauvegarde sur le compte non confirmée.');
    }
    if (result.dossierId !== dossierId || result.revision !== revision + 1) throw new Error('Réponse de sauvegarde invalide.');
    // Une navigation pendant la requête ne doit jamais modifier le nouveau dossier.
    if (state.fileId === fileId) {
      state.wixBackup = { memberId, dossierId, revision: result.revision };
      localSave(); enabled.add(fileId);
    }
    status('Enregistré et relu sur votre compte — version ' + result.revision + '.');
    showSaveToast('Copie sur le compte Wix confirmée');
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
    status('Copie récupérée sur cet appareil. Utilisez le bouton ci-dessus pour activer sa sauvegarde sur le compte.');
    showSaveToast('Dossier récupéré depuis votre compte Wix');
  }
  async function run(operation) {
    if (busy) return;
    busy = true;
    try { await operation(); } catch (error) { status(error.message); showSaveToast(error.message); }
    finally { busy = false; }
  }
  button.addEventListener('click', () => {
    panel.showModal();
    run(async () => { await connect(); status('Compte connecté. Aucune donnée n’est envoyée sans action de votre part.'); });
  });
  panel.addEventListener('click', event => {
    const op = event.target.dataset.op;
    if (op === 'close') return panel.close();
    if (op === 'save') run(() => save(true));
    if (op === 'list') run(() => list(false));
    if (op === 'more' && next !== null) run(() => list(true));
  });
  const originalSave = saveLocal;
  saveLocal = function () {
    originalSave();
    if (enabled.has(state.fileId)) {
      panel.showModal();
      run(() => save(false));
    }
  };
})();
