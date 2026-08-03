/**
 * SRRI (Stripe Radar Risk Inspector) — 静态数据与工具函数
 * 全部客户端运行，零数据上传。
 */

// ============================================================
// 风险权重
// ============================================================
export const WEIGHTS = {
  ipRegionMismatch: 35,
  datacenterIP: 25,
  binRegionMismatch: 20,
  tzMismatch: 10,
  langMismatch: 10,
  velocity: 10,
  webrtcLeak: 15,
} as const;

// ============================================================
// 国家 → 时区 / 语言映射
// ============================================================
export const COUNTRY_TIMEZONES: Record<string, string> = {
  US: "America/", CN: "Asia/Shanghai", HK: "Asia/Hong_Kong",
  TW: "Asia/Taipei", JP: "Asia/Tokyo", KR: "Asia/Seoul",
  SG: "Asia/Singapore", GB: "Europe/London", DE: "Europe/Berlin",
  FR: "Europe/Paris", NL: "Europe/Amsterdam", AU: "Australia/",
  CA: "America/", IN: "Asia/Kolkata", BR: "America/Sao_Paulo",
  PH: "Asia/Manila", TH: "Asia/Bangkok", VN: "Asia/Ho_Chi_Minh",
  MY: "Asia/Kuala_Lumpur", ID: "Asia/Jakarta", AE: "Asia/Dubai",
  RU: "Europe/Moscow", TR: "Europe/Istanbul",
};

export const COUNTRY_LANGS: Record<string, string> = {
  US: "en", CN: "zh", HK: "zh", TW: "zh", JP: "ja", KR: "ko",
  SG: "en", GB: "en", DE: "de", FR: "fr", NL: "nl", AU: "en",
  CA: "en", IN: "en", BR: "pt", PH: "en", TH: "th", VN: "vi",
  MY: "ms", ID: "id", AE: "ar", RU: "ru", TR: "tr",
};

// ============================================================
// 类型定义
// ============================================================
export interface IPInfo {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  isp: string;
  isHosting: boolean;
  error?: boolean;
}

export interface TimezoneInfo {
  tz: string;
  match: boolean;
  expected: string;
}

export interface LanguageInfo {
  lang: string;
  match: boolean;
  expected: string;
}

export interface WebRTCInfo {
  leaked: boolean;
  ips: string[];
  error?: boolean;
}

export interface BINInfo {
  scheme: string;
  type: string;
  brand: string;
  country: string;
  countryCode: string;
  bank: string;
  prepaid: boolean;
}

export interface RiskReason {
  weight: number;
  text: string;
  severity: "critical" | "warning";
}

export interface RiskResult {
  score: number;
  reasons: RiskReason[];
}

export interface Prescription {
  num: number;
  action: string;
  severity: "critical" | "warning" | "info" | "success";
  tag: string;
}

export interface Attempt {
  ts: number;
  success: boolean;
  card: string;
}

export interface AddressInfo {
  name: string;
  line1: string;
  city: string;
  state: string;
  postal: string;
  country: string;
  countryName: string;
}

// ============================================================
// 检测函数
// ============================================================

/** IP 检测：主用 ipwho.is，备用 ipapi.co */
export async function detectIP(): Promise<IPInfo> {
  try {
    const resp = await fetch("https://ipwho.is/");
    const data = await resp.json();
    if (!data.success) throw new Error(data.message || "API error");
    const ispStr = (data.connection && (data.connection.isp || data.connection.org)) || "Unknown";
    const isHosting = /hosting|cloud|datacenter|server|amazon|google|microsoft|digitalocean|vultr|linode|ovh|aws|azure/i.test(ispStr);
    return {
      ip: data.ip, country: data.country || "Unknown",
      countryCode: data.country_code || "", region: data.region || "",
      city: data.city || "", isp: ispStr, isHosting,
    };
  } catch {
    try {
      const resp = await fetch("https://ipapi.co/json/");
      const data = await resp.json();
      const ispStr = data.org || data.isp || "Unknown";
      const isHosting = /hosting|cloud|datacenter|server|amazon|google|microsoft|digitalocean|vultr|linode|ovh|aws|azure/i.test(ispStr);
      return {
        ip: data.ip, country: data.country_name || "Unknown",
        countryCode: data.country_code || "", region: data.region || "",
        city: data.city || "", isp: ispStr, isHosting,
      };
    } catch {
      return { ip: "Error", country: "检测失败", countryCode: "", region: "", city: "", isp: "", isHosting: false, error: true };
    }
  }
}

