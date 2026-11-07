// 날씨 앱 — Open-Meteo API 사용 (API 키 불필요)
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const DEFAULT_PLACE = { name: "원주시", admin1: "강원도", country: "대한민국", latitude: 37.35139, longitude: 127.94528 };

const $ = (id) => document.getElementById(id);
const state = {
  unit: load("unit") || "c",
  place: load("lastPlace") || DEFAULT_PLACE,
  data: null,
};

// WMO 날씨 코드 → [설명, 낮 아이콘, 밤 아이콘, 배경 테마]
const WEATHER = {
  0: ["맑음", "☀️", "🌙", "clear"],
  1: ["대체로 맑음", "🌤️", "🌙", "clear"],
  2: ["구름 조금", "⛅", "☁️", "cloudy"],
  3: ["흐림", "☁️", "☁️", "cloudy"],
  45: ["안개", "🌫️", "🌫️", "fog"],
  48: ["짙은 안개", "🌫️", "🌫️", "fog"],
  51: ["약한 이슬비", "🌦️", "🌧️", "rain"],
  53: ["이슬비", "🌦️", "🌧️", "rain"],
  55: ["강한 이슬비", "🌧️", "🌧️", "rain"],
  56: ["어는 이슬비", "🌧️", "🌧️", "rain"],
  57: ["강한 어는 이슬비", "🌧️", "🌧️", "rain"],
  61: ["약한 비", "🌦️", "🌧️", "rain"],
  63: ["비", "🌧️", "🌧️", "rain"],
  65: ["강한 비", "🌧️", "🌧️", "rain"],
  66: ["어는 비", "🌧️", "🌧️", "rain"],
  67: ["강한 어는 비", "🌧️", "🌧️", "rain"],
  71: ["약한 눈", "🌨️", "🌨️", "snow"],
  73: ["눈", "❄️", "❄️", "snow"],
  75: ["폭설", "❄️", "❄️", "snow"],
  77: ["싸락눈", "🌨️", "🌨️", "snow"],
  80: ["약한 소나기", "🌦️", "🌧️", "rain"],
  81: ["소나기", "🌧️", "🌧️", "rain"],
  82: ["강한 소나기", "⛈️", "⛈️", "storm"],
  85: ["약한 눈보라", "🌨️", "🌨️", "snow"],
  86: ["눈보라", "❄️", "❄️", "snow"],
  95: ["뇌우", "⛈️", "⛈️", "storm"],
  96: ["우박 동반 뇌우", "⛈️", "⛈️", "storm"],
  99: ["강한 우박 뇌우", "⛈️", "⛈️", "storm"],
};
const wx = (code, isDay = true) => {
  const w = WEATHER[code] || ["알 수 없음", "🌡️", "🌡️", "cloudy"];
  return { desc: w[0], icon: isDay ? w[1] : w[2], theme: w[3] };
};

// ---------- 유틸 ----------
function load(key) {
  try { return JSON.parse(localStorage.getItem("weather:" + key)); } catch { return null; }
}
function save(key, value) {
  try { localStorage.setItem("weather:" + key, JSON.stringify(value)); } catch {}
}
const temp = (c) => Math.round(state.unit === "f" ? c * 9 / 5 + 32 : c) + "°";
const hhmm = (iso) => iso.slice(11, 16);
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
function setStatus(msg) { $("status").textContent = msg; }
function placeLabel(p) {
  return [p.name, p.admin1 && p.admin1 !== p.name ? p.admin1 : null].filter(Boolean).join(", ");
}

