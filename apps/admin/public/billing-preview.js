/**
 * billing-preview.js — 청구서 시스템 (Template + Instance) 로직.
 * Phase X (2026-05-20): billing-preview.html 분리 — 사장님 명령 '구글 개발자처럼'.
 *
 * 패턴: admin.js 와 동일 (classic script, var/function 글로벌). 
 * billing-calc.ts (TS, src/lib/) 와 별도 — 옛 인프라 = classic JS only.
 * 본적용 (apps/admin) 마이그 시 billing-calc helper 재사용 가능 (DRY).
 *
 * 의존:
 *   - billing-preview.css (스타일 토큰 + 모달 클래스)
 *   - filing-tax-credit-catalog.json (카탈로그 fetch)
 *   - /api/admin-approve / /api/admin-businesses / /api/billing-invoices (fetch)
 */

/* ========== 데이터 ========== */
var TARIFF={
  corp:[[0,400000,0],[100000000,400000,.25],[300000000,900000,.18],[500000000,1260000,.10],[1000000000,1760000,.06],[3000000000,2960000,.03],[5000000000,3560000,.02],[10000000000,4160000,.015],[30000000000,7160000,.01],[100000000000,14160000,.01]],
  indv:[[0,300000,0],[100000000,300000,.25],[300000000,800000,.18],[500000000,1160000,.12],[1000000000,1760000,.06],[2000000000,2360000,.04],[3000000000,2760000,.025]]
};
var SECTIONS={
  corp:{s1:[{name:'제조원가명세서 작성',type:'rate',val:20,desc:'기본보수 × %'},{name:'법인지점 결산 및 합산신고',type:'rate',val:10,desc:'지점당 ×%'},{name:'주식변동상황명세서',type:'unit',val:50000,desc:'변동인원 1인당'},{name:'해외현지법인 명세서',type:'unit',val:300000,desc:'건당'}],s2:[{name:'신용카드 내역 검토',type:'direct',val:0,desc:'직접 입력'},{name:'4대보험 취득·상실',type:'unit',val:10000,desc:'건당'},{name:'연말정산',type:'unit',val:20000,desc:'인당'},{name:'부가세 수정신고',type:'unit',val:50000,desc:'건당'}]},
  indv:{s1:[{name:'복식부기 작성',type:'rate',val:30,desc:'기본보수 × %'},{name:'성실신고 자료 검토',type:'rate',val:15,desc:'기본보수 × %'}],s2:[{name:'신용카드 내역 검토',type:'direct',val:0,desc:'직접 입력'},{name:'4대보험 (자영업자)',type:'unit',val:10000,desc:'건당'},{name:'프리랜서 인적용역',type:'unit',val:30000,desc:'건당'}]}
};
var CATALOG=[];
/* 폴백 = sewmu/public/filing-tax-credit-catalog.json 풀 118개 임베드.
 * fetch 실패해도 다 보임. fetch 성공 시 더 최신 데이터로 교체됨. */