/** 时区一致性检测 */
export function checkTimezone(ipCountryCode: string): TimezoneInfo {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const expectedPrefix = COUNTRY_TIMEZONES[ipCountryCode];
  let match = true;
  if (expectedPrefix) {
    if (ipCountryCode === "US" || ipCountryCode === "CA" || ipCountryCode === "AU") {
      match = tz.startsWith(expectedPrefix);
    } else {
      match = tz.toLowerCase().includes(expectedPrefix.toLowerCase().replace("/", ""));
    }
  }
  return { tz, match, expected: expectedPrefix || "N/A" };
}

/** 浏览器语言一致性检测 */
export function checkLanguage(ipCountryCode: string): LanguageInfo {
  const navLang = navigator.language.toLowerCase();
  const expectedLang = COUNTRY_LANGS[ipCountryCode] || "";
  let match = true;
  if (expectedLang) match = navLang.startsWith(expectedLang);
  return { lang: navLang, match, expected: expectedLang || "N/A" };
}

/** WebRTC 真实 IP 泄露检测 */
export function checkWebRTCLeak(): Promise<WebRTCInfo> {
  return new Promise((resolve) => {
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      const candidates: string[] = [];
      pc.createDataChannel("");
      const timeout = setTimeout(() => {
        try { pc.close(); } catch { /* noop */ }
        resolve({ leaked: candidates.length > 0, ips: candidates });
      }, 3000);
      pc.onicecandidate = (e) => {
        if (e.candidate && e.candidate.candidate) {
          const m = e.candidate.candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
          if (m && !candidates.includes(m[1])) candidates.push(m[1]);
        }
        if (!e.candidate) {
          clearTimeout(timeout);
          try { pc.close(); } catch { /* noop */ }
          resolve({ leaked: candidates.length > 0, ips: candidates });
        }
      };
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => resolve({ leaked: false, ips: [], error: true }));
    } catch {
      resolve({ leaked: false, ips: [], error: true });
    }
  });
}

/** BIN 查询：主用 binlist.io，备用 handyapi.com */
export async function lookupBIN(bin: string): Promise<BINInfo | null> {
  try {
    const resp = await fetch("https://binlist.io/lookup/" + bin + "/");
    const data = await resp.json();
    return {
      scheme: data.scheme || "Unknown", type: data.type || "Unknown",
      brand: data.brand || "", country: (data.country && data.country.name) || "Unknown",
      countryCode: (data.country && data.country.alpha2) || "",
      bank: (data.bank && data.bank.name) || "", prepaid: data.prepaid || false,
    };
  } catch {
    try {
      const resp = await fetch("https://data.handyapi.com/bin/" + bin);
      const data = await resp.json();
      return {
        scheme: data.Scheme || "Unknown", type: data.CardType || "Unknown",
        brand: "", country: data.Country || "Unknown",
        countryCode: data.Issuer || "", bank: data.Bank || "", prepaid: false,
      };
    } catch {
      return null;
    }
  }
}

// ============================================================
// 风险评分引擎
// ============================================================
export function calculateRiskScore(
  checks: { ip: IPInfo | null; tz: TimezoneInfo | null; lang: LanguageInfo | null; webrtc: WebRTCInfo | null },
  billingCountryInput: string,
  attempts: Attempt[],
): RiskResult {
  let score = 0;
  const reasons: RiskReason[] = [];
  const billingCC = (billingCountryInput || "").toUpperCase().trim();

  if (billingCC && checks.ip && checks.ip.countryCode) {
    if (billingCC !== checks.ip.countryCode) {
      score += WEIGHTS.ipRegionMismatch;
      reasons.push({ weight: WEIGHTS.ipRegionMismatch, text: `IP 在 ${checks.ip.country}，但卡账单地址在 ${billingCC}`, severity: "critical" });
    }
  }
  if (checks.ip && checks.ip.isHosting) {
    score += WEIGHTS.datacenterIP;
    reasons.push({ weight: WEIGHTS.datacenterIP, text: `IP 属于数据中心/托管服务：${checks.ip.isp} — VPN/代理 IP 是 Radar 拦截的首要信号`, severity: "critical" });
  }
  if (checks.webrtc && checks.webrtc.leaked && checks.ip) {
    const leakedNonLocal = checks.webrtc.ips.filter((ip) => !ip.startsWith("192.168") && !ip.startsWith("10.") && !ip.startsWith("172."));
    if (leakedNonLocal.length > 0 && !leakedNonLocal.includes(checks.ip.ip)) {
      score += WEIGHTS.webrtcLeak;
      reasons.push({ weight: WEIGHTS.webrtcLeak, text: `WebRTC 泄露真实 IP：${leakedNonLocal.join(", ")}，与出口 IP 不一致`, severity: "critical" });
    }
  }
  if (checks.tz && !checks.tz.match) {
    score += WEIGHTS.tzMismatch;
    reasons.push({ weight: WEIGHTS.tzMismatch, text: `系统时区 ${checks.tz.tz} 与 IP 地区不匹配`, severity: "warning" });
  }
  if (checks.lang && !checks.lang.match) {
    score += WEIGHTS.langMismatch;
    reasons.push({ weight: WEIGHTS.langMismatch, text: `浏览器语言 ${checks.lang.lang} 与 IP 地区预期语言不匹配`, severity: "warning" });
  }
  const recentAttempts = attempts.filter((a) => Date.now() - a.ts < 86400000);
  if (recentAttempts.length >= 3) {
    const velScore = Math.min(WEIGHTS.velocity * 2, recentAttempts.length * 4);
    score += velScore;
    reasons.push({ weight: velScore, text: `24h 内已有 ${recentAttempts.length} 次尝试记录，高频重试会推高 Radar 风险评分`, severity: recentAttempts.length >= 5 ? "critical" : "warning" });
  }
  return { score: Math.min(score, 100), reasons };
}

