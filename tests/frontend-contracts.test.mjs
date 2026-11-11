import { spawnSync } from 'node:child_process';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import ts from 'typescript';

// Execute the real client and runtime modules after TypeScript erasure, with browser I/O mocked.
const dataURL = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
async function client(demo = false) {
  const compile = file => ts.transpileModule(readFileSync(new URL('../src/' + file, import.meta.url),'utf8'), {
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}
  }).outputText.replaceAll('import.meta.env', JSON.stringify({VITE_DEMO_MODE:String(demo)}));
  const runtime = dataURL(compile('lib/runtime.ts'));
  const code = compile('lib/apiClient.ts').replace("from './runtime'", `from '${runtime}'`);
  const api=await import(dataURL(code));
  return {...api,runtime:await import(runtime)};
}
let calls;
beforeEach(() => {
  const values = new Map();
  globalThis.localStorage = {getItem:key=>values.get(key) ?? null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
  globalThis.window = new EventTarget();
  calls=[];
  globalThis.fetch=async (url,options) => {calls.push({url,options}); return new Response(JSON.stringify([]),{status:200});};
  localStorage.setItem('lumeneios_token','access-token');
  localStorage.setItem('lumeneios_current_school','school-test');
});

test('bank requests carry bearer and selected school, without caching keys',async()=>{
  const {apiClient}=await client();
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify([
    {id:'q',text:'Question',type:'mcq',subject_id:'s',correct_answer:'SECRET',marking_rubric:'RUBRIC'}]));};
  const rows=await apiClient.assessments.getQuestionBank('s');
  assert.equal(calls[0].options.headers.Authorization,'Bearer access-token');
  assert.equal(calls[0].options.headers['X-School-Id'],'school-test');
  assert.equal(rows[0].correctAnswer,'SECRET');
  assert.equal(rows[0].markingRubric,'RUBRIC');
  assert.equal(localStorage.getItem('lumeneios_questionBank'),null);
});

test('regeneration sends required subject and frozen authoring context',async()=>{
  const {apiClient}=await client();
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({id:'saved'}));};
  await apiClient.assessments.regenerateQuestion('saved',{subjectId:'math',type:'mcq',competency:'LU',text:'Original'},'Apply');
  const body=JSON.parse(calls[0].options.body);
  assert.equal(body.subject_id,'math');assert.equal(body.question_type,'mcq');assert.equal(body.current_text,'Original');
  assert.equal(body.bloom_level,'Apply');assert.equal(body.custom_instruction,undefined);
});

test('generation maps focus_topic and source_documents to the existing contract',async()=>{
  const {apiClient}=await client();
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({questions:[],source_documents:[{id:'doc'}]}));};
  const res=await apiClient.assessments.generateQuestions({subjectId:'math',sourceDocumentIds:['doc'],mcqCount:1,theoryCount:0,bloomLevel:'Apply',topicHint:'Area'});
  assert.equal(JSON.parse(calls[0].options.body).focus_topic,'Area');
  assert.equal(res.sourceDocumentsUsed[0].id,'doc');
});

test('submission first save omits version and later saves use returned versions',async()=>{
  const {apiClient}=await client();
  await apiClient.homework.save('assignment/1',[{position:1,clear:true}],null);
  assert.equal(JSON.parse(calls[0].options.body).expected_version,undefined);
  assert.match(calls[0].url,/assignment%2F1/);
  await apiClient.homework.save('a',[{position:1,answer_text:'Partial'}],3);
  assert.equal(JSON.parse(calls[1].options.body).expected_version,3);
  await apiClient.homework.submit('a',4);
  assert.deepEqual(JSON.parse(calls[2].options.body),{expected_version:4});
});

test('parent result uses explicit IDs; student result uses the me route',async()=>{
  const {apiClient}=await client();
  await apiClient.homework.parentResult('child/1','a');await apiClient.homework.result('a');
  assert.match(calls[0].url,/parents\/me\/students\/child%2F1\/homework/);
  assert.match(calls[1].url,/students\/me\/homework/);
});