var CATALOG_FALLBACK=[{"code":"SOD_56","name":"배당세액공제","alias":["배당"],"law":"소득세법 56조","cat":"general"},{"code":"JTL_56_2","name":"기장세액공제","alias":["기장"],"law":"조특법 56조의2","cat":"general"},{"code":"JTL_104_8","name":"전자계산서 발급전송세액공제","alias":["전자계산서"],"law":"조특법 104조의8","cat":"general"},{"code":"SOD_57","name":"외국납부세액공제","alias":["외국납부"],"law":"소득세법 57조","cat":"general"},{"code":"SOD_58","name":"재해손실세액공제","alias":["재해손실"],"law":"소득세법 58조","cat":"general"},{"code":"SOD_59","name":"근로소득세액공제","alias":["근로소득"],"law":"소득세법 59조","cat":"general"},{"code":"SOD_59_2","name":"자녀세액공제","alias":["자녀"],"law":"소득세법 59조의2","cat":"general"},{"code":"SOD_59_2_B","name":"출산입양자녀세액공제","alias":["출산","입양"],"law":"소득세법 59조의2","cat":"general"},{"code":"JTL_91_5","name":"연금계좌세액공제(과학기술인공제)","alias":["연금","과학기술인"],"law":"조특법 91조의5","cat":"general"},{"code":"SOD_59_3_A","name":"연금계좌세액공제(퇴직연금)","alias":["퇴직연금","연금"],"law":"소득세법 59조의3","cat":"general"},{"code":"SOD_59_3_B","name":"연금계좌세액공제(연금저축)","alias":["연금저축","연금"],"law":"소득세법 59조의3","cat":"general"},{"code":"JTL_91_18","name":"연금계좌세액공제(ISA만기 연금계좌납입)","alias":["ISA","연금"],"law":"조특법 91조의18","cat":"general"},{"code":"SOD_59_4_A","name":"보장성보험료 세액공제(일반)","alias":["보험","보장성"],"law":"소득세법 59조의4","cat":"special"},{"code":"SOD_59_4_B","name":"보장성보험료 세액공제(장애인)","alias":["보험","장애인"],"law":"소득세법 59조의4","cat":"special"},{"code":"SOD_59_4_C","name":"의료비 세액공제","alias":["의료비"],"law":"소득세법 59조의4","cat":"special"},{"code":"SOD_59_4_D","name":"교육비 세액공제","alias":["교육비"],"law":"소득세법 59조의4","cat":"special"},{"code":"SOD_59_4_E","name":"기부금 세액공제","alias":["기부","기부금"],"law":"소득세법 59조의4","cat":"special"},{"code":"SOD_59_4_F","name":"표준세액공제","alias":["표준"],"law":"소득세법 59조의4","cat":"special"},{"code":"131","name":"중소기업투자세액공제","alias":["중소기업투자"],"law":"조특법 5조","cat":"credit_invest"},{"code":"14Z","name":"상생결제 지급금액 세액공제","alias":["상생결제"],"law":"조특법 7조의4","cat":"credit_invest"},{"code":"14M","name":"대·중소기업 상생협력기금 출연 세액공제","alias":["상생협력기금"],"law":"조특법 8조의3","cat":"credit_invest"},{"code":"18D","name":"협력중소기업 유형고정자산 무상임대 세액공제","alias":["무상임대"],"law":"조특법 8조의3","cat":"credit_invest"},{"code":"18L","name":"수탁기업 설치 시설 세액공제","alias":["수탁기업"],"law":"조특법 8조의3","cat":"credit_invest"},{"code":"18R","name":"교육기관 무상기증 중고자산 세액공제","alias":["무상기증","중고자산"],"law":"조특법 8조의3","cat":"credit_invest"},{"code":"13L","name":"신성장·원천기술 연구개발비 세액공제(최저한세 적용대상)","alias":["신성장","R&D","연구"],"law":"조특법 10조","cat":"credit_rnd"},{"code":"10E","name":"국가전략기술 연구개발비 세액공제(최저한세 적용대상)","alias":["국가전략","R&D"],"law":"조특법 10조","cat":"credit_rnd"},{"code":"13M","name":"일반연구 및 인력개발비 세액공제(최저한세 적용대상)","alias":["일반연구","R&D"],"law":"조특법 10조","cat":"credit_rnd"},{"code":"16A","name":"신성장·원천기술 연구개발비 세액공제(최저한세 적용제외)","alias":["신성장","R&D"],"law":"조특법 10조","cat":"credit_rnd"},{"code":"10D","name":"국가전략기술 연구개발비 세액공제(최저한세 적용제외)","alias":["국가전략","R&D"],"law":"조특법 10조","cat":"credit_rnd"},{"code":"16B","name":"일반연구 및 인력개발비 세액공제(최저한세 적용제외)","alias":["일반연구","R&D"],"law":"조특법 10조","cat":"credit_rnd"},{"code":"176","name":"기술취득 세액공제","alias":["기술취득"],"law":"조특법 12조","cat":"credit_rnd"},{"code":"14T","name":"기술혁신형 합병 세액공제","alias":["기술혁신","합병"],"law":"조특법 12조의3","cat":"credit_rnd"},{"code":"14U","name":"기술혁신형 주식취득 세액공제","alias":["기술혁신","주식취득"],"law":"조특법 12조의4","cat":"credit_rnd"},{"code":"18E","name":"벤처기업 등 출자 세액공제","alias":["벤처","출자"],"law":"조특법 13조의2","cat":"credit_invest"},{"code":"18N","name":"소재·부품·장비 수요기업 공동출자 세액공제","alias":["소부장","수요기업"],"law":"조특법 13조의3","cat":"credit_invest"},{"code":"19P","name":"소재·부품·장비 외국법인 인수 세액공제","alias":["소부장","외국법인"],"law":"조특법 13조의3","cat":"credit_invest"},{"code":"18H","name":"성과공유 중소기업 경영성과급 세액공제","alias":["성과공유","경영성과급"],"law":"조특법 19조","cat":"credit_employee"},{"code":"13W","name":"통합투자세액공제(일반)","alias":["통합투자"],"law":"조특법 24조","cat":"credit_invest"},{"code":"13X","name":"통합투자세액공제(신성장사업화시설)","alias":["통합투자","신성장"],"law":"조특법 24조","cat":"credit_invest"},{"code":"13Y","name":"통합투자세액공제(국가전략기술사업화시설)","alias":["통합투자","국가전략"],"law":"조특법 24조","cat":"credit_invest"},{"code":"1B1","name":"임시 통합투자세액공제(일반)","alias":["임시통합투자"],"law":"조특법 24조","cat":"credit_invest"},{"code":"1B2","name":"임시 통합투자세액공제(신성장사업화시설)","alias":["임시통합투자","신성장"],"law":"조특법 24조","cat":"credit_invest"},{"code":"1B3","name":"임시 통합투자세액공제(국가전략기술사업화시설)","alias":["임시통합투자","국가전략"],"law":"조특법 24조","cat":"credit_invest"},{"code":"18I","name":"초연결네트워크 투자 세액공제","alias":["초연결네트워크"],"law":"조특법 25조의5","cat":"credit_invest"},{"code":"134","name":"연구 및 인력개발설비투자 세액공제","alias":["연구","인력개발설비"],"law":"조특법 25조","cat":"credit_rnd"},{"code":"177","name":"에너지절약시설투자 세액공제","alias":["에너지절약"],"law":"조특법 25조의2","cat":"credit_invest"},{"code":"14A","name":"환경보전시설투자 세액공제","alias":["환경보전"],"law":"조특법 25조의3","cat":"credit_invest"},{"code":"142","name":"근로자복지증진설비투자 세액공제","alias":["근로자복지"],"law":"조특법 25조의4","cat":"credit_employee"},{"code":"136","name":"안전설비투자 세액공제","alias":["안전설비"],"law":"조특법 25조의5","cat":"credit_invest"},{"code":"135","name":"생산성향상시설투자 세액공제","alias":["생산성향상"],"law":"조특법 25조의6","cat":"credit_invest"},{"code":"14B","name":"의약품품질관리개선시설투자 세액공제","alias":["의약품"],"law":"조특법 25조의8","cat":"credit_invest"},{"code":"18B","name":"신성장기술 사업화 시설투자 세액공제","alias":["신성장기술","사업화"],"law":"조특법 25조의9","cat":"credit_invest"},{"code":"18C","name":"영상콘텐츠제작비용 세액공제(기본)","alias":["영상콘텐츠"],"law":"조특법 25조의10","cat":"credit_invest"},{"code":"1B8","name":"영상콘텐츠제작비용 세액공제(추가)","alias":["영상콘텐츠"],"law":"조특법 25조의10","cat":"credit_invest"},{"code":"1B7","name":"문화산업전문회사 출자 세액공제","alias":["문화산업"],"law":"조특법 25조의11","cat":"credit_invest"},{"code":"14N","name":"고용창출투자세액공제","alias":["고용창출투자"],"law":"조특법 26조","cat":"credit_employee"},{"code":"14S","name":"산업수요맞춤형고교 졸업자 병역이행 후 복직 중소기업 세액공제","alias":["병역이행","복직"],"law":"조특법 29조의2","cat":"credit_employee"},{"code":"14X","name":"경력단절여성 고용기업 인건비 세액공제","alias":["경력단절","여성"],"law":"조특법 29조의3","cat":"credit_employee"},{"code":"18J","name":"육아휴직 후 고용유지 인건비 세액공제","alias":["육아휴직"],"law":"조특법 29조의3","cat":"credit_employee"},{"code":"14Y","name":"근로소득 증대 기업 세액공제","alias":["근로소득증대"],"law":"조특법 29조의4","cat":"credit_employee"},{"code":"18A","name":"청년고용증대 세액공제","alias":["청년고용"],"law":"조특법 29조의5","cat":"credit_employee"},{"code":"18F","name":"고용증대 세액공제","alias":["고용증대"],"law":"조특법 29조의7","cat":"credit_employee"},{"code":"18S","name":"통합고용세액공제","alias":["통합고용"],"law":"조특법 29조의8","cat":"credit_employee"},{"code":"1B4","name":"통합고용세액공제(정규직전환)","alias":["통합고용","정규직"],"law":"조특법 29조의8","cat":"credit_employee"},{"code":"1B5","name":"통합고용세액공제(육아휴직복귀)","alias":["통합고용","육아휴직"],"law":"조특법 29조의8","cat":"credit_employee"},{"code":"18K","name":"고용유지 중소기업 세액공제","alias":["고용유지"],"law":"조특법 30조","cat":"credit_employee"},{"code":"14H","name":"정규직근로자 전환 세액공제","alias":["정규직전환"],"law":"조특법 30조의2","cat":"credit_employee"},{"code":"14Q","name":"중소기업 고용증가인원 사회보험료 세액공제","alias":["사회보험료","고용증가"],"law":"조특법 30조의4","cat":"credit_employee"},{"code":"18G","name":"중소기업(고용증가인원) 사회보험료 세액공제","alias":["사회보험료","고용증가"],"law":"조특법 30조의4","cat":"credit_employee"},{"code":"10B","name":"상가임대료 인하 임대사업자 세액공제","alias":["상가임대","인하"],"law":"조특법 96조의3","cat":"credit_invest"},{"code":"18Q","name":"선결제금액 세액공제","alias":["선결제"],"law":"조특법 99조의11","cat":"credit_invest"},{"code":"184","name":"전자신고세액공제(납세의무자)","alias":["전자신고"],"law":"조특법 104조의5","cat":"credit_general"},{"code":"14J","name":"전자신고세액공제(세무대리인)","alias":["전자신고","세무대리"],"law":"조특법 104조의5","cat":"credit_general"},{"code":"14E","name":"제3자물류비용 세액공제","alias":["제3자물류"],"law":"조특법 104조의14","cat":"credit_invest"},{"code":"1B6","name":"해외자원개발투자 과세특례","alias":["해외자원개발"],"law":"조특법 104조의15","cat":"credit_invest"},{"code":"14O","name":"기업의 경기부 설치운영 세액공제","alias":["경기부"],"law":"조특법 104조의20","cat":"credit_invest"},{"code":"14P","name":"석유제품 전자상거래 세액공제","alias":["석유제품","전자상거래"],"law":"조특법 104조의22","cat":"credit_invest"},{"code":"14I","name":"대학 맞춤형 교육비용 세액공제","alias":["대학","맞춤형교육"],"law":"조특법 104조의18","cat":"credit_general"},{"code":"14K","name":"대학 등 기부 설비 세액공제","alias":["대학기부","설비"],"law":"조특법 104조의18","cat":"credit_general"},{"code":"14R","name":"산업수요맞춤형고교 재학생 현장훈련수당 세액공제","alias":["현장훈련수당"],"law":"조특법 104조의18","cat":"credit_employee"},{"code":"18M","name":"우수선화주 인증 국제물류주선업자 세액공제","alias":["선화주","물류주선"],"law":"조특법 104조의27","cat":"credit_invest"},{"code":"10C","name":"용역제공자 과세자료 제출 세액공제","alias":["용역제공자"],"law":"조특법 104조의29","cat":"credit_general"},{"code":"14W","name":"금사업자·스크랩 사업자 수입금액 증가 세액공제","alias":["금사업자","스크랩"],"law":"조특법 122조의4","cat":"credit_invest"},{"code":"14V","name":"금현물시장 금지금 과세특례","alias":["금현물","금지금"],"law":"조특법 126조의7","cat":"credit_invest"},{"code":"11O","name":"창업중소기업 감면(최저한세 적용제외)","alias":["창업중소","창특"],"law":"조특법 6조","cat":"exemption"},{"code":"111","name":"창업중소기업 감면(최저한세 적용대상)","alias":["창업중소","창특"],"law":"조특법 6조","cat":"exemption"},{"code":"174","name":"창업벤처중소기업 감면","alias":["창업벤처","창벤"],"law":"조특법 6조","cat":"exemption"},{"code":"13E","name":"에너지신기술 중소기업 감면","alias":["에너지신기술"],"law":"조특법 6조","cat":"exemption"},{"code":"112","name":"중소기업 특별세액감면","alias":["중특","중소기업특별"],"law":"조특법 7조","cat":"exemption"},{"code":"13J","name":"기술이전 감면","alias":["기술이전"],"law":"조특법 12조","cat":"exemption"},{"code":"13K","name":"기술대여 감면","alias":["기술대여"],"law":"조특법 12조","cat":"exemption"},{"code":"17C","name":"연구개발특구 입주기업 세액감면(최저한세 적용제외)","alias":["연구개발특구"],"law":"조특법 12조의2","cat":"exemption"},{"code":"179","name":"연구개발특구 입주기업 세액감면(최저한세 적용대상)","alias":["연구개발특구"],"law":"조특법 12조의2","cat":"exemption"},{"code":"190","name":"고용창출형 창업기업 감면","alias":["고용창출형창업"],"law":"조특법 30조의2","cat":"exemption"},{"code":"192","name":"사업전환 중소기업 감면","alias":["사업전환"],"law":"조특법 33조의2","cat":"exemption"},{"code":"108","name":"수도권과밀억제권역 밖 이전 중소기업 / 공장 지방이전 세액감면","alias":["지방이전","수도권과밀"],"law":"조특법 63조","cat":"exemption"},{"code":"117","name":"농공단지 입주기업 등 감면","alias":["농공단지"],"law":"조특법 64조","cat":"exemption"},{"code":"11L","name":"사회적기업 감면","alias":["사회적기업"],"law":"조특법 85조의6","cat":"exemption"},{"code":"11M","name":"장애인표준사업장 감면","alias":["장애인표준사업장"],"law":"조특법 85조의6","cat":"exemption"},{"code":"11A","name":"행정중심복합도시·혁신도시 공장이전 감면","alias":["혁신도시","공장이전"],"law":"조특법 85조의2","cat":"exemption"},{"code":"13I","name":"소형주택 임대사업자 감면","alias":["소형주택","임대사업자"],"law":"조특법 96조","cat":"exemption"},{"code":"13N","name":"상가건물 장기임대사업자 감면","alias":["상가건물","장기임대"],"law":"조특법 96조의2","cat":"exemption"},{"code":"11N","name":"위기지역내 창업기업 세액감면(최저한세 적용제외)","alias":["위기지역"],"law":"조특법 99조의9","cat":"exemption"},{"code":"13S","name":"위기지역내 창업기업 세액감면(최저한세 적용대상)","alias":["위기지역"],"law":"조특법 99조의9","cat":"exemption"},{"code":"124","name":"산림개발소득 감면","alias":["산림개발"],"law":"조특법 102조","cat":"exemption"},{"code":"11F","name":"해외진출기업 국내복귀 감면","alias":["국내복귀","해외진출"],"law":"조특법 104조의24","cat":"exemption"},{"code":"181","name":"제주첨단과학기술단지 입주기업 조세감면(최저한세 적용제외)","alias":["제주첨단","제주과기"],"law":"조특법 121조의8","cat":"exemption"},{"code":"182","name":"제주첨단과학기술단지 입주기업 조세감면(최저한세 적용대상)","alias":["제주첨단","제주과기"],"law":"조특법 121조의8","cat":"exemption"},{"code":"197","name":"제주투자진흥지구·제주자유무역지역 입주기업 감면(최저한세 적용제외)","alias":["제주투자진흥","제주자유무역"],"law":"조특법 121조의9","cat":"exemption"},{"code":"13R","name":"제주투자진흥지구·제주자유무역지역 입주기업 감면(최저한세 적용대상)","alias":["제주투자진흥","제주자유무역"],"law":"조특법 121조의9","cat":"exemption"},{"code":"198","name":"기업도시개발사업등 시행자 감면","alias":["기업도시"],"law":"조특법 121조의17","cat":"exemption"},{"code":"11C","name":"아시아문화중심도시 투자진흥지구 입주기업 감면(최저한세 적용제외)","alias":["아시아문화중심도시"],"law":"조특법 121조의20","cat":"exemption"},{"code":"11G","name":"아시아문화중심도시 투자진흥지구 입주기업 감면(최저한세 적용대상)","alias":["아시아문화중심도시"],"law":"조특법 121조의20","cat":"exemption"},{"code":"17A","name":"금융중심지 창업기업 감면(최저한세 적용제외)","alias":["금융중심지"],"law":"조특법 121조의21","cat":"exemption"},{"code":"17B","name":"금융중심지 창업기업 감면(최저한세 적용대상)","alias":["금융중심지"],"law":"조특법 121조의21","cat":"exemption"},{"code":"380","name":"첨단의료복합단지 입주기업 감면(최저한세 적용제외)","alias":["첨단의료"],"law":"조특법 121조의22","cat":"exemption"},{"code":"381","name":"첨단의료복합단지 입주기업 감면(최저한세 적용대상)","alias":["첨단의료"],"law":"조특법 121조의22","cat":"exemption"},{"code":"164","name":"기회발전특구 창업기업등 세액감면","alias":["기회발전특구"],"law":"조특법 121조의33","cat":"exemption"}];
var STAFF=['정은','민지','영철','예슬'];