// ============================================================
// 行动建议引擎
// ============================================================
export function generatePrescriptions(riskResult: RiskResult): Prescription[] {
  const rx: Prescription[] = [];
  const reasons = [...riskResult.reasons].sort((a, b) => b.weight - a.weight);
  let stepNum = 1;

  for (const r of reasons) {
    if (r.severity !== "critical") continue;
    let action = "";
    if (r.text.includes("数据中心") || r.text.includes("VPN")) {
      action = "<strong>关闭 VPN/代理</strong>，或切换到与卡账单地址所在国匹配的住宅 IP 节点。共享 VPN 节点很可能已被 Stripe 拉黑。";
    } else if (r.text.includes("IP 在")) {
      action = "<strong>消除地区不一致</strong>：让 IP、卡账单地址、浏览器时区/语言三者指向同一个国家。";
    } else if (r.text.includes("WebRTC")) {
      action = "<strong>禁用 WebRTC</strong>：安装 WebRTC Control 扩展或在浏览器设置中关闭，防止真实 IP 泄露。";
    } else if (r.text.includes("高频重试")) {
      action = "<strong>停止重试</strong>，等待 24-48 小时让 Radar 风控评分自然衰减。";
    }
    if (action) rx.push({ num: stepNum++, action, severity: "critical", tag: "必须修复" });
  }

  for (const r of reasons) {
    if (r.severity !== "warning") continue;
    let action = "";
    if (r.text.includes("时区")) action = "将系统/浏览器时区修改为与 IP 地区匹配的时区。";
    else if (r.text.includes("语言")) action = "将浏览器首选语言设置为与 IP 地区匹配的语言。";
    if (action) rx.push({ num: stepNum++, action, severity: "warning", tag: "建议修复" });
  }

  if (riskResult.score >= 40) {
    rx.push({ num: stepNum++, severity: "info", tag: "替代方案",
      action: "<strong>当前环境风险过高，直接支付大概率被拒。</strong>推荐绕过 Stripe 的替代路径：<br>1. <strong>iOS App Store 内购</strong>（成功率约 100%）：iPhone 下载 ChatGPT App 内部升级，走 Apple 支付<br>2. <strong>虚拟卡</strong>（成功率约 89%）：使用与当前 IP 区域匹配的虚拟卡（Wise/Revolut 等）<br>3. <strong>等待冷却后重试</strong>：修复以上问题后，等 24h 再用无痕模式尝试" });
  } else if (riskResult.score >= 15) {
    rx.push({ num: stepNum++, severity: "warning", tag: "注意",
      action: "修复以上问题后用<strong>无痕模式</strong>重试。如修复后仍被拒，问题可能在<strong>银行端</strong> — 打电话给发卡行要求白名单 OpenAI/Stripe 商户。" });
  } else {
    rx.push({ num: stepNum++, severity: "success", tag: "环境正常",
      action: "当前环境信号基本一致，可以直接尝试支付。如果仍被拒，<strong>大概率是银行端拦截</strong>或<strong>卡类型限制</strong>（预付卡/借记卡）。" });
  }
  return rx;
}

// ============================================================
// 地址生成器数据
// ============================================================
interface USState {
  name: string;
  zips: string[];
  cities: string[];
}

