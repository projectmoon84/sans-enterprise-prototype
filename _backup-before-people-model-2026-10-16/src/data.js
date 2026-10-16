export const GROUPS=['Federal Division','EMEA Operations'];
export const TEAMS=['Application Security','Cloud Platform','Security Operations','GRC & Audit'];
export const VOUCHERS=['Cyber Defense FY26','Cloud Security FY26','Offensive Ops FY26','Leadership FY26'];
export const ROLES=['Admin','Limited Admin','Viewer'];
export const uid=()=>globalThis.crypto?.randomUUID?.()||`mock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function seed(){
 const portalNames=['Ada Whitfield','Marcus Okonjo','Priya Raman','Tom Halloway','Petra Lindgren','Freya Lindholm','Ines Duarte','Ravi Nair','Omar Haddad'];
 const studentNames=['Ken Adeyemi','Sofia Marchetti','Grace Lindqvist','Nina Petrov','Sam Boateng','Yusuf Demir','Claire Beaumont','Hiro Tanaka','Elin Kowalczyk','Caleb Prieto','Dita Gallo'];
 const portalAccess=['All Vouchers • All Admin Groups • All Teams','4 Vouchers • 2 Admin Groups • 12 Teams','2 Vouchers • 1 Admin Group • 6 Teams','1 Voucher • All Admin Groups • 6 Teams','1 Voucher • 2 Admin Groups • 6 Teams','1 Voucher • All Admin Groups • All Teams','1 Voucher • All Admin Groups • All Teams','All Vouchers • All Admin Groups • All Teams','1 Voucher • All Admin Groups • 4 Teams'];
 const modifiers=['Ada Whitfield','Priya Raman','Ada Whitfield','Ada Whitfield','Marcus Okonjo','Marcus Okonjo','Marcus Okonjo','Priya Raman','Rosa Villanueva'];
 const dates=['Today at 09:12','Today at 08:40','Aug 26 2026','Aug 25 2026','Aug 22 2026','Aug 27 2026','6 days pending','Aug 19 2026','2 days pending'];
 const workRoles=['Security Program Lead','SOC Analyst I','SOC Analyst II','Security Program Lead','SOC Analyst II','SOC Analyst II','Cloud Security Engineer','SOC Analyst II','ICS/OT Security Engineer','',''];
 const studentGroups=[[],[],[],[],[GROUPS[0],GROUPS[1]],[GROUPS[0]],[],[GROUPS[1]],[GROUPS[0]],[],[]];
 const studentTeams=[[TEAMS[0]],[TEAMS[1]],[TEAMS[3]],[TEAMS[0]],[TEAMS[2]],[TEAMS[2]],[],[TEAMS[1]],[],[TEAMS[2]],[TEAMS[2]]];
 const make=(name,i,type)=>({id:uid(),name,email:i===9&&type==='student'?'c.prieto@northwind.example':i===10&&type==='student'?'d.gallo@northwind.example':name.toLowerCase().replaceAll(' ','.')+'@example.com',type,role:type==='portal'?(i===7?'SSO Admin':ROLES[i<4?0:i===4?1:2]):'Student',groups:type==='student'?studentGroups[i]:i===1||i===4?[...GROUPS]:[GROUPS[0]],teams:type==='student'?studentTeams[i]:[...TEAMS],vouchers:type==='portal'&&[0,7].includes(i)?[...VOUCHERS]:[VOUCHERS[i%4]],status:[6,8].includes(i)&&type==='portal'?'Pending invite':'Active',workRole:type==='student'?workRoles[i]:'',updatedAt:i===8?'2026-01-20T09:00:00.000Z':'2026-06-03T09:00:00.000Z',modifiedBy:modifiers[i%9],modifiedDetail:i===8?'SANS · Jan 20, 2026':'Portal Admin · Jun 3, 2026',...(type==='portal'?{accessLabel:portalAccess[i],lastAccess:dates[i]}:{})});
 return {version:1,users:[...portalNames.map((n,i)=>make(n,i,'portal')),...studentNames.map((n,i)=>make(n,i,'student'))],teams:[...TEAMS],groups:[...GROUPS],activity:[]};
}
export function parseCSV(input){
 const rows=[];let row=[],cell='',quoted=false;
 const text=input.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('A quoted field is not closed. Check the CSV and try again.');
 row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 if(rows.length<2)throw Error('Add a header row and at least one student.');
 const headers=rows.shift().map(x=>x.trim().toLowerCase().replace(/[ _-]+/g,''));
 if(!headers.includes('email'))throw Error('Your CSV needs an email column. Download the template for an example.');
 if(rows.length>500)throw Error('This prototype supports up to 500 students per import.');
 return rows.map((r,i)=>{const o={};headers.forEach((h,j)=>o[h]=(r[j]||'').trim());return {id:uid(),row:i+2,name:o.name||'',email:o.email||'',voucher:o.voucher||'',group:o.suborg||o.admingroup||o.group||'',team:o.team||'',workRole:o.workrole||'SOC Analyst I'};});
}
export function validateCandidate(row,existing=[],batch=[],directory={groups:GROUPS,teams:TEAMS}){
 const errors=[];const email=(row.email||'').trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))errors.push('Enter a valid email address');
 if(existing.some(u=>u.email.toLowerCase()===email))errors.push('This email already exists in the portal');
 if(batch.some(u=>u!==row&&u.email?.trim().toLowerCase()===email))errors.push('Duplicate email in this import');
 if(!VOUCHERS.includes(row.voucher))errors.push('Choose a valid voucher');
 if(row.group&&!directory.groups.includes(row.group))errors.push('Choose a valid admin group');
 if(row.team&&!directory.teams.includes(row.team))errors.push('Choose a valid team');
 return errors;
}
export function validateDatabase(data){
 if(data?.version!==1||!Array.isArray(data.users)||!Array.isArray(data.teams)||!Array.isArray(data.groups)||!Array.isArray(data.activity))throw Error('Choose a valid prototype database export.');
 if(data.users.length>5000)throw Error('The database is too large for this prototype.');
 const ids=new Set(),emails=new Set();
 for(const u of data.users){if(typeof u.id!=='string'||ids.has(u.id)||typeof u.name!=='string'||typeof u.email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)||emails.has(u.email.toLowerCase())||!['portal','student'].includes(u.type)||!['Active','Pending invite','Suspended'].includes(u.status)||![u.groups,u.teams,u.vouchers].every(a=>Array.isArray(a)&&a.every(v=>typeof v==='string'))||(u.type==='portal'&&![...ROLES,'SSO Admin'].includes(u.role)))throw Error('The database contains an invalid or duplicate user.');ids.add(u.id);emails.add(u.email.toLowerCase());}
 if(![data.teams,data.groups].every(a=>a.every(v=>typeof v==='string')))throw Error('The database contains invalid teams or groups.');
 if(data.activity.some(a=>!a||typeof a.id!=='string'||typeof a.message!=='string'||!Number.isFinite(Date.parse(a.time))))throw Error('The database contains invalid activity records.');
 if(data.users.some(u=>!Number.isFinite(Date.parse(u.updatedAt))))throw Error('The database contains an invalid modification date.');
 return data;
}
