import { catalog, createDemoStore } from './booking.mjs';

const $ = (selector, root = document) => root.querySelector(selector);
const form = $('#booking-form');
const receipt = $('#receipt');
const formError = $('#form-error');
const queue = $('#queue');
const role = $('#demo-role');
const teamMessage = $('#team-message');
let store = createDemoStore();
let key = crypto.randomUUID();
let latest = null;

const messages = {
  INVALID_INPUT: 'Bitte die Testangaben prüfen.',
  INVALID_IDEMPOTENCY_KEY: 'Die Anfrage konnte nicht vorbereitet werden. Bitte die Seite neu laden.',
  UNKNOWN_LOCATION: 'Bitte ein gültiges Teststudio auswählen.',
  UNKNOWN_SERVICE: 'Bitte einen gültigen Beispielservice auswählen.',
  UNKNOWN_CUSTOMER: 'Bitte eine synthetische Testperson auswählen.',
  PRIVACY_REQUIRED: 'Bitte den Hinweis zur Testansicht bestätigen.',
  INVALID_DATE: 'Bitte ein gültiges Wunschdatum auswählen.',
  INVALID_TIME: 'Bitte eine gültige Uhrzeit wählen. Mehrdeutige oder ausfallende Zeiten beim Zeitwechsel sind nicht möglich.',
  PAST_TIME: 'Der Terminwunsch muss in der Zukunft liegen (Demo-Zeitzone Europe/Berlin).',
  IDEMPOTENCY_CONFLICT: 'Diese Anfrage-ID wurde bereits mit anderen Angaben verwendet. Bitte die Angaben erneut prüfen.',
  DUPLICATE_REQUEST: 'Für diese Testperson besteht zu dieser Zeit im Teststudio schon eine offene oder bestätigte Anfrage.',
  FORBIDDEN: 'Als Gast hast du keinen Zugriff auf die Demo-Queue. Wähle die Team-Demo-Rolle, um den Ablauf zu testen.',
  NOT_FOUND: 'Die Testanfrage wurde nicht gefunden. Bitte die Testansicht zurücksetzen.',
  INVALID_TRANSITION: 'Diese Anfrage ist bereits abgeschlossen und kann nicht erneut geändert werden.',
  RECONCILIATION_REQUIRED: 'Bitte den simulierten manuellen Treatwell-Abgleich bestätigen und einen Demo-Verweis angeben.',
  RECONCILIATION_MISMATCH: 'Teststudio, Datum und Uhrzeit müssen genau zur Anfrage passen.',
  INVALID_REFERENCE: 'Bitte einen synthetischen Verweis im Format DEMO-12345 verwenden, keine echten Buchungsdaten.',
  REFERENCE_CONFLICT: 'Dieser Demo-Verweis gehört bereits zu einer anderen Anfrage.'
};
const explain = (error) => messages[error.code] || 'Die Testaktion konnte nicht ausgeführt werden. Bitte die Seite neu laden.';
const label = (group, id) => catalog[group].find((item) => item.id === id)?.label || id;
const dateLabel = (date) => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const statusLabels = { PENDING: 'PENDING · Offen', CONFIRMED: 'CONFIRMED · In der Demo bestätigt', DECLINED: 'DECLINED · In der Demo abgelehnt' };

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function showError(node, error) {
  node.textContent = explain(error);
  node.hidden = false;
  node.focus();
}

function context() { return { role: role.value }; }

function updateReceipt(request = latest) {
  if (!request) return;
  latest = request;
  receipt.hidden = false;
  const badge = $('.status', receipt);
  badge.textContent = statusLabels[request.status];
  badge.className = `status ${request.status.toLowerCase()}`;
  $('#receipt-detail').textContent = `${label('locations', request.locationId)} · ${label('services', request.serviceId)} · ${dateLabel(request.date)}, ${request.time} Uhr (Europe/Berlin).`;
  $('#receipt-status').textContent = request.status === 'PENDING'
    ? 'Nächster Schritt: manueller Abgleich durch das Team. Diese Demo verschickt keine Bestätigung.'
    : request.status === 'CONFIRMED'
      ? 'Nur in der Simulation bestätigt. Es existiert kein echter Treatwell-Termin.'
      : 'Der Testwunsch wurde in der Simulation abgelehnt. Es existiert kein echter Termin.';
}

form.addEventListener('input', () => { key = crypto.randomUUID(); formError.hidden = true; });
form.addEventListener('change', () => { key = crypto.randomUUID(); formError.hidden = true; });
form.addEventListener('submit', (event) => {
  event.preventDefault();
  formError.hidden = true;
  const values = new FormData(form);
  const input = {
    locationId: values.get('locationId'), serviceId: values.get('serviceId'),
    customerId: values.get('customerId'), date: values.get('date'), time: values.get('time'),
    privacyAccepted: values.get('privacyAccepted') === 'on'
  };
  const button = $('button[type="submit"]', form);
  button.disabled = true;
  try {
    updateReceipt(store.request(input, key));
    renderQueue();
    receipt.focus();
  } catch (error) { showError(formError, error); }
  finally { button.disabled = false; }
});

