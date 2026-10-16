import { Permissions, webMethod } from 'wix-web-module';
import { currentMember } from 'wix-members-backend';
import wixData from 'wix-data';
import { createHash } from 'crypto';

const COLLECTION = 'LBT_Dossiers_Test';
const READ = { suppressAuth: true, consistentRead: true };
const WRITE = { suppressAuth: true };
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}

async function identity(expected) {
  const member = await currentMember.getMember();
  if (!member?._id || (expected && member._id !== expected)) {
    throw new Error('Compte déconnecté ou modifié. Rechargez la page.');
  }
  return member._id;
}
function dossierId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/i.test(value)) {
    throw new Error('Identifiant de dossier invalide.');
  }
  return value;
}
function recordId(memberId, id, revision) {
  return createHash('sha256').update(JSON.stringify([memberId, id, revision])).digest('hex').slice(0, 32);
}
async function latest(memberId, id) {
  const result = await wixData.query(COLLECTION).eq('memberId', memberId)
    .eq('dossierId', id).descending('revision').limit(1).find(READ);
  return result.items[0] || null;
}
export const verifierConnexion = webMethod(Permissions.SiteMember, async () => ({
  ok: true, memberId: await identity(), protocol: 1
}));

// Une insertion immuable par version : deux écritures concurrentes ne peuvent
// pas écraser la même révision, même entre deux instances du serveur.
export const enregistrerDossier = webMethod(Permissions.SiteMember, async (request) => {
  const memberId = await identity(request?.memberId);
  if (!request?.memberId) throw new Error('Compte attendu manquant.');
  const id = dossierId(request.dossierId);
  const base = request.revision;
  if (!Number.isSafeInteger(base) || base < 0) throw new Error('Révision invalide.');
  const payload = request.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !payload.state?.patient || !Array.isArray(payload.state.evals)) {
    throw new Error('Contenu du dossier invalide.');
  }
  const encoded = JSON.stringify(payload);
  if (Buffer.byteLength(encoded, 'utf8') > 350000) throw new Error('Dossier trop volumineux. Téléchargez une copie JSON.');
  const previous = await latest(memberId, id);
  if ((previous?.revision || 0) !== base) {
    return { ok: false, code: 'CONFLICT', revision: previous?.revision || 0 };
  }
  const revision = base + 1;
  const item = {
    _id: recordId(memberId, id, revision), title: 'Sauvegarde LBT',
    memberId, dossierId: id, revision,
    payload: { state: payload.state, savedAt: new Date().toISOString() }
  };
  try {
    await wixData.insert(COLLECTION, item, WRITE);
  } catch (error) {
    // Un délai réseau ne doit jamais être présenté comme une réussite.
    const now = await latest(memberId, id);
    if ((now?.revision || 0) > base) return { ok: false, code: 'CONFLICT', revision: now.revision };
    throw error;
  }
  const check = await wixData.query(COLLECTION).eq('memberId', memberId)
    .eq('_id', item._id).limit(1).find(READ);
  if (check.items[0]?.revision !== revision || canonical(check.items[0]?.payload) !== canonical(item.payload)) {
    throw new Error('Enregistrement envoyé mais relecture non confirmée. Consultez les versions avant de réessayer.');
  }
  return { ok: true, dossierId: id, revision, savedAt: item.payload.savedAt };
});

export const listerDossiers = webMethod(Permissions.SiteMember, async (request) => {
  const memberId = await identity(request?.memberId);
  if (!request?.memberId) throw new Error('Compte attendu manquant.');
  const skip = request.skip || 0;
  if (!Number.isSafeInteger(skip) || skip < 0) throw new Error('Page invalide.');
  const result = await wixData.query(COLLECTION).eq('memberId', memberId)
    .descending('_createdDate', '_id').skip(skip).limit(50).find(READ);
  return {
    ok: true,
    items: result.items.filter(x => x.payload?.state).map(x => ({
      recordId: x._id, dossierId: x.dossierId, revision: x.revision,
      savedAt: x.payload.savedAt, name: String(x.payload.state.patient?.name || 'Sans nom').slice(0, 150)
    })),
    next: result.hasNext() ? skip + result.items.length : null
  };
});

export const chargerDossier = webMethod(Permissions.SiteMember, async (request) => {
  const memberId = await identity(request?.memberId);
  if (!request?.memberId || typeof request.recordId !== 'string' || !/^[a-f0-9]{32}$/.test(request.recordId)) throw new Error('Demande invalide.');
  const result = await wixData.query(COLLECTION).eq('memberId', memberId)
    .eq('_id', request.recordId).limit(1).find(READ);
  const item = result.items[0];
  if (!item?.payload?.state) throw new Error('Dossier introuvable pour ce compte.');
  const head = await latest(memberId, item.dossierId);
  return { ok: true, dossierId: item.dossierId, revision: item.revision,
    latestRevision: head.revision, payload: item.payload };
});