// ---------- 데이터 ----------
async function fetchWeather(place) {
  setStatus("불러오는 중…");
  const params = new URLSearchParams({
    latitude: place.latitude,
    longitude: place.longitude,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m",
    hourly: "temperature_2m,weather_code,precipitation_probability,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
    timezone: "auto",
    forecast_days: 7,
    past_days: 1, // 어제 기온과 비교하기 위해 하루치 과거 데이터 포함
    wind_speed_unit: "ms",
  });
  try {
    const res = await fetch(`${FORECAST_URL}?${params}`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    // 일별 배열의 첫 항목(어제)은 따로 보관하고, 7일 예보는 오늘부터 시작
    data.yesterday = {};
    for (const key of Object.keys(data.daily)) {
      data.yesterday[key] = data.daily[key][0];
      data.daily[key] = data.daily[key].slice(1);
    }
    state.data = data;
    state.place = place;
    save("lastPlace", place);
    setStatus("");
    render();
  } catch (err) {
    console.error(err);
    setStatus("날씨 정보를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.");
  }
}

async function searchCities(query) {
  // 한국 도시는 "원주시", "양평군"처럼 등록된 경우가 많아서
  // 한글 검색어는 "○○시", "○○군"도 함께 검색해 합칩니다.
  const queries = [query];
  if (/[가-힣]$/.test(query) && !/[시군구]$/.test(query)) queries.push(query + "시", query + "군");

  const lists = await Promise.all(queries.map(async (q) => {
    const params = new URLSearchParams({ name: q, count: 15, language: "ko", format: "json" });
    const res = await fetch(`${GEO_URL}?${params}`);
    if (!res.ok) return [];
    return (await res.json()).results || [];
  }));
  const seen = new Set();
  const merged = lists.flat().filter((p) => !seen.has(p.id) && seen.add(p.id));

  // 산·강 등 지형보다 도시(PPL*)를 우선, 그다음 인구순
  const isCity = (p) => (p.feature_code || "").startsWith("PPL") ? 1 : 0;
  return merged
    .sort((a, b) => isCity(b) - isCity(a) || (b.population || 0) - (a.population || 0))
    .slice(0, 6);
}

// ---------- 렌더링 ----------
function render() {
  const d = state.data;
  if (!d) return;
  const c = d.current;
  const now = wx(c.weather_code, c.is_day);

  document.body.className = c.is_day ? (now.theme === "clear" ? "" : now.theme) : "night";
  document.title = `${temp(c.temperature_2m)} ${state.place.name} — 날씨`;

  $("place").textContent = placeLabel(state.place);
  $("updated").textContent = `${state.place.country || ""} · ${hhmm(c.time)} 기준`;
  $("now-icon").textContent = now.icon;
  $("now-temp").textContent = temp(c.temperature_2m);
  $("now-desc").textContent = now.desc;
  $("now-range").textContent = `최고 ${temp(d.daily.temperature_2m_max[0])} / 최저 ${temp(d.daily.temperature_2m_min[0])}`;
  $("d-feels").textContent = temp(c.apparent_temperature);
  $("d-humidity").textContent = `${c.relative_humidity_2m}%`;
  $("d-wind").textContent = `${c.wind_speed_10m.toFixed(1)} m/s`;
  $("d-pop").textContent = `${d.daily.precipitation_probability_max[0] ?? 0}%`;
  $("d-sunrise").textContent = hhmm(d.daily.sunrise[0]);
  $("d-sunset").textContent = hhmm(d.daily.sunset[0]);
  $("unit-btn").textContent = state.unit === "f" ? "°F" : "°C";

  // 시간별: 현재 시각부터 24시간
  const h = d.hourly;
  const nowHour = c.time.slice(0, 13);
  let start = h.time.findIndex((t) => t.slice(0, 13) === nowHour);
  if (start < 0) start = 0;

  // 어제 같은 시간과 비교
  const yIdx = start - 24;
  const cmp = $("now-compare");
  if (yIdx >= 0 && h.temperature_2m[yIdx] != null) {
    const yTemp = h.temperature_2m[yIdx];
    const diffC = c.temperature_2m - yTemp;
    const diff = Math.round(Math.abs(state.unit === "f" ? diffC * 9 / 5 : diffC));
    if (diff === 0) {
      cmp.textContent = "어제 이 시간과 비슷해요";
      cmp.className = "now-compare same";
    } else if (diffC > 0) {
      cmp.textContent = `▲ 어제보다 ${diff}° 높아요`;
      cmp.className = "now-compare warmer";
    } else {
      cmp.textContent = `▼ 어제보다 ${diff}° 낮아요`;
      cmp.className = "now-compare colder";
    }
    cmp.title = `어제 ${hhmm(h.time[yIdx])} 기온: ${temp(yTemp)}`;
    const y = d.yesterday;
    $("now-compare-sub").textContent =
      `어제 이 시간 ${temp(yTemp)} · 어제 최고 ${temp(y.temperature_2m_max)} / 최저 ${temp(y.temperature_2m_min)}`;
    cmp.hidden = $("now-compare-sub").hidden = false;
  } else {
    cmp.hidden = $("now-compare-sub").hidden = true;
  }
  $("hourly").innerHTML = h.time.slice(start, start + 24).map((t, i) => {
    const k = start + i;
    const w = wx(h.weather_code[k], h.is_day[k]);
    const pop = h.precipitation_probability[k];
    return `<div class="hour">
      <span>${i === 0 ? "지금" : Number(t.slice(11, 13)) + "시"}</span>
      <span class="h-icon" title="${w.desc}">${w.icon}</span>
      <span class="h-pop">${pop >= 20 ? pop + "%" : ""}</span>
      <span class="h-temp">${temp(h.temperature_2m[k])}</span>
    </div>`;
  }).join("");

  // 7일
  const dl = d.daily;
  const lo = Math.min(...dl.temperature_2m_min);
  const hi = Math.max(...dl.temperature_2m_max);
  const span = hi - lo || 1;
  $("daily").innerHTML = dl.time.map((t, i) => {
    const w = wx(dl.weather_code[i]);
    const [y, m, day] = t.split("-").map(Number);
    const label = i === 0 ? "오늘" : DAYS[new Date(y, m - 1, day).getDay()] + "요일";
    const left = ((dl.temperature_2m_min[i] - lo) / span) * 100;
    const width = ((dl.temperature_2m_max[i] - dl.temperature_2m_min[i]) / span) * 100;
    const pop = dl.precipitation_probability_max[i];
    return `<li>
      <span class="d-day">${label}</span>
      <span class="d-icon" title="${w.desc}">${w.icon}</span>
      <span class="d-pop">${pop >= 20 ? pop + "%" : ""}</span>
      <span class="d-range">
        <span class="d-min">${temp(dl.temperature_2m_min[i])}</span>
        <span class="bar"><i style="left:${left}%;width:${Math.max(width, 3)}%"></i></span>
        <span class="d-max">${temp(dl.temperature_2m_max[i])}</span>
      </span>
    </li>`;
  }).join("");

  ["current", "hourly-card", "daily-card"].forEach((id) => ($(id).hidden = false));
}

// ---------- 검색 ----------
const input = $("search-input");
const list = $("suggestions");
let results = [];
let active = -1;
let debounce;

function showSuggestions(items) {
  results = items;
  active = -1;
  if (!items.length) {
    list.innerHTML = `<li class="empty">검색 결과가 없습니다</li>`;
  } else {
    list.innerHTML = items.map((p, i) =>
      `<li data-i="${i}">${esc(p.name)}<small>${esc([p.admin1, p.country].filter(Boolean).join(", "))}</small></li>`
    ).join("");
  }
  list.hidden = false;
}
function hideSuggestions() { list.hidden = true; }
function choose(i) {
  const p = results[i];
  if (!p) return;
  hideSuggestions();
  input.value = "";
  input.blur();
  fetchWeather({ name: p.name, admin1: p.admin1, country: p.country, latitude: p.latitude, longitude: p.longitude });
}

input.addEventListener("input", () => {
  clearTimeout(debounce);
  const q = input.value.trim();
  if (q.length < 1) return hideSuggestions();
  debounce = setTimeout(async () => {
    try {
      const items = await searchCities(q);
      if (input.value.trim() === q) showSuggestions(items);
    } catch { /* 네트워크 오류 무시 */ }
  }, 300);
});

input.addEventListener("keydown", (e) => {
  if (list.hidden || !results.length) return;
  const lis = list.querySelectorAll("li[data-i]");
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    active = (active + (e.key === "ArrowDown" ? 1 : -1) + lis.length) % lis.length;
    lis.forEach((li, i) => li.classList.toggle("active", i === active));
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
});

$("search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!list.hidden && results.length) return choose(active >= 0 ? active : 0);
  const q = input.value.trim();
  if (!q) return;
  const items = await searchCities(q).catch(() => []);
  if (items.length) { results = items; choose(0); }
  else showSuggestions([]);
});

list.addEventListener("mousedown", (e) => {
  const li = e.target.closest("li[data-i]");
  if (li) { e.preventDefault(); choose(Number(li.dataset.i)); }
});
input.addEventListener("blur", () => setTimeout(hideSuggestions, 100));

// ---------- 버튼 ----------
$("unit-btn").addEventListener("click", () => {
  state.unit = state.unit === "c" ? "f" : "c";
  save("unit", state.unit);
  render();
});

$("locate-btn").addEventListener("click", () => {
  if (!navigator.geolocation) return setStatus("이 브라우저는 위치 기능을 지원하지 않습니다.");
  setStatus("현재 위치 확인 중…");
  navigator.geolocation.getCurrentPosition(
    (pos) => fetchWeather({
      name: "현재 위치",
      country: `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    }),
    () => setStatus(state.data ? "" : "위치 권한이 거부되었습니다. 도시를 검색해 주세요."),
    { timeout: 10000 }
  );
  if (state.data) setTimeout(() => $("status").textContent === "현재 위치 확인 중…" && setStatus(""), 10000);
});

// 10분마다 자동 새로고침
setInterval(() => fetchWeather(state.place), 10 * 60 * 1000);

fetchWeather(state.place);