/* C1 (2026-05-20 재): "거래처(개인) / 사업장(법인)" 명확 분리 (사장님 결정).
 * - person 모드: 사람 검색 → 매핑 사업장 picker (개인사업자 위주)
 * - business 모드: 법인 사업장 직접 검색 (사람 매핑 무관) */
var PERSONS=[];           /* /api/admin-approve fetch (기장거래처 사람) */
var CORPS=[];             /* /api/admin-businesses fetch 후 법인만 필터 */
var SELECTED_PERSON=null; /* 현재 선택된 거래처(사람) 객체 */
var BIZS=[];              /* 발행 대상 사업장 list (사람 모드: 매핑 / 법인 모드: 단건) */
var custMode='person';    /* 'person' | 'business' */
var personStaff='민지';
var selectedBizId=null;
var INV_S2=[];  /* 현재 청구서 적용 Section 2 (활증업무) — {name, val, qty} */
var INV_S3=[];  /* 현재 선택된 거래처의 Section 3 적용분 (검토표 자동흐름 후 사장님 편집) */

/* Phase X Step 4 (2026-05-20): mock INVOICES 폐기 → /api/billing-invoices fetch (실제 D1).
 * 진입 시 loadInvoiceList() 호출 → 응답으로 INVOICES 채움 (빈 list 시작).
 * publish() → POST → 응답 받아 unshift. invPay/Unpay/Staff → PATCH. */
var INVOICES=[];
var INVOICES_LOADED=false;

var curTplForm='corp', TODAY=new Date('2025-05-20');

function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function W(n){return (n||0).toLocaleString('ko-KR')}
function showToast(m){var t=$('toast');t.textContent=m;t.classList.add('show');clearTimeout(t._tm);t._tm=setTimeout(()=>t.classList.remove('show'),2500)}
function statusOf(inv){if(!inv.sent)return{cls:'st-gr',label:'발행X',code:'gr'};if(inv.paid)return{cls:'st-g',label:'🟢 수금',code:'g'};var d=new Date(inv.due);if(d<TODAY)return{cls:'st-r',label:'🔴 미수('+Math.floor((TODAY-d)/86400000)+'일)',code:'r'};return{cls:'st-y',label:'🟡 발송',code:'y'}}
function catLabel(c){return{general:'일반',special:'특별공제',credit_invest:'투자',credit_rnd:'R&D',credit_employee:'고용',credit_general:'일반세액',exemption:'감면'}[c]||c}
function calcBase(amount,form){var t=TARIFF[form];var row=t[0];for(var i=0;i<t.length;i++){if(amount>=t[i][0])row=t[i];else break}return Math.floor((row[1]+(amount-row[0])*((row[2]||0)/100))/1000)*1000}
function calcGain(amt,rule){if(rule==='flat_5')return Math.floor(amt*0.05);if(rule==='progressive_u'){var g=0;if(amt<=5000000)g=amt*0.20;else if(amt<=10000000)g=amt*0.10;else g=amt*0.20;return Math.floor(g)}return 0}

function nav(el){document.querySelectorAll('.sb-i').forEach(b=>b.classList.remove('on'));el.classList.add('on');var v=el.dataset.v;document.querySelectorAll('.view').forEach(s=>s.classList.remove('on'));$('v-'+v).classList.add('on');$('bc').textContent={tpl:'청구서 양식 (템플릿)',list:'청구서 모아보기',cust:'거래처 dashboard — 청구서 발행',manual:'수기 청구서 발행'}[v];if(v==='tpl')renderTpl();if(v==='list'){loadInvoiceList();renderList();}if(v==='cust')renderCust();if(v==='manual')renderManual();window.scrollTo(0,0)}
function filterStaff(){renderList();refreshAlert()}
function pickTpl(el){document.querySelectorAll('#tplTabs .tab').forEach(b=>b.classList.remove('on'));el.classList.add('on');curTplForm=el.dataset.t;$('tplFormLabel').textContent=curTplForm==='corp'?'법인':'개인';renderTpl()}

/* ===== 1. 청구서 양식 (Template) ===== */
function renderTpl(){
  $('catTotal') && ($('catTotal').textContent=CATALOG.length);
  $('tariffBody').innerHTML=TARIFF[curTplForm].map((r,i)=>(
    '<tr><td><div class="inl"><input type="number" value="'+(r[0]/1000000)+'" onchange="setTariff('+i+',0,this.value*1000000)"><span class="unit">백만원</span></div></td>'
    +'<td><input type="number" value="'+r[1]+'" onchange="setTariff('+i+',1,+this.value)"></td>'
    +'<td><div class="inl"><input type="number" step="0.01" value="'+r[2]+'" onchange="setTariff('+i+',2,+this.value)"><span class="unit">%</span></div></td>'
    +'<td><button class="btn-x" onclick="rmTariff('+i+')">✕</button></td></tr>'
  )).join('');
  ['s1','s2'].forEach(key=>{var arr=SECTIONS[curTplForm][key];$(key+'Cnt').textContent=arr.length;$(key+'Body').innerHTML=arr.map((it,i)=>(
    '<tr><td><input type="text" value="'+esc(it.name)+'" onchange="setSec(\''+key+'\','+i+',\'name\',this.value)"></td>'
    +'<td><select class="seld" onchange="setSec(\''+key+'\','+i+',\'type\',this.value)"><option value="rate"'+(it.type==='rate'?' selected':'')+'>rate</option><option value="unit"'+(it.type==='unit'?' selected':'')+'>unit</option><option value="direct"'+(it.type==='direct'?' selected':'')+'>direct</option></select></td>'
    +'<td><input type="number" value="'+it.val+'" onchange="setSec(\''+key+'\','+i+',\'val\',+this.value)"></td>'
    +'<td style="font-size:11px;color:#6B7280">'+esc(it.desc)+'</td>'
    +'<td><button class="btn-x" onclick="rmSec(\''+key+'\','+i+')">✕</button></td></tr>'
  )).join('')});
  renderCatalog(); syncSamplePreview();
}
function setTariff(i,col,v){TARIFF[curTplForm][i][col]=v;showToast('누진표 저장')}
function addTariff(){TARIFF[curTplForm].push([0,0,0]);renderTpl()}
function rmTariff(i){TARIFF[curTplForm].splice(i,1);renderTpl()}
function setSec(k,i,f,v){SECTIONS[curTplForm][k][i][f]=v;showToast(k.toUpperCase()+' 저장')}
function rmSec(k,i){SECTIONS[curTplForm][k].splice(i,1);renderTpl()}
function addSec(k){var d=k==='s1'?'업종/회사별 추가':'활증업무';SECTIONS[curTplForm][k].push({name:'새 항목',type:'unit',val:0,desc:d});renderTpl();showToast('+ '+k.toUpperCase()+' 항목 추가')}

function renderCatalog(){
  var q=($('catSearch').value||'').trim().toLowerCase();var ft=$('catFilt').value,catF=$('catCatF').value;
  var list=CATALOG.filter(c=>{if(!c.applies||!c.applies.includes(curTplForm))return false;if(catF&&c.cat!==catF)return false;if(q){var h=(c.name+' '+c.code+' '+(c.law||'')+' '+(c.alias||[]).join(' ')).toLowerCase();if(!h.includes(q))return false}if(ft==='billable'&&!c.billable)return false;if(ft==='excluded'&&c.billable)return false;return true});
  $('catCnt').textContent=list.length;
  $('catBody').innerHTML=list.map(c=>{
    var rc=c.rule==='flat_5'?'<span class="chip chip-flat">5%</span>':c.rule==='progressive_u'?'<span class="chip chip-u">U자</span>':'<span class="chip chip-none">none</span>';
    var ac=c.applies.length===2?'<span class="chip chip-both">법·개</span>':c.applies[0]==='corp'?'<span class="chip chip-biz">법인만</span>':'<span class="chip chip-indv">개인만</span>';
    return '<tr><td><div style="font-weight:600;color:'+(c.billable?'#0B1F3A':'#9CA3AF')+';font-size:12px">'+esc(c.name)+'</div><div style="font-size:10px;color:#9CA3AF">'+esc(c.code)+'</div></td>'
      +'<td style="font-size:11px;color:#6B7280">'+esc(c.law||'')+'</td>'
      +'<td><span class="cat-cat">'+catLabel(c.cat)+'</span> '+ac+'</td>'
      +'<td><label class="tg"><input type="checkbox" '+(c.billable?'checked':'')+' onchange="catBill(\''+c.code+'\',this.checked)"><span class="tg-s"></span></label></td>'
      +'<td><select class="seld" onchange="catRule(\''+c.code+'\',this.value)" '+(c.billable?'':'disabled')+'><option value="none"'+(c.rule==='none'?' selected':'')+'>none</option><option value="flat_5"'+(c.rule==='flat_5'?' selected':'')+'>5%</option><option value="progressive_u"'+(c.rule==='progressive_u'?' selected':'')+'>U자</option></select> '+rc+'</td>'
      +'</tr>';
  }).join('') || '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--mut)">카탈로그 fetch 중…</td></tr>';
}
function catBill(code,v){var c=CATALOG.find(x=>x.code===code);if(c){c.billable=v;if(!v)c.rule='none';else if(c.rule==='none')c.rule='progressive_u';showToast(c.name+' billable='+v);renderCatalog()}}
function catRule(code,v){var c=CATALOG.find(x=>x.code===code);if(c){c.rule=v;showToast(c.name+' rule='+v)}}

function syncSamplePreview(){
  /* 양식 우측 = 사장님이 변경 가능한 부분만 미리보기 (거래처 데이터는 placeholder) */
  $('tpv-firm').textContent=$('g-firm').value||'세무회계 이윤';
  $('tpv-cpa').textContent=($('g-cpa').value||'이재윤').split('').join(' ');
  $('tpv-subj').textContent=$('g-title').value || '(연도)년 귀속 (세금구분) 신고 및 세무조정 수수료 청구의 건';
  $('tpv-p1').textContent=$('g-p1').value||'';
  $('tpv-p2').textContent=$('g-p2').value||'';
  $('tpv-p3').textContent=$('g-p3').value||'';
  $('tpv-pEnd').textContent=$('g-pEnd').value||'';
  $('tpv-bank').textContent=$('g-bank').value||'';
  $('tpv-acct').textContent=$('g-acct').value||'';
  $('tpv-holder').textContent=$('g-holder').value||'';
  $('tpv-addr').textContent=$('g-addr').value||'';
  $('tpv-tel').textContent=$('g-tel').value||'';
  $('tpv-fax').textContent=$('g-fax').value||'';
}
function saveTpl(){showToast('✅ 양식(템플릿) 저장 — 모든 청구서 즉시 반영')}