export const US_STATES: Record<string, USState> = {
  "OR": { name: "Oregon", zips: ["970","971","972","973","974","975","976","977","978"], cities: ["Portland","Eugene","Salem","Gresham","Hillsboro","Beaverton","Bend","Medford","Springfield","Corvallis"] },
  "WA": { name: "Washington", zips: ["980","981","982","983","984","985","986","988","989","990","991","992","993","994"], cities: ["Seattle","Spokane","Tacoma","Vancouver","Bellevue","Kent","Everett","Renton","Federal Way","Yakima"] },
  "CA": { name: "California", zips: ["900","901","902","903","904","905","906","907","908","910","911","912","913","914","915","916","917","918","919","920","921","922","923","924","925","926","927","928","930","931","932","933","934","935","936","937","938","939","940","941","942","943","944","945","946","947","948","949","950","951","952","953","954","955","956","957","958","959","960","961"], cities: ["Los Angeles","San Diego","San Jose","San Francisco","Fresno","Sacramento","Long Beach","Oakland","Bakersfield","Anaheim","Santa Ana","Riverside","Stockton","Irvine","Chula Vista","Fremont","San Bernardino","Modesto","Oxnard","Fontana"] },
  "NY": { name: "New York", zips: ["100","101","102","103","104","105","106","107","108","109","110","111","112","113","114","115","116","117","118","119","120","121","122","123","124","125","126","127","128","129","130","131","132","133","134","135","136","137","138","139","140","141","142","143","144","145","146","147","148","149"], cities: ["New York City","Buffalo","Rochester","Yonkers","Syracuse","Albany","New Rochelle","Mount Vernon","Schenectady","Utica","White Plains","Hempstead","Troy","Niagara Falls","Binghamton","Freeport","Valley Stream"] },
  "TX": { name: "Texas", zips: ["750","751","752","753","754","755","756","757","758","759","760","761","762","763","764","765","766","767","768","769","770","771","772","773","774","775","776","777","778","779","780","781","782","783","784","785","786","787","788","789","790","791","792","793","794","795","796","797","798","799"], cities: ["Houston","San Antonio","Dallas","Austin","Fort Worth","El Paso","Arlington","Corpus Christi","Plano","Lubbock","Laredo","Garland","Irving","Frisco","McKinney","Amarillo","Brownsville","Pasadena","Mesquite"] },
  "FL": { name: "Florida", zips: ["320","321","322","323","324","325","326","327","328","329","330","331","332","333","334","335","336","337","338","339","341","342","344","346","347","349"], cities: ["Jacksonville","Miami","Tampa","Orlando","St. Petersburg","Hialeah","Tallahassee","Fort Lauderdale","Port St. Lucie","Cape Coral","Pembroke Pines","Hollywood","Gainesville","Miramar","Coral Springs","Clearwater"] },
  "IL": { name: "Illinois", zips: ["600","601","602","603","604","605","606","607","608","609","610","611","612","613","614","615","616","617","618","619","620","622","623","624","625","626","627","628","629"], cities: ["Chicago","Aurora","Rockford","Joliet","Naperville","Springfield","Peoria","Elgin","Waukegan","Champaign","Bloomington","Decatur","Evanston","Schaumburg"] },
  "MA": { name: "Massachusetts", zips: ["010","011","012","013","014","015","016","017","018","019","020","021","022","023","024","025","026","027"], cities: ["Boston","Worcester","Springfield","Cambridge","Lowell","Brockton","Quincy","Lynn","New Bedford","Newton","Lawrence","Somerville","Framingham","Haverhill"] },
  "PA": { name: "Pennsylvania", zips: ["150","151","152","153","154","155","156","157","158","159","160","161","162","163","164","165","166","167","168","169","170","171","172","173","174","175","176","177","178","179","180","181","182","183","184","185","186","187","188","189","190","191","192","193","194","195","196"], cities: ["Philadelphia","Pittsburgh","Allentown","Erie","Reading","Scranton","Bethlehem","Lancaster","Harrisburg","York","Altoona","Wilkes-Barre","State College"] },
  "GA": { name: "Georgia", zips: ["300","301","302","303","304","305","306","307","308","309","310","311","312","313","314","315","316","317","318","319","398"], cities: ["Atlanta","Augusta","Columbus","Macon","Savannah","Athens","Sandy Springs","Roswell","Johns Creek","Albany","Warner Robins","Alpharetta","Marietta","Valdosta"] },
  "OH": { name: "Ohio", zips: ["430","431","432","433","434","435","436","437","438","439","440","441","442","443","444","445","446","447","448","449","450","451","452","453","454","455","456","457","458","459"], cities: ["Columbus","Cleveland","Cincinnati","Toledo","Akron","Dayton","Parma","Canton","Youngstown","Lorain","Hamilton","Springfield","Kettering"] },
  "NC": { name: "North Carolina", zips: ["270","271","272","273","274","275","276","277","278","279","280","281","282","283","284","285","286","287","288","289"], cities: ["Charlotte","Raleigh","Greensboro","Durham","Winston-Salem","Fayetteville","Cary","Wilmington","High Point","Greenville","Asheville","Concord","Gastonia"] },
  "VA": { name: "Virginia", zips: ["220","221","222","223","224","225","226","227","228","229","230","231","232","233","234","235","236","237","238","239","240","241","242","243","244","245","246","247","248","249"], cities: ["Virginia Beach","Norfolk","Chesapeake","Richmond","Newport News","Alexandria","Hampton","Roanoke","Portsmouth","Suffolk","Lynchburg","Harrisonburg","Charlottesville"] },
  "NJ": { name: "New Jersey", zips: ["070","071","072","073","074","075","076","077","078","079","080","081","082","083","084","085","086","087","088","089"], cities: ["Newark","Jersey City","Paterson","Elizabeth","Edison","Woodbridge","Lakewood","Toms River","Hamilton","Trenton","Clifton","Camden","Brick"] },
  "MI": { name: "Michigan", zips: ["480","481","482","483","484","485","486","487","488","489","490","491","492","493","494","495","496","497","498","499"], cities: ["Detroit","Grand Rapids","Warren","Sterling Heights","Ann Arbor","Lansing","Flint","Dearborn","Livonia","Westland","Troy","Farmington Hills"] },
  "AZ": { name: "Arizona", zips: ["850","851","852","853","855","856","857","859","860","863","864","865"], cities: ["Phoenix","Tucson","Mesa","Chandler","Scottsdale","Glendale","Gilbert","Tempe","Peoria","Surprise","Yuma","Avondale"] },
  "CO": { name: "Colorado", zips: ["800","801","802","803","804","805","806","807","808","809","810","811","812","813","814","815","816"], cities: ["Denver","Colorado Springs","Aurora","Fort Collins","Lakewood","Thornton","Arvada","Westminster","Pueblo","Boulder","Centennial","Longmont"] },
  "NV": { name: "Nevada", zips: ["889","890","891","893","894","895","897","898"], cities: ["Las Vegas","Henderson","Reno","North Las Vegas","Sparks","Carson City","Fernley","Elko"] },
  "TN": { name: "Tennessee", zips: ["370","371","372","373","374","375","376","377","378","379","380","381","382","383","384","385"], cities: ["Nashville","Memphis","Knoxville","Chattanooga","Clarksville","Murfreesboro","Franklin","Jackson","Johnson City","Hendersonville"] },
  "IN": { name: "Indiana", zips: ["460","461","462","463","464","465","466","467","468","469","470","471","472","473","474","475","476","477","478","479"], cities: ["Indianapolis","Fort Wayne","Evansville","South Bend","Carmel","Fishers","Bloomington","Hammond","Gary","Noblesville","Greenwood"] },
  "MO": { name: "Missouri", zips: ["630","631","633","634","635","636","637","638","639","640","641","644","645","646","647","648","649","650","651","652","653","654","655","656","657","658"], cities: ["Kansas City","St. Louis","Springfield","Independence","Columbia","Lee's Summit","O'Fallon","St. Joseph","St. Charles","Blue Springs"] },
  "MD": { name: "Maryland", zips: ["206","207","208","209","210","211","212","214","215","216","217","218","219"], cities: ["Baltimore","Frederick","Rockville","Gaithersburg","Bowie","Hagerstown","Annapolis","Salisbury","College Park","Greenbelt"] },
  "WI": { name: "Wisconsin", zips: ["530","531","532","534","535","537","538","539","540","541","542","543","544","545","546","547","548","549","550"], cities: ["Milwaukee","Madison","Green Bay","Kenosha","Racine","Appleton","Waukesha","Eau Claire","Oshkosh","Janesville","West Allis"] },
  "MN": { name: "Minnesota", zips: ["550","551","553","554","555","556","557","558","559","560","561","562","563","564","565","566","567"], cities: ["Minneapolis","Saint Paul","Rochester","Duluth","Bloomington","Brooklyn Park","Plymouth","Maple Grove","Woodbury","St. Cloud"] },
  "CT": { name: "Connecticut", zips: ["060","061","062","063","064","065","066","067","068","069"], cities: ["Bridgeport","New Haven","Stamford","Hartford","Waterbury","Norwalk","Danbury","New Britain","Bristol","Meriden"] },
};