for(const status of [401,403,404,409,422]) test(`HTTP ${status} remains an error, without demo fallback`,async()=>{
  const {apiClient,ApiError}=await client();
  localStorage.setItem('lumeneios_questionBank','SECRET-CACHE');
  globalThis.fetch=async()=>new Response(JSON.stringify({detail:status===422?[{msg:'Invalid position'}]:'Denied'}),{status});
  await assert.rejects(()=>apiClient.assessments.getQuestionBank(),ex=>ex instanceof ApiError && ex.status===status);
  if(status===401) {assert.equal(localStorage.getItem('lumeneios_token'),null);assert.equal(localStorage.getItem('lumeneios_questionBank'),null);}
});

test('explicit demo mode never calls live API',async()=>{
  const {apiClient}=await client(true);
  await assert.rejects(()=>apiClient.assessments.generateQuestions({subjectId:'s',sourceDocumentIds:[],mcqCount:1,theoryCount:0,bloomLevel:'Apply'}),/Offline demonstration/);
  assert.equal(calls.length,0);
});

test('login uses supplied password, clears old teaching cache; logout clears token',async()=>{
  const {apiClient}=await client();
  localStorage.setItem('lumeneios_questionBank','STALE-KEY');
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({access_token:'new-token',user:{id:'user',role:'teacher'}}));};
  await apiClient.auth.login('teacher@example.test','entered-password');
  assert.equal(JSON.parse(calls[0].options.body).password,'entered-password');
  assert.equal(localStorage.getItem('lumeneios_questionBank'),null);
  await apiClient.auth.logout();assert.equal(localStorage.getItem('lumeneios_token'),null);
});


test('live build hosts the main app without the offline DemoApp shell',()=>{
  const dir = new URL('../dist/assets/',import.meta.url);
  assert.ok(existsSync(dir),'Run npm run build before the artifact check');
  const files=readdirSync(dir).filter(name=>name.endsWith('.js'));
  // Offline DemoApp must stay out of the live host bundle (tree-shaken when VITE_DEMO_MODE=false).
  assert.ok(files.every(name=>!name.includes('DemoApp')));
  const bundle=files.map(file=>readFileSync(new URL(file,dir),'utf8')).join('');
  for(const marker of ['Offline demonstration','Loading offline demonstration']) {
    assert.ok(!bundle.includes(marker), `Live bundle contains offline-demo marker: ${marker}`);
  }
  // Differentiated Homework is wired into the host navigation/routes.
  assert.ok(bundle.includes('Differentiated Homework'), 'Live bundle missing Differentiated Homework host tab');
});


test('late responses cannot restore logged-out data or clear a newer account',async()=>{
  const {apiClient,ApiError}=await client();
  let resolve;
  globalThis.fetch=()=>new Promise(done=>{resolve=done;});
  const pending=apiClient.assessments.getQuestionBank();
  localStorage.setItem('lumeneios_token','new-account-token');
  resolve(new Response(JSON.stringify({detail:'expired'}),{status:401}));
  await assert.rejects(()=>pending,ex=>ex instanceof ApiError && ex.status===409);
  assert.equal(localStorage.getItem('lumeneios_token'),'new-account-token');
});


test('live builds fail safely without API configuration',()=>{
  const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{
    cwd:new URL('..',import.meta.url),encoding:'utf8',env:{...process.env,VITE_DEMO_MODE:'false',VITE_API_URL:''}});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Live builds require an explicit VITE_API_URL/);
});


test('demo print templates escape untrusted text before writing HTML',async()=>{
  const {runtime}=await client();
  const result=runtime.escapeHtml('<img src=x onerror="alert(1)"> & rubric');
  assert.ok(!result.includes('<img'));
  assert.match(result,/&lt;img/);assert.match(result,/&quot;/);assert.match(result,/&amp;/);
  for(const file of ['pages/teacher/AssessmentBuilder.tsx','pages/teacher/ScanReview.tsx']) {
    const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
    assert.ok(source.includes('OFFLINE DEMO - synthetic data, not official student results.'));
    assert.ok(!source.includes('${q.text}'));
    assert.ok(!source.includes('${it.fileName}'));
  }
});

test('CSV export renders formula-like content as text',async()=>{
  const {runtime}=await client();
  for(const value of ['=SUM(A1:A2)','+cmd','-cmd','@cmd','  =cmd']) {
    const cell=runtime.csvCell(value);
    assert.equal(cell[0],String.fromCharCode(34));
    assert.equal(cell[1],String.fromCharCode(39));
  }
  assert.equal(runtime.csvCell('Safe'), '"Safe"');
});
