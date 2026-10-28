import { createLabController } from './controller.mjs';

// All commands run in this page's memory. There is no network/API adapter.
const controller = createLabController({delay:() => new Promise(done => setTimeout(done,180))});
const $ = id => document.getElementById(id);
const starts = ['2027-02-18T13:30:00.000Z','2027-02-18T14:30:00.000Z','2027-02-19T13:30:00.000Z','2027-02-20T15:30:00.000Z'];
const locations = [['demo-a','Teststudio A'],['demo-b','Teststudio B']];
const resources = [['resource-a1','Testressource A1'],['resource-a2','Testressource A2'],['resource-b1','Testressource B1']];
const services = {'demo-care':'Nagelpflege (Demo)','demo-colour':'Farblook (Demo)'};
const statuses = {
  PENDING:'Anfrage offen (PENDING)', CONFIRMED:'Nur im Test bestätigt (CONFIRMED)',
  DECLINED:'Anfrage abgelehnt (DECLINED)', CANCELLED:'Im Test storniert (CANCELLED)',
  RESCHEDULED:'Im Test verschoben (RESCHEDULED)',
};
let selectedId = null, detailSignature = '', queueSignature = '', receiptSignature = '', lastError = null;
let ready = false;
let state = controller.getState();
function el(tag,text,className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function instant(value) { return value ? value.slice(0,16).replace('T',' ')+' UTC' : '–'; }
function location(id) { return locations.find(([value]) => value === id)?.[1] || 'Teststudio'; }
function options(select,items,placeholder) {
  if (placeholder) select.append(new Option(placeholder,''));
  for (const [value,label] of items) select.append(new Option(label,value));
}
function selectionReadout(select) {
  // Native selects may clip their chosen label when text is enlarged. Keep the
  // complete value visible without changing the native keyboard interaction.
  const readout=el('p',undefined,'selection-value'); readout.id=select.id+'-selection';
  const update=() => {readout.hidden=!select.value;readout.textContent=select.value?'Auswahl: '+select.selectedOptions[0].textContent:'';};
  select.after(readout);select.addEventListener('change',update);update();
}
function field(form,id,label,items) {
  const wrap = el('div'), caption = el('label',label); caption.htmlFor = id;
  const input = el('select'); input.id = id; input.required = true;
  options(input,items,'Bitte auswählen'); wrap.append(caption,input); selectionReadout(input); form.append(wrap); return input;
}
function refField(form,id,label) {
  const wrap = el('div'), caption = el('label',label); caption.htmlFor = id;
  const input = el('input'); Object.assign(input,{id,type:'text',required:true,pattern:'DEMO-[A-Za-z0-9][A-Za-z0-9\\-]{2,49}',maxLength:55,autocomplete:'off'});
  const hint = el('small','Nur erfundene Referenzen mit DEMO-, z. B. DEMO-TEST001.');
  hint.id = id+'-hint'; input.setAttribute('aria-describedby',hint.id);
  wrap.append(caption,input,hint); form.append(wrap); return input;
}
function check(form,id,label) {
  const caption = el('label',undefined,'check'), input = el('input');
  Object.assign(input,{id,type:'checkbox',required:true}); caption.append(input,document.createTextNode(label)); form.append(caption); return input;
}
function button(label,id,action,className) {
  const node = el('button',label,className); node.type = 'button'; node.id = id;
  if (action) node.addEventListener('click',action);
  return node;
}
function form(id,onSubmit) {
  const node = el('form'); node.id = id;
  node.addEventListener('submit',event => { event.preventDefault(); if (!state.busy) onSubmit(); });
  return node;
}
function submit(node,label,id) {
  const action = button(label,id); action.type = 'submit'; node.append(action);
}
function isStaff() { return typeof state.actorSession === 'string' && state.actorSession.startsWith('fixture-staff-'); }
function isCustomer() { return ['fixture-customer-01','fixture-customer-02'].includes(state.actorSession); }
function errorText(error) {
  return ({
    AUTHENTICATION_REQUIRED:'Die Testsitzung ist ungültig. Wähle eine öffentliche Testrolle.',
    RESOURCE_UNAVAILABLE:'Diese Ansicht ist für die Testrolle und das Teststudio nicht verfügbar. Prüfe beide Auswahlen.',
    INVALID_REQUEST:'Die Eingaben sind unvollständig oder ungültig. Prüfe die markierten Testwerte und DEMO-Referenzen.',
    REQUEST_CONFLICT:'Der Vorgang passt nicht zum aktuellen Teststand. Prüfe Status, Zeitabgleich, Ressource und eindeutige DEMO-Referenzen; aktualisiere die Ansicht bei Bedarf.',
    REQUEST_NOT_ALLOWED:'Der Vorgang ist in diesem Teststand nicht erlaubt. Prüfe die Testuhr, den manuellen Abgleich und das gewählte Änderungsszenario.',
    INTERNAL_ERROR:'Das lokale Labor konnte den Vorgang nicht abschließen. Lade die Seite neu, um alle Testdaten zu verwerfen.',
  })[error.code] || 'Der lokale Testvorgang konnte nicht abgeschlossen werden.';
}
function focus(id) { $(id)?.focus(); }
async function command(work,after) {
  const outcome = await work();
  if (outcome?.ok) after?.(outcome.value);
  return outcome;
}
function describe(parent,booking) {
  parent.append(el('p',statuses[booking.effectiveState] || statuses[booking.status],'status'));
  const dl = el('dl');
  const historical=booking.effectiveState !== booking.status;
  for (const [key,value] of [['Test-ID',booking.id],['Teststudio',location(booking.locationId)],['Testkundin',booking.customerId === 'demo-01'?'Testkundin 01':'Testkundin 02'],['Testleistung',services[booking.serviceId]],[historical?'Ursprünglicher Testzeitpunkt':'Testzeitpunkt',instant(booking.startAt)],[historical?'Ursprüngliche Testreferenz':'Testreferenz',booking.treatwellReference || 'Noch keine'],['Testressource',booking.resourceId || 'Nicht zugeteilt']]) {
    dl.append(el('dt',key),el('dd',value));
  }
  if(booking.effectiveState !== booking.status) dl.append(el('dt','Historische Erstentscheidung'),el('dd',booking.status+' (unverändert)'));
  parent.append(dl);
}
function renderReceipt() {
  const signature = JSON.stringify([state.actorSession,state.receipt]);
  if (signature === receiptSignature) return;
  receiptSignature = signature;
  const receipt = $('receipt'); receipt.replaceChildren(); receipt.hidden = !state.receipt;
  if (!state.receipt) return;
  receipt.append(el('h3',state.receipt.effectiveState !== state.receipt.status?'Historische Testanfrage':'Deine Testanfrage')); describe(receipt,state.receipt);
  if(state.receipt.effectiveState === 'RESCHEDULED') receipt.append(el('p','Diese Angaben gehören zum ursprünglichen Testtermin. Der verknüpfte Ersatztermin ist in der Testteam-Ansicht sichtbar.'));
  receipt.append(el('p',state.receipt.effectiveState === 'PENDING' ? 'Kein Termin reserviert. Wähle eine Testteam-Rolle, um die Anfrage zu prüfen.' : 'Der Status gilt nur im Labor. Es gibt keinen echten Treatwell-Termin und keine Nachricht an Kundinnen.'));
}
function renderQueue() {
  const signature = JSON.stringify([state.actorSession,state.locationId,state.bookings,selectedId,state.error?.code]);
  if (signature === queueSignature) return;
  queueSignature = signature;
  const queue = $('queue'); queue.replaceChildren();
  if (!isStaff()) { queue.append(el('p','Die Teamliste ist erst mit einer Testteam-Rolle sichtbar.','empty')); return; }
  if (!state.bookings.length) {
    queue.append(el('p',state.error?'Die Teamansicht ist nicht verfügbar. Prüfe Testrolle und Teststudio und aktualisiere die Ansicht.':'Hier sind noch keine sichtbaren Testanfragen. Stelle eine Anfrage als Testkundin für dieses Teststudio.','empty')); return;
  }
  for (const booking of state.bookings) {
    const node = button('',`open-${booking.id}`,() => { selectedId=booking.id; detailSignature=''; render(); focus('detail'); },'queue-entry');
    node.dataset.bookingId = booking.id; node.setAttribute('aria-pressed',String(booking.id === selectedId));
    node.append(el('strong',booking.customerId === 'demo-01'?'Testkundin 01':'Testkundin 02'),el('span',instant(booking.startAt)),el('span',services[booking.serviceId]),el('span',statuses[booking.effectiveState],'status'));
    queue.append(node);
  }
}
function renderConfirm(parent,booking) {
  const node = form('confirm-form',() => command(() => controller.confirm(booking.id,{
    resourceId:$('resource').value,manuallyChecked:$('attestation').checked,
    matchedLocationId:$('matched-location').value,matchedStartAt:$('matched-start').value,treatwellReference:$('reference').value,
  }),() => focus('detail')));
  node.className='reconcile'; node.append(el('h4','Manuellen Abgleich simulieren'),el('p','Wähle die im Test abgeglichenen Werte bewusst aus. Ein Häkchen allein bestätigt keine Übereinstimmung.'));
  const group = el('div',undefined,'fields');
  field(group,'resource','Testressource',resources.filter(([id]) => id.startsWith(booking.locationId === 'demo-a'?'resource-a':'resource-b')));
  field(group,'matched-location','Abgeglichenes Teststudio',locations);
  field(group,'matched-start','Abgeglichener Testzeitpunkt (UTC)',starts.map(value => [value,instant(value)]));
  refField(group,'reference','Erfundene Treatwell-Testreferenz'); node.append(group);
  check(node,'attestation','Ich habe den manuellen Abgleich mit dieser Testreferenz bewusst simuliert.');
  submit(node,'Nur im Test bestätigen','confirm'); parent.append(node);
  const decline = button('Anfrage ablehnen','decline',() => command(() => controller.decline(booking.id),() => focus('detail')),'danger');
  const row=el('div',undefined,'action-row'); row.append(decline); parent.append(row);
}
function renderProposal(parent,booking) {
  parent.append(el('h4','Änderung vorschlagen'),el('p','Ein Vorschlag ändert den bestätigten Testtermin noch nicht und hält keinen neuen Platz frei.'));
  const node = form('proposal-form',() => command(() => controller.proposeChange(booking.id,
    $('change-kind').value === 'CANCEL' ? {kind:'CANCEL'} : {kind:'RESCHEDULE',newStartAt:$('new-start').value}),() => focus('detail')));
  const kind=field(node,'change-kind','Art des Vorschlags',[['CANCEL','Stornierung vorschlagen'],['RESCHEDULE','Verschiebung vorschlagen']]);
  const newStart=field(node,'new-start','Neuer Testzeitpunkt (UTC)',starts.map(value => [value,instant(value)]));
  newStart.parentElement.hidden=true; newStart.disabled=true;
  kind.addEventListener('change',() => { const show=kind.value === 'RESCHEDULE'; newStart.parentElement.hidden=!show; newStart.disabled=!show; });
  const hint=el('p',state.scenario === 'locked' ? 'Standard: Änderungen sind gesperrt. Ein Versuch wird vom Vertrag abgelehnt. Für den separaten Mechaniktest kann das Labor mit erfundener Freigabe neu gestartet werden.' : 'Erfundene Freigabe aktiv: nur zum Testen der Mechanik, keine Betriebsregel des Salons.');
  node.append(hint); submit(node,'Änderungsvorschlag prüfen','propose'); parent.append(node);
}
function renderChange(parent,booking,change) {
  const entry=el('section',undefined,'change-entry'); entry.dataset.changeId=change.id;
  const label=change.kind === 'CANCEL'?'Stornierungsvorschlag':'Verschiebungsvorschlag';
  const status={PENDING:'Offen (PENDING)',REJECTED:'Abgelehnt (REJECTED)',APPLIED:'Im Test angewendet (APPLIED)'}[change.status];
  entry.append(el('h4',label),el('p',`${change.id}: ${status}`));
  if (change.newStartAt) entry.append(el('p','Neuer Testzeitpunkt: '+instant(change.newStartAt)));
  if (change.replacementBookingId) {
    entry.append(el('p','Verknüpfter Ersatztermin: '+change.replacementBookingId));
    entry.append(button('Ersatztermin ansehen',`replacement-${change.id}`,() => {selectedId=change.replacementBookingId;detailSignature='';render();focus('detail');},'secondary'));
  }
  if (change.status !== 'PENDING' || booking.effectiveState !== 'CONFIRMED') { parent.append(entry); return; }
  entry.append(el('p','Der bisherige Testtermin bleibt bestehen, bis der Abgleich simuliert und der Vorschlag angewendet wurde.'));
  const node=form('apply-form',() => {
    const body={manuallyChecked:$('change-attestation').checked,matchedLocationId:$('original-location').value,
      matchedOriginalStartAt:$('original-start').value,originalTreatwellReference:$('original-reference').value,changeReference:$('change-reference').value};
    if (change.kind === 'RESCHEDULE') Object.assign(body,{matchedNewStartAt:$('replacement-start').value,resourceId:$('replacement-resource').value,replacementTreatwellReference:$('replacement-reference').value});
    return command(() => controller.applyChange(change.id,body),() => focus('detail'));
  });
  const group=el('div',undefined,'fields');
  field(group,'original-location','Abgeglichenes ursprüngliches Teststudio',locations);
  field(group,'original-start','Abgeglichener ursprünglicher Testzeitpunkt (UTC)',starts.map(value => [value,instant(value)]));
  refField(group,'original-reference','Ursprüngliche Testreferenz'); refField(group,'change-reference','Neue Testreferenz für den Änderungsvorgang');
  if (change.kind === 'RESCHEDULE') {
    field(group,'replacement-start','Abgeglichener neuer Testzeitpunkt (UTC)',starts.map(value => [value,instant(value)]));
    field(group,'replacement-resource','Testressource des Ersatztermins',resources.filter(([id]) => id.startsWith(booking.locationId === 'demo-a'?'resource-a':'resource-b')));
    refField(group,'replacement-reference','Neue Testreferenz des Ersatztermins');
  }
  node.append(group); check(node,'change-attestation','Ich habe den ursprünglichen Termin und diesen Änderungsvorgang mit Testreferenzen bewusst abgeglichen.');
  submit(node,change.kind === 'CANCEL'?'Stornierung nur im Test anwenden':'Verschiebung nur im Test anwenden','apply-change'); entry.append(node);
  const row=el('div',undefined,'action-row');row.append(button('Änderungsvorschlag ablehnen','reject-change',() => command(() => controller.rejectChange(change.id),() => focus('detail')),'danger'));entry.append(row);parent.append(entry);
}
function renderDetail() {
  const booking=isStaff() && state.bookings.find(item => item.id === selectedId);
  const changes=booking ? state.changes.filter(change => change.bookingId === booking.id) : [];
  const signature=JSON.stringify([state.actorSession,state.locationId,booking,changes,state.scenario]);
  if (signature === detailSignature) return;
  detailSignature=signature;
  const parent=$('detail');parent.replaceChildren();
  const heading=el('h3',booking?'Ausgewählte Testanfrage':'Anfrage auswählen');heading.id='detail-title'; parent.append(heading);
  if (!booking) {parent.append(el('p','Wähle einen sichtbaren Eintrag aus der Liste. Neue Anfragen halten keinen Platz frei.'));return;}
  const back=el('a','Zurück zur Liste','back-link');back.href='#queue-title';back.addEventListener('click',event => {event.preventDefault();$('queue-title').tabIndex=-1;focus('queue-title');$('queue-title').scrollIntoView({block:'center'});});parent.append(back);
  describe(parent,booking);
  if (booking.effectiveState === 'PENDING') renderConfirm(parent,booking);
  else if (booking.effectiveState === 'CONFIRMED' && !changes.some(change => change.status === 'PENDING')) renderProposal(parent,booking);
  else if (booking.effectiveState !== 'CONFIRMED') parent.append(el('p','Dieser historische Teststand wird nicht erneut bestätigt oder abgelehnt.'));
  else parent.append(el('p','Änderungsvorschlag offen. Der bisherige Testtermin bleibt bestehen; kein neuer Platz ist reserviert.'));
  for (const change of changes) renderChange(parent,booking,change);
  if (booking.sourceBookingId) parent.append(el('p','Ersatz für den historischen Eintrag '+booking.sourceBookingId+'.'));
}
function render() {
  $('lab-controls').disabled=!ready || state.busy;
  $('actor').value=state.actorSession || 'invalid-fixture'; $('scope-location').value=state.locationId;
  $('activity').textContent=state.busy?'Lokaler Testvorgang läuft. Bitte warten.':'';
  $('lab-controls').setAttribute('aria-busy',String(state.busy));
  $('request-fields').disabled=!isCustomer();
  $('request-form').hidden=!isCustomer();
  $('request-access').textContent=isCustomer()?`Anfrage als Testkundin ${state.actorSession.endsWith('01')?'01':'02'} für ${location(state.locationId)}.`:'Für eine neue Testanfrage oben eine Testkundin wählen.';
  $('staff-access').textContent=isStaff()?`${location(state.locationId)} unter der gewählten Testteam-Rolle. Die Rolle wird bei jedem Vorgang erneut im Fake-Vertrag geprüft.`:'Zum Prüfen einer Anfrage oben eine Testteam-Rolle wählen. Das ist eine öffentliche Simulation, kein geschützter Adminbereich.';
  $('refresh').disabled=!isStaff();
  $('scenario-state').textContent=state.scenario === 'locked'?'Änderungen gesperrt – Betriebsregel noch offen.':'Erfundene Freigabe für Änderungen aktiv. Diese Testregel ist keine Salonfreigabe.';
  const error=$('global-error');error.hidden=!state.error;
  if (state.error) {
    const signature=JSON.stringify(state.error);error.textContent=errorText(state.error);
    if (signature !== lastError && !state.busy) error.focus();lastError=signature;
  } else {error.textContent='';lastError=null;}
  if (!state.bookings.some(booking => booking.id === selectedId)) selectedId=null;
  renderReceipt();renderQueue();renderDetail();
}
// Install every event listener before enabling the static fieldset or submit.
options($('request-start'),starts.map(value => [value,instant(value)]));
selectionReadout($('request-service'));selectionReadout($('request-start'));
$('request-form').addEventListener('submit',event => {event.preventDefault();if(state.busy)return;command(() => controller.request({locationId:state.locationId,serviceId:$('request-service').value,customerId:state.actorSession.endsWith('01')?'demo-01':'demo-02',startAt:$('request-start').value,privacyAccepted:$('request-privacy').checked}),() => focus('receipt'));});
$('actor').addEventListener('change',event => command(() => controller.setActor(event.target.value),() => {
  if(isStaff()) { $('staff-title').tabIndex=-1;focus('staff-title');$('staff-title').scrollIntoView({block:'start'}); }
  else if(isCustomer()) { $('request-title').tabIndex=-1;focus('request-title');$('request-title').scrollIntoView({block:'start'}); }
}));
$('scope-location').addEventListener('change',event => command(() => controller.setLocation(event.target.value),() => focus('scope-location')));
$('refresh').addEventListener('click',() => command(() => controller.refresh(),() => focus('refresh')));
$('reset').addEventListener('click',() => {
  if (!$('reset-ack').checked) { $('reset-ack').focus();$('reset-ack').setCustomValidity('Bestätige zuerst das Löschen aller lokalen Testdaten.');$('reset-ack').reportValidity();return; }
  controller.reset($('scenario').value);selectedId=null;detailSignature='';$('reset-ack').checked=false;render();focus('actor');
});
$('reset-ack').addEventListener('change',() => $('reset-ack').setCustomValidity(''));
controller.subscribe(next => {state=next;render();});
$('request-send').type='submit';
$('boot-message').textContent='Labor bereit. Alle Vorgänge laufen nur im Speicher dieser Seite; Neuladen löscht den Teststand.';
ready=true;
render();