/* ===== 2. 청구서 모아보기 ===== */
/* Phase X Step 4 (2026-05-20): /api/billing-invoices GET — D1 의 실제 청구서 list */
async function loadInvoiceList(force){
  if(!force && INVOICES_LOADED) return;
  try{
    var r=await fetch('/api/billing-invoices'+adminKeyQS('?'),{credentials:'include'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    var d=await r.json();
    INVOICES=(d.invoices||[]).map(serverRowToInvoice);
    INVOICES_LOADED=true;
    renderList();
  }catch(e){
    _billingError('loadInvoiceList', e);
    showToast('⚠️ 청구서 list 로드 실패 — '+(e&&e.message));
  }
}

/* Phase X Step 5 (2026-05-20): 통합 에러 로깅 — console.error + error-logs API 1회 (rate-limit) */
var _billingErrorCount={};
function _billingError(op, err){
  console.error('[billing] '+op+' 실패:', err);
  /* op 별 1회만 보고 (스팸 방지) */
  if(_billingErrorCount[op]) return;
  _billingErrorCount[op]=1;
  try{
    fetch('/api/admin-error-log'+adminKeyQS('?'),{
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        source:'billing-preview',
        message:op+' failed: '+(err&&err.message||String(err)),
        level:'error',
        url:location.href,
      }),
    }).catch(()=>{});
  }catch(_){}
}
/* D1 row → 클라이언트 invoice 객체 (UI 호환) */
function serverRowToInvoice(row){
  return {
    id: row.id,
    cust: row.business_name || row.user_name || '(이름없음)',
    business_id: row.business_id,
    user_id: row.user_id,
    taxType: row.tax_type || '종소세',
    yr: row.year || new Date().getFullYear(),
    iDate: (row.created_at||'').slice(0,10),
    due: row.sent_at ? (row.sent_at.slice(0,10)) : '',
    amount: row.total_fee || 0,
    sent: row.status==='sent' || row.status==='paid',
    paid: row.status==='paid',
    paidAt: (row.paid_at||'').slice(0,10),
    staff: row.staff_name || personStaff,
    override: !!row.staff_override,
    _server: row
  };
}
function refreshAlert(){var gs=$('globStaff').value;var mis=INVOICES.filter(i=>{if(gs&&i.staff!==gs)return false;return statusOf(i).code==='r'});var t=mis.reduce((a,i)=>a+i.amount,0);$('alertN').textContent=mis.length;$('alertW').textContent=W(t);$('alertBox').style.display=mis.length?'flex':'none';$('cnt-mis').textContent=mis.length}
function renderList(){refreshAlert();var yr=$('lYr').value,tax=$('lTax').value,staff=$('lStaff').value,state=$('lState').value,q=($('lQ').value||'').trim(),gs=$('globStaff').value;
  var filt=INVOICES.filter(i=>{if(yr&&String(i.yr)!==yr)return false;if(tax&&i.taxType!==tax)return false;if(staff&&i.staff!==staff)return false;if(gs&&i.staff!==gs)return false;if(q&&i.cust.indexOf(q)<0)return false;if(state&&statusOf(i).code!==state)return false;return true});
  $('listCnt').textContent=filt.length;
  var byS={};filt.forEach(i=>{(byS[i.staff]=byS[i.staff]||[]).push(i)});
  var order=Object.keys(byS).sort((a,b)=>byS[b].length-byS[a].length);
  var html='';
  order.forEach(s=>{var arr=byS[s];var misN=arr.filter(i=>statusOf(i).code==='r').length;var sum=arr.reduce((a,i)=>a+i.amount,0);
    html+='<tr><td colspan="9" class="gh">👤 <b>'+esc(s)+'</b> 담당 <span class="gh-cnt">('+arr.length+'건'+(misN?' · 미수 '+misN:'')+')</span><span class="gh-sum">합계 '+W(sum)+'원</span></td></tr>';
    arr.forEach(i=>{var st=statusOf(i);
      html+='<tr onclick="openCustFromList()" style="cursor:pointer">'
        +'<td><b style="color:var(--ink)">'+esc(i.cust)+'</b></td>'
        +'<td><span class="chip '+(i.taxType==='법인세'?'chip-biz':i.taxType==='종소세'?'chip-indv':'chip-flat')+'">'+esc(i.taxType)+'</span></td>'
        +'<td style="color:#6B7280">'+esc(i.iDate.slice(2).replace(/-/g,'.'))+'</td>'
        +'<td style="color:#6B7280">'+esc(i.due.slice(2).replace(/-/g,'.'))+'</td>'
        +'<td style="font-weight:700;color:var(--ink)">'+W(i.amount)+'원</td>'
        +'<td><span class="st '+st.cls+'">'+st.label+'</span></td>'
        +'<td style="color:#6B7280">'+(i.paidAt?esc(i.paidAt.slice(2).replace(/-/g,'.')):'—')+'</td>'
        +'<td><select class="seld '+(i.override?'over':'')+'" onchange="invStaffChange(event,'+i.id+',this.value)" onclick="event.stopPropagation()">'+STAFF.map(s2=>'<option'+(s2===i.staff?' selected':'')+'>'+s2+'</option>').join('')+'</select></td>'
        +'<td>'+(i.paid?'<button class="btn-x" style="border-color:#10B981;color:#10B981;border-style:solid" onclick="invUnpay(event,'+i.id+')">↶</button>':'<button class="btn-primary btn" style="font-size:11px;padding:4px 8px" onclick="invPay(event,'+i.id+')">✓ 수금</button>')+'</td>'
        +'</tr>';
    });
  });
  if(!filt.length)html='<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--mut)">조건 없음</td></tr>';
  $('listBody').innerHTML=html;
}
/* Phase X Step 4 (2026-05-20): 상태 변경 — PATCH /api/billing-invoices?id=N */
async function patchInvoice(id, body, optimisticFn, optimisticUndoFn){
  /* optimistic UI 갱신 */
  if(typeof optimisticFn==='function') optimisticFn();
  renderList();
  try{
    var r=await fetch('/api/billing-invoices?id='+id+adminKeyQS('&'),{
      method:'PATCH', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
    });
    if(!r.ok) throw new Error('HTTP '+r.status);
    var d=await r.json();
    if(!d.ok) throw new Error(d.error||'PATCH failed');
  }catch(e){
    _billingError('PATCH', e);
    showToast('⚠️ 저장 실패 (rollback) — '+(e&&e.message));
    if(typeof optimisticUndoFn==='function') optimisticUndoFn();
    renderList();
  }
}
function invPay(e,id){
  e.stopPropagation();
  var i=INVOICES.find(x=>x.id===id); if(!i) return;
  if(i._manual){ i.paid=true; i.paidAt=new Date().toISOString().slice(0,10); renderList(); showToast('🟢 '+i.cust+' 수금 (수기, in-memory)'); return; }
  var prev={paid:i.paid, paidAt:i.paidAt};
  patchInvoice(id, {status:'paid'},
    ()=>{ i.paid=true; i.paidAt=new Date().toISOString().slice(0,10); showToast('🟢 '+i.cust+' 수금'); },
    ()=>{ i.paid=prev.paid; i.paidAt=prev.paidAt; });
}
function invUnpay(e,id){
  e.stopPropagation();
  var i=INVOICES.find(x=>x.id===id); if(!i) return;
  if(i._manual){ i.paid=false; i.paidAt=''; renderList(); showToast('미수로 (수기)'); return; }
  var prev={paid:i.paid, paidAt:i.paidAt};
  patchInvoice(id, {status:'sent', paid_at:''},
    ()=>{ i.paid=false; i.paidAt=''; showToast('미수로'); },
    ()=>{ i.paid=prev.paid; i.paidAt=prev.paidAt; });
}
function invStaffChange(e,id,v){
  e.stopPropagation();
  var i=INVOICES.find(x=>x.id===id); if(!i) return;
  if(i._manual){ i.staff=v; i.override=true; renderList(); showToast('💡 '+i.cust+' 담당자 → '+v+' (수기)'); return; }
  var prev={staff:i.staff, override:i.override};
  patchInvoice(id, {staff_override:true, note:'staff:'+v},
    ()=>{ i.staff=v; i.override=true; showToast('💡 '+i.cust+' 담당자 → '+v); },
    ()=>{ i.staff=prev.staff; i.override=prev.override; });
}
function openCustFromList(){nav(document.querySelector('[data-v=cust]'));showToast('📂 거래처 dashboard 로 — 거기서 청구서 발행')}

/* ===== 3. 거래처 dashboard — 청구서 발행 (C1: 진짜 거래처 fetch) ===== */
function renderCust(){
  /* 첫 진입 — PERSONS 비었으면 fetch */
  if(!PERSONS.length) loadCustList();
  /* 이미 선택된 사람 있으면 헤더 렌더 + 사업장 picker */
  if(SELECTED_PERSON){
    renderCustHeader();
    renderBizPicker();
  } else {
    /* 사람 미선택 — 검색 결과만 표시 */
    searchCustList();
  }
}

/* C1: 거래처 + 사업장 fetch — URL 의 ?key= 자동 첨부 + same-origin cookie. 사장님 admin.html?key=X 흐름 호환. */
function adminKeyQS(prefix){
  try{ var k=new URLSearchParams(location.search).get('key'); return k?(prefix||'&')+'key='+encodeURIComponent(k):''; }catch(_){return ''}
}
async function loadCustList(force){
  if(!force && PERSONS.length && CORPS.length) return;
  var cnt=$('custLoadCnt'); if(cnt) cnt.textContent='로드 중…';
  /* 사람 + 사업장 병렬 fetch. 사업장은 법인만 필터. */
  var personPromise=fetch('/api/admin-approve?status=approved_client'+adminKeyQS('&'),{credentials:'include'}).then(r=>r.ok?r.json():Promise.reject('HTTP '+r.status));
  var bizPromise=fetch('/api/admin-businesses'+adminKeyQS('?'),{credentials:'include'}).then(r=>r.ok?r.json():Promise.reject('HTTP '+r.status));
  try{
    var [pd,bd]=await Promise.all([personPromise,bizPromise]);
    PERSONS=(pd.users||[]).filter(u=>Number(u.is_admin)!==1);
    var allBiz=(bd.businesses||[]).filter(b=>!b.deleted_at);
    /* 법인 필터: company_form 이 '법인'/'corp' 이거나 회사명에 '(주)' '주식회사' 등 포함 */
    var isCorp=function(b){
      var f=String(b.company_form||'').toLowerCase();
      if(f==='법인'||f==='corp'||f==='corporation') return true;
      var nm=String(b.company_name||'');
      return /\(주\)|㈜|주식회사|유한회사|합자회사|합명회사/.test(nm);
    };
    CORPS=allBiz.filter(isCorp).map(b=>({
      id:b.id,
      name:b.company_name||'(이름없음)',
      form:'법인',
      taxType:b.tax_type||'법인세',
      ceo:b.ceo_name||'',
      bizNum:b.business_number||'',
      raw:b,
      staff:null,override:false,
      ext:{rev:0,asset:0,bizup:'기타',bt:'법인장부대행 및 법인조정',s3FromReview:[]}
    }));
    updateLoadCnt();
    searchCustList();
  }catch(e){
    var em=(e&&e.message)||String(e);
    if(cnt) cnt.textContent='⚠️ 로드 실패 ('+em+')';
    $('custResults').innerHTML='<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--mut);font-size:13px;line-height:1.6">API 응답 실패 ('+esc(em)+').<br><br>👉 <b>URL 끝에 <code>?key=YOUR_ADMIN_KEY</code> 붙여서 진입</b><br><span style="font-size:11.5px">예: /billing-preview.html?key=1111</span></div>';
  }
}

