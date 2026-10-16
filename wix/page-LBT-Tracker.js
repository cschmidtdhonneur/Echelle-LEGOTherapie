import {
  verifierConnexion, enregistrerDossier, listerDossiers, chargerDossier
} from 'backend/lbtDossiers.web';

$w.onReady(function () {
  const component = $w('#html1');
  let busy = false;
  component.onMessage(async (event) => {
    const message = event.data;
    if (!message || message.channel !== 'PTB_WIX_BACKUP_V1' ||
        typeof message.requestId !== 'string' || message.requestId.length > 80) return;
    // Le gestionnaire est attaché uniquement au composant #html1, dont l'URL
    // doit rester https://cschmidtdhonneur.github.io/Echelle-LEGOTherapie/.
    if (event.origin && event.origin !== 'https://cschmidtdhonneur.github.io') return;
    if (busy) return;
    const methods = {
      HELLO: () => verifierConnexion(),
      SAVE: () => enregistrerDossier(message.body),
      LIST: () => listerDossiers(message.body),
      LOAD: () => chargerDossier(message.body)
    };
    if (!Object.prototype.hasOwnProperty.call(methods, message.action)) return;
    busy = true;
    try {
      const result = await methods[message.action]();
      component.postMessage({ channel: message.channel, requestId: message.requestId, result });
    } catch (error) {
      component.postMessage({ channel: message.channel, requestId: message.requestId,
        error: String(error.message || 'Connexion Wix impossible. Vérifiez votre espace membre.').slice(0, 400) });
    } finally { busy = false; }
  });
});
