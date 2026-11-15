import { test, expect } from './fixtures';

// Full live workflow against the isolated synthetic browser server (see playwright.config.ts).
test('teacher creates, reviews, assigns and marks; student saves and submits; parent sees released result', async ({page,request}) => {
  const api='http://127.0.0.1:18080/api/v1';
  page.on('dialog',dialog=>dialog.accept());
  const admin=await request.post(api+'/auth/login',{data:{email:'admin@lumeneios.demo',password:'browser-test-password'}});
  expect(admin.ok()).toBeTruthy();
  const link=await request.post(api+'/student-account-links',{headers:{Authorization:'Bearer '+(await admin.json()).access_token},
    data:{user_id:'user-student-1',student_id:'user-student-1'}});
  expect(link.status()).toBe(201);
  const openHomework=async()=>{
    await page.getByRole('link',{name:'Differentiated Homework',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Differentiated Homework',exact:true})).toBeVisible();
  };
  const login=async(email:string)=>{
    await page.goto('/');
    const account=page.getByRole('button',{name:'Account menu',exact:true});
    const email_=page.getByLabel('Email',{exact:true});
    await expect(account.or(email_)).toBeVisible();  // wait for the session check to finish
    if(await account.isVisible()){
      await account.click();
      await page.getByRole('button',{name:'Sign out',exact:true}).click();
    }
    await page.getByLabel('Email',{exact:true}).fill(email);
    await page.getByLabel('Password',{exact:true}).fill('browser-test-password');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(page.getByRole('button',{name:'Account menu',exact:true})).toBeVisible();
    await openHomework();
  };
  const tab=(name:string)=>page.getByRole('tab',{name}).click();

  // Teacher: question bank authoring (template generation, edit, delete).
  await login('teacher@lumeneios.demo');
  await tab('Question bank');
  await page.getByLabel('Bank subject',{exact:true}).selectOption('sub-math');
  const generatedResponse=page.waitForResponse(r=>r.url().endsWith('/assessments/generate-questions') && r.request().method()==='POST');
  await page.getByRole('button',{name:'Add template question (no AI)',exact:true}).click();
  const generated=(await (await generatedResponse).json()).questions[0];
  await page.getByRole('button',{name:generated.text}).first().click();
  await page.getByRole('textbox',{name:'Question',exact:true}).fill('BROWSER-EDITED-QUESTION');
  await page.getByRole('textbox',{name:'Correct answer',exact:true}).fill('BROWSER-PRIVATE-KEY');
  await page.getByRole('textbox',{name:'Rubric',exact:true}).fill('BROWSER-PRIVATE-RUBRIC');
  await page.getByRole('button',{name:'Save edits',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Question saved.');
  await page.getByRole('button',{name:/BROWSER-EDITED-QUESTION/}).click();
  const deleted=page.waitForResponse(r=>r.url().endsWith('/questions/'+generated.id) && r.request().method()==='DELETE');
  await page.getByRole('button',{name:'Delete',exact:true}).click();
  expect((await deleted).ok()).toBeTruthy();

  // Teacher: pick class/student/subject, see gap analysis, preview, save, edit, approve, assign.
  await tab('1. Create homework');
  await page.getByLabel('Class',{exact:true}).selectOption('class-8a');
  await page.getByLabel('Student',{exact:true}).selectOption({label:'14. Aarav Patel'});
  await expect(page.getByText('Competency gap analysis')).toBeVisible();
  await page.getByLabel('Subject',{exact:true}).selectOption('sub-math');
  await page.getByLabel('Question count',{exact:true}).fill('2');
  await page.getByRole('button',{name:'Preview homework',exact:true}).click();
  await page.getByRole('button',{name:'Save draft for review',exact:true}).click();
  await expect(page.getByRole('heading',{name:/Review draft/})).toBeVisible();
  await page.getByRole('button',{name:'Remove',exact:true}).nth(1).click();
  await expect(page.getByRole('status')).toContainText('Question 2 removed.');
  await page.getByRole('button',{name:'Approve',exact:true}).click();
  await page.getByRole('button',{name:'Assign to student',exact:true}).click();
  await expect(page.getByText('Marking opens after the student submits.')).toBeVisible();

  // Student: partial save, edit, final submit locks answers.
  await login('student@lumeneios.demo');
  await expect(page.getByText('BROWSER-PRIVATE-KEY',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:/1 questions/}).click();
  const radios=page.getByRole('radiogroup',{name:'Answer for question 1'});
  const answer=async(n:number)=>{ if(await radios.count()) await radios.getByRole('radio').nth(n).check();
    else await page.getByRole('textbox',{name:'Answer for question 1'}).fill('Response '+n); };
  await answer(0);
  await page.getByRole('button',{name:'Save progress',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Answers saved.');
  await answer(1);
  await page.getByRole('button',{name:'Submit homework',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Submitted for teacher evaluation.');
  await expect(page.getByRole('button',{name:'Save progress',exact:true})).toHaveCount(0);
  await expect(page.getByText('Your teacher has not released the evaluation yet.')).toBeVisible();

  // Parent: linked child and assignment visible, result not yet released.
  await login('parent@lumeneios.demo');
  await page.getByRole('button',{name:/Aarav Patel/}).click();
  await expect(page.getByText('Result not released yet.')).toBeVisible();

  // Teacher: manual marking, finalize, release.
  await login('teacher@lumeneios.demo');
  await tab('3. Submissions & marking');
  await page.getByRole('button',{name:/user-student-1 - sub-math/}).click();
  await page.getByRole('button',{name:'Start marking',exact:true}).click();
  await expect(page.getByText(/Answer key \(teacher only\)/)).toBeVisible();
  await page.getByLabel('Marks for question 1',{exact:true}).fill('0');
  await page.getByLabel('Feedback for question 1',{exact:true}).fill('BROWSER-TEACHER-FEEDBACK');
  await page.getByRole('button',{name:'Save and finalize',exact:true}).click();
  await page.getByRole('button',{name:'Release results',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Results released.');

  // Parent and student see the released result, never keys or rubrics.
  await login('parent@lumeneios.demo');
  await page.getByRole('button',{name:/Aarav Patel/}).click();
  await page.getByRole('button',{name:'View result',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Released teacher evaluation'})).toBeVisible();
  await expect(page.getByText(/BROWSER-TEACHER-FEEDBACK/)).toBeVisible();
  await expect(page.getByText(/Answer key|Rubric/)).toHaveCount(0);

  await login('student@lumeneios.demo');
  await page.getByRole('button',{name:/1 questions/}).click();
  await expect(page.getByRole('heading',{name:'Released teacher evaluation'})).toBeVisible();
  await expect(page.getByText(/BROWSER-TEACHER-FEEDBACK/)).toBeVisible();
  await expect(page.getByText('BROWSER-PRIVATE-KEY',{exact:true})).toHaveCount(0);
});

// AI question generation UI. The Gemini call is mocked in the browser (no real AI request);
// approval/saving goes to the real isolated backend.
test('teacher generates AI questions, edits, rejects one and saves the approved one', async ({page}) => {
  const fake=(n:number)=>({text:`AI-E2E question ${n}: volume of a 2 m cube?`,question_type:'mcq',options:['4 m³','6 m³','8 m³','12 m³'],
    correct_answer:'8 m³',marking_rubric:'2m for 8 m³.',marks:2,competency:'AU',bloom_level:'Apply',explanation:'V = s³.'});
  let requests=0;
  await page.route('**/assessments/ai/generate-questions',async route=>{
    requests++; const body=route.request().postDataJSON();
    expect(JSON.stringify(body)).not.toMatch(/student|user-/);
    expect(body.avoid_texts).toBeDefined();
    await route.fulfill({json:{provider:'gemini',model:'mock',source:'ai_generated',requested:body.count,generated:body.count,
      attempts:1,received:body.count,checked_against:15,rejected_duplicates:0,rejected_repeats:0,rejected_invalid:0,discarded:0,warnings:[],
      questions:Array.from({length:body.count},(_,i)=>fake(requests*10+i))}});
  });
  await page.goto('/');
  await page.getByLabel('Email',{exact:true}).fill('teacher@lumeneios.demo');
  await page.getByLabel('Password',{exact:true}).fill('browser-test-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('link',{name:'Differentiated Homework',exact:true}).click();
  await page.getByRole('tab',{name:'Question bank'}).click();
  await page.getByLabel('AI subject',{exact:true}).selectOption('sub-math');
  await page.getByLabel('AI topic',{exact:true}).fill('Mensuration');
  await page.getByLabel('AI count',{exact:true}).fill('2');
  await page.getByRole('button',{name:'Generate',exact:true}).click();
  await expect(page.getByText('Gemini generated 2 new question(s).',{exact:false})).toBeVisible();
  await expect(page.getByTestId('ai-provenance')).toContainText('New questions generated just now by gemini / mock');
  await expect(page.getByTestId('ai-provenance')).toContainText('2 of 2 requested');
  await page.getByRole('button',{name:'Reject',exact:true}).nth(1).click();
  await page.getByLabel('AI question 1 text',{exact:true}).fill('AI-E2E EDITED by teacher: volume of a 2 m cube?');
  await page.getByLabel('Option D is correct',{exact:true}).check();
  await page.getByRole('button',{name:'Regenerate all'}).isVisible();
  await page.getByRole('button',{name:'Save 1 approved to question bank',exact:true}).click();
  await expect(page.getByText('1 approved question(s) saved')).toBeVisible();
  const saved=page.getByRole('button',{name:/AI-E2E EDITED by teacher/});
  await expect(saved).toBeVisible();
  await expect(saved).toContainText('AI-generated');
  await saved.click();
  await expect(page.getByRole('textbox',{name:'Correct answer',exact:true})).toHaveValue('12 m³');
  await expect(page.getByRole('button',{name:/AI-E2E question 11/})).toHaveCount(0);
});