function updateLoadCnt(){
  var cnt=$('custLoadCnt'); if(!cnt) return;
  cnt.textContent='거래처(개인) '+PERSONS.length+'명 · 사업장(법인) '+CORPS.length+'개';
}

function setCustMode(mode){
  custMode=mode;
  document.querySelectorAll('#custModeTabs .tab').forEach(b=>b.classList.toggle('on',b.dataset.mode===mode));
  var box=$('custSearchBox');
  box.placeholder=mode==='person'?'거래처 검색 (이름·전화, 예: 박수현, 010-1234)':'법인 검색 (회사명·사업자번호·대표자, 예: (주)고성, 1234567890)';
  box.value='';
  searchCustList();
}

function searchCustList(){
  var q=($('custSearchBox').value||'').trim().toLowerCase();
  if(custMode==='business'){
    var list=CORPS.filter(b=>{
      if(!q) return true;
      var h=((b.name||'')+' '+(b.bizNum||'')+' '+(b.ceo||'')).toLowerCase();
      return h.indexOf(q)>=0;
    }).slice(0,200);
    if(!list.length){
      $('custResults').innerHTML='<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--mut);font-size:12.5px">'+(CORPS.length?'검색 결과 없음':'법인 로드 중…')+'</div>';
      return;
    }
    $('custResults').innerHTML=list.map(b=>{
      return '<button onclick="pickBiz('+b.id+')" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;cursor:pointer;text-align:left;font-family:inherit">'
        +'<span style="width:30px;height:30px;border-radius:8px;background:#FEF3C7;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">🏢</span>'
        +'<span style="min-width:0;overflow:hidden"><div style="font-weight:700;font-size:12.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(b.name)+'</div>'
        +'<div style="font-size:10px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">법인 · '+esc(b.taxType)+(b.ceo?' · '+esc(b.ceo):'')+(b.bizNum?' · '+esc(b.bizNum):'')+'</div></span>'
        +'</button>';
    }).join('');
    return;
  }
  /* person mode */
  var list=PERSONS.filter(u=>{
    if(!q) return true;
    var h=((u.real_name||'')+' '+(u.name||'')+' '+(u.phone||'')+' '+(u.email||'')).toLowerCase();
    return h.indexOf(q)>=0;
  }).slice(0,200);
  if(!list.length){
    $('custResults').innerHTML='<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--mut);font-size:12.5px">'+(PERSONS.length?'검색 결과 없음':'거래처 로드 중…')+'</div>';
    return;
  }
  $('custResults').innerHTML=list.map(u=>{
    var nm=u.real_name||u.name||'(이름없음)';
    var ph=u.phone||'';
    var ini=(nm||'?').charAt(0);
    return '<button onclick="pickCust('+u.id+')" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;cursor:pointer;text-align:left;font-family:inherit">'
      +'<span style="width:30px;height:30px;border-radius:50%;background:#EEF2F7;color:var(--navy);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0">'+esc(ini)+'</span>'
      +'<span style="min-width:0;overflow:hidden"><div style="font-weight:700;font-size:13px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(nm)+'</div>'
      +'<div style="font-size:10.5px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(ph||'전화 미등록')+'</div></span>'
      +'</button>';
  }).join('');
}

/* 법인 모드: 직접 선택 → 사람 매핑 없어도 즉시 청구 (법인세 대상) */
function pickBiz(bid){
  var b=CORPS.find(x=>x.id===bid); if(!b) return;
  SELECTED_PERSON=null;
  BIZS=[b];
  selectedBizId=bid;
  $('custPersonPicker').style.display='none';
  $('custSelectedHeader').style.display='block';
  $('custH1').textContent='🏢 '+b.name+' — 청구서 발행';
  $('custAvatar').textContent='🏢';
  $('custName').textContent=b.name;
  $('custMeta').textContent='법인 · '+b.taxType+(b.ceo?' · '+b.ceo+' 대표':'')+(b.bizNum?' · '+b.bizNum:'');
  $('custStaff').value=personStaff;
  renderBizPicker();
  /* 청구 이력 mock (C3 에서 진짜 fetch) */
  var hist=INVOICES.filter(i=>i.cust.indexOf(b.name)>=0);
  $('psHist').innerHTML=hist.length?hist.map(i=>{var st=statusOf(i);return '<tr><td><b>'+esc(i.cust)+'</b></td><td><span class="chip '+(i.taxType==='법인세'?'chip-biz':'chip-indv')+'">'+esc(i.taxType)+'</span></td><td style="color:#6B7280">'+esc(i.iDate.slice(2).replace(/-/g,'.'))+'</td><td style="font-weight:700">'+W(i.amount)+'원</td><td><span class="st '+st.cls+'">'+st.label+'</span></td><td><b>'+esc(i.staff)+'</b></td></tr>'}).join(''):'<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--mut);font-size:12px">청구 이력 없음 (C3 에서 /api/billing-invoices fetch 연결)</td></tr>';
}

