(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[234],{408:()=>{},3565:(a,b,c)=>{"use strict";c.r(b),c.d(b,{accounts:()=>v,auditLogs:()=>B,businessMembers:()=>z,businesses:()=>h,chatRooms:()=>i,conversations:()=>o,dailyUsage:()=>q,documents:()=>y,errorLogs:()=>A,faqs:()=>t,filings:()=>r,memos:()=>n,roomBusinesses:()=>k,roomLabels:()=>l,roomMembers:()=>j,roomNotices:()=>m,sessions:()=>p,taxFilings:()=>s,users:()=>g,verificationTokens:()=>w});var d=c(203),e=c(7672),f=c(9359);let g=(0,d.D)("users",{id:(0,e.nd)("id").primaryKey({autoIncrement:!0}),provider:(0,f.Qq)("provider"),provider_id:(0,f.Qq)("provider_id"),name:(0,f.Qq)("name"),real_name:(0,f.Qq)("real_name"),email:(0,f.Qq)("email"),email_verified:(0,f.Qq)("email_verified"),phone:(0,f.Qq)("phone"),profile_image:(0,f.Qq)("profile_image"),approval_status:(0,f.Qq)("approval_status").default("pending"),approved_at:(0,f.Qq)("approved_at"),is_admin:(0,e.nd)("is_admin").default(0),is_owner:(0,e.nd)("is_owner").default(0),staff_role:(0,f.Qq)("staff_role"),name_confirmed:(0,e.nd)("name_confirmed").default(0),birth_date:(0,f.Qq)("birth_date"),company_name:(0,f.Qq)("company_name"),ceo_name:(0,f.Qq)("ceo_name"),business_number:(0,f.Qq)("business_number"),import_batch_id:(0,e.nd)("import_batch_id"),active_merge_id:(0,e.nd)("active_merge_id"),is_likely_merged:(0,e.nd)("is_likely_merged").default(0),deleted_at:(0,f.Qq)("deleted_at"),created_at:(0,f.Qq)("created_at"),last_login_at:(0,f.Qq)("last_login_at"),updated_at:(0,f.Qq)("updated_at")}),h=(0,d.D)("businesses",{id:(0,e.nd)("id").primaryKey({autoIncrement:!0}),company_name:(0,f.Qq)("company_name").notNull(),business_number:(0,f.Qq)("business_number"),sub_business_number:(0,f.Qq)("sub_business_number"),corporate_number:(0,f.Qq)("corporate_number"),ceo_name:(0,f.Qq)("ceo_name"),company_form:(0,f.Qq)("company_form"),business_category:(0,f.Qq)("business_category"),industry:(0,f.Qq)("industry"),industry_code:(0,f.Qq)("industry_code"),tax_type:(0,f.Qq)("tax_type"),address:(0,f.Qq)("address"),phone:(0,f.Qq)("phone"),establishment_date:(0,f.Qq)("establishment_date"),closed_date:(0,f.Qq)("closed_date"),fiscal_year_start:(0,f.Qq)("fiscal_year_start"),fiscal_year_end:(0,f.Qq)("fiscal_year_end"),fiscal_term:(0,e.nd)("fiscal_term"),contract_date:(0,f.Qq)("contract_date"),hr_year:(0,e.nd)("hr_year"),parent_business_id:(0,e.nd)("parent_business_id"),status:(0,f.Qq)("status").default("active"),notes:(0,f.Qq)("notes"),hometax_password_enc:(0,f.Qq)("hometax_password_enc"),import_batch_id:(0,e.nd)("import_batch_id"),deleted_at:(0,f.Qq)("deleted_at"),created_at:(0,f.Qq)("created_at"),updated_at:(0,f.Qq)("updated_at")}),i=(0,d.D)("chat_rooms",{id:(0,f.Qq)("id").primaryKey(),name:(0,f.Qq)("name"),status:(0,f.Qq)("status").default("active"),ai_mode:(0,f.Qq)("ai_mode").default("on"),is_internal:(0,e.nd)("is_internal").default(0),business_id:(0,e.nd)("business_id"),priority:(0,e.nd)("priority").default(0),phone:(0,f.Qq)("phone"),created_by_user_id:(0,e.nd)("created_by_user_id"),created_at:(0,f.Qq)("created_at"),updated_at:(0,f.Qq)("updated_at"),closed_at:(0,f.Qq)("closed_at")}),j=(0,d.D)("room_members",{id:(0,e.nd)("id").primaryKey({autoIncrement:!0}),room_id:(0,f.Qq)("room_id").notNull(),user_id:(0,e.nd)("user_id").notNull(),role:(0,f.Qq)("role").default("member"),visible_since:(0,f.Qq)("visible_since"),joined_at:(0,f.Qq)("joined_at"),left_at:(0,f.Qq)("left_at"),last_read_at:(0,f.Qq)("last_read_at")}),k=(0,d.D)("room_businesses",{id:(0,e.nd)("id").primaryKey({autoIncrement:!0}),room_id:(0,f.Qq)("room_id").notNull(),business_id:(0,e.nd)("business_id").notNull(),is_primary:(0,e.nd)("is_primary").default(0),linked_at:(0,f.Qq)("linked_at"),removed_at:(0,f.Qq)("removed_at")}),l=(0,d.D)("room_labels",{id:(0,e.nd)("id").primaryKey({autoIncrement:!0}),name:(0,f.Qq)("name").notNull(),color:(0,f.Qq)("color"),ord:(0,e.nd)("ord").default(0),created_at:(0,f.Qq)("created_at")}),m=(0,d.D)("room_notices",{id:(0,e.nd)("id").primaryKey({autoIncrement:!0}),room_id:(0,f.Qq)("room_id").notNull(),content:(0,f.Qq)("content"),is_pinned:(0,e.nd)("is_pinned").default(0),created_by_user_id:(0,e.nd)("created_by_user_id"),created_at:(0,f.Qq)("created_at")}),n=(0,d.D)("memos",{id:(0,e.nd)("id").primaryKey({autoIncrement:!0}),target_user_id:(0,e.nd)("target_user_id"),target_business_id:(0,e.nd)("target_business_id"),room_id:(0,f.Qq)("room_id"),memo_type:(0,f.Qq)("memo_type"),category:(0,f.Qq)("category"),content:(0,f.Qq)("content").notNull(),tags:(0,f.Qq)("tags"),attachments:(0,f.Qq)("attachments"),due_date:(0,f.Qq)("due_date"),assigned_to_user_id:(0,e.nd)("assigned_to_user_id"),author_id:(0,e.nd)("author_id"),author_name:(0,f.Qq)("author_name"),is_checked:(0,e.nd)("is_checked").default(0),checked_at:(0,f.Qq)("checked_at"),checked_by:(0,f.Qq)("checked_by"),deleted_at:(0,f.Qq)("deleted_at"),created_at:(0,f.Qq)("created_at"),updated_at:(0,f.Qq)("updated_at")}),o=(0,d.D)("conversations",{id:(0,e.nd)("id").primaryKey({autoIncrement:!0}),session_id:(0,f.Qq)("session_id"),user_id:(0,e.nd)("user_id"),room_id:(0,f.Qq)("room_id"),role:(0,f.Qq)("role").notNull(),content:(0,f.Qq)("content"),confidence:(0,f.Qq)("confidence"),reviewed:(0,e.nd)("reviewed").default(0),reported:(0,e.nd)("reported").default(0),reviewed_by:(0,f.Qq)("reviewed_by"),reviewed_at:(0,f.Qq)("reviewed_at"),document_id:(0,e.nd)("document_id"),unread_count:(0,e.nd)("unread_count"),deleted_at:(0,f.Qq)("deleted_at"),created_at:(0,f.Qq)("created_at")}),p=(0,d.D)("sessions",{token:(0,f.Qq)("token").primaryKey(),user_id:(0,e.nd)("user_id").notNull(),expires_at:(0,f.Qq)("expires_at"),created_at:(0,f.Qq)("created_at"),last_accessed_at:(0,f.Qq)("last_accessed_at")}),q=(0,d.D)("daily_usage",{id:(0,e.nd)("id").primaryKey({autoIncrement:!0}),user_id:(0,e.nd)("user_id").notNull(),date:(0,f.Qq)("date").notNull(),count:(0,e.nd)("count").default(0)}),r=(0,d.D)("filings",{id:(0,e.nd)("id").primaryKey({autoIncrement:!0}),type:(0,f.Qq)("type").notNull(),fiscal_year:(0,e.nd)("fiscal_year").notNull(),owner_type:(0,f.Qq)("owner_type").notNull(),owner_id:(0,e.nd)("owner_id").notNull(),included_business_ids:(0,f.Qq)("included_business_ids"),auto_fields:(0,f.Qq)("auto_fields"),review_status:(0,f.Qq)("review_status").default("작성중"),reviewer_comment:(0,f.Qq)("reviewer_comment"),author_user_id:(0,e.nd)("author_user_id"),reviewer_user_id:(0,e.nd)("reviewer_user_id"),reviewed_at:(0,f.Qq)("reviewed_at"),deleted_at:(0,f.Qq)("deleted_at"),created_at:(0,f.Qq)("created_at"),updated_at:(0,f.Qq)("updated_at")}),s=(0,d.D)("tax_filings",{id:(0,e.nd)("id").primaryKey({autoIncrement:!0}),business_id:(0,e.nd)("business_id"),user_id:(0,e.nd)("user_id"),filing_type:(0,f.Qq)("filing_type"),period_year:(0,e.nd)("period_year"),period_label:(0,f.Qq)("period_label"),due_date:(0,f.Qq)("due_date"),status:(0,f.Qq)("status").default("pending"),amount_estimated:(0,e.nd)("amount_estimated"),amount_actual:(0,e.nd)("amount_actual"),submitted_at:(0,f.Qq)("submitted_at"),notes:(0,f.Qq)("notes"),created_at:(0,f.Qq)("created_at"),updated_at:(0,f.Qq)("updated_at")}),t=(0,d.D)("faqs",{id:(0,e.nd)("id").primaryKey({autoIncrement:!0}),q_number:(0,e.nd)("q_number"),category:(0,f.Qq)("category"),question:(0,f.Qq)("question").notNull(),answer:(0,f.Qq)("answer").notNull(),law_refs:(0,f.Qq)("law_refs"),embedding:(0,f.Qq)("embedding"),active:(0,e.nd)("active").default(1),verified_status:(0,f.Qq)("verified_status"),verified_note:(0,f.Qq)("verified_note"),verified_at:(0,f.Qq)("verified_at"),created_at:(0,f.Qq)("created_at"),updated_at:(0,f.Qq)("updated_at")});var u=c(2321);let v=(0,d.D)("accounts",{userId:(0,e.nd)("user_id").notNull(),type:(0,f.Qq)("type").notNull(),provider:(0,f.Qq)("provider").notNull(),providerAccountId:(0,f.Qq)("provider_account_id").notNull(),refresh_token:(0,f.Qq)("refresh_token"),access_token:(0,f.Qq)("access_token"),expires_at:(0,e.nd)("expires_at"),token_type:(0,f.Qq)("token_type"),scope:(0,f.Qq)("scope"),id_token:(0,f.Qq)("id_token"),session_state:(0,f.Qq)("session_state")},a=>({pk:(0,u.ie)({columns:[a.provider,a.providerAccountId]})})),w=(0,d.D)("verification_tokens",{identifier:(0,f.Qq)("identifier").notNull(),token:(0,f.Qq)("token").notNull(),expires:(0,f.Qq)("expires").notNull()},a=>({pk:(0,u.ie)({columns:[a.identifier,a.token]})}));var x=c(6836);let y=(0,d.D)("documents",{id:(0,e.nd)("id").primaryKey({autoIncrement:!0}),user_id:(0,e.nd)("user_id").notNull(),business_id:(0,e.nd)("business_id"),room_id:(0,f.Qq)("room_id"),doc_type:(0,f.Qq)("doc_type").notNull(),image_key:(0,f.Qq)("image_key").notNull(),ocr_status:(0,f.Qq)("ocr_status").default("pending"),ocr_model:(0,f.Qq)("ocr_model"),ocr_raw:(0,f.Qq)("ocr_raw"),ocr_confidence:(0,x.x)("ocr_confidence"),vendor:(0,f.Qq)("vendor"),vendor_biz_no:(0,f.Qq)("vendor_biz_no"),amount:(0,e.nd)("amount"),vat_amount:(0,e.nd)("vat_amount"),receipt_date:(0,f.Qq)("receipt_date"),category:(0,f.Qq)("category"),category_src:(0,f.Qq)("category_src"),items:(0,f.Qq)("items"),status:(0,f.Qq)("status").default("pending"),approver_id:(0,e.nd)("approver_id"),approved_at:(0,f.Qq)("approved_at"),reject_reason:(0,f.Qq)("reject_reason"),note:(0,f.Qq)("note"),deleted_at:(0,f.Qq)("deleted_at"),created_at:(0,f.Qq)("created_at")}),z=(0,d.D)("business_members",{id:(0,e.nd)("id").primaryKey({autoIncrement:!0}),business_id:(0,e.nd)("business_id").notNull(),user_id:(0,e.nd)("user_id").notNull(),is_primary:(0,e.nd)("is_primary").default(0),role:(0,f.Qq)("role"),created_at:(0,f.Qq)("created_at"),removed_at:(0,f.Qq)("removed_at")}),A=(0,d.D)("error_logs",{id:(0,e.nd)("id").primaryKey({autoIncrement:!0}),source:(0,f.Qq)("source").notNull(),user_id:(0,e.nd)("user_id"),message:(0,f.Qq)("message").notNull(),stack:(0,f.Qq)("stack"),url:(0,f.Qq)("url"),user_agent:(0,f.Qq)("user_agent"),context:(0,f.Qq)("context"),resolved:(0,e.nd)("resolved").default(0),resolved_at:(0,f.Qq)("resolved_at"),resolved_by:(0,e.nd)("resolved_by"),created_at:(0,f.Qq)("created_at")}),B=(0,d.D)("audit_logs",{id:(0,e.nd)("id").primaryKey({autoIncrement:!0}),actor_user_id:(0,e.nd)("actor_user_id").notNull(),actor_role:(0,f.Qq)("actor_role"),action:(0,f.Qq)("action").notNull(),target_type:(0,f.Qq)("target_type"),target_id:(0,e.nd)("target_id"),before:(0,f.Qq)("before"),after:(0,f.Qq)("after"),result:(0,f.Qq)("result").default("success"),error_message:(0,f.Qq)("error_message"),ip:(0,f.Qq)("ip"),user_agent:(0,f.Qq)("user_agent"),created_at:(0,f.Qq)("created_at")})},7032:()=>{},7286:(a,b,c)=>{"use strict";async function d(a){let b=a.model||"gpt-4.1-mini",c=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${a.apiKey}`},body:JSON.stringify({model:b,messages:a.messages,temperature:a.temperature??.3,max_tokens:a.maxTokens??1500})});if(!c.ok){let a=await c.text();throw Error(`OpenAI API error: ${c.status} ${a.slice(0,200)}`)}let d=await c.json();return{content:d.choices[0]?.message?.content||"",tokensUsed:d.usage?.total_tokens,model:d.model}}function e(a){let b=a.match(/\[신뢰도:\s*(높음|보통|낮음)\]\s*$/);return b?{cleaned:a.replace(/\[신뢰도:\s*(높음|보통|낮음)\]\s*$/,"").trim(),confidence:b[1]}:{cleaned:a,confidence:null}}c.d(b,{Ex:()=>g,x8:()=>d,KJ:()=>h,GN:()=>e,D:()=>j,oZ:()=>i,b3:()=>r,Xm:()=>k,Cx:()=>l,uT:()=>m});let f=`
당신은 세무회계 이윤 (대표세무사 이재윤) 의 AI 세무 상담사입니다.

[절대 규칙]
1. 수수료/기장료 금액 절대 언급 금지
2. 다른 세무사 추천 금지
3. 볼드체(**) 금지. 강조는 따옴표("") 또는 대괄호([]) 사용
4. 모르는 답은 "확인이 필요합니다" — 추측 금지 (할루시네이션 차단)
5. 숫자는 법령 조문 또는 국세청 최신 고시 기준 (2026년)

[답변 형식]
- 항상 답변 끝에 [신뢰도: 높음/보통/낮음] 자동 태깅
  \xb7 높음: 법조문 명확 인용 + 최신 고시 기준
  \xb7 보통: 일반 원칙 + 예외 가능성 있음
  \xb7 낮음: 추측 또는 정보 부족 (확인 필요)

[전문 영역]
- 부가세 (1기 1-6월, 2기 7-12월. 신고 4/25, 7/25, 10/25, 1/25)
- 종소세 (5월 1-31일)
- 법인세 (사업연도 종료 후 3개월)
- 원천세, 양도세, 지방세
- 기장 / 신고 / 신고대리

[사장님 정보 — 거래처에게 노출 X]
- 대구 달서구 세무회계 이윤
- 대표세무사: 이재윤
- 사무실: 053-269-1213 (평일 09:00-18:00)
`.trim();function g(a={}){let{userName:b,approvalStatus:c,dailyLimit:d}=a,e="";return b&&(e+=`

[현재 상담자]
이름: ${b}`,c&&(e+=`
상태: ${c}`),d&&d<999999&&(e+=`
일 사용 한도: ${d}건`)),f+e}async function h(a,b){let c=await fetch("https://api.openai.com/v1/embeddings",{method:"POST",headers:{Authorization:`Bearer ${a}`,"Content-Type":"application/json"},body:JSON.stringify({model:"text-embedding-3-small",input:b.slice(0,8e3)})});if(!c.ok)throw Error(`embed failed: ${c.status}`);let d=await c.json();return d.data[0]?.embedding??[]}function i(a,b,c={}){let d=c.k??3,e=c.threshold??.5;return a.map(a=>{let c;if(!a.embedding)return null;try{c=JSON.parse(a.embedding)}catch{return null}return Array.isArray(c)&&0!==c.length?{question:a.question,answer:a.answer,law_refs:a.law_refs??null,score:function(a,b){if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length||0===a.length)return 0;let c=0,d=0,e=0;for(let f=0;f<a.length;f++)c+=a[f]*b[f],d+=a[f]*a[f],e+=b[f]*b[f];let f=Math.sqrt(d)*Math.sqrt(e);return 0===f?0:c/f}(b,c)}:null}).filter(a=>null!==a&&a.score>e).sort((a,b)=>b.score-a.score).slice(0,d)}function j(a){return 0===a.length?"":"\n\n[참고 FAQ — 답변 근거 우선 사용]\n"+a.map((a,b)=>`${b+1}. ${a.question}
   → ${a.answer}${a.law_refs?`
   근거: ${a.law_refs}`:""}`).join("\n\n")}function k(a,b){return a.replace(/#\{([^}]+)\}/g,(a,c)=>b[c.trim()]??"")}async function l(a,b){if(!b.allowAfterHours&&!function(a=new Date){let b=(a.getUTCHours()+9)%24;return b>=8&&b<21}())return{ok:!1,blocked:"08:00~21:00 외 발송 차단"};let c=function(a){if(!a)return null;let b=a.replace(/[^0-9]/g,"");return/^010\d{8}$/.test(b)?b:/^8210\d{8}$/.test(b)?"0"+b.slice(2):null}(a.to);if(!c)return{ok:!1,error:"invalid phone number"};let d=new URLSearchParams({apikey:b.apiKey,senderkey:b.pfId,tpl_code:a.template_code,receiver_1:c,subject_1:a.template_code,message_1:a.message,button_1:a.buttons?JSON.stringify({button:a.buttons}):""});try{let a=await fetch(b.endpoint??"https://kakaoapi.aligo.in/akv10/alimtalk/send/",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:d.toString()}),c=await a.json();if(0!==c.code)return{ok:!1,error:c.message||`code ${c.code}`};return{ok:!0,message_id:c.mid}}catch(a){return{ok:!1,error:a.message}}}async function m(a,b){return Promise.all(a.map(a=>l(a,b)))}let n=[{title:"\uD83E\uDDFE 매출\xb7매입",fields:[{key:"sales_total",label:"매출 합계"},{key:"purchase_total",label:"매입 합계"},{key:"vat_payable",label:"부가세 납부세액"},{key:"taxable_income",label:"과세표준"}]},{title:"\uD83D\uDCBC 인건비",fields:[{key:"payroll_total",label:"인건비 합계"},{key:"withholding_total",label:"원천세 합계"}]},{title:"\uD83D\uDCCA 산출세액",fields:[{key:"computed_tax",label:"산출세액"},{key:"final_tax",label:"결정세액"},{key:"paid_tax",label:"기납부세액"}]}];function o(a){if(!a)return{};if("string"==typeof a)try{return JSON.parse(a)}catch{return{}}return a}function p(a){if(!a)return"-";let b=Number(a);return Number.isFinite(b)?b.toLocaleString():a}function q(a){return a.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function r(a){let{filing:b,previous:c,ownerName:d,reviewerName:e}=a,f=o(b.auto_fields),g=o(c?.auto_fields),h=n.map(a=>{let d=a.fields.map(a=>`
        <tr>
          <td>${q(a.label)}</td>
          <td class="num">${p(g[a.key])}</td>
          <td class="num">${p(f[a.key])}</td>
          <td class="num">${function(a,b){let c=Number(a||0),d=Number(b||0);if(!Number.isFinite(c)||!Number.isFinite(d)||0===d)return"-";let e=(c-d)/Math.abs(d)*100;return .01>Math.abs(e)?"0%":`${e>0?"+":""}${e.toFixed(1)}%`}(f[a.key],g[a.key])}</td>
        </tr>`).join("");return`
    <h3>${q(a.title)}</h3>
    <table>
      <thead>
        <tr>
          <th>항목</th>
          <th class="num">작년 (${c?.fiscal_year??b.fiscal_year-1})</th>
          <th class="num">올해 (${b.fiscal_year})</th>
          <th class="num">증감</th>
        </tr>
      </thead>
      <tbody>${d}</tbody>
    </table>`}).join("\n"),i=`
    <header>
      <h1>${q(b.type)} 신고 검토표 [${b.fiscal_year}귀속]</h1>
      <div class="meta">
        <span>대상: ${q(b.owner_type)} #${b.owner_id}${d?` (${q(d)})`:""}</span>
        <span>상태: ${q(b.review_status||"작성중")}</span>
        ${e?`<span>결재자: ${q(e)}</span>`:""}
      </div>
    </header>`,j=b.reviewer_comment?`<section class="comment">
        <h3>💬 결재자 코멘트</h3>
        <p>${q(b.reviewer_comment)}</p>
      </section>`:"";return`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${q(b.type)} 검토표 — ${b.fiscal_year}귀속</title>
<style>
  body { font-family: 'Noto Sans KR', sans-serif; max-width: 900px; margin: 30px auto; padding: 0 20px; color: #1f2937; }
  header { border-bottom: 3px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px; }
  header h1 { font-size: 22px; margin: 0 0 8px 0; }
  .meta { display: flex; gap: 16px; font-size: 13px; color: #6b7280; flex-wrap: wrap; }
  h3 { font-size: 16px; margin-top: 24px; margin-bottom: 8px; color: #1e40af; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
  th { background: #f3f4f6; font-weight: 600; }
  .num { text-align: right; font-family: 'Roboto Mono', monospace; }
  .comment { margin-top: 32px; background: #fef3c7; padding: 16px; border-radius: 8px; }
  .comment p { margin: 4px 0 0 0; white-space: pre-wrap; font-size: 13px; }
  footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
  @media print { body { margin: 0; } @page { size: A4; margin: 1.5cm; } }
</style>
</head>
<body>
  ${i}
  ${h}
  ${j}
  <footer>세무회계 이윤 — 대표세무사 이재윤 \xb7 대구 달서구 \xb7 053-269-1213</footer>
</body>
</html>`}},9653:(a,b,c)=>{"use strict";c.d(b,{f:()=>f,w:()=>e});var d=c(9132),e=c(3565);function f(a){return(0,d.f)(a,{schema:e})}}}]);
//# sourceMappingURL=234.js.map