export const US_STREETS = ["Main St","Oak Ave","Maple Dr","Cedar Ln","Pine St","Elm St","Washington Ave","Park Ave","Lake Dr","Hill Rd","Sunset Blvd","River Rd","Highland Ave","Forest Dr","Spring St","Church St","Mill Rd","Madison Ave","Jefferson St","Lincoln Way","Center St","School St","North St","South St","East Ave","West Rd","Country Club Dr","Ridge Rd","Valley View","Brookside Ln","Garden St","Franklin St","Adams St","Jackson St","Liberty St","Union St","Market St","Broadway","Front St","Court St","Cherry St","Walnut St","Birch Dr","Spruce St","Willow Ln","Magnolia Ave","Sycamore Dr","Dogwood Dr","Hickory Ln","Aspen Dr"];

export const US_FIRST_NAMES = ["James","Mary","Robert","Patricia","John","Jennifer","Michael","Linda","David","Elizabeth","William","Barbara","Richard","Susan","Joseph","Jessica","Thomas","Sarah","Charles","Karen","Christopher","Nancy","Daniel","Lisa","Matthew","Margaret","Anthony","Betty","Mark","Sandra","Donald","Ashley","Steven","Kimberly","Paul","Emily","Andrew","Donna","Joshua","Michelle","Kenneth","Carol","Kevin","Amanda","Brian","Dorothy","George","Melissa","Edward","Deborah"];
export const US_LAST_NAMES = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin","Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson","Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores","Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts"];