async function pickCust(uid){
  var u=PERSONS.find(p=>p.id===uid); if(!u) return;
  SELECTED_PERSON=u;
  $('custPersonPicker').style.display='none';
  $('custSelectedHeader').style.display='block';
  $('bizPanel').style.display='none';  /* 사업장 선택까지는 발행 패널 숨김 */
  $('bizPicker').innerHTML='사업장 fetch 중…';
  renderCustHeader();
  /* 매핑 사업장 fetch */
  try{
    var r=await fetch('/api/admin-businesses?user_id='+uid+adminKeyQS('&'),{credentials:'include'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    var d=await r.json();
    BIZS=(d.businesses||[]).filter(b=>!b.deleted_at).map(b=>({
      id:b.id,
      name:b.company_name||'(이름없음)',
      form: (b.company_form==='법인'||b.company_form==='corp')?'법인':'개인사업자',
      taxType: b.tax_type || ((b.company_form==='법인'||b.company_form==='corp')?'법인세':'종소세'),
      staff:null, override:false,
      ext:{rev:0,asset:0,bizup:'기타',bt:((b.company_form==='법인'||b.company_form==='corp')?'법인장부대행 및 법인조정':'개인장부대행 및 개인조정'),s3FromReview:[]}
    }));
    selectedBizId=null;
    renderBizPicker();
  }catch(e){
    $('bizPicker').innerHTML='<span style="color:#dc2626;font-size:12px">⚠️ 사업장 fetch 실패: '+esc(e.message)+'</span>';
  }
  /* 청구 이력 mock filter (C3 에서 진짜 GET /api/billing-invoices 로 교체 예정) */
  var nm=u.real_name||u.name||'';
  var hist=INVOICES.filter(i=>nm && i.cust.indexOf(nm)>=0);
  $('psHist').innerHTML=hist.length?hist.map(i=>{var st=statusOf(i);return '<tr><td><b>'+esc(i.cust)+'</b></td><td><span class="chip '+(i.taxType==='법인세'?'chip-biz':'chip-indv')+'">'+esc(i.taxType)+'</span></td><td style="color:#6B7280">'+esc(i.iDate.slice(2).replace(/-/g,'.'))+'</td><td style="font-weight:700">'+W(i.amount)+'원</td><td><span class="st '+st.cls+'">'+st.label+'</span></td><td><b>'+esc(i.staff)+'</b>'+(i.override?' <span class="chip chip-both">override</span>':'')+'</td></tr>'}).join(''):'<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--mut);font-size:12px">청구 이력 없음 (C3 에서 /api/billing-invoices fetch 연결)</td></tr>';
}

function resetCustPick(){
  SELECTED_PERSON=null; BIZS=[]; selectedBizId=null;
  $('custPersonPicker').style.display='';
  $('custSelectedHeader').style.display='none';
  $('bizPanel').style.display='none';
  searchCustList();
}

function renderCustHeader(){
  if(!SELECTED_PERSON) return;
  var u=SELECTED_PERSON;
  var nm=u.real_name||u.name||'(이름없음)';
  var ini=(nm||'?').charAt(0);
  $('custH1').textContent='👤 '+nm+' 거래처 — 청구서 발행';
  $('custAvatar').textContent=ini;
  $('custName').textContent=nm;
  $('custMeta').textContent='기장거래처 · '+(u.phone||'전화 미등록');
  $('custStaff').value=personStaff;
}

function renderBizPicker(){
  if(!BIZS.length){
    $('bizPicker').innerHTML='<span style="color:var(--mut);font-size:12px">매핑된 사업장 없음 — admin 에서 사업장 추가 후 진입</span>';
    return;
  }
  $('bizPicker').innerHTML=BIZS.map(b=>{
    var eff=b.override?b.staff:personStaff;
    var sel=b.id===selectedBizId;
    var fc=b.form==='법인'?'🏢':'👤';
    return '<button class="tab'+(sel?' on':'')+'" onclick="selectBiz('+b.id+')" style="padding:8px 14px;display:flex;align-items:center;gap:8px;font-size:12.5px">'
      +fc+' <b>'+esc(b.name)+'</b>'
      +'<span style="font-size:10.5px;opacity:.85">· '+esc(b.taxType)+' · '+eff+(b.override?' ⚙':'')+'</span>'
      +'</button>';
  }).join('');
  if(selectedBizId) selectBiz(selectedBizId);
}

function selectBiz(id){
  selectedBizId=id;
  var b=BIZS.find(x=>x.id===id);if(!b)return;
  $('bizPanel').style.display='';  /* 사업장 선택 시 발행 패널 표시 */
  $('biz-name').textContent=b.name;
  /* 검토표 데이터 자동 prefill — C2 후속에서 진짜 /api/admin-filings fetch 연결. 지금은 빈 fallback. */
  var ext=b.ext||{};
  $('i-rev').value=ext.rev||0;
  $('i-asset').value=ext.asset||0;
  if(ext.bizup) $('i-bizup').value=ext.bizup;
  if(ext.bt) $('i-bt').value=ext.bt;
  /* Section 3 자동 흐름 (검토표 fetch X 까진 빈 array) */
  INV_S3=(ext.s3FromReview||[]).filter(s3=>{
    var cat=CATALOG.find(c=>c.code===s3.code);
    return cat && cat.billable;
  }).map(s3=>{var cat=CATALOG.find(c=>c.code===s3.code)||{rule:'progressive_u'};return Object.assign({},s3,{rule:cat.rule})});
  /* picker active 갱신 */
  renderBizPicker.__skip=true;  /* 재진입 방지 */
  $('bizPicker').querySelectorAll('button').forEach((btn,idx)=>{
    btn.classList.toggle('on', BIZS[idx] && BIZS[idx].id===id);
  });
  renderS2(); renderS3(); syncCustPreview();
}
/* Section 2 (활증업무) — INV_S2 (거래처) / MAN_S2 (수기) */
function renderS2(){
  $('i-s2Cnt').textContent=INV_S2.length;
  $('i-s2Body').innerHTML=INV_S2.map((s2,idx)=>{
    var gain=(s2.val||0)*(s2.qty||1);
    return '<tr><td style="font-size:12px;font-weight:600">'+esc(s2.name)+'</td>'
      +'<td><input type="number" value="'+(s2.val||0)+'" onchange="setS2('+idx+',\'val\',+this.value)"></td>'
      +'<td><input type="number" value="'+(s2.qty||1)+'" onchange="setS2('+idx+',\'qty\',+this.value)"></td>'
      +'<td style="font-weight:700;color:#1E40AF">'+W(gain)+'원</td>'
      +'<td><button class="btn-x" onclick="rmS2('+idx+')">✕</button></td></tr>';
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--mut);padding:14px">+ 항목 추가로 양식의 활증업무에서 선택</td></tr>';
  syncCustPreview();
}
function setS2(i,f,v){ INV_S2[i][f]=v; renderS2(); }
function rmS2(i){ var n=INV_S2[i].name; INV_S2.splice(i,1); showToast('✕ '+n+' 제거'); renderS2(); }
function renderManS2(){
  $('m-s2Cnt').textContent=MAN_S2.length;
  $('m-s2Body').innerHTML=MAN_S2.map((s2,idx)=>{
    var gain=(s2.val||0)*(s2.qty||1);
    return '<tr><td style="font-size:12px;font-weight:600">'+esc(s2.name)+'</td>'
      +'<td><input type="number" value="'+(s2.val||0)+'" onchange="setManS2('+idx+',\'val\',+this.value)"></td>'
      +'<td><input type="number" value="'+(s2.qty||1)+'" onchange="setManS2('+idx+',\'qty\',+this.value)"></td>'
      +'<td style="font-weight:700;color:#1E40AF">'+W(gain)+'원</td>'
      +'<td><button class="btn-x" onclick="rmManS2('+idx+')">✕</button></td></tr>';
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--mut);padding:14px">+ 항목 추가로 양식의 활증업무에서 선택</td></tr>';
  syncManualPreview();
}
function setManS2(i,f,v){ MAN_S2[i][f]=v; renderManS2(); }
function rmManS2(i){ var n=MAN_S2[i].name; MAN_S2.splice(i,1); showToast('✕ '+n); renderManS2(); }

/* S2 picker 모달 — 양식(SECTIONS[form].s2)에서 활증업무 선택 */
var _s2PickMode=null, _s2PickIdx=null;
function _s2CurrentForm(){
  if(_s2PickMode==='cust'){
    var b=BIZS.find(x=>x.id===selectedBizId);
    return (b && b.form==='법인') ? 'corp' : 'indv';
  }
  /* manual: m-bt 업무구분으로 form 결정 */
  try{
    var bt=$('m-bt').value||'';
    if(bt.indexOf('법인')>=0) return 'corp';
    if(bt.indexOf('개인')>=0) return 'indv';
  }catch(_){}
  return 'corp';
}
function openS2Picker(mode){
  _s2PickMode=mode; _s2PickIdx=null;
  $('s2Modal').style.display='flex';
  $('s2ModalSub').textContent=(mode==='cust'?'(거래처 발행 — INV_S2)':'(수기 청구서 — MAN_S2)')+' · '+_s2CurrentForm();
  $('s2PickSearch').value='';
  $('s2PickSelectedName').textContent='—';
  $('s2PickSelectedMeta').textContent='';
  $('s2PickVal').value=''; $('s2PickQty').value='1';
  $('s2PickGain').textContent='—';
  $('s2PickInputArea').style.display='none';
  $('s2PickNameRow').style.display='none';
  $('s2PickName').value='';
  renderS2Picks();
  setTimeout(function(){ var el=$('s2PickSearch'); if(el)el.focus(); },50);
}
function closeS2Picker(){ $('s2Modal').style.display='none'; _s2PickMode=null; }
function renderS2Picks(){
  var q=($('s2PickSearch').value||'').trim().toLowerCase();
  var src=SECTIONS[_s2CurrentForm()].s2 || [];
  var list=src.map((it,i)=>({...it,_idx:i})).filter(c=>{
    if(!q) return true;
    var h=(c.name+' '+(c.desc||'')).toLowerCase();
    return h.indexOf(q)>=0;
  });
  $('s2PickCnt').textContent=list.length+'/'+src.length+(src.length?' · 양식 항목':'');
  /* 직접 추가 카드 — 항상 최상단. 검색어 있으면 그 텍스트 prefill 안내 */
  var customQuery=($('s2PickSearch').value||'').trim();
  var customCard='<button class="s3-pick'+(_s2PickIdx===-1?' on':'')+'" onclick="selectS2Pick(-1)" type="button" style="border-style:dashed;border-color:#3B82F6;background:#F0F9FF">'
    +'<div class="s3-pick-nm" style="color:#1E40AF">✏️ 직접 추가 (양식 X)'+(customQuery?': "'+esc(customQuery)+'"':'')+'</div>'
    +'<div class="s3-pick-meta"><span class="s3-pick-cat" style="background:#DBEAFE;color:#1E40AF">자유 입력</span><span class="s3-pick-code">항목명·단가·건수 직접</span></div>'
    +'</button>';
  if(!list.length && !src.length){
    $('s2PickResults').innerHTML=customCard+'<div style="grid-column:1/-1;padding:14px;text-align:center;color:var(--mut);font-size:11.5px">양식 Section 2 비어있음 — 위 "직접 추가" 사용 또는 양식에서 항목 등록</div>';
    return;
  }
  if(!list.length){
    $('s2PickResults').innerHTML=customCard+'<div style="grid-column:1/-1;padding:14px;text-align:center;color:var(--mut);font-size:11.5px">양식에서 일치 없음 — 위 "직접 추가" 사용</div>';
    return;
  }
  $('s2PickResults').innerHTML=customCard+list.map(c=>{
    var sel=c._idx===_s2PickIdx;
    var typeLbl=c.type==='rate'?'기본보수×%':c.type==='unit'?'건당':'직접 입력';
    return '<button class="s3-pick'+(sel?' on':'')+'" onclick="selectS2Pick('+c._idx+')" type="button">'
      +'<div class="s3-pick-nm">'+esc(c.name)+'</div>'
      +'<div class="s3-pick-meta"><span class="s3-pick-cat">'+typeLbl+'</span><span class="s3-pick-rule u">'+W(c.val||0)+(c.type==='rate'?'%':'원')+'</span><span class="s3-pick-code">'+esc(c.desc||'')+'</span></div>'
      +'</button>';
  }).join('');
}
function selectS2Pick(idx){
  _s2PickIdx=idx;
  if(idx===-1){
    /* 직접 추가 모드 */
    $('s2PickSelectedName').textContent='✏️ 직접 추가';
    $('s2PickSelectedMeta').textContent='자유 입력 (양식 X)';
    $('s2PickNameRow').style.display='flex';
    $('s2PickName').value=($('s2PickSearch').value||'').trim();
    $('s2PickVal').value=''; $('s2PickQty').value='1';
    $('s2PickGain').textContent='—';
    $('s2PickInputArea').style.display='block';
    renderS2Picks();
    setTimeout(function(){ var el=$('s2PickName'); if(el)el.focus(); },30);
    return;
  }
  var it=SECTIONS[_s2CurrentForm()].s2[idx]; if(!it) return;
  $('s2PickSelectedName').textContent=it.name;
  $('s2PickSelectedMeta').textContent=(it.type==='rate'?'기본보수×%':it.type==='unit'?'건당':'직접 입력')+' · '+(it.desc||'');
  $('s2PickNameRow').style.display='none';  /* 양식 모드 = 항목명 input 숨김 */
  /* type=rate 면 기본보수 기준 자동 — base 추정해서 prefill, 사장님이 수정 가능 */
  var defaultVal=it.val||0;
  if(it.type==='rate'){
    var base=0;
    try{ base=parseFloat($('cpv-base').textContent.replace(/[^0-9]/g,''))||0; }catch(_){}
    defaultVal=Math.floor(base*(it.val||0)/100/1000)*1000;
  }
  $('s2PickVal').value=defaultVal;
  $('s2PickQty').value='1';
  $('s2PickInputArea').style.display='block';
  updateS2PickGain();
  renderS2Picks();
  setTimeout(function(){ var el=$('s2PickVal'); if(el)el.focus(); },30);
}
function updateS2PickGain(){
  var val=parseFloat($('s2PickVal').value)||0;
  var qty=parseFloat($('s2PickQty').value)||1;
  $('s2PickGain').textContent=val>0?W(val*qty)+'원':'—';
}
function confirmS2Pick(){
  if(_s2PickIdx===null){ showToast('항목을 먼저 선택하세요'); return; }
  var val=parseFloat($('s2PickVal').value)||0;
  var qty=parseFloat($('s2PickQty').value)||1;
  var name='';
  if(_s2PickIdx===-1){
    name=($('s2PickName').value||'').trim();
    if(!name){ showToast('항목명을 입력하세요'); var el=$('s2PickName'); if(el)el.focus(); return; }
  } else {
    var src=SECTIONS[_s2CurrentForm()].s2[_s2PickIdx];
    if(!src) return;
    name=src.name;
  }
  if(val<=0){ showToast('단가를 입력하세요'); var el=$('s2PickVal'); if(el)el.focus(); return; }
  var row={name:name, val:val, qty:qty};
  if(_s2PickMode==='cust'){ INV_S2.push(row); renderS2(); }
  else { MAN_S2.push(row); renderManS2(); }
  showToast('+ '+name);
  closeS2Picker();
}

function renderS3(){
  $('i-s3Cnt').textContent=INV_S3.length;
  $('i-s3Body').innerHTML=INV_S3.map((s3,idx)=>{
    var gain=calcGain(s3.amt,s3.rule);s3.gain=gain;
    return '<tr><td style="font-size:12px;font-weight:600">'+esc(s3.name)+'</td>'
      +'<td><input type="number" value="'+s3.amt+'" onchange="setS3('+idx+',\'amt\',+this.value)"></td>'
      +'<td><select class="seld" onchange="setS3('+idx+',\'rule\',this.value)"><option value="flat_5"'+(s3.rule==='flat_5'?' selected':'')+'>5%</option><option value="progressive_u"'+(s3.rule==='progressive_u'?' selected':'')+'>U자</option></select></td>'
      +'<td style="font-weight:700;color:#0B1F3A">'+W(gain)+'원</td>'
      +'<td><button class="btn-x" onclick="rmS3('+idx+')">✕</button></td></tr>';
  }).join('');
  syncCustPreview();
}
function setS3(i,f,v){INV_S3[i][f]=v;renderS3()}
function rmS3(i){var n=INV_S3[i].name;INV_S3.splice(i,1);showToast('✕ '+n+' 제거');renderS3()}
function addS3Row(){ openS3Picker('cust'); }

function syncCustPreview(){
  var b=BIZS.find(x=>x.id===selectedBizId)||BIZS[0];
  if(!b) return;  /* 사람·사업장 미선택 시 미리보기 건너뜀 */
  var bt=$('i-bt').value, yr=$('i-yr').value;
  var taxType=bt.includes('법인')?'법인세':'종소세';
  var form=bt.includes('법인')?'corp':'indv';
  var rev=parseFloat($('i-rev').value)||0;
  var asset=parseFloat($('i-asset').value)||0;
  var baseRev=Math.max(rev,asset);
  var base=calcBase(baseRev,form);
  var ket=bt.includes('장부')?Math.floor(base*0.2/1000)*1000:0;
  var cst=base>0?Math.floor((base+ket)*0.1/1000)*1000:0;
  var s1Extra=0; SECTIONS[form].s1.forEach(it=>{if(it.type==='rate')s1Extra+=Math.floor(base*(it.val||0)/100/1000)*1000});
  var s2Tot=INV_S2.reduce((a,s)=>a+((s.val||0)*(s.qty||1)),0);
  var s3Tot=INV_S3.reduce((a,s)=>a+(s.gain||0),0);
  var extra=s1Extra+s2Tot+s3Tot;
  var supply=base+ket+cst+extra;
  var disc=parseFloat($('i-disc').value)||0;
  var supplyDisc=supply-disc;
  var vat=Math.round(supplyDisc*0.1);
  var total=supplyDisc+vat;
  /* 우측 청구서 본체 = 양식 템플릿(인삿말·계좌 등) + 이 거래처 데이터 결합 */
  $('cpv-title').textContent=b.name+' '+yr+'년 '+taxType+' 청구서';
  $('cpv-sub').textContent='담당 '+personStaff;
  $('cpv-firm').textContent=$('g-firm').value||'세무회계 이윤';
  $('cpv-cpa').textContent=($('g-cpa').value||'이재윤').split('').join(' ');
  $('cpv-date').textContent=$('i-date').value.replace(/-/g,'. ');
  $('cpv-due').textContent=$('i-due').value.replace(/-/g,'. ');
  $('cpv-cn').textContent=b.name; $('cpv-rn').textContent=(SELECTED_PERSON?(SELECTED_PERSON.real_name||SELECTED_PERSON.name||''):''); $('cpv-yr').textContent=yr;
  var subj=($('g-title').value||(yr+'년 귀속 '+taxType+' 신고 및 세무조정 수수료 청구의 건')).replace(/{yn}/g,yr).replace(/{taxType}/g,taxType);
  $('cpv-subj').textContent=subj;
  var p3=($('g-p3').value||'').replace(/{yn}/g,yr).replace(/{taxType}/g,taxType);
  $('cpv-p1').textContent=$('g-p1').value||'';
  $('cpv-p2').textContent=$('g-p2').value||'';
  $('cpv-p3').textContent=p3;
  $('cpv-pEnd').textContent=$('g-pEnd').value||'';
  $('cpv-bank').textContent=$('g-bank').value||'';
  $('cpv-acct').textContent=$('g-acct').value||'';
  $('cpv-holder').textContent=$('g-holder').value||'';
  $('cpv-addr').textContent=$('g-addr').value||'';
  $('cpv-tel').textContent=$('g-tel').value||'';
  $('cpv-fax').textContent=$('g-fax').value||'';
  $('cpv-rev').textContent=rev?W(rev)+'원':'—';
  $('cpv-base').textContent=base?W(base+ket+cst)+'원':'—';
  $('cpv-extra').textContent=extra?W(extra)+'원':'—';
  if(disc>0){$('cpv-disc-row').style.display='flex';$('cpv-disc').textContent='▼ '+W(disc)+'원'}else{$('cpv-disc-row').style.display='none'}
  $('cpv-total').textContent=total?W(total)+'원':'—';
  $('cpv-s3-body').innerHTML=INV_S3.map(s3=>{var rt=s3.rule==='flat_5'?'5%':'U자 20·10·20%';return '<tr><td>'+esc(s3.name)+'</td><td style="color:#94a3b8;font-style:italic">감면 '+W(s3.amt)+' × '+rt+'</td><td>'+W(s3.gain||0)+'</td></tr>'}).join('') || '<tr><td colspan="3" style="text-align:center;color:#cbd5e1">—</td></tr>';
  /* 2장 (cust-page2) — 산출근거 헤더 정보 */
  $('cpv2-cn').textContent=b.name;
  $('cpv2-yr').textContent=yr;
  $('cpv2-rev').textContent=rev?W(rev)+'원':'—';
  $('cpv2-bizup').textContent=$('i-bizup').value||'—';
  $('cpv-s3-sum').textContent=W(INV_S3.reduce((a,s)=>a+(s.gain||0),0));
}

/* Phase X Step 4 (2026-05-20): publish — POST /api/billing-invoices (D1 저장) */
async function publish(){
  var b=BIZS.find(x=>x.id===selectedBizId)||BIZS[0];
  if(!b){ showToast('⚠️ 사업장 먼저 선택'); return; }
  var yr=$('i-yr').value, bt=$('i-bt').value;
  var tt=bt.includes('법인')?'법인세':'종소세';
  var rev=parseFloat($('i-rev').value)||0;
  var asset=parseFloat($('i-asset').value)||0;
  var disc=parseFloat($('i-disc').value)||0;
  var amt=parseFloat(($('cpv-total').textContent||'0').replace(/[^0-9]/g,''))||0;
  var baseFee=parseFloat(($('cpv-base').textContent||'0').replace(/[^0-9]/g,''))||0;
  var extra=parseFloat(($('cpv-extra').textContent||'0').replace(/[^0-9]/g,''))||0;
  var s2Total=INV_S2.reduce((a,s)=>a+((s.val||0)*(s.qty||1)),0);
  var s3Tot=INV_S3.reduce((a,s)=>a+(s.gain||0),0);
  var body={
    business_id: b.id,
    user_id: SELECTED_PERSON ? SELECTED_PERSON.id : null,
    year: +yr,
    tax_type: tt,
    revenue: rev,
    asset: asset,
    biz_type: $('i-bizup').value || null,
    basic_type: bt || null,
    base_fee: baseFee,
    s2_addition: s2Total,
    s3_addition: s3Tot,
    discount: disc,
    total_fee: amt,
    s2_items: INV_S2,
    s3_items: INV_S3,
    staff_override: b.override?1:0,
    status: 'pending',
  };
  try{
    var r=await fetch('/api/billing-invoices'+adminKeyQS('?'),{
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
    });
    if(!r.ok) throw new Error('HTTP '+r.status);
    var d=await r.json();
    if(!d.ok) throw new Error(d.error||'POST failed');
    showToast('💾 '+b.name+' '+yr+'년 청구서 발행 ('+W(amt)+'원) — D1 저장 OK (id '+d.id+')');
    await loadInvoiceList(true);  /* 모아보기 갱신 */
    setTimeout(()=>nav(document.querySelector('[data-v=list]')),900);
  }catch(e){
    _billingError('publish', e);
    showToast('⚠️ 발행 실패 — '+(e&&e.message)+' (다시 시도)');
  }
}
function custStaffChange(){
  personStaff=$('custStaff').value;
  var nm=SELECTED_PERSON?(SELECTED_PERSON.real_name||SELECTED_PERSON.name||'거래처'):'거래처';
  showToast('👤 '+nm+' → '+personStaff+' · override 안 된 사업장 자동 상속');
  renderCust();
}

/* ===== 4. 수기 청구서 발행 ===== */
var MAN_S2=[];  /* 수기 청구서 Section 2 (활증업무) */
var MAN_S3=[];
function renderManual(){renderManS2();renderManS3();syncManualPreview()}
function renderManS3(){
  $('m-s3Cnt').textContent=MAN_S3.length;
  $('m-s3Body').innerHTML=MAN_S3.map((s3,idx)=>{
    var gain=calcGain(s3.amt,s3.rule);s3.gain=gain;
    return '<tr><td style="font-size:12px;font-weight:600">'+esc(s3.name)+'</td>'
      +'<td><input type="number" value="'+s3.amt+'" onchange="setManS3('+idx+',\'amt\',+this.value)"></td>'
      +'<td><select class="seld" onchange="setManS3('+idx+',\'rule\',this.value)"><option value="flat_5"'+(s3.rule==='flat_5'?' selected':'')+'>5%</option><option value="progressive_u"'+(s3.rule==='progressive_u'?' selected':'')+'>U자</option></select></td>'
      +'<td style="font-weight:700;color:#0B1F3A">'+W(gain)+'원</td>'
      +'<td><button class="btn-x" onclick="rmManS3('+idx+')">✕</button></td></tr>';
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--mut);padding:14px">+ 항목 추가로 직접 선택</td></tr>';
  syncManualPreview();
}
function setManS3(i,f,v){MAN_S3[i][f]=v;renderManS3()}
function rmManS3(i){var n=MAN_S3[i].name;MAN_S3.splice(i,1);showToast('✕ '+n);renderManS3()}
function addS3Manual(){ openS3Picker('manual'); }

/* S3 picker 모달 — 사장님 명령 (2026-05-20): prompt() 짜침 → 깔끔 모달 */
var _s3PickMode=null, _s3PickCode=null, _s3PickName='', _s3PickRule='progressive_u';
function openS3Picker(mode){
  if(!CATALOG||!CATALOG.length){ showToast('카탈로그 fetch 대기 중…'); return; }
  if(!CATALOG.filter(c=>c.billable).length){ showToast('billable 항목 없음'); return; }
  _s3PickMode=mode; _s3PickCode=null; _s3PickName=''; _s3PickRule='progressive_u';
  $('s3Modal').style.display='flex';
  $('s3ModalSub').textContent=mode==='cust'?'(거래처 발행 — INV_S3)':'(수기 청구서 — MAN_S3)';
  $('s3PickSearch').value='';
  $('s3PickSelectedName').textContent='—';
  $('s3PickSelectedMeta').textContent='';
  $('s3PickAmt').value='';
  $('s3PickGain').textContent='—';
  $('s3PickRuleLbl').textContent='U자';
  $('s3PickAmtArea').style.display='none';
  renderS3Picks();
  setTimeout(function(){ var el=$('s3PickSearch'); if(el)el.focus(); },50);
}
function closeS3Picker(){ $('s3Modal').style.display='none'; _s3PickMode=null; }
function renderS3Picks(){
  var q=($('s3PickSearch').value||'').trim().toLowerCase();
  var bill=CATALOG.filter(c=>c.billable);
  var list=bill.filter(c=>{
    if(!q) return true;
    var h=(c.name+' '+c.code+' '+(c.alias||[]).join(' ')+' '+(c.law||'')).toLowerCase();
    return h.indexOf(q)>=0;
  }).slice(0,200);
  $('s3PickCnt').textContent=list.length+'/'+bill.length;
  if(!list.length){
    $('s3PickResults').innerHTML='<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--mut);font-size:12.5px">검색 결과 없음</div>';
    return;
  }
  $('s3PickResults').innerHTML=list.map(c=>{
    var sel=c.code===_s3PickCode;
    var ru=c.rule==='flat_5'?'<span class="s3-pick-rule">5%</span>':c.rule==='progressive_u'?'<span class="s3-pick-rule u">U자</span>':'';
    return '<button class="s3-pick'+(sel?' on':'')+'" onclick="selectS3Pick(\''+c.code+'\')" type="button">'
      +'<div class="s3-pick-nm">'+esc(c.name)+'</div>'
      +'<div class="s3-pick-meta"><span class="s3-pick-cat">'+catLabel(c.cat)+'</span>'+ru+'<span class="s3-pick-code">'+esc(c.code)+'</span></div>'
      +'</button>';
  }).join('');
}
function selectS3Pick(code){
  var c=CATALOG.find(x=>x.code===code); if(!c) return;
  _s3PickCode=code; _s3PickName=c.name; _s3PickRule=c.rule||'progressive_u';
  $('s3PickSelectedName').textContent=c.name;
  $('s3PickSelectedMeta').textContent=catLabel(c.cat)+' · '+(c.law||'');
  $('s3PickRuleLbl').textContent=_s3PickRule==='flat_5'?'5%':_s3PickRule==='progressive_u'?'U자(20·10·20%)':'없음';
  $('s3PickAmtArea').style.display='block';
  updateS3PickGain();
  renderS3Picks();
  setTimeout(function(){ var el=$('s3PickAmt'); if(el)el.focus(); },30);
}
function updateS3PickGain(){
  var amt=parseFloat($('s3PickAmt').value)||0;
  var gain=calcGain(amt,_s3PickRule);
  $('s3PickGain').textContent=amt>0?W(gain)+'원':'—';
}
function confirmS3Pick(){
  if(!_s3PickCode){ showToast('항목을 먼저 선택하세요'); return; }
  var amt=parseFloat($('s3PickAmt').value)||0;
  if(amt<=0){ showToast('감면액을 입력하세요'); var el=$('s3PickAmt'); if(el)el.focus(); return; }
  var row={code:_s3PickCode, name:_s3PickName, amt:amt, rule:_s3PickRule};
  if(_s3PickMode==='cust'){ INV_S3.push(row); renderS3(); }
  else { MAN_S3.push(row); renderManS3(); }
  showToast('+ '+_s3PickName);
  closeS3Picker();
}
function syncManualPreview(){
  var cn=$('m-cn').value||'(거래처명)',rn=$('m-rn').value||'(대표)',yr=$('m-yr').value||'____';
  var bt=$('m-bt').value,taxType=bt.includes('법인')?'법인세':bt.includes('부가')?'부가세':bt.includes('개인')?'종소세':'기타';
  var form=bt.includes('법인')?'corp':'indv';
  var rev=parseFloat($('m-rev').value)||0,asset=parseFloat($('m-asset').value)||0;
  var baseRev=Math.max(rev,asset);
  var base=calcBase(baseRev,form);
  var ket=bt.includes('장부')?Math.floor(base*0.2/1000)*1000:0;
  var cst=base>0?Math.floor((base+ket)*0.1/1000)*1000:0;
  var s1Extra=0;SECTIONS[form].s1.forEach(it=>{if(it.type==='rate')s1Extra+=Math.floor(base*(it.val||0)/100/1000)*1000});
  var s2Tot=MAN_S2.reduce((a,s)=>a+((s.val||0)*(s.qty||1)),0);
  var s3Tot=MAN_S3.reduce((a,s)=>a+(s.gain||0),0);
  var extra=s1Extra+s2Tot+s3Tot;
  var supply=base+ket+cst+extra;
  var disc=parseFloat($('m-disc').value)||0;
  var supplyDisc=supply-disc,vat=Math.round(supplyDisc*0.1),total=supplyDisc+vat;
  $('mpv-title').textContent=cn+' '+yr+'년 '+taxType+' 청구서 (수기)';
  $('mpv-firm').textContent=$('g-firm').value||'세무회계 이윤';
  $('mpv-cpa').textContent=($('g-cpa').value||'이재윤').split('').join(' ');
  $('mpv-date').textContent=($('m-date').value||'').replace(/-/g,'. ');
  $('mpv-due').textContent=($('m-due').value||'').replace(/-/g,'. ');
  $('mpv-cn').textContent=cn; $('mpv-cn').style.color=cn==='(거래처명)'?'#cbd5e1':'';
  $('mpv-rn').textContent=rn; $('mpv-rn').style.color=rn==='(대표)'?'#cbd5e1':'';
  $('mpv-yr').textContent=yr;
  var subj=($('g-title').value||(yr+'년 귀속 '+taxType+' 신고 및 세무조정 수수료 청구의 건')).replace(/{yn}/g,yr).replace(/{taxType}/g,taxType);
  $('mpv-subj').textContent=subj;
  var p3=($('g-p3').value||'').replace(/{yn}/g,yr).replace(/{taxType}/g,taxType);
  $('mpv-p1').textContent=$('g-p1').value||'';$('mpv-p2').textContent=$('g-p2').value||'';
  $('mpv-p3').textContent=p3;$('mpv-pEnd').textContent=$('g-pEnd').value||'';
  $('mpv-bank').textContent=$('g-bank').value||'';$('mpv-acct').textContent=$('g-acct').value||'';
  $('mpv-holder').textContent=$('g-holder').value||'';
  $('mpv-addr').textContent=$('g-addr').value||'';$('mpv-tel').textContent=$('g-tel').value||'';$('mpv-fax').textContent=$('g-fax').value||'';
  $('mpv-rev').textContent=rev?W(rev)+'원':'—';
  $('mpv-base').textContent=base?W(base+ket+cst)+'원':'—';
  $('mpv-extra').textContent=extra?W(extra)+'원':'—';
  if(disc>0){$('mpv-disc-row').style.display='flex';$('mpv-disc').textContent='▼ '+W(disc)+'원'}else{$('mpv-disc-row').style.display='none'}
  $('mpv-total').textContent=total?W(total)+'원':'—';
}
/* Phase X Step 4 (2026-05-20): 수기 발행 — D1 미저장 (in-memory only).
 * 사장님 수기 모드 = 검토표 X, business_id/user_id 매핑 X. 1회성 PDF 출력만.
 * 향후 본적용 시 manual_label 컬럼 추가 시 D1 저장 가능. */
function publishManual(){
  var cn=$('m-cn').value.trim();
  if(!cn){alert('거래처명 필수');return}
  var yr=$('m-yr').value,bt=$('m-bt').value;
  var tt=bt.includes('법인')?'법인세':bt.includes('부가')?'부가세':bt.includes('개인')?'종소세':'기타';
  var amt=parseFloat(($('mpv-total').textContent||'0').replace(/[^0-9]/g,''))||0;
  /* in-memory id (실제 D1 저장 X) — 진짜 id 와 충돌 방지 위해 negative */
  var nid=-Date.now();
  var staff=$('m-staff').value;
  INVOICES.unshift({id:nid,cust:cn,taxType:tt,yr:+yr,iDate:$('m-date').value,due:$('m-due').value,amount:amt,sent:true,paid:false,paidAt:'',staff:staff,override:false,_manual:true});
  showToast('💾 '+cn+' '+yr+'년 수기 발행 ('+W(amt)+'원) — 임시 in-memory (D1 미저장)');
  renderList();
  setTimeout(()=>nav(document.querySelector('[data-v=list]')),900);
}
function bizStaffChange(id,v){var b=BIZS.find(x=>x.id===id);if(!b)return;if(v===personStaff&&!b.override)return;b.staff=v;b.override=true;showToast('⚙ '+b.name+' → '+v);renderCust()}
function bizResetOverride(id){var b=BIZS.find(x=>x.id===id);if(!b)return;b.override=false;b.staff=null;showToast('↶ '+b.name+' override 해제');renderCust()}

/* ===== 카탈로그 fetch (단일 진실) ===== */
fetch('/filing-tax-credit-catalog.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(r.status)).then(j=>{
  /* 데이터 구조 호환: {version,_comment,items:[...]} 또는 [version,_comment,[...]] */
  var arr=(j&&j.items)||(Array.isArray(j)?j.find(x=>Array.isArray(x)):null);
  if(!arr)throw new Error('format');
  var indvOnly=['SOD_56','JTL_56_2','SOD_59','SOD_59_2','SOD_59_2_B','SOD_59_3_A','SOD_59_3_B','JTL_91_5','JTL_91_18','SOD_59_4_A','SOD_59_4_B','SOD_59_4_C','SOD_59_4_D','SOD_59_4_E','SOD_59_4_F'];
  CATALOG=arr.map(c=>{var b=(c.cat==='general'||c.cat==='special')?false:true;var rl=b?'progressive_u':'none';if(c.code==='JTL_7'||c.code==='112'||(c.name||'').indexOf('특별세액감면')>=0||(c.alias||[]).indexOf('중특')>=0)rl='flat_5';return Object.assign({},c,{applies:indvOnly.indexOf(c.code)>=0?['indv']:['indv','corp'],billable:b,rule:rl})});
  showToast('✅ 카탈로그 ['+CATALOG.length+'개] sewmu JSON fetch — 단일 진실');
  renderCatalog();
}).catch(e=>{
  console.warn('catalog fetch fail, fallback:',e);
  CATALOG=CATALOG_FALLBACK.map(c=>Object.assign({},c,{applies:['indv','corp'],billable:true,rule:c.code==='JTL_7'?'flat_5':'progressive_u'}));
  renderCatalog();
});

/* 부팅 */
renderTpl(); refreshAlert();
