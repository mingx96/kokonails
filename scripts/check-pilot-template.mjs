import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fields=Object.freeze(['salonIdentity','locations','servicesAndDurations',
  'resourcesAndCapacity','hoursAndClosures','schedulingBuffers',
  'treatwellBookingLinks','manualReconciliationProcedure']);
const record=value => value !== null && typeof value === 'object' &&
  [Object.prototype,null].includes(Object.getPrototypeOf(value));

/** Intake completeness only. There is deliberately no pilot-ready outcome. */
export function assessPilotIntake(input) {
  const missingFields=[];
  let invalidStructure=false;
  try {
    if(!record(input)) invalidStructure=true;
    else {
      if(Reflect.ownKeys(input).some(key=>!fields.includes(key))) invalidStructure=true;
      for(const field of fields) {
        const descriptor=Object.getOwnPropertyDescriptor(input,field);
        if(!descriptor || !Object.hasOwn(descriptor,'value')) {
          missingFields.push(field);
          if(descriptor) invalidStructure=true;
          continue;
        }
        const value=descriptor.value;
        const plain=record(value);
        if(value!==null && typeof value!=='string' && !Array.isArray(value) && !plain) invalidStructure=true;
        if(value===null || typeof value==='string' && !value.trim() ||
          Array.isArray(value) && !value.length || plain && !Reflect.ownKeys(value).length) missingFields.push(field);
      }
    }
  } catch { invalidStructure=true; }
  if(invalidStructure && !missingFields.length) missingFields.push(...fields);
  return Object.freeze({
    ready:false,
    status:invalidStructure?'BLOCKED_INVALID_CONFIGURATION':missingFields.length?
      'BLOCKED_MISSING_BUSINESS_FACTS':'BLOCKED_UNVERIFIED_BUSINESS_FACTS',
    missingFields:Object.freeze(missingFields),
    invalidStructure,
  });
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  let result;
  try {
    const input=process.argv.length===2?
      JSON.parse(await readFile(new URL('../config/pilot.template.json',import.meta.url),'utf8')):null;
    result=assessPilotIntake(input);
  } catch { result=assessPilotIntake(null); }
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  process.exitCode=1;
}