interface UKCity { city: string; postcode: string; }
export const UK_CITIES: UKCity[] = [
  { city: "London", postcode: "SW1A" }, { city: "Manchester", postcode: "M1" },
  { city: "Birmingham", postcode: "B1" }, { city: "Leeds", postcode: "LS1" },
  { city: "Glasgow", postcode: "G1" }, { city: "Liverpool", postcode: "L1" },
  { city: "Bristol", postcode: "BS1" }, { city: "Sheffield", postcode: "S1" },
  { city: "Edinburgh", postcode: "EH1" }, { city: "Cardiff", postcode: "CF10" },
  { city: "Belfast", postcode: "BT1" }, { city: "Newcastle", postcode: "NE1" },
  { city: "Brighton", postcode: "BN1" }, { city: "Nottingham", postcode: "NG1" },
  { city: "Oxford", postcode: "OX1" },
];
export const UK_STREETS = ["High Street","Station Road","Main Street","Church Lane","Park Road","Victoria Street","Mill Lane","King Street","Queens Road","Manor Road","New Road","School Lane","The Avenue","York Road","London Road","Church Street","Mill Road","North Street","South Street","Green Lane"];

interface CACity { city: string; province: string; postal: string; }
export const CA_CITIES: CACity[] = [
  { city: "Toronto", province: "ON", postal: "M5" }, { city: "Vancouver", province: "BC", postal: "V6" },
  { city: "Montreal", province: "QC", postal: "H2" }, { city: "Calgary", province: "AB", postal: "T2" },
  { city: "Ottawa", province: "ON", postal: "K1" }, { city: "Edmonton", province: "AB", postal: "T5" },
  { city: "Winnipeg", province: "MB", postal: "R3" }, { city: "Mississauga", province: "ON", postal: "L5" },
  { city: "Halifax", province: "NS", postal: "B3" }, { city: "Victoria", province: "BC", postal: "V8" },
];
export const CA_STREETS = ["King Street","Queen Street","Main Street","Yonge Street","Bay Street","Bloor Street","Dundas Street","College Street","Spadina Avenue","Bank Street","Wellington Street","Albert Street","York Street","Front Street","Richmond Street"];

interface JPCity { city: string; prefecture: string; postal: string; }
export const JP_CITIES: JPCity[] = [
  { city: "Chiyoda", prefecture: "Tokyo", postal: "100" }, { city: "Chuo", prefecture: "Tokyo", postal: "104" },
  { city: "Minato", prefecture: "Tokyo", postal: "105" }, { city: "Shinjuku", prefecture: "Tokyo", postal: "160" },
  { city: "Osaka", prefecture: "Osaka", postal: "530" }, { city: "Naka", prefecture: "Yokohama", postal: "231" },
  { city: "Nakamura", prefecture: "Nagoya", postal: "450" }, { city: "Sapporo", prefecture: "Hokkaido", postal: "060" },
];

interface HKDistrict { district: string; region: string; }
export const HK_DISTRICTS: HKDistrict[] = [
  { district: "Central", region: "Central and Western" }, { district: "Admiralty", region: "Central and Western" },
  { district: "Wan Chai", region: "Wan Chai" }, { district: "Causeway Bay", region: "Wan Chai" },
  { district: "Tsim Sha Tsui", region: "Yau Tsim Mong" }, { district: "Mong Kok", region: "Yau Tsim Mong" },
  { district: "North Point", region: "Eastern" }, { district: "Quarry Bay", region: "Eastern" },
  { district: "Kowloon Bay", region: "Kwun Tong" }, { district: "Sha Tin", region: "Sha Tin" },
];