function field(labelText, name, type, value) {
  const container = element('div', undefined, 'field');
  const input = document.createElement(type === 'select' ? 'select' : 'input');
  input.id = `${name}-${value.id}`;
  input.name = name;
  input.required = true;
  if (type === 'select') {
    for (const location of catalog.locations) {
      const option = element('option', location.label);
      option.value = location.id;
      input.append(option);
    }
    input.value = value.locationId;
  } else {
    input.type = type;
    if (name === 'matchedDate') input.value = value.date;
    if (name === 'matchedTime') input.value = value.time;
    if (name === 'treatwellReference') {
      input.placeholder = 'DEMO-12345';
      input.pattern = 'DEMO-[A-Za-z0-9](?:[A-Za-z0-9]|-){2,49}';
      input.maxLength = 55;
      input.autocomplete = 'off';
      input.setAttribute('aria-describedby', `reconcile-hint-${value.id}`);
    }
  }
  const inputLabel = element('label', labelText);
  inputLabel.htmlFor = input.id;
  container.append(inputLabel, input);
  return container;
}

function queueItem(request) {
  const article = element('article', undefined, 'queue-item');
  const heading = element('header');
  heading.append(element('h3', label('customers', request.customerId)), element('span', statusLabels[request.status], `status ${request.status.toLowerCase()}`));
  article.append(heading);
  const details = element('dl');
  for (const [title, text] of [
    ['Teststudio', label('locations', request.locationId)], ['Beispielservice', label('services', request.serviceId)],
    ['Wunschzeit', `${dateLabel(request.date)}, ${request.time} Uhr (Europe/Berlin)`], ['Anfrage-ID', request.id]
  ]) details.append(element('dt', title), element('dd', text));
  article.append(details);
  if (request.status !== 'PENDING') {
    article.append(element('p', 'Abgeschlossen in der Simulation. Weitere Statusänderungen sind gesperrt.', 'quiet'));
    return article;
  }
  const actionForm = element('form');
  actionForm.append(element('h4', 'Treatwell-Abgleich simulieren'));
  const hint = element('p', 'Die vorausgefüllten Angaben mit der Testanfrage vergleichen. Dieser Abgleich ist nur eine Simulation und prüft Treatwell nicht.', 'form-note');
  hint.id = `reconcile-hint-${request.id}`;
  actionForm.append(hint, field('Abgeglichenes Teststudio', 'matchedLocationId', 'select', request));
  const row = element('div', undefined, 'field-row');
  row.append(field('Abgeglichenes Datum', 'matchedDate', 'date', request), field('Abgeglichene Uhrzeit', 'matchedTime', 'time', request));
  actionForm.append(row, field('Synthetischer Treatwell-Verweis', 'treatwellReference', 'text', request));
  const checkLabel = element('label', undefined, 'checkbox');
  const check = document.createElement('input');
  check.type = 'checkbox'; check.name = 'manuallyChecked'; check.required = true;
  checkLabel.append(check, element('span', 'Ich habe den manuellen Abgleich von Teststudio, Datum und Uhrzeit in dieser Demo simuliert.'));
  const actions = element('div', undefined, 'form-actions');
  const confirm = element('button', 'In der Demo bestätigen', 'button');
  confirm.type = 'submit';
  const decline = element('button', 'In der Demo ablehnen', 'button secondary');
  decline.type = 'button';
  actions.append(confirm, decline);
  const errorNode = element('p', undefined, 'error');
  errorNode.setAttribute('role', 'alert'); errorNode.tabIndex = -1; errorNode.hidden = true;
  actionForm.append(checkLabel, actions, errorNode);
  function change(action) {
    try {
      const updated = store.transition(request.id, action, context());
      if (latest?.id === updated.id) updateReceipt(updated);
      renderQueue();
      teamMessage.textContent = `${label('customers', request.customerId)}: ${statusLabels[updated.status]}. Keine echte Buchung oder Nachricht.`;
      teamMessage.tabIndex = -1;
      teamMessage.focus();
    } catch (error) { showError(errorNode, error); }
  }
  actionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = new FormData(actionForm);
    change({status:'CONFIRMED', treatwellReference: values.get('treatwellReference'), manuallyChecked: values.get('manuallyChecked') === 'on', matchedLocationId: values.get('matchedLocationId'), matchedDate: values.get('matchedDate'), matchedTime: values.get('matchedTime')});
  });
  decline.addEventListener('click', () => change({status:'DECLINED'}));
  article.append(actionForm);
  return article;
}

function renderQueue() {
  queue.replaceChildren();
  try {
    const requests = store.list(context());
    teamMessage.textContent = requests.length ? `${requests.length} synthetische Anfrage(n) in diesem Tab.` : 'Noch keine Testanfragen. Beginne mit dem Formular oben.';
    for (const request of requests) queue.append(queueItem(request));
  } catch (error) { teamMessage.textContent = explain(error); }
}

role.addEventListener('change', renderQueue);
$('#reset-demo').addEventListener('click', () => {
  store = createDemoStore(); key = crypto.randomUUID(); latest = null;
  form.reset(); receipt.hidden = true; formError.hidden = true; role.value = 'guest';
  renderQueue();
  teamMessage.textContent = 'Alle Testanfragen in diesem Tab wurden zurückgesetzt. Gastrolle aktiv.';
});
const berlinDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
$('#date').min = berlinDate;
renderQueue();
// Enable only after every listener and the initial state are ready. Static HTML
// remains inert when JavaScript is disabled, a dependency fails or setup throws.
$('#booking-submit').type = 'submit';
$('#booking-submit').disabled = false;
$('#booking-controls').disabled = false;
$('#team-controls').disabled = false;
$('#form-availability').textContent = 'Die Demo ist bereit. Testangaben bleiben nur im Arbeitsspeicher dieses Tabs; es wird nichts versendet.';