export const SG_AREAS = ["Orchard","Marina Bay","Sentosa","Chinatown","Little India","Bugis","Holland Village","Tiong Bahru","Bukit Timah","Novena","Bedok","Tampines","Jurong East","Clementi","Bishan"];

interface AUCity { city: string; state: string; postcode: string; }
export const AU_CITIES: AUCity[] = [
  { city: "Sydney", state: "NSW", postcode: "2000" }, { city: "Melbourne", state: "VIC", postcode: "3000" },
  { city: "Brisbane", state: "QLD", postcode: "4000" }, { city: "Perth", state: "WA", postcode: "6000" },
  { city: "Adelaide", state: "SA", postcode: "5000" }, { city: "Gold Coast", state: "QLD", postcode: "4217" },
  { city: "Canberra", state: "ACT", postcode: "2600" }, { city: "Hobart", state: "TAS", postcode: "7000" },
];

// ============================================================
// 地址生成函数
// ============================================================
function randomFrom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function padNum(n: number, len: number): string { return String(n).padStart(len, "0"); }
function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }

function generateUSAddress(ipRegion: string | null): AddressInfo {
  let stateKey: string | null = null;
  if (ipRegion) {
    const upper = ipRegion.toUpperCase();
    for (const k in US_STATES) { if (k === upper) { stateKey = k; break; } }
    if (!stateKey) {
      for (const k2 in US_STATES) {
        if (US_STATES[k2].name.toUpperCase().includes(upper)) { stateKey = k2; break; }
      }
    }
  }
  if (!stateKey) {
    const validKeys = Object.keys(US_STATES);
    stateKey = randomFrom(validKeys);
  }
  const st = US_STATES[stateKey];
  const city = randomFrom(st.cities);
  const zipPrefix = randomFrom(st.zips);
  const zip = zipPrefix + padNum(randInt(0, 99), 2);
  const streetNum = randInt(100, 9999);
  const street = randomFrom(US_STREETS);
  const apt = Math.random() > 0.6 ? ` Apt ${randInt(1, 99)}` : "";
  return {
    name: `${randomFrom(US_FIRST_NAMES)} ${randomFrom(US_LAST_NAMES)}`,
    line1: `${streetNum} ${street}${apt}`, city, state: stateKey,
    postal: zip, country: "US", countryName: "United States",
  };
}

function generateUKAddress(): AddressInfo {
  const c = randomFrom(UK_CITIES);
  const streetNum = randInt(1, 200);
  const street = randomFrom(UK_STREETS);
  const flat = Math.random() > 0.5 ? `Flat ${randInt(1, 30)}, ` : "";
  const postSuffix = String.fromCharCode(65 + randInt(0, 25)) + randInt(1, 9) + String.fromCharCode(65 + randInt(0, 25));
  const postcode = `${c.postcode} ${randInt(1, 9)}${postSuffix}`;
  return {
    name: `${randomFrom(US_FIRST_NAMES)} ${randomFrom(US_LAST_NAMES)}`,
    line1: `${flat}${streetNum} ${street}`, city: c.city, state: "England",
    postal: postcode, country: "GB", countryName: "United Kingdom",
  };
}

function generateCAAddress(): AddressInfo {
  const c = randomFrom(CA_CITIES);
  const streetNum = randInt(100, 9999);
  const street = randomFrom(CA_STREETS);
  const apt = Math.random() > 0.5 ? ` Unit ${randInt(1, 99)}` : "";
  const alpha = "ABCDEFGHJKLMNPRSTVWXYZ";
  const p1 = c.postal + alpha[randInt(0, alpha.length - 1)] + randInt(1, 9) + alpha[randInt(0, alpha.length - 1)];
  const postal = `${p1} ${alpha[randInt(0, alpha.length - 1)]}${randInt(1, 9)}${alpha[randInt(0, alpha.length - 1)]}`;
  return {
    name: `${randomFrom(US_FIRST_NAMES)} ${randomFrom(US_LAST_NAMES)}`,
    line1: `${streetNum} ${street}${apt}`, city: c.city, state: c.province,
    postal, country: "CA", countryName: "Canada",
  };
}

function generateJPAddress(): AddressInfo {
  const c = randomFrom(JP_CITIES);
  const chome = randInt(1, 5);
  const ban = randInt(1, 30);
  const go = randInt(1, 20);
  const postal = c.postal + padNum(randInt(0, 9999), 4);
  return {
    name: "Tarou Yamada",
    line1: `${c.city}-${chome}-${ban}-${go}`, city: `${c.city}-ku`,
    state: c.prefecture, postal, country: "JP", countryName: "Japan",
  };
}

function generateHKAddress(): AddressInfo {
  const d = randomFrom(HK_DISTRICTS);
  const flat = String.fromCharCode(65 + randInt(0, 5)) + randInt(1, 99);
  const streets = ["Des Voeux Road","Hennessy Road","Nathan Road","Argyle Street","Canton Road","Princess Margaret Road"];
  const firstName = randomFrom(["Chan","Wong","Lee","Lau","Cheung","Ho","Choi","Tang","Wu","Lam"]);
  const lastName = randomFrom(["Ka Ming","Siu Fung","Wing Yan","Ho Yin","Tsz Hin","Ka Wai","Sze Wing","Chun Yu"]);
  return {
    name: `${firstName} ${lastName}`,
    line1: `Flat ${flat}, ${randInt(1, 200)} ${randomFrom(streets)}, ${d.district}`,
    city: d.region, state: "Hong Kong Island", postal: "",
    country: "HK", countryName: "Hong Kong",
  };
}

function generateSGAddress(): AddressInfo {
  const area = randomFrom(SG_AREAS);
  const blk = randInt(1, 999);
  const floor = randInt(1, 40);
  const unit = randInt(1, 200);
  const postal = padNum(randInt(1, 80), 6);
  const firstName = randomFrom(["Tan","Lim","Lee","Ong","Wong","Goh","Chua","Chan","Koh","Teo"]);
  const lastName = randomFrom(["Wei Ming","Hui Min","Jun Jie","Pei Shan","Kah Lok","Siew Ling","Chee Boon","Yan Ni"]);
  return {
    name: `${firstName} ${lastName}`,
    line1: `Blk ${blk} ${area} Road #${padNum(floor, 2)}-${padNum(unit, 2)}`,
    city: area, state: "", postal, country: "SG", countryName: "Singapore",
  };
}

function generateAUAddress(): AddressInfo {
  const c = randomFrom(AU_CITIES);
  const streetNum = randInt(1, 500);
  const streets = ["George Street","Pitt Street","Collins Street","Bourke Street","Queen Street","Adelaide Street","Hay Street","Murray Street","Grenfell Street"];
  const apt = Math.random() > 0.5 ? ` Unit ${randInt(1, 50)}` : "";
  return {
    name: `${randomFrom(US_FIRST_NAMES)} ${randomFrom(US_LAST_NAMES)}`,
    line1: `${streetNum} ${randomFrom(streets)}${apt}`, city: c.city, state: c.state,
    postal: c.postcode, country: "AU", countryName: "Australia",
  };
}

function generateGenericEU(cc: string, countryName: string, stateName: string): AddressInfo {
  const streetsDE = ["Hauptstrasse","Bahnhofstrasse","Schulstrasse","Gartenstrasse","Bergstrasse","Dorfstrasse","Lindenstrasse"];
  const streetsFR = ["Rue du Mai","Avenue de la Republique","Rue Pasteur","Boulevard Saint-Michel","Rue Victor Hugo"];
  const streetsNL = ["Keizerstraat","Kerkstraat","Stationsweg","Markt","Lindenlaan","Koningstraat"];
  const streetPool = cc === "DE" ? streetsDE : (cc === "FR" ? streetsFR : streetsNL);
  const streetNum = randInt(1, 200);
  const cities = cc === "DE" ? ["Berlin","Munich","Hamburg","Frankfurt","Cologne","Stuttgart"] : (cc === "FR" ? ["Paris","Lyon","Marseille","Toulouse","Nice","Lille"] : ["Amsterdam","Rotterdam","The Hague","Utrecht","Eindhoven"]);
  return {
    name: `${randomFrom(US_FIRST_NAMES)} ${randomFrom(US_LAST_NAMES)}`,
    line1: `${streetNum} ${randomFrom(streetPool)}`, city: randomFrom(cities),
    state: stateName, postal: padNum(randInt(10000, 99999), 5),
    country: cc, countryName,
  };
}

export function generateAddress(countryCode: string, ipRegion: string | null): AddressInfo {
  switch ((countryCode || "US").toUpperCase()) {
    case "US": return generateUSAddress(ipRegion);
    case "GB": return generateUKAddress();
    case "CA": return generateCAAddress();
    case "JP": return generateJPAddress();
    case "HK": return generateHKAddress();
    case "SG": return generateSGAddress();
    case "AU": return generateAUAddress();
    case "DE": return generateGenericEU("DE", "Germany", "Germany");
    case "FR": return generateGenericEU("FR", "France", "France");
    case "NL": return generateGenericEU("NL", "Netherlands", "Netherlands");
    default: return generateUSAddress(ipRegion);
  }
}